@AGENTS.md

Project context and rules live in `context/`:
- `context/RULES.md` — coding & implementation rules (SOLID/DRY/KISS, naming, error handling, state management, secrets handling)
- `context/ARCHITECTURE.md` — app architecture, routing, auth, data access, Edge Functions
- `context/DESIGN.md` — the palette and styling conventions actually in use (reverse-engineered from the code — there's no design tool or token file yet)
- `context/SCHEMA.md` — Supabase tables/columns as inferred from query call sites (no migrations are tracked in this repo — verify against the dashboard before relying on it for anything consequential)
- `context/PRD.md` — mostly `[TODO]` placeholders; the as-built feature list is filled in, product decisions (target user, scope, success metrics) are not

Read the relevant file(s) before non-trivial work.

## Planning
When finalizing a plan (plan mode), save a copy into `plans/` in this repo
(descriptive kebab-case filename), in addition to the default plan-mode
location. Keeps design decisions and their reasoning versioned alongside the
code instead of only living in a local scratch file.

## Git commits
Author commits as the user only. Do not add a `Co-Authored-By: Claude` (or
any AI) trailer.
