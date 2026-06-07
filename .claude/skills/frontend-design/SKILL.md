---
name: frontend-design
description: Build and refine AtmosFlow's UI to the project's existing design language. Use this skill whenever the task is visual/frontend work in atmosiq-v6 — adding or restyling a component, screen, card, button, modal, nav, or chat surface; adjusting colors/typography/spacing/motion; matching a screenshot or reference; or improving polish, accessibility, theming, or mobile/PWA behavior. Triggers on phrases like "redesign", "restyle", "make it look like", "add a card/button/modal", "neon outline", "match the … screen", "change the font/color/spacing", "the … looks off", "fix the layout", or any request to change how something renders. Do NOT use for backend/API, engine/scoring, DOCX report generation, or non-visual logic.
---

# AtmosFlow frontend-design skill

You're invoked for **visual/frontend work** in `atmosiq-v6`. The goal is UI
that looks like it was always part of the app — premium, technical, and
defensible — not a bolted-on widget. Match the existing language; don't invent
a parallel one.

## 0. Non-negotiables (read first)

- **Stack:** Vite + React 18 SPA, **inline `style={{...}}`** per component. No
  Tailwind, no CSS-in-JS lib, no shadcn. A token surface exists; use it.
- **Write code that reads like the surrounding code** — same idioms, comment
  density, naming. Surgical changes only; no drive-by refactors.
- **Screening-only positioning** holds in copy too: "may indicate",
  "consistent with", "screening-level" — never "diagnose / confirm / fails
  compliance / safe". (See CLAUDE.md.)
- **Always `npm run build`** (from `atmosiq-v6/`) before declaring done. The
  SPA (`src/`) is **not** covered by lint, so the build is your gate.
- **The engine is sacred** — never touch `src/engine*/` for a visual change.

## 1. Where the design system lives

| Concern | Source of truth |
|---|---|
| Color/spacing/type tokens | `src/styles/tokens.js` (imported as `V3` / `* as V3`) |
| Theme palette (CSS vars) | `index.html` `:root` (dark) + `[data-theme="light"]` |
| Soft-glass surfaces, radii, rhythm | `src/styles/soft-glass.js` (`GLASS`, `RADII`, `RHYTHM`) |
| Jasper (AI chat) tokens | `src/styles/jasper-tokens.js` |
| UI primitives | `src/components/ui/` (`GlassCard`, `TactileButton`, `GhostButton`, `Chip`, `BottomSheet`, `InlineError`, `GaugeBar`, …) |
| App shell / dashboard / nav / result tabs | `src/components/MobileApp.jsx` (the hot file) |
| Severity color helper | `sv(sev)` in `MobileApp.jsx` (`critical/high/medium/low/pass/info` → `{c,bg,l}`) |

**Theme:** never hardcode hex for themable surfaces. Use the CSS vars
(`var(--bg)`, `var(--surface)`, `var(--card)`, `var(--border)`, `var(--text)`,
`var(--sub)`, `var(--dim)`, `var(--accent)`, `var(--accent-fill)`,
`var(--on-accent-fill)`, `var(--warn)`, `var(--danger)`, `var(--success)`).
They flip automatically under `[data-theme="light"]` (set on `<html>` via
`src/utils/theme.js`). If you hardcode a surface that must adapt, you've
introduced a light-mode bug — verify both themes.

## 2. Established patterns (reuse these, don't reinvent)

- **Cards:** `GlassCard` (soft-glass surface). `style` is spread last, so you
  can override `border` / `boxShadow` / `padding`. `accent="<color>"` adds a
  top rail.
- **Buttons:** `TactileButton` (`variant="primary|secondary"`, `size`, `pill`,
  `icon`). Primary = filled `--accent-fill` with `--on-accent-fill` text.
- **Neon outline** (full-perimeter glow — used on the Home co-pilot card and
  the result hero):
  ```js
  border: `1px solid color-mix(in srgb, ${C} 80%, transparent)`,
  boxShadow: `0 0 18px color-mix(in srgb, ${C} 28%, transparent),
              0 0 6px  color-mix(in srgb, ${C} 42%, transparent),
              inset 0 0 14px color-mix(in srgb, ${C} 7%, transparent),
              0 4px 14px rgba(0,0,0,0.35)`,
  ```
  `C` = `var(--accent)` for brand-neutral cards, or the **severity color**
  (`sevPillTone`) for result/severity cards so it stays coherent.
- **Accent:** restrained cyan `--accent` for icons/text/borders;
  brighter `--accent-fill` for filled CTAs and emphasis only.
- **Typography:** Inter (UI). **Serif (Lora→Tiempos)** for AI *response* copy.
  **Bitcount Grid Single** (cyan) for the Jasper "thinking" status. Don't
  spread these fonts to general UI.
- **Motion:** keyframes live in the global `<style>` block in `MobileApp.jsx`
  (and `jasper-tokens.js` for chat). **Always** pair animation with a
  `@media (prefers-reduced-motion: reduce)` fallback.

## 3. Mobile / PWA discipline (this is a field tool on phones)

- Primary tap targets ≥ **44px** min-height.
- Respect safe-area insets: `env(safe-area-inset-top/bottom)` on fixed/edge UI.
- Don't break the locked viewport (no horizontal overflow; `index.html` floors
  inputs at 16px to stop iOS zoom — keep form controls ≥16px).
- Test the change at a narrow width (~360–390px). Long labels wrap or need
  `whiteSpace:'nowrap'` + sizing.

## 4. Accessibility (cheap, do it inline)

- Meaningful `<img>` → real `alt`; icon-only buttons → `aria-label`.
- Status/live regions use `role="status"`; don't let rapidly-changing text
  spam screen readers (mark the volatile span `aria-hidden`, keep a stable
  label on the container).
- Sufficient contrast; if you intentionally go below AA for brand reasons,
  leave a comment flagging it (precedent: the white-on-cyan CTA note in
  `index.html`).

## 5. Workflow

1. **Find the pattern first.** Grep for the component/screen and the nearest
   existing example of what you're building. Read the tokens/primitive you'll
   use. Don't start from a blank style object.
2. **Make the surgical change** in the matching idiom (inline styles, V3
   tokens, CSS vars).
3. **Verify both themes** if you touched any surface/border/text color.
4. **`npm run build`** from `atmosiq-v6/`. Fix anything it surfaces.
5. **No headless browser here** — the Vercel preview is the real visual check.
   Say so, and call out any judgment calls (e.g. severity-tint vs cyan) so the
   reviewer can redirect.

## 6. Anti-patterns

- Hardcoded hex on a themable surface (breaks light mode).
- Tailwind classes / new styling libraries.
- Spreading the serif or Bitcount fonts into general UI.
- Animations with no reduced-motion fallback.
- Tap targets < 44px on primary actions.
- "Improving" unrelated nearby code in the same change.
