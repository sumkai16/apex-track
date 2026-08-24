# PRD.md — Product Requirements Document

**This file is a skeleton, not a finished PRD.** Sections marked `[TODO]` are
product decisions only the product owner can make — they aren't inferable from
the code and haven't been written yet. The "As-Built Feature Scope" section below
*is* inferable (it's a direct read of what exists in `app/`) and can be trusted;
treat everything else as a placeholder to fill in, not as researched fact.

## 1. Problem Statement
[TODO] — what problem is ApexTrack solving, and for whom, that existing workout
apps (Strong, Hevy, generic spreadsheets) don't? The AI program-generation feature
(`app/ai/generate-program.tsx`) suggests a angle around "build me a program"
rather than just logging an existing one, but that's an inference from a feature,
not a stated positioning.

## 2. Target User
[TODO] — who is this for: personal use, a small group, or a public app-store
release? This matters for scope decisions (e.g. whether the client-exposed Gemini
key in `context/RULES.md` § Secrets is a real risk worth fixing now or a
non-issue for a single-user app).

## 3. As-Built Feature Scope
Derived directly from `app/` — see `context/ARCHITECTURE.md` for how these fit
together:
- [x] Auth — email/password, Google Sign-In, Facebook OAuth (`(auth)/`, `lib/auth/`)
- [x] User profile — display name, avatar, body stats (height/weight/age/gender),
  fitness goal, weight-unit preference (`(tabs)/profile.tsx`)
- [x] Program builder — manual creation with named days and per-day exercises,
  including a "start from a template" flow (`programs/create.tsx`)
- [x] AI program generation — a short questionnaire (`ai_generator_questions`)
  feeds a Gemini prompt that returns a structured program, written into
  `programs`/`program_days`/`program_exercises` (`ai/generate-program.tsx`)
- [x] Exercise library — system-seeded + user-created exercises, with
  category/equipment metadata (`programs/[id]/day/[dayId]/add-exercise.tsx`)
- [x] Workout logging — an active-session screen tracking sets/reps/weight per
  exercise, with PR detection (`session/[id].tsx`)
- [x] Session history — past-session detail view (`session-detail/[id].tsx`),
  per-exercise progress view (`exercise/[id].tsx`)
- [x] Progress tracking — aggregate view across completed sessions
  (`(tabs)/progress.tsx`)
- [x] Home dashboard — recent sessions, current program at a glance
  (`(tabs)/home.tsx`)
- [x] Account deletion — self-service, via `delete-account` Edge Function
- [ ] [TODO] Anything planned but not yet built — roadmap items, deferred
  features, things explicitly cut. Not knowable from reading `app/` alone.

## 4. Explicitly Out of Scope
[TODO] — nothing in the code tells us what was *deliberately* excluded vs. just
not built yet. Worth capturing once decided, so future work doesn't accidentally
re-litigate a settled "no."

## 5. Technical Requirements
- Stack: Expo SDK 54, React Native 0.81, React 19, TypeScript, Expo Router
- Backend: Supabase (Postgres + Auth + Edge Functions) — see
  `context/ARCHITECTURE.md`
- Third-party integrations: Google Sign-In, Facebook Login (OAuth via Supabase),
  Google Gemini API (`gemini-2.5-flash`) for AI program generation
- Distribution: [TODO] — EAS build profiles exist for `development`/`preview`
  (APK) and `production` (app bundle) in `eas.json`, targeting
  `com.sumkai.apextrack` on Android. Is this shipping to the Play Store / App
  Store, or internal/personal distribution only? Changes how seriously to weigh
  things like the client-exposed API key.

## 6. Success Metrics
[TODO] — no stated success criteria exist yet (user count, retention, "I use it
myself daily," a defense/demo date like the AbangananHub capstone has). Add once
there's a goal to measure against.

## 7. Constraints
[TODO] — team size, timeline, budget for third-party API usage (Gemini calls
aren't free at scale), any deadline. `../AbangananHub`'s PRD.md § 7 is the model
for what this section should look like once there's real information to put here.
