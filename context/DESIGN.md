# DESIGN.md — Design System

No design tool, token file, or component library backs this today — the palette
below is **reverse-engineered from the hex values actually hardcoded across
`app/*.tsx`**, not read from `constants/theme.ts` (which is unused, see
`context/ARCHITECTURE.md`). Treat this file the way `context/SCHEMA.md` is
treated: a snapshot of what's really there, to keep new screens consistent with
existing ones — update it when the real palette moves, don't treat it as a source
of truth that overrides the code.

## 1. The palette actually in use
Dark theme throughout, near-black backgrounds with a maroon/red accent —
consistent across `home.tsx`, `programs.tsx`, `profile.tsx`, `progress.tsx`,
`log.tsx`, `session/[id].tsx`, `session-detail/[id].tsx`, the auth screens, and
the tab bar (`(tabs)/_layout.tsx`):

| Role | Hex | Notes |
|---|---|---|
| Screen background | `#050505` | The near-universal root container color |
| Secondary background / section | `#0a0a0a`, `#0d0d0d`, `#080808` | Slightly-lifted panels off the root background |
| Card background | `#1a1a1a`, `#161616`, `#141414`, `#121212` | Multiple near-identical darks in circulation — see § 3 |
| Border / divider | `#2a2a2a` | |
| Primary accent (brand) | `#800000` (maroon) | Buttons, active tab icon, active states |
| Accent — brighter/interactive | `#b30000` | Pressed/highlighted variant of the accent, used heavily in `profile.tsx`/`programs.tsx` |
| Accent — danger/alert | `#e60000`, `#cc0000`, `#ff4444` | Delete actions, validation errors |
| Success | `#0a7a0a` (text), `#eaffea` (bg) | Only seen in `login.tsx` — success-state form feedback |
| Primary text | `#fff` | |
| Secondary/muted text | `#cfcfcf`, `#9a9a9a`, `#888`, `#444` | Multiple grays in circulation, not a fixed scale |

## 2. Known drift — `app/ai/generate-program.tsx`
This screen uses a **completely different palette**: Zinc-scale grays
(`#09090B`, `#18181B`, `#141417`, `#27272A`, `#3F3F46`, `#52525B`, `#71717A`,
`#A1A1AA`, `#F4F4F5`, `#FAFAFA`, `#FFFFFF`) with `#FF3B30` (iOS system red) as the
accent, instead of the `#050505`/`#800000` pattern everywhere else. It's the
newest screen in the app and reads like it was designed independently rather than
matched to the rest. **Don't copy this screen's colors into new work** — treat § 1
as the palette to match, and flag `generate-program.tsx` for a palette pass rather
than treating its choices as precedent.

## 3. Anti-pattern to actively fix (not urgent, but real)
Card backgrounds alone have at least four near-identical darks in circulation
(`#1a1a1a`, `#161616`, `#141414`, `#121212`) with no visible rule for which screen
gets which. Same for muted text grays. There is no evidence this is intentional —
it reads as "picked a close-enough dark hex each time" rather than a scale. If you
touch a screen's `StyleSheet` for another reason, feel free to consolidate onto one
of the existing values rather than introducing a fifth; don't do a repo-wide
find/replace as a standalone task without asking first, since 4 near-identical
darks is a minor consistency nit, not a bug.

## 4. Structural conventions observed
- **Styling**: `StyleSheet.create` at the bottom of each screen file, no
  NativeWind/Tailwind despite `react-native-web` being present for Expo Web
  support. Keep new screens consistent with this — don't introduce a styling
  library for one component.
- **No shared `<Card>`/`<Button>`/`<Screen>` components** — each screen defines its
  own view/style combination inline. If a visual pattern (card layout, button
  style) starts repeating identically across 3+ screens, that's the DRY threshold
  from `context/RULES.md` — worth extracting into a shared component at that
  point, not before.
- **Icons**: `@expo/vector-icons` (confirm which icon set per-screen before adding
  a new one — don't mix icon families within the same screen).
- **Tab bar** (`(tabs)/_layout.tsx`): active tab uses the `#800000` accent against
  a `#0d0d0d`/`#1a1a1a` bar background, consistent with § 1.

## 5. If this ever gets a real token file
Given the palette above is already consistent across 90%+ of the app (everything
but `generate-program.tsx`), a light `constants/colors.ts` (or fixing up the
existing unused `constants/theme.ts`) with `background`, `surface`, `card`,
`accent`, `accentBright`, `danger`, `border`, `text`, `textMuted` tokens pulled
from § 1 would let `generate-program.tsx` converge onto the rest of the app in one
pass instead of a hundred scattered hex edits. Not needed until someone's actively
touching multiple screens' styling in the same session — don't do this speculatively.
