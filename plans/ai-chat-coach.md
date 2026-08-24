# AI Chat Coach — Implementation Plan

## Context

ApexTrack is a workout tracker: users build or AI-generate multi-day training
programs and log actual sessions against them, set by set. It already has one AI
feature — `app/ai/generate-program.tsx` — but that is a **fixed questionnaire**:
the user taps preset answer chips, one LLM call returns a whole program as JSON,
done. It is one-shot and non-conversational. The user cannot ask it anything.

The gap: the app holds a detailed record of every set the user has ever lifted,
and no way to *ask it anything*. The questions a lifter actually has — "is my push
day too much volume?", "how's my bench progressing?", "should I deload this week?"
— have nowhere to go. Meanwhile `app/(tabs)/_layout.tsx:167-176` already ships a
disabled **"AI Coach"** FAB row marked `soon`, so the feature is already promised
in the UI.

**Outcome:** a free-form fitness chat, ChatGPT-style, that answers whatever the
user types — and that *knows their logged data*, so personal questions get
grounded answers instead of generic ones.

## Decisions taken (settled with the user)

| # | Decision | Rationale |
|---|---|---|
| 1 | Free-form conversational chat, not a questionnaire | The generator already covers the structured path |
| 2 | **Data-aware** — the bot sees real workout history | It's the differentiator, and the data is already there |
| 3 | **LLM call moves server-side** to a new Supabase Edge Function | `context/RULES.md` § Secrets: the OpenRouter key must not ship in the bundle. Chat burns far more tokens than one-shot generation, so an extractable key is a real bill risk |
| 4 | **No streaming** — typing indicator, then the full reply | Keeps the request shape identical to what the codebase already does; RN streaming needs `expo/fetch` or XHR plumbing not worth it for v1 |
| 5 | **History in AsyncStorage, on-device** | No schema change. Supabase-backed history needs new tables + RLS policies hand-made in the dashboard (no migrations tracked here), and `context/SCHEMA.md` notes RLS enforcement is unverified — a chat feature shouldn't be what depends on that. Records are shaped to map 1:1 onto a future `chat_messages` table |
| 6 | Entry point = the existing disabled **AI Coach** FAB row | Already built, styled, animated |
| 7 | **Chat only** — `generate-program.tsx` is not touched | Smallest diff; nothing working can regress |
| 8 | Model stays **`stealth/ox-alpha`** | Consistent with the generator |

### Two caveats recorded, accepted, and not blocking

- **`stealth/ox-alpha` is a cloaked model** — undisclosed provider, undisclosed
  retention terms, can be withdrawn without notice. The plan sends profile data
  (age, weight, gender) to it. Kept per decision #8; isolated to a single `MODEL`
  constant at the top of the Edge Function so swapping it is a one-line change.
- **`EXPO_PUBLIC_OPENROUTER_API_KEY` is likely undefined in EAS builds.**
  `eas.json` has no `env` blocks, `.env.local` matches `.env*.local` in
  `.gitignore:22`, and there is no `.easignore` — so the key almost certainly does
  not reach a preview/production APK, meaning **`generate-program.tsx` is probably
  broken in built apps today and works only in local dev**. Out of scope per
  decision #7, but worth verifying separately. The chat feature is immune to this
  by construction, since its key lives server-side.

---

## Architecture

```
app/ai/chat.tsx                          (new screen)
   │  POST { messages: [...last 10] }
   │  Authorization: Bearer <supabase access_token>
   ▼
supabase/functions/chat/index.ts         (new Edge Function)
   │  1. verify JWT  → user.id
   │  2. build workout context server-side (RLS-scoped, user's own JWT)
   │  3. system prompt + context + client messages
   ▼
OpenRouter  /api/v1/chat/completions      OPENROUTER_API_KEY (server-side secret)
```

The context fetch happens **server-side, inside the function**, using a Supabase
client constructed with the *caller's* JWT — exactly the `userClient` pattern from
`supabase/functions/delete-account/index.ts:17-22`. Two reasons: RLS still applies
so the function can't read anyone else's data, and the client cannot forge its own
stats (it could otherwise claim a 300kg bench and get advice grounded in a lie).
It also keeps the request payload small.

