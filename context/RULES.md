# RULES.md — Coding & Implementation Rules

Same intent as `../AbangananHub/context/RULES.md` (plan-before-implementing, DRY at
the right threshold, extra care around anything unattended or security-sensitive),
translated to this stack — Expo Router + TypeScript + Supabase, a single client repo
with no separate backend. Supabase (Postgres + Auth + Edge Functions) *is* the server;
there is no `../apex-track-api` to split concerns against.

## Core Principles
- **SOLID** — especially Single Responsibility. Reality check: right now almost every
  screen in `app/` calls `supabase.from(...)` directly inline (fetch, mutate, and
  render all in one component — see `app/(tabs)/profile.tsx`, `app/session/[id].tsx`).
  That's the existing pattern, not a target to defend. When a query is genuinely
  reused across 2+ screens (e.g. "does this user have an active program" — duplicated
  in `home.tsx`, `log.tsx`, `profile.tsx`), extract it into `lib/`, don't copy a third
  time.
- **DRY** — extract when logic repeats 3+ times, not before.
- **KISS** — default to the boring, obvious Expo/React Native solution. No Redux,
  MobX, Zustand, or React Query — `useState`/`useEffect` plus direct Supabase calls
  is the whole data layer today, and that's fine at this scale.

## Plan Before Implementing
**No non-trivial screen or feature starts with an edit.**
1. **Investigate first** — read the existing screen(s)/route(s) doing something
   similar before adding a new pattern next to one that already does it differently.
   Check what table/columns a feature needs against `context/SCHEMA.md` (or the
   Supabase dashboard directly — `SCHEMA.md` is inferred from code, not introspected,
   and can drift).
2. **Present the plan** — approach, files touched, design decisions.
3. **Ask about real forks only** — UX pattern, navigation structure, data shape.
   Don't ask about anything with an obvious default.
4. **Then implement**, layer by layer per Build Order below.

Use plan mode for anything multi-screen or design-bearing. Skip the ceremony for a
one-line fix, a rename, or a typo.

## Naming
- Variables/functions: camelCase (`displayName`, `fetchExercises()`)
- Components: PascalCase. Route files follow Expo Router's own convention —
  `app/(tabs)/programs.tsx`, `app/session/[id].tsx`, `app/programs/[id]/day/[dayId]/add-exercise.tsx`
  — the bracket/parenthesis syntax is the router's, not a naming choice.
- Types/interfaces: PascalCase (`GoogleSignInResult`, `SetData`)
- Hooks/context: `use` prefix (`useWeightUnit`, `useColorScheme`)
- Supabase columns: snake_case, matches Postgres convention (`display_name`,
  `program_day_id`, `weight_used`, `reps_done`, `is_pr`, `is_rest_day`,
  `order_index`, `target_sets`, `target_reps`, `equipment_type`,
  `estimated_duration`) — see `context/SCHEMA.md`.

## Error Handling
- **Every Supabase call site handles the error case** — check `error` from the
  destructured response before trusting `data`, and surface failures via
  `Alert.alert` (the pattern already used in `log.tsx`, `home.tsx`) rather than
  letting a screen silently render empty state.
- **No `console.log`/`console.error` left in committed code.** This is currently
  violated in a few places (`home.tsx`'s `fetchProfile` catch, `session/[id].tsx`'s
  session-query failure) — don't add new ones, and clean up existing ones when you're
  already touching that file.
- No swallowed promise rejections (`.catch(() => {})`) outside of the two
  deliberate, already-commented exceptions in `lib/auth/google.ts` /
  `signOutGoogle()` (best-effort sign-out cleanup).
- Supabase RLS denials and auth errors both surface as a Postgres/Auth `error`
  object, not a thrown exception — always check it explicitly, don't rely on a
  try/catch alone to catch a failed query.

## State Management
- **Auth state is not centralized.** There is no `AuthProvider`/`useAuth()` — the
  root layout (`app/_layout.tsx`) calls `supabase.auth.getSession()` /
  `onAuthStateChange` directly and redirects with `router.replace`. Screens that
  need the current user call `supabase.auth.getUser()` themselves. If a second
  global piece of auth-derived state is ever needed, that's the point to introduce
  a context — don't thread props for it instead.
