# Soft-glass UI system

The `src/components/ui/` directory and its companion `src/styles/soft-glass.js`
token surface implement the v3.3 "field co-pilot" design language for
AtmosFlow: rounded layered cards, translucent blur, spring motion, calm
spacing, friendly microcopy, and physical tap feedback.

This module sits **alongside** the established V3 token surface
(`src/styles/tokens.js`) — it does not replace it. Unmigrated screens
keep rendering through the V3 primitives unchanged. As surfaces are
migrated to the soft-glass system, prefer the primitives here.

## Design principles

Adapted from Apple's iOS 26 "Liquid Glass" language:

1. **Rounded containers** — card corners at 20px, sheet corners at 24px,
   pills at full-round. Nothing feels sharp.
2. **Floating layers** — cards over backgrounds, sticky bottom sheets,
   floating action bars; never a flat page.
3. **Glass / blur** — translucent surfaces with `backdrop-filter: blur`
   at three tiers (subtle 8px / card 14px / elevated 22px) and a
   `saturate(140–160%)` boost so the surface picks up color from the
   background. Opacity tuned to 88% / 93% / 96% (v3.3.1) — translucent
   enough to feel like a layer of glass, opaque enough that text
   stays confidently legible over busy page content.
4. **Spring motion** — `cubic-bezier(0.34, 1.4, 0.64, 1)` for taps,
   `cubic-bezier(0.16, 1.2, 0.3, 1)` for sheet entrance. Settles feel
   physical; never snap.
5. **Haptics** — every interactive primitive fires a light buzz on press
   (heavy + success patterns reserved for confirmation taps). Falls back
   to silent on iOS where the API is unavailable outside a user
   gesture.
6. **Calm spacing** — `RHYTHM` scale at 12/16/20/28 keeps stacks of cards
   breathing instead of cramming the screen.
7. **Friendly microcopy** — "Start walkthrough" not "Submit Assessment";
   "Pick up where you left off" not "Continue from current step";
   "Report an incident" not "Report IAQ Incident".
8. **Contextual UI** — the surface responds in real time (press scale,
   haptic, sheet spring) so the tool feels alive.

## Tokens (`src/styles/soft-glass.js`)

| Export | Purpose |
|---|---|
| `GLASS.subtle` | In-content chips, inline advisory banners |
| `GLASS.card` | Workhorse card surface |
| `GLASS.elevated` | Floating sheets, bottom sheets, modal panels |
| `SPRING.gentle` | Tap / 1-property transitions |
| `SPRING.bounce` | Sheet enter |
| `SPRING.settle` | Sheet exit, color / shadow transitions |
| `SPRING.durFast/Med/Slow` | 140 / 220 / 320 ms |
| `RADII.{sm,md,lg,xl,pill,card,sheet}` | Extends V3 R.* with card=20 and sheet=24 |
| `RHYTHM.{tight,base,loose,section}` | 12 / 16 / 20 / 28 |
| `FLOATING_BAR_SHADOW` | Upward-pointing shadow for bottom-pinned bars |
| `tapTransition` | Composable transition string for tap-feedback elements |
| `tapResetStyle` | `{ WebkitTapHighlightColor: 'transparent', touchAction: 'manipulation' }` |
| `softCard({ accent?, dense? })` | One-liner card style object |
| `softPill(tone, { lg? })` | One-liner pill style object |
| `stack(size)` | Flex column with rhythm gap |
| `floatingActionBar` | Sticky-bottom bar style object |

## Primitives (`src/components/ui/`)

### `<GlassCard>` — `GlassCard.jsx`

The workhorse card. Composes layered glass + rounded radius + optional
severity rail + optional tactile press feedback.

```jsx
<GlassCard accent={V3.SEVERITY.critical}>
  <h2>Critical finding</h2>
  <p>...</p>
</GlassCard>

<GlassCard onClick={() => openReport(r)} dense>
  Report row
</GlassCard>

<GlassCard elevated>...sheet content...</GlassCard>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `accent` | `string` (hex) | – | Paints a 2-px rail at the top edge for severity at-a-glance |
| `dense` | `boolean` | `false` | Halves padding for inline rows |
| `elevated` | `boolean` | `false` | Uses `GLASS.elevated` instead of `GLASS.card` |
| `onClick` | `function` | – | When supplied, enables tactile press feedback (scale-down on pointerdown) |
| `style` | `object` | – | Merged after the composed style |

### `<StatusPill>` — `StatusPill.jsx`

Soft-glass status / severity / confidence chip with inner highlight.

```jsx
<StatusPill tone={V3.SEVERITY.critical}>Critical</StatusPill>
<StatusPill tone={V3.STATUS.inProgress} size="lg">In progress</StatusPill>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `tone` | `string` (hex) | required | Drives bg + border + foreground; pair with `V3.SEVERITY.*` / `V3.CONFIDENCE.*` / `V3.STATUS.*` |
| `size` | `'sm' \| 'lg'` | `'sm'` | `'lg'` for hero-card emphasis |