---

## 1. Edge Function — `supabase/functions/chat/index.ts` (new)

Mirror `delete-account/index.ts`: `serve()` from `https://deno.land/std@0.168.0/http/server.ts`,
`createClient` from `https://esm.sh/@supabase/supabase-js@2`.

**Contract**

```
POST /functions/v1/chat
Authorization: Bearer <access_token>
Body: { messages: { role: "user" | "assistant", content: string }[] }

200 → { reply: string }
400 → { error: "..." }   malformed body / empty messages / oversized payload
401 → { error: "..." }   missing or invalid JWT
502 → { error: "..." }   OpenRouter non-200 or empty content
500 → { error: "..." }   unexpected
```

Steps:
1. Handle `OPTIONS` preflight with CORS headers, and return CORS headers on every
   response. (`delete-account` omits CORS — it works because it's called from the
   native app, not a browser. Add it here so `expo start --web` also works.)
2. Reject non-`POST` with 405.
3. Read `Authorization`; 401 if absent.
4. `userClient.auth.getUser()`; 401 if error or no user.
5. Validate body: `messages` is a non-empty array, each item has a valid `role`
   and a non-empty string `content`, **cap at 10 items and 4000 chars each** —
   reject rather than truncate, so the client stays honest about what it sends.
6. Build the workout context (§2).
7. Call OpenRouter with `MODEL = "stealth/ox-alpha"`, `temperature: 0.7`,
   `messages: [{ role: "system", content: systemPrompt }, ...clientMessages]`.
   Wrap in `AbortController` with a ~25s timeout. **Check `response.ok`** — the
   generator does not, which is why a 401/429 there surfaces as a useless generic
   alert. Send OpenRouter attribution headers (`HTTP-Referer`, `X-Title`).
8. Read `data.choices?.[0]?.message?.content`; 502 if missing.
9. Return `{ reply }`.

**Registration** — add to `supabase/config.toml`, matching the existing block:

```toml
[functions.chat]
enabled = true
verify_jwt = true
entrypoint = "./functions/chat/index.ts"
```

