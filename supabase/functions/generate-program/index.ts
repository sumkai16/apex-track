import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import {
  authenticate,
  complete,
  corsHeaders,
  json,
} from "../_shared/openrouter.ts";

/**
 * Generous: this model reasons before answering (see _shared/openrouter.ts) and
 * then has to emit a whole program as JSON. Too low and the JSON comes back
 * truncated — or empty — and JSON.parse fails.
 */
const MAX_OUTPUT_TOKENS = 8000;
/** Longer than chat's: a full program is a much bigger generation. */
const REQUEST_TIMEOUT_MS = 90000;

const MAX_ANSWERS = 30;
const MAX_ANSWER_CHARS = 300;

interface GeneratedExercise {
  exercise_id: string;
  target_sets: number;
  target_reps: number;
  order_index: number;
}

interface GeneratedDay {
  name: string;
  day_order: number;
  exercises: GeneratedExercise[];
}

function buildPrompt(
  answerSummary: string,
  exerciseList: string,
  daysPerWeek: number,
): string {
  return `You are a certified strength and conditioning coach with expertise in evidence-based training. Generate a personalized training program based on the following user profile:

${answerSummary}

You MUST only use exercises from this exact list. Use the exact id values provided:
${exerciseList}

Respond ONLY with a valid JSON object in this exact format, no explanation, no markdown:
{
  "program_name": "string",
  "description": "string (1-2 sentences, science-based rationale)",
  "days": [
    {
      "name": "string (e.g. Upper Body A)",
      "day_order": 0,
      "exercises": [
        {
          "exercise_id": "uuid from the list above",
          "target_sets": number,
          "target_reps": number,
          "order_index": 0
        }
      ]
    }
  ]
}

Rules:
- Only include ${daysPerWeek} training days (no rest days in the array)
- Adjust exercises per day based on session_duration (30-45 min = 3-4 exercises, 45-60 min = 4-5, 60-90 min = 5-6)
- Avoid exercises that aggravate the user's stated limitations
- Use progressive overload principles appropriate for the user's level
- Balance muscle groups appropriately for the stated goal and style
- Only use exercise IDs from the list provided
- target_reps should be a single number (e.g. 8, not "8-12")`;
}

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
    const { userClient } = auth;

    let body: { answers?: unknown };
    try {
      body = await req.json();
    } catch {
      return json({ error: "Invalid JSON body" }, 400);
    }

    const answers = body.answers;
    if (
      !answers ||
      typeof answers !== "object" ||
      Array.isArray(answers) ||
      Object.keys(answers).length === 0
    ) {
      return json({ error: "answers must be a non-empty object" }, 400);
    }
    const entries = Object.entries(answers as Record<string, unknown>);
    if (entries.length > MAX_ANSWERS) {
      return json({ error: `answers capped at ${MAX_ANSWERS} keys` }, 400);
    }
    for (const [key, value] of entries) {
      if (typeof value !== "string" || value.length > MAX_ANSWER_CHARS) {
        return json({ error: `Malformed answer for "${key}"` }, 400);
      }
    }
    const answerMap = answers as Record<string, string>;

    const apiKey = Deno.env.get("OPENROUTER_API_KEY");
    if (!apiKey) {
      console.error("OPENROUTER_API_KEY is not set");
      return json({ error: "Program generation is not configured" }, 500);
    }

    // Ordering the summary by the question order keeps the prompt stable rather
    // than dependent on however the client happened to serialise its object.
    const { data: questions } = await userClient
      .from("ai_generator_questions")
      .select("field_key, order_index")
      .eq("is_active", true)
      .order("order_index");

    const orderedKeys = (questions ?? [])
      .map((q: { field_key: string }) => q.field_key)
      .filter((key: string) => key in answerMap);
    for (const key of Object.keys(answerMap)) {
      if (!orderedKeys.includes(key)) orderedKeys.push(key);
    }
    const answerSummary = orderedKeys
      .map((key) => `${key}: ${answerMap[key]}`)
      .join("\n");

    const { data: exercises } = await userClient
      .from("exercises")
      .select("id, name, category, equipment_type");

    if (!exercises || exercises.length === 0) {
      return json({ error: "No exercises found in the database." }, 500);
    }

    const exerciseList = exercises
      .map(
        (e: { id: string; name: string; category: string; equipment_type: string }) =>
          `- ${e.name} (id: ${e.id}, category: ${e.category}, equipment: ${e.equipment_type})`,
      )
      .join("\n");

    const daysMatch = answerMap["days_per_week"]?.match(/\d+/);
    const daysPerWeek = daysMatch ? parseInt(daysMatch[0]) : 4;

    const result = await complete({
      apiKey,
      temperature: 0.7,
      maxTokens: MAX_OUTPUT_TOKENS,
      timeoutMs: REQUEST_TIMEOUT_MS,
      messages: [
        {
          role: "user",
          content: buildPrompt(answerSummary, exerciseList, daysPerWeek),
        },
      ],
    });

    if (!result.ok) {
      console.error("Program generation failed:", result.logDetail);
      return json({ error: result.userMessage }, result.status);
    }

    // The model is told "no markdown" but fences happen anyway.
    const clean = result.reply!.replace(/```json|```/g, "").trim();
    let parsed: { program_name?: string; description?: string; days?: GeneratedDay[] };
    try {
      parsed = JSON.parse(clean);
    } catch {
      console.error("Unparseable program JSON:", clean.slice(0, 400));
      return json({ error: "The AI returned a malformed program. Try again." }, 502);
    }

    if (!parsed?.program_name || !Array.isArray(parsed.days) || !parsed.days.length) {
      console.error("Program JSON missing fields:", clean.slice(0, 400));
      return json({ error: "The AI returned an incomplete program. Try again." }, 502);
    }

    // The client inserts these ids straight into program_exercises, so anything
    // hallucinated outside the catalog would break the insert (or write a bad
    // row). The old client-side path trusted the model completely.
    const validIds = new Set(exercises.map((e: { id: string }) => e.id));
    let dropped = 0;
    parsed.days = parsed.days.map((day) => ({
      ...day,
      exercises: (Array.isArray(day.exercises) ? day.exercises : []).filter(
        (ex) => {
          const good =
            ex &&
            validIds.has(ex.exercise_id) &&
            Number.isFinite(Number(ex.target_sets)) &&
            Number.isFinite(Number(ex.target_reps));
          if (!good) dropped += 1;
          return good;
        },
      ),
    }));
    if (dropped) {
      console.error(`Dropped ${dropped} invalid exercise(s) from generated program`);
    }

    if (!parsed.days.some((day) => day.exercises.length > 0)) {
      return json(
        { error: "The AI picked exercises that don't exist. Try again." },
        502,
      );
    }

    return json({ program: parsed, daysPerWeek }, 200);
  } catch (err) {
    console.error("Unexpected error:", err);
    return json({ error: "Unexpected error" }, 500);
  }
});
