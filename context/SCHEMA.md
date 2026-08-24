# SCHEMA.md — Database Schema (inferred)

**This is reverse-engineered from Supabase query call sites in `app/` and `lib/`
(`.select()`, `.insert()`, `.eq()` strings), not from an actual schema dump —
`supabase/` has no `migrations/` folder in this repo, so there is no tracked
source of truth to read instead.** Treat every column below as "observed in use,"
not "the full/authoritative column list." Verify against the Supabase dashboard
before relying on this for anything consequential (a migration, a security
review). Update this file when you touch a table and learn something new about it.

## Tables

### `profiles`
One row per user, keyed on the Supabase Auth user id (not a separate PK/FK — see
`confirm-name.tsx`/`register.tsx` inserting `{ id: user.id, ... }`).
- `id` — PK, = `auth.users.id`
- `display_name`
- `avatar_url`
- `weight_unit` — `'kg' | 'lbs'`, read by `lib/WeightUnitContext.tsx`
- `height_unit`
- `age`
- `height_cm`
- `weight_kg`
- `gender`
- `fitness_goal`

### `programs`
A user's workout program (hand-built or AI-generated).
- `id` — PK
- `user_id` — FK → `profiles.id` / `auth.users.id`
- `name`
- `description`
- `is_active` — `log.tsx` filters the "current" program on this
- `created_at`

### `program_days`
A day within a program (training day or rest day).
- `id` — PK
- `program_id` — FK → `programs.id`
- `name`
- `day_order` — int, used for sequencing/sorting
- `is_rest_day` — bool (`generate-program.tsx` filters `!d.is_rest_day` to find
  training days among created days)

### `program_exercises`
An exercise assigned to a program day, with its target prescription.
- `id` — PK
- `program_day_id` — FK → `program_days.id`
- `exercise_id` — FK → `exercises.id`
- `order_index`
- `target_sets`
- `target_reps`

### `exercises`
The exercise library — both system-seeded and user-created.
- `id` — PK
- `name`
- `category`
- `equipment_type`
- `icon` — used by `programs.tsx`'s template-preview lookup
- `estimated_duration`
- `is_system` — bool, distinguishes seeded/template exercises from user-added ones
- `created_by` — FK → `profiles.id`, set when `is_system: false`

### `sessions`
A logged workout instance against a specific program day.
- `id` — PK
- `user_id` — FK → `profiles.id`
- `program_id` — FK → `programs.id` (filtered on in `log.tsx:93`, inserted at `log.tsx:152`)
- `program_day_id` — FK → `program_days.id`
- `status` — seen values: `'in_progress'`, `'completed'`, **`'abandoned'`**
  (`session/[id].tsx:497`). **An abandoned session still contains its saved
  sets** — `saveAllSets()` runs before the status update — so any aggregate over
  `session_sets` MUST filter `status = 'completed'` or it double-counts.
- `started_at`
- `ended_at`

### `session_sets`
Individual logged sets within a session.
- `id` — PK (implicit — not seen selected directly, but referenced for delete)
- `session_id` — FK → `sessions.id`
- `program_exercise_id` — FK → `program_exercises.id`
- `exercise_id` — **denormalized** copy of `program_exercises.exercise_id`, written
  by both write paths (`session/[id].tsx:294-305`, `:399`). This is the shortcut
  that makes per-exercise history a **one-hop** query — `exercise/[id].tsx:57-84`
  predates it and still does the three-hop `program_exercises` dance instead.
- `set_number`
- `weight_used` — **always kilograms**, regardless of `weight_unit` below
- `reps_done`
- `weight_unit` — hardcoded `"kg"` on every insert (`session/[id].tsx:301`, `:403`).
  Display conversion is `lib/WeightUnitContext.tsx`'s job, from `profiles.weight_unit`.
- `is_extra` — bool, marks a bonus set logged beyond `target_sets`
- `is_pr` — bool. **Do not trust this column.** The live per-set upsert writes
  `is_pr: false` unconditionally (`session/[id].tsx:301`); only the finish-time
  `saveAllSets()` pass computes it properly (`:412-445`) — and that pass uses
  `.insert()`, not an upsert, so rows already written live keep the stale `false`.
  Compute maxima from `weight_used` instead.
- Upsert conflict key: `"session_id,program_exercise_id,set_number"`

### `ai_generator_questions`
The onboarding question set `ai/generate-program.tsx` walks the user through
before calling Gemini.
- `id` — PK
- `is_active` — bool, filters which questions are currently shown
- `order_index`
- (other columns holding the question text/type/options exist — not enumerated
  here; read `generate-program.tsx`'s render of `questions` before changing this
  table)

## Relationships (as used, not as constrained)
```
profiles 1—* programs
programs 1—* program_days
program_days 1—* program_exercises
exercises 1—* program_exercises
profiles 1—* sessions
program_days 1—* sessions
sessions 1—* session_sets
program_exercises 1—* session_sets
```

## RLS
Not inspected here — every query in `app/` filters by `user_id`/`id` client-side
(e.g. `.eq("user_id", user.id)`), which only protects the app's own UI, not the
data itself. Whether Postgres RLS policies actually enforce per-user isolation at
the database level needs verifying directly in the Supabase dashboard before
treating this app as safe against a malicious client bypassing the app UI and
calling the API directly with a stolen anon key + someone else's JWT.

## Cleanup / cascade behavior
`(tabs)/profile.tsx`'s account-deletion flow manually deletes in dependency order
— `session_sets` → `sessions`, then `program_exercises` → `program_days` →
`programs` — before finally calling the `delete-account` Edge Function to remove
the `auth.users` row. **This only makes sense if there's no `ON DELETE CASCADE`
from `auth.users`/`profiles` down through these tables** (otherwise the manual
deletes would be redundant, though harmless). Confirm the actual FK cascade
behavior in the dashboard before assuming either way — if cascades already exist,
this client-side cleanup could be simplified.