Use `verify_jwt = true` (unlike `delete-account`'s `false`) so unauthenticated
requests are rejected at the gateway before burning function invocations; step 4
still runs because we need the `user` object regardless.

**Secrets** — set server-side, never in the app:
`npx supabase secrets set OPENROUTER_API_KEY=...`
(`SUPABASE_URL` and `SUPABASE_ANON_KEY` are injected by the platform.)

**Deploy** — `npx supabase functions deploy chat`.

---

## 2. Workout context builder (inside the function)

The heart of the feature. Goal: a compact plain-text block, target **under ~700
tokens**, never raw rows.

Queries, all via `userClient` (RLS applies), run with `Promise.all` where possible:

1. **Profile** — `profiles.select("display_name, age, height_cm, weight_kg, gender, fitness_goal, weight_unit").eq("id", user.id).single()`
2. **Active program with structure** — one nested embed:
   ```
   programs.select("name, description, program_days(name, day_order, is_rest_day,
     program_exercises(target_sets, target_reps, order_index, exercises(name, category)))")
     .eq("user_id", user.id).eq("is_active", true).maybeSingle()
   ```
   Use `maybeSingle()`, not `.single()` — a user with no active program is a normal
   state, and `.single()` errors on zero rows.
3. **Recent completed sessions** — last 30 days, `limit(20)`:
   `sessions.select("id, started_at, ended_at, program_days(name)").eq("user_id", user.id).eq("status", "completed").gte("started_at", cutoff).order("started_at", { ascending: false })`
   **`.eq("status", "completed")` is mandatory** — `'abandoned'` sessions still
   contain saved sets (`app/session/[id].tsx:497`) and would double-count.
4. **Sets for those sessions** —
   `session_sets.select("session_id, exercise_id, set_number, weight_used, reps_done, is_pr").in("session_id", sessionIds)`
   This uses the denormalized `session_sets.exercise_id` (`app/session/[id].tsx:294-305`),
   making it **one hop** instead of the three-hop `program_exercises` dance in
   `app/exercise/[id].tsx:57-84`.
5. **Exercise names** — `exercises.select("id, name, category").in("id", exerciseIds)`.
   Fetch separately rather than embedding through `session_sets`; the FK needed for
   a PostgREST embed on that column is unverified (`context/SCHEMA.md` is inferred,
   not dumped). A separate `.in()` works regardless.

Reduce in JS to a text block:

```
USER: Rian, 24y male, 178cm, 74kg, goal: build muscle, displays weight in kg
ACTIVE PROGRAM: "PPL 4-Day"
  Day 1 Push — Bench Press 4x8, Incline DB Press 3x10, Lateral Raise 3x12
  Day 2 Pull — Deadlift 3x5, Barbell Row 4x8
  Day 3 Rest
  ...
TRAINING (last 30 days): 11 completed sessions, ~2.8/week, last Aug 22 (Push)
TOP SETS (last 30 days, kg):
  Bench Press   60x5 -> 70x5  (+10)  18 sets   PR 72.5 on Aug 19
  Squat         90x5 -> 95x5   (+5)  15 sets
  Barbell Row   50x8 -> 55x8   (+5)  12 sets
IN PROGRAM BUT NOT TRAINED IN 30 DAYS: Deadlift, Lateral Raise
```

Rules for the reducer:
- **All weights in the DB are kg** regardless of `weight_unit` — that column is
  display-only (`lib/WeightUnitContext.tsx`). Emit kg, and state the user's display
  preference in the `USER:` line so the model can answer in their units.
- Cap at the **12 most-frequently-trained exercises**; append `(+N more)`.
- "Top set" per session per exercise = row with max `weight_used`; the trend arrow
  is first vs last session in the window.
- Report `is_pr` only from completed sessions — it's written correctly at session
  finish but the live per-set upsert writes `is_pr: false` unconditionally
  (`app/session/[id].tsx:301`).
- **New/empty user**: emit explicit lines the model can act on rather than an empty
  block — `NO ACTIVE PROGRAM.` / `NO COMPLETED SESSIONS YET.` — so it invites the
  user to generate a program instead of hallucinating history.
- Any query failing degrades to its "no data" line rather than failing the request.
  A chat that answers generally beats a chat that 500s.

---

## 3. System prompt

Assembled in the function as: fixed instructions + `\n\n` + the context block.
It must cover:

- **Role**: knowledgeable strength & hypertrophy coach inside the ApexTrack app;
  concise, direct, practical. Mobile screen — short paragraphs, no walls of text,
  no markdown tables.
- **Grounding**: the context block is the user's real logged data. Use it when the
  question is personal ("my bench", "am I doing enough"). Answer generally when the
  question is general ("how many sets should I do?"). **Never invent numbers not in
  the context** — if the data isn't there, say so plainly and suggest logging it.
- **Units**: data is kg; answer in the user's displayed preference.
- **Scope**: stay on training, nutrition, recovery, and this app. Decline unrelated
  requests briefly and redirect.
- **Safety**: for pain, injury, or medical questions — do not diagnose; give
  general, conservative guidance and recommend a professional. No PED, extreme cut,
  or crash-diet protocols.
- **Honesty**: no fabricated citations or studies.

---

## 4. Chat screen — `app/ai/chat.tsx` (new)

Auto-registers as `/ai/chat` — the root `<Stack>` is bare, no `<Stack.Screen>` is
declared anywhere in this repo, so no routing config changes.

Structure, matching the conventions in `app/(tabs)/progress.tsx` and
`app/ai/generate-program.tsx`:

```
<KeyboardAvoidingView style={styles.container}
    behavior={Platform.OS === "ios" ? "padding" : "height"}>
  <StatusBar barStyle="light-content" />
  <View style={styles.topBar}>          ← chevron-back → router.back(), title "AI Coach",
                                          trailing trash icon → clear conversation
  <ScrollView ref={scrollRef}
      contentContainerStyle={styles.messages}
      keyboardShouldPersistTaps="handled"
      onContentSizeChange={() => scrollRef.current?.scrollToEnd({ animated: true })}>
     empty state | message bubbles | typing indicator
  </ScrollView>
  <View style={styles.inputBar}>        ← TextInput (multiline, maxLength 2000) + send button
</KeyboardAvoidingView>
```

- **`ScrollView`, not `FlatList`** — deliberate. There is **no `FlatList` anywhere
  in this codebase**; every list is a `ScrollView`. With history capped at 50
  messages the virtualization win is nil, and an inverted `FlatList` would be a new
  pattern to maintain for no benefit.
- **Keyboard**: the exact pattern already in `app/(auth)/login.tsx:160`.
- **Bubbles**: user right-aligned on `#800000`; assistant left-aligned on `#1a1a1a`
  with a `#2a2a2a` border. Radius 14, padding 12-14, `maxWidth: "85%"`.
- **Typing indicator**: assistant-side bubble with three dots animated via
  `Animated` (already used for the FAB in `(tabs)/_layout.tsx`) — or an
  `ActivityIndicator size="small" color="#800000"` if simpler. Sits in the message
  list so it scrolls naturally.
- **Empty state**: short greeting using `profiles.display_name` (same one-line
  fetch as `generate-program.tsx:40-47`) plus 3-4 tappable starter chips — *"How's
  my bench progressing?"*, *"Is my current program balanced?"*, *"What should I
  train today?"*, *"How do I break a plateau?"* — which prefill and send.
- **Errors inline, not `Alert.alert`**: a failed turn renders as a muted assistant
  bubble with the reason and a **Retry** button that re-sends the same turn. This
  deliberately departs from the generator's `Alert.alert("Error", "Failed to
  generate program. Please try again.")`, which loses the user's input and offers
  no recovery.
- **Palette**: `#050505` / `#800000` per `context/DESIGN.md` §1. **Do not** copy
  `generate-program.tsx`'s Zinc + `#FF3B30` — DESIGN.md §2 explicitly flags it as
  drift.
- `StyleSheet.create` at the bottom of the file. No new shared components — none
  exist in this repo, and one screen is below the DRY threshold in
  `context/RULES.md`.

---

## 5. Persistence — AsyncStorage

- **Key**: `apextrack.chat.v1.<user.id>` — per-user, because the app supports
  account switching and a shared key would leak one user's thread to the next.
- **Record shape**, chosen to map 1:1 onto a future `chat_messages` table:
  ```ts
  type ChatMessage = {
    id: string;            // crypto.randomUUID()
    role: "user" | "assistant";
    content: string;
    created_at: string;    // ISO
    status?: "sending" | "failed";   // client-only, stripped before send/persist
  };
  ```
- **Load** on mount after `supabase.auth.getUser()`; **save** debounced on change.
- **Cap stored** at the most recent 50 messages; **cap sent** at the last 10
  (≈5 turns). Both trims happen client-side, and the function enforces the 10 cap
  independently.
- **Clear**: trash icon in the top bar → `Alert.alert` confirm → remove the key and
  reset state.
- Wrap every `AsyncStorage` read/write in try/catch — a storage failure should
  cost the transcript, not the screen.

---

## 6. Failure modes to handle explicitly

| Case | Handling |
|---|---|
| Non-200 from OpenRouter | Function returns 502; screen shows a retryable error bubble |
| Empty `choices[0].message.content` | Same as above — the generator's blind spot |
| Network loss | `fetch` rejects → error bubble + Retry |
| Function timeout | `AbortController`, ~25s client-side and in the function |
| Double-send | `sending` state disables the send button and ignores repeat submits |
| App backgrounded mid-request | Request completes or aborts; on unmount, guard `setState` with a mounted ref |
| No session / expired token | 401 → prompt re-login; root layout's `onAuthStateChange` already redirects |
| Empty or whitespace-only input | Send button disabled |

---

## 7. Files

**New**
- `supabase/functions/chat/index.ts` — the function (§1, §2, §3)
- `app/ai/chat.tsx` — the screen (§4, §5)

**Modified**
- `supabase/config.toml` — add the `[functions.chat]` block
- `app/(tabs)/_layout.tsx:167-176` — activate the "AI Coach" FAB row: swap
  `styles.fabLabelDisabled` → `styles.fabLabel`, `fabOptionBtnDisabled` → active,
  icon color `#444` → `#fff`, drop the `soon` badge, wrap in `TouchableOpacity`
  with `onPress={() => { closeFab(); router.push("/ai/chat"); }}` — mirroring the
  "Generate Program" row directly below it. Note the `generateEnabled` guard on
  that row (from commit `b7523e3`, the "invisible button" fix) and apply the same
  guard so the button isn't tappable while the FAB is collapsed.

**Not modified** — `app/ai/generate-program.tsx`, `lib/supabase.ts`, any schema.

**Also** — per `CLAUDE.md` § Planning, a copy of this plan gets written to
`plans/ai-chat-coach.md` in the repo (the directory doesn't exist yet and will be
created) so the reasoning is versioned alongside the code.

**Doc updates** (worth doing in the same branch, since both files are already
uncommitted and currently wrong):
- `context/ARCHITECTURE.md` §1 and §5 — records the AI call as Gemini +
  `EXPO_PUBLIC_GEMINI_API_KEY`; it's actually OpenRouter. Add the new function to §5.
- `context/SCHEMA.md` — add `session_sets.exercise_id` / `weight_unit` / `is_extra`,
  `sessions.program_id`, and the `'abandoned'` status.

---

## 8. Verification

Manual, on a device or emulator — **not `expo start --web`**, per
`context/RULES.md` § Testing (native auth doesn't run there; the chat screen itself
does, which is useful for layout only).

1. **Deploy first**: `npx supabase secrets set OPENROUTER_API_KEY=...` then
   `npx supabase functions deploy chat`. Confirm with `npx supabase functions list`.
2. **Function in isolation** — grab a real token in the app
   (`supabase.auth.getSession()`), then:
   ```bash
   curl -X POST https://vaqivrymjwlnlrxsducb.supabase.co/functions/v1/chat \
     -H "Authorization: Bearer <access_token>" -H "Content-Type: application/json" \
     -d '{"messages":[{"role":"user","content":"how is my bench progressing?"}]}'
   ```
   Expect `{ "reply": "..." }` referencing real numbers from your log.
3. **Auth rejection** — same call with no header and with a garbage token → 401 both times.
4. **In-app happy path** — open the FAB, tap AI Coach, ask a general question
   ("how many sets per week for chest?") and a personal one ("how's my bench
   progressing?"). The personal answer must cite real weights from your sessions.
5. **Grounding check** — ask about a lift you have never logged. It must say it has
   no data, not invent numbers. This is the single most important test.
6. **New-user path** — sign in as an account with no programs or sessions. It must
   respond helpfully and suggest generating a program, not hallucinate a history.
7. **Persistence** — send messages, force-quit the app, reopen, navigate back to
   chat: the thread is still there. Sign out, sign in as another user: the thread is
   empty, not the first user's.
8. **Failure path** — temporarily set a bad `OPENROUTER_API_KEY` secret, redeploy,
   send a message: an inline error bubble with a working Retry appears (no crash,
   no `Alert`). Restore the key afterwards.
9. **Keyboard/layout** — long conversation on a small device: input bar stays above
   the keyboard, list auto-scrolls to the newest message, back chevron works, no
   content hidden under the notch.
10. **Regression** — `/ai/generate-program` still works from the FAB, untouched.
11. `npx expo lint` clean.

## Follow-ups (explicitly out of scope, worth tracking)

- Migrate `generate-program.tsx` onto the Edge Function, removing
  `EXPO_PUBLIC_OPENROUTER_API_KEY` from the bundle entirely — and confirm whether
  that feature is in fact broken in EAS builds today.
- Server-side per-user rate limiting on the function once real usage exists.
- Supabase-backed history if cross-device sync is ever wanted; the record shape
  above is already compatible.
- Verify RLS is actually enabled on all tables — `context/SCHEMA.md` § RLS flags
  this as unverified, and the context builder trusts RLS to scope its reads.

---

# Post-deploy fix (same day)

The first deploy returned "empty reply" on every message. Two independent faults,
found by probing OpenRouter directly (the Supabase CLI in use has no `logs`
subcommand):

1. **`max_tokens: 600` starved a reasoning model.** `stealth/ox-alpha` emits a
   hidden reasoning trace before any answer and those tokens count against
   `max_tokens` — a measured turn used 8,188 characters of reasoning / 2,458
   completion tokens. At 600 the budget was gone before it wrote anything, so
   `content` came back empty. `generate-program.tsx` sets no `max_tokens`, which is
   why it never hit this. Now `MAX_OUTPUT_TOKENS = 4000`.

2. **The model is rate-limited ~50% of the time** on OpenRouter's free shared pool
   (HTTP 429, `limit_source: upstream_provider_shared_pool`). Fixed with
   `models: [MODEL, FALLBACK_MODEL]` plus an explicit one-shot retry.
   `FALLBACK_MODEL` is `google/gemini-2.5-flash-lite`.

3. **The error handling hid both.** It only checked `response.ok` — OpenRouter can
   return a provider error as HTTP 200 with an `error` body — and reported two
   generic strings instead of `error.metadata.raw`. Now surfaces the provider's own
   wording, and names the truncation case separately when `finish_reason` is
   `"length"`.

Timeouts raised to 45s (function) / 55s (client) — observed latency is 10-23s, so
the original 25s abort was marginal.

**Verified after redeploy:** 5/5 identical requests returned non-empty content;
one of the five failed over to the fallback model automatically, confirming
OpenRouter's `models[]` failover fires for provider 429s.

**Models evaluated and rejected**, measured on one identical prompt:

| model | latency | note |
|---|---|---|
| `gemini-2.5-flash-lite` | 1.5-2.5s | no reasoning overhead, ~$0.0005/msg — chosen as fallback |
| `gemini-2.5-flash` | 1.8s | no reasoning overhead |
| `gemini-3.7-flash` | 7.4s | reasoning model, ~30x Lite's cost |
| `nemotron-3-ultra:free` | **96.6s** | throughput-bound ~21 tok/s; also, NVIDIA's free-endpoint terms forbid uploading personal data, which this feature does by design |

---

# Release 1.2.0 — both AI features moved server-side

Prompted by the first APK release. `EXPO_PUBLIC_OPENROUTER_API_KEY` was in **no**
EAS environment, so `generate-program.tsx` would have sent
`Authorization: Bearer undefined` and failed for every user of the build. Rather
than add the key to EAS (where it compiles into the APK as an extractable
literal, and the APK was going to friends), the generator moved server-side.

- **`supabase/functions/_shared/openrouter.ts`** (new) — JWT verification, CORS,
  model constants, and the call-with-fallback logic, shared by both AI functions.
  Extracted rather than duplicated specifically because the reasoning-model
  `max_tokens` trap would otherwise get fixed in one function and left in the
  other.
- **`supabase/functions/generate-program/`** (new) — client now posts only
  `{ answers }`; the function fetches the exercise catalogue, builds the prompt,
  calls OpenRouter, and **validates every returned `exercise_id` against the
  catalogue**. The old client-side path inserted whatever the model returned.
  `maxTokens` 8000 and a 90s timeout: a whole program is a far bigger generation
  than a chat turn.
- **`app/ai/generate-program.tsx`** — prompt, catalogue fetch and OpenRouter call
  deleted; now one `supabase.functions.invoke`. It also surfaces the function's
  real error instead of a fixed "Failed to generate program" string.
- **`.env.local`** — `EXPO_PUBLIC_OPENROUTER_API_KEY` commented out (not deleted:
  Supabase secrets can't be read back, so the only copy of the value would
  otherwise be gone). `EXPO_PUBLIC_GEMINI_API_KEY` marked dead.
- **`eas.json`** — every build profile now names its `environment` explicitly.
  Without it, EAS-stored variables may not be injected at all, which would have
  broken Google Sign-In in the APK.
- **`app.json`** — 1.1.1 → 1.2.0.

**No AI key ships in the app bundle any more.** Build log confirms only
`EXPO_PUBLIC_GEMINI_API_KEY` (dead) and `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` load
into the build.

Note for future releases: EAS uploads the working tree minus gitignored files
(no `requireCommit` set), so untracked files *do* reach the build — but they are
not in git, so nothing else preserves them.