- **`WeightUnitContext` (`lib/WeightUnitContext.tsx`) is the one existing global
  context** — it exists because unit conversion (`kg`/`lbs`) is needed on almost
  every session/progress screen and is cheap to keep in sync via
  `onAuthStateChange`. It's the model to follow if another cross-cutting user
  preference needs the same treatment — not a pattern to add a second, unrelated
  context next to casually.
- Local UI state (form fields, modal open/closed, loading flags) stays in
  `useState` on the screen that owns it.
- Server data (programs, sessions, exercises) is fetched where it's needed, not
  cached globally. No data-fetching library is installed; don't add one
  speculatively — see KISS above.

## Secrets & Client-Exposed Keys
- **`EXPO_PUBLIC_*` env vars are compiled into the JS bundle as literals** and are
  extractable from any built APK/IPA — same caveat as `VITE_*` vars in the web
  sibling repo. `EXPO_PUBLIC_GEMINI_API_KEY` (`app/ai/generate-program.tsx`) and
  `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID` are both shipped this way today. The Google
  client ID is meant to be public (that's how native Google Sign-In works); the
  Gemini key is not — anyone who unpacks the app can extract and reuse it against
  your quota/billing. Don't add another paid/rate-limited third-party key this way
  without at least discussing proxying it through a Supabase Edge Function first
  (the `delete-account` function is the existing example of the pattern: verify
  the caller's JWT, then do the privileged thing server-side).
- The Supabase **anon key** (`lib/supabase.ts`) is safe to ship client-side by
  design — it's meaningless without Row Level Security policies behind it. Never
  ship the **service role key** (`SUPABASE_SERVICE_ROLE_KEY`) anywhere in `app/` or
  `lib/` — it belongs only in Edge Function runtime env, as in
  `supabase/functions/delete-account/index.ts`.

## Testing
- No automated test suite — manual testing on a real device/emulator is the
  pattern here, same as the sibling repos.
- **Test on a physical device or emulator, not just `npx expo start --web`.**
  Native Google/Facebook sign-in (`@react-native-google-signin/google-signin`,
  `expo-web-browser` OAuth flow) and haptics don't behave the same — or don't run
  at all — in the web preview.
- `expo-secure-store` is installed and listed as an Expo plugin in `app.json` but
  is not currently imported anywhere — the Supabase session goes through
  `AsyncStorage` (`lib/supabase.ts`), which is Supabase's own documented pattern
  for RN. Don't assume `SecureStore` is wired up just because the dependency and
  plugin exist.

## Git Discipline
- Conventional commits (`feat:`, `fix:`, `chore:`) where practical — the log is
  mixed (some conventional, some not); use conventional going forward rather than
  "fixing" old history.
- Author commits as the user only. **Do not add a `Co-Authored-By: Claude` (or any
  AI) trailer** — matches the convention in `../AbangananHub` and
  `../AbangananHubMobile`. (One earlier commit here — `5528ec7` — has the trailer;
  don't repeat it.)
- Separate commits per concern; avoid `git add .` across unrelated work.
- This repo shares work with a collaborator (see `joseph` branch merges in the
  log) — same as the sibling repos, so re-check anything merged in from that
  branch against the palette/patterns in `context/DESIGN.md` before building on
  top of it (see DESIGN.md's palette-drift note on `app/ai/generate-program.tsx`).

## Build Order (Layer-by-Layer)
1. Confirm the table/columns exist (`context/SCHEMA.md`, or the Supabase dashboard
   if `SCHEMA.md` looks stale) — add a migration via the Supabase dashboard/CLI
   first if it doesn't.
2. If the query is reused elsewhere, a typed helper in `lib/`; otherwise inline in
   the screen (see Core Principles above).
3. Screen component — fetch, loading/error state, render.
4. Wire into navigation (`app/` route file — Expo Router picks it up by file path).

Confirm output at each step before proceeding to the next.
