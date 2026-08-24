import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import {
  authenticate,
  ChatMessage,
  complete,
  corsHeaders,
  json,
} from "../_shared/openrouter.ts";

const MAX_MESSAGES = 10;
const MAX_CONTENT_CHARS = 4000;
const CONTEXT_DAYS = 30;
const MAX_CONTEXT_EXERCISES = 12;
const REQUEST_TIMEOUT_MS = 45000;
const MAX_OUTPUT_TOKENS = 4000;

/** Trims float noise for the context block: 60 not 60.0000001, 72.5 stays. */
function fmt(n: number): string {
  return String(Math.round(n * 100) / 100);
}

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
  });
}

// ---------------------------------------------------------------------------
// Workout context
// ---------------------------------------------------------------------------

/**
 * Builds the compact plain-text summary of the caller's real training data that
 * gets prepended to the system prompt.
 *
 * Runs entirely against `userClient` — a Supabase client carrying the caller's
 * own JWT — so RLS applies and this can only ever read the caller's rows. It
 * also means the client can't forge its own stats to get advice grounded in a
 * lie.
 *
 * Every section degrades to an explicit "no data" line rather than throwing: a
 * chat that answers generally beats a chat that 500s.
 */
async function buildWorkoutContext(
  userClient: SupabaseClient,
  userId: string,
): Promise<string> {
  const cutoff = new Date(
    Date.now() - CONTEXT_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const [profileRes, programRes, sessionRes] = await Promise.all([
    userClient
      .from("profiles")
      .select(
        "display_name, age, height_cm, weight_kg, gender, fitness_goal, weight_unit",
      )
      .eq("id", userId)
      .maybeSingle(),
    userClient
      .from("programs")
      .select(
        "name, description, program_days(name, day_order, is_rest_day, program_exercises(target_sets, target_reps, order_index, exercises(name, category)))",
      )
      .eq("user_id", userId)
      .eq("is_active", true)
      .maybeSingle(),
    userClient
      .from("sessions")
      .select("id, started_at, ended_at, program_days(name)")
      .eq("user_id", userId)
      // Mandatory: 'abandoned' sessions still hold saved sets and would
      // double-count every stat below.
      .eq("status", "completed")
      .gte("started_at", cutoff)
      .order("started_at", { ascending: false })
      .limit(20),
  ]);

  const lines: string[] = [];

  // --- Profile -------------------------------------------------------------
  const profile = profileRes.data;
  const displayUnit = profile?.weight_unit === "lbs" ? "lbs" : "kg";

  // Every weight in the DB is kg; weight_unit is a display preference only.
  // Convert here rather than asking the model to do arithmetic — and use the
  // same 2.205 factor as lib/WeightUnitContext.tsx:45 so the coach's numbers
  // match what the app shows the user to the decimal.
  const showWeight = (kg: number): string => {
    const value =
      displayUnit === "lbs" ? Math.round(kg * 2.205 * 10) / 10 : kg;
    return `${fmt(value)}${displayUnit}`;
  };

  if (profile) {
    const bits: string[] = [];
    if (profile.display_name) bits.push(String(profile.display_name));
    if (profile.age) bits.push(`${profile.age}y`);
    if (profile.gender) bits.push(String(profile.gender));
    if (profile.height_cm) bits.push(`${fmt(profile.height_cm)}cm`);
    if (profile.weight_kg)
      bits.push(`${showWeight(profile.weight_kg)} bodyweight`);
    if (profile.fitness_goal) bits.push(`goal: ${profile.fitness_goal}`);
    bits.push(`displays weight in ${displayUnit}`);
    lines.push(`USER: ${bits.join(", ")}`);
  } else {
    lines.push("USER: no profile details on file.");
  }

  // --- Active program ------------------------------------------------------
  const program = programRes.data;
  if (program) {
    lines.push(`ACTIVE PROGRAM: "${program.name}"`);
    const days = [...(program.program_days ?? [])].sort(
      (a: any, b: any) => (a.day_order ?? 0) - (b.day_order ?? 0),
    );
    for (const day of days) {
      if (day.is_rest_day) {
        lines.push(`  ${day.name} — Rest`);
        continue;
      }
      const exercises = [...(day.program_exercises ?? [])]
        .sort((a: any, b: any) => (a.order_index ?? 0) - (b.order_index ?? 0))
        .map(
          (pe: any) =>
            `${pe.exercises?.name ?? "Unknown"} ${pe.target_sets}x${pe.target_reps}`,
        );
      lines.push(
        `  ${day.name} — ${exercises.length ? exercises.join(", ") : "no exercises added"}`,
      );
    }
  } else {
    lines.push("ACTIVE PROGRAM: none — the user has no active program.");
  }

  // --- Sessions ------------------------------------------------------------
  const sessions = sessionRes.data ?? [];
  if (!sessions.length) {
    lines.push(
      `TRAINING (last ${CONTEXT_DAYS} days): NO COMPLETED SESSIONS YET.`,
    );
    return lines.join("\n");
  }

  const perWeek = (sessions.length / (CONTEXT_DAYS / 7)).toFixed(1);
  const latest = sessions[0];
  const latestDay = (latest as any).program_days?.name;
  lines.push(
    `TRAINING (last ${CONTEXT_DAYS} days): ${sessions.length} completed sessions, ~${perWeek}/week, last on ${shortDate(latest.started_at)}${latestDay ? ` (${latestDay})` : ""}`,
  );

  // --- Sets ----------------------------------------------------------------
  const sessionIds = sessions.map((s: any) => s.id);
  const sessionDate = new Map<string, string>(
    sessions.map((s: any) => [s.id, s.started_at]),
  );

  // One hop: session_sets carries a denormalized exercise_id alongside
  // program_exercise_id, so per-exercise history needs no program_exercises join.
  // is_pr is deliberately not selected: the live per-set upsert writes it as
  // `false` unconditionally (app/session/[id].tsx:301) and the finish-time pass
  // that computes it correctly uses .insert(), not an upsert — so sets logged
  // live keep the stale value. Bests are computed from weight_used instead.
  const { data: sets } = await userClient
    .from("session_sets")
    .select("session_id, exercise_id, weight_used, reps_done")
    .in("session_id", sessionIds);

  if (!sets?.length) {
    lines.push("LOGGED SETS: none in this window.");
    return lines.join("\n");
  }

  const exerciseIds = [
    ...new Set(sets.map((s: any) => s.exercise_id).filter(Boolean)),
  ];

  // Fetched separately rather than embedded through session_sets — the FK a
  // PostgREST embed would need on that column is unverified.
  const { data: exercises } = await userClient
    .from("exercises")
    .select("id, name")
    .in("id", exerciseIds);
  const exerciseName = new Map<string, string>(
    (exercises ?? []).map((e: any) => [e.id, e.name]),
  );

  interface TopSet {
    date: string;
    weight: number;
    reps: number;
  }
  const byExercise = new Map<
    string,
    { setCount: number; top: Map<string, TopSet>; best?: TopSet }
  >();

  for (const set of sets as any[]) {
    if (!set.exercise_id) continue;
    let entry = byExercise.get(set.exercise_id);
    if (!entry) {
      entry = { setCount: 0, top: new Map() };
      byExercise.set(set.exercise_id, entry);
    }
    entry.setCount += 1;

    const weight = Number(set.weight_used) || 0;
    const reps = Number(set.reps_done) || 0;
    const iso = sessionDate.get(set.session_id);
    if (!iso) continue;

    const current = entry.top.get(set.session_id);
    if (!current || weight > current.weight) {
      entry.top.set(set.session_id, { date: iso, weight, reps });
    }
    if (!entry.best || weight > entry.best.weight) {
      entry.best = { date: iso, weight, reps };
    }
  }

  const ranked = [...byExercise.entries()]
    .sort((a, b) => b[1].setCount - a[1].setCount)
    .slice(0, MAX_CONTEXT_EXERCISES);

  lines.push(
    `TOP SETS (last ${CONTEXT_DAYS} days, weights shown in ${displayUnit}):`,
  );
  for (const [exerciseId, entry] of ranked) {
    const progression = [...entry.top.values()].sort(
      (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime(),
    );
    const first = progression[0];
    const last = progression[progression.length - 1];
    const name = exerciseName.get(exerciseId) ?? "Unknown exercise";

    let trend = `${showWeight(last.weight)}x${last.reps}`;
    if (progression.length > 1) {
      const delta = last.weight - first.weight;
      const sign = delta > 0 ? "+" : "";
      trend = `${showWeight(first.weight)}x${first.reps} -> ${showWeight(last.weight)}x${last.reps} (${sign}${showWeight(delta)})`;
    }
    const best = entry.best
      ? `, best in window ${showWeight(entry.best.weight)}x${entry.best.reps} on ${shortDate(entry.best.date)}`
      : "";
    lines.push(`  ${name}: ${trend}, ${entry.setCount} sets${best}`);
  }
  if (byExercise.size > ranked.length) {
    lines.push(`  (+${byExercise.size - ranked.length} more exercises trained)`);
  }

  // --- Programmed but untrained -------------------------------------------
  if (program) {
    // Compare against everything trained in the window, not just the top-ranked
    // slice — a lift trained once still isn't "not trained".
    const trainedNames = new Set(
      [...byExercise.keys()]
        .map((id) => exerciseName.get(id))
        .filter((n): n is string => Boolean(n)),
    );
    const untrained: string[] = [];
    for (const day of (program.program_days ?? []) as any[]) {
      for (const pe of day.program_exercises ?? []) {
        const name = pe.exercises?.name;
        if (!name) continue;
        if (!trainedNames.has(name) && !untrained.includes(name)) {
          untrained.push(name);
        }
      }
    }
    if (untrained.length) {
      lines.push(
        `IN PROGRAM BUT NOT TRAINED IN ${CONTEXT_DAYS} DAYS: ${untrained.join(", ")}`,
      );
    }
  }

  return lines.join("\n");
}

// ---------------------------------------------------------------------------
// System prompt
// ---------------------------------------------------------------------------

function buildSystemPrompt(context: string): string {
  return `You are the AI Coach inside ApexTrack, a workout tracking app. You are a knowledgeable strength and hypertrophy coach talking to a lifter in a chat window on their phone.

STYLE
- Plain text only. The app renders your reply as raw text with no markdown parser,
  so asterisks, hashes and pipe tables show up as literal characters. No **bold**,
  no # headers, no | tables |. Short "- " bullets are fine.
- Be concise, direct and practical. Short paragraphs, 2-4 sentences each.
- Under 150 words unless they ask for detail. Answer first, brief reasoning after.
- Talk like a coach, not a textbook. No emojis.

USING THEIR DATA
- The USER DATA block below is this lifter's real logged training history from the app.
- When the question is about them ("my bench", "am I doing enough", "should I deload"), ground your answer in that data and reference the actual numbers.
- When the question is general ("how many sets per week for chest?"), just answer it well. You do not need to force their data into every reply.
- NEVER invent numbers, lifts, sessions or dates that are not in the USER DATA block. If they ask about something you have no data for, say so plainly and suggest they log it.
- Weights are already in the unit this user has chosen to see, and every number is
  labelled with it. Repeat them exactly as given — do not convert them.
- The data covers a limited recent window, stated in the block. A "best in window"
  is the heaviest set in that window, NOT an all-time personal record. Never call it
  a PR or an all-time best.

SCOPE
- Stay on training, programming, technique, nutrition, recovery, and using this app.
- If asked about something unrelated, say briefly that you are the fitness coach here and steer back.

SAFETY
- For pain, injury, or medical questions: do not diagnose. Give general, conservative guidance and recommend they see a professional.
- Do not provide performance-enhancing drug protocols, crash diets, or extreme cuts.
- Do not fabricate studies, citations or statistics.

USER DATA
${context}`;
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    if (req.method !== "POST") {
      return json({ error: "Method not allowed" }, 405);
    }

    const auth = await authenticate(req);
    if (!auth) {
      return json({ error: "Unauthorized" }, 401);
    }
    const { user, userClient } = auth;

    let body: { messages?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const messages = body.messages;
    if (!Array.isArray(messages) || messages.length === 0) {
      return json({ error: "messages must be a non-empty array" }, 400);
    }
    if (messages.length > MAX_MESSAGES) {
      return json({ error: `messages capped at ${MAX_MESSAGES}` }, 400);
    }
    for (const message of messages) {
      const m = message as ChatMessage;
      if (
        !m ||
        (m.role !== "user" && m.role !== "assistant") ||
        typeof m.content !== "string" ||
        m.content.trim().length === 0
      ) {
        return json({ error: "Malformed message in messages" }, 400);
      }
      if (m.content.length > MAX_CONTENT_CHARS) {
        return json(
          { error: `message content capped at ${MAX_CONTENT_CHARS} characters` },
          400,
        );
      }
    }

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      console.error("OPENROUTER_API_KEY is not set");
      return json({ error: "Chat is not configured" }, 500);
    }

    let context: string;
    try {
      context = await buildWorkoutContext(userClient, user.id);
    } catch (err) {
      // Losing the context is survivable — answering generally beats failing.
      console.error("Context build failed:", err);
      context = "USER DATA UNAVAILABLE — answer generally and say you could not read their training history.";
    }

    const result = await complete({
      apiKey,
      temperature: 0.6,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      messages: [
        { role: "system", content: buildSystemPrompt(context) },
        ...(messages as ChatMessage[]),
      ],
    });

    if (!result.ok) {
      console.error("Chat completion failed:", result.logDetail);
      return json({ error: result.userMessage }, result.status);
    }

    return json({ reply: result.reply }, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