### `<TactileButton>` — `TactileButton.jsx`

Press-feedback button with four variants and opt-in haptics.

```jsx
<TactileButton variant="primary" onClick={start}>Start walkthrough</TactileButton>
<TactileButton variant="secondary" onClick={...} icon={<I n="play" />}>Word</TactileButton>
<TactileButton variant="ghost" onClick={onClose}>Cancel</TactileButton>
<TactileButton variant="danger" haptic="heavy" onClick={confirmDelete}>Delete</TactileButton>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `variant` | `'primary' \| 'secondary' \| 'ghost' \| 'danger'` | `'secondary'` | Surface treatment |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Touch-target sizing |
| `icon` / `iconRight` | `ReactNode` | – | Optional flanking icons |
| `fullWidth` | `boolean` | `false` | Stretches to container |
| `haptic` | `'light' \| 'heavy' \| 'success' \| false` | `'light'` (`null` for ghost) | Vibrate pattern on press; pass `false` to silence |
| `disabled` | `boolean` | `false` | Disables press feedback + onClick + haptic |

### `<BottomSheet>` — `BottomSheet.jsx`

Mobile-first sheet that springs up from the bottom edge.

```jsx
{open && (
  <BottomSheet title="Export report" onClose={() => setOpen(false)}>
    <p>Choose format:</p>
    <GlassCard onClick={consultant}>Consultant</GlassCard>
    <GlassCard onClick={technical}>Technical</GlassCard>
  </BottomSheet>
)}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `open` | `boolean` | `true` | Visibility (mount on demand or pass explicit flag) |
| `onClose` | `function` | – | Called on backdrop tap and on Escape |
| `title` | `string` | – | Optional header label |
| `maxWidth` | `number` | `560` | Caps sheet width on tablet |
| `ariaLabel` | `string` | – | Falls back to `title` |

Behavior:
- Backdrop tap dismisses (only when the event target IS the backdrop).
- `Escape` dismisses.
- Body scroll locked while open; restored on unmount.
- `env(safe-area-inset-bottom)` is respected so the home-indicator never
  overlaps content.
- Spring entrance (220–320ms with `SPRING.bounce`).
- `prefers-reduced-motion: reduce` disables the entrance animation.

## Migration playbook

When converting a legacy modal / panel / button:

1. **Modals** → `<BottomSheet>`. Outside-tap dismiss is automatic.
   Deliberate gates (defensibility blockers) can keep a custom
   centered-modal pattern but still adopt `GLASS.elevated` for
   surface consistency.
2. **Cards** → `<GlassCard>`. Pass `accent` to encode a severity at the
   top edge. Pass `onClick` to make the card tactile.
3. **Pills / chips** → `<StatusPill>`. Use the right semantic tone
   from `V3.SEVERITY` / `V3.CONFIDENCE` / `V3.STATUS`.
4. **Buttons** → `<TactileButton>`. Pick a variant. Friendly microcopy.
5. **Dropdowns** that need outside-tap dismiss must set the backdrop
   `zIndex` ABOVE all content (≥ 200) and the menu itself one step
   higher (≥ 210). Lower z-indexes get intercepted by floating
   bottom-of-screen content (CTAs, nav). Apply `pointerDown` AND
   `click` to the backdrop so iOS Safari catches the dismiss on the
   first touch.
6. **Friendly microcopy** — re-read every label. "Submit" / "Save" /
   "Process" / "Generate Now" are off-brand. The product is a field
   co-pilot, not a compliance form.

## Tested behavior

`tests/components/soft-glass-primitives.test.jsx` pins:

- `BottomSheet`: backdrop tap dismisses, inner content does NOT, Esc
  dismisses, body-scroll lock + restore.
- `TactileButton`: default haptic by variant, override behavior,
  disabled state, iOS `vibrate` exception swallowed.
- `GlassCard`: accent rail render, onClick fires, cursor / tap-reset
  applied only when interactive.
- `StatusPill`: tone color contract, lg-size padding.

20 tests; run with `npm test -- --run tests/components/soft-glass-primitives`.

## Surfaces migrated so far

| Surface | PR | Notes |
|---|---|---|
| Result hero card + Next Steps + Export bar | #225 | Severity rail on hero, tactile Word/Share/Map Zones, DOCX picker as BottomSheet |
| Home: active-draft hero, empty state, lists, header pill, floating Continue walkthrough CTA | #226 | Friendly microcopy, glassy header pill |
| Modals: Zone Complete, Pre-assessment disclaimer, Photo Select, Premium Gate, Delete confirm, Calibration warning, Consultant preflight | this PR | All migrated to BottomSheet or soft-glass shell with proper backdrop dismiss |

## Next surfaces (queued)

- **Pre-Survey / Zone capture** — soft zone cards for CO₂, RH,
  temperature, odor, moisture, HVAC; swipeable zone summaries.
- **Workflow stepper** — animated Building → Zones → Observations →
  Findings → Report indicator.
- **FieldAssistant FAB** — refactor the full-screen Jasper sheet into
  a floating bubble that expands on tap.
