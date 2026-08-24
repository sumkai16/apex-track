# ARCHITECTURE.md — System Architecture

## 1. Stack Summary
- Framework: Expo SDK 54, React Native 0.81, React 19
- Language: TypeScript
- Navigation: Expo Router (file-based, `app/`), typed routes enabled
  (`experiments.typedRoutes` in `app.json`)
- Backend: **Supabase only** — Postgres (with RLS), Supabase Auth, and one Deno
  Edge Function (`supabase/functions/delete-account`). There is no separate API
  server repo — this app *is* the client and Supabase *is* the backend. See
  `context/SCHEMA.md` for the tables in use.
- Auth: Supabase Auth — email/password, plus native Google Sign-In
  (`@react-native-google-signin/google-signin` → ID token →
  `supabase.auth.signInWithIdToken`) and Facebook via a browser-based OAuth code
  exchange (`expo-web-browser` + `supabase.auth.exchangeCodeForSession`). Session
  persisted via `AsyncStorage` on native (`lib/supabase.ts`), `localStorage` on web
  (Supabase's default web behavior) — `expo-secure-store` is installed and listed
  as a plugin but not currently used for this.
- AI: two features, **both server-side**. `app/ai/generate-program.tsx` (the
  questionnaire) and `app/ai/chat.tsx` (the AI Coach chat) each call their own
  Edge Function — `generate-program` and `chat` — which hold the OpenRouter key
  as a Supabase secret and share `supabase/functions/_shared/openrouter.ts`.
  **No AI key ships in the app bundle.** See § 5. (The generator used to call
  Gemini directly from the client; `@google/genai` is still an unused dependency
  in `package.json`, and `EXPO_PUBLIC_GEMINI_API_KEY` is dead.)
- Styling: plain `StyleSheet.create` per screen, no NativeWind/Tailwind/Tamagui.
  `constants/theme.ts` (the default Expo-template `Colors`/`Fonts` export) exists
  but is **not imported anywhere in `app/`** — every screen hardcodes its own hex
  values instead. See `context/DESIGN.md` for the palette actually in use.

## 2. Current State
Auth-gated routing: `app/_layout.tsx` calls `supabase.auth.getSession()` on mount
and subscribes to `onAuthStateChange`, `router.replace`-ing to `/(tabs)/home` or
`/(auth)/login` depending on session presence. `registeringFlag` (a module-level
mutable flag, not React state) suppresses that redirect during the registration
flow so a new user can land on `confirm-name` instead of being bounced to `home`
mid-signup — see the fix in commit `5528ec7` for the race this previously caused.

Route groups:
- `(auth)` — `login.tsx`, `register.tsx`, `confirm-name.tsx` (post-social-signup
  display-name confirmation)
- `(tabs)` — `home.tsx`, `programs.tsx`, `log.tsx`, `progress.tsx`, `profile.tsx`
- `auth/callback.tsx` — the landing screen `expo-web-browser` returns to mid-OAuth;
  it's a loading spinner only, the actual token exchange happens in
  `lib/auth/facebook.ts` before this ever renders
- Top-level stack screens pushed over the tabs: `programs/[id].tsx`,
  `programs/create.tsx`, `programs/[id]/day/[dayId]/add-exercise.tsx` and
  `.../exercise/[exerciseId]/edit.tsx`, `exercise/[id].tsx`, `session/[id].tsx`
  (the active workout logger), `session-detail/[id].tsx` (read-only past-session
  view), `ai/generate-program.tsx`

**Domain:** a workout-tracking app — users build or AI-generate multi-day training
**programs**, each day made of **exercises** with target sets/reps, and log actual
**sessions** (with per-set `session_sets` recording weight/reps/PR status) against
a program day.

## 3. Data Access
No `lib/api.ts`-style client — screens import `supabase` from `lib/supabase.ts`
and call `.from('table').select(...)` directly (see `context/RULES.md` § Core
Principles for the honest state of this vs. the SRP ideal). The one shared
non-trivial data concern is unit conversion, factored into
`lib/WeightUnitContext.tsx`.

`lib/supabase.ts` creates the client with `flowType: 'pkce'` and
`detectSessionInUrl: false` (deep-link based OAuth return, not a web redirect
listener), `autoRefreshToken`/`persistSession` on, storage swapped to
`AsyncStorage` only on native (`Platform.OS !== 'web'` — web falls back to the
SDK's own `localStorage` default).

## 4. Auth Providers
- **Google** (`lib/auth/google.ts`): native `GoogleSignin.signIn()` →
  `supabase.auth.signInWithIdToken({ provider: 'google', token: idToken })`. Checks
  `profiles` for an existing row keyed on the auth user id to decide `isNewUser`
  (there's no dedicated "is this a first login" flag from Supabase itself for
  ID-token sign-in).
- **Facebook** (`lib/auth/facebook.ts`): `supabase.auth.signInWithOAuth({ provider:
  'facebook', skipBrowserRedirect: true })` to get an authorize URL,
  `WebBrowser.openAuthSessionAsync` to run it in an in-app browser tab, then
  `Linking.parse` the redirect back into this app (`apextrack://auth/callback`,
  scheme from `app.json`) to pull the `code` param and
  `supabase.auth.exchangeCodeForSession(code)`. Same `profiles`-existence check
  for `isNewUser`.
- **Email/password**: standard Supabase Auth, via `login.tsx`/`register.tsx`
  (not read in detail here — read those files directly before changing the flow).
- New-user path funnels through `(auth)/confirm-name.tsx` to let the user confirm
  or edit the display name suggested by the provider before it's written to
  `profiles`.

## 5. Edge Functions
Three, each registered per-function in `supabase/config.toml`.

`supabase/functions/_shared/openrouter.ts` is shared by the two AI functions
(files under `_shared/` are bundled into each function at deploy time; the
leading underscore stops Supabase treating the directory as a function of its
own). It owns JWT verification, CORS, the model constants, and the
call-with-fallback logic — deliberately in one place, because the
reasoning-model/`max_tokens` trap documented below is exactly the kind of bug
that would otherwise be fixed in one function and left in the other.

`supabase/functions/generate-program` — backs `app/ai/generate-program.tsx`. The
client sends only the questionnaire answers; the function fetches the exercise
catalogue, builds the prompt, calls OpenRouter, and **validates every returned
`exercise_id` against the catalogue** before handing the program back, since the
client inserts those ids straight into `program_exercises`. The old client-side
path trusted the model completely.

`supabase/functions/delete-account` — the one place this app needs privileged
(service-role) access: verifies the caller's JWT with an anon-key client, then uses
a service-role client to `adminClient.auth.admin.deleteUser(user.id)`. This is the
reference pattern for "the client needs to do something RLS can't allow" — proxy it
through a narrowly-scoped Edge Function, don't widen RLS or ship the service key
client-side.

`supabase/functions/chat` — backs the AI Coach (`app/ai/chat.tsx`). Different
reason for existing: not privilege, but **secrecy and trust**. It holds
`OPENROUTER_API_KEY` as a Supabase secret so the key never reaches the bundle, and
it builds the user's workout-context summary server-side — using a client carrying
the *caller's own* JWT, so RLS still applies and the client can't forge its own
training stats. It deliberately does **not** construct a service-role client;
least privilege. `verify_jwt = true` in `config.toml` (unlike `delete-account`)
rejects unauthenticated calls at the gateway.

Two things about its model config are load-bearing and cost a deploy to relearn:

- **`MODEL` (`stealth/ox-alpha`) is a reasoning model, and reasoning tokens are
  charged against `max_tokens`.** A measured turn spent 8,188 characters on its
  reasoning trace before writing any answer. Setting `MAX_OUTPUT_TOKENS` too low
  does not truncate the reply — it burns the whole budget on reasoning and returns
  **empty content**. That exact bug (`max_tokens: 600`) broke this function on its
  first deploy. It is now 4000. Don't lower it without checking `finish_reason` on
  a real reasoning turn.
- **It is rate-limited on a free shared pool**, returning HTTP 429 roughly half the
  time. Hence `FALLBACK_MODEL` (`google/gemini-2.5-flash-lite`) and the `models[]`
  array — OpenRouter's automatic failover is verified to fire for this error class.
  Observed latency is 10-23s, which is why the upstream abort is 45s and the
  client's own bound (`app/ai/chat.tsx`) sits outside it at 55s.

## 6. Known Gaps / Open Items
- **`constants/theme.ts` is dead code** in practice — every screen hardcodes its
  own palette instead (see `context/DESIGN.md`). Either wire screens to it or
  remove it; leaving it as unused boilerplate invites a future edit to "fix the
  theme" in a file nothing reads.
- ~~OpenRouter key client-exposed~~ — **resolved.** Both AI features now go
  through Edge Functions; the key exists only as a Supabase secret and is
  commented out in `.env.local`. Never reinstate it as `EXPO_PUBLIC_*`: that
  compiles it into the APK as an extractable literal.
- **Env vars only reach a build via EAS, not `.env.local`.** `.env.local` matches
  `.env*.local` in `.gitignore` and there is no `.easignore`, so it is never
  uploaded. Anything the app needs at build time must be set with
  `eas env:create` and the build profile must name its environment — each profile
  in `eas.json` now carries an explicit `"environment"` key for exactly this
  reason. Today the only one that matters is `EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID`.
- **No `SCHEMA.md` migrations tracked in-repo** — `supabase/` has no
  `migrations/` folder; schema changes happen against the live Supabase project
  directly (dashboard or a CLI not checked into this repo's history). Treat
  `context/SCHEMA.md` as inferred from `app/`'s query call sites, not as an
  authoritative source — it can drift from the real schema. When in doubt, check
  the Supabase dashboard.
