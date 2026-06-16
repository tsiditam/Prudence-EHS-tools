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

### `<AtmosFlowFloatingDock>` — `AtmosFlowFloatingDock.jsx`

The bottom navigation, built to match the **Instagram (iOS-26 "Liquid Glass")
floating tab bar**: a floating, rounded, frosted-glass **capsule** that hovers
just above the bottom edge with side margins (not a flat edge-to-edge bar).
Destinations are icon-only and spread evenly; the active one sits inside a soft,
neutral rounded-rect highlight tile. Monochrome throughout — no labels, no brand
accent, no magnification. The AtmosFlow AI launcher is **not** in the capsule —
it floats separately on the right via `JasperFloatingButton` (below).

```jsx
<AtmosFlowFloatingDock
  maxWidth={contentMax}
  tabs={[
    { id: 'projects', label: 'Projects', icon: 'bldg', active: view === 'projects', onClick },
    { id: 'sensor-data', label: 'Logger Studio', icon: 'chartLine', active: view === 'sensor-data', onClick },
    { id: 'history', label: 'Reports', icon: 'report', active: view === 'history', onClick, badge: 3 },
    { id: 'account', label: 'Account', icon: 'user', active: view === 'account', onClick, renderIcon },
  ]}
/>
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `tabs` | `array` | – | `{ id, label, icon, active, onClick, badge?, renderIcon? }` per tab |
| `maxWidth` | `number` | `460` | Caps the capsule width (pass the page content width) |
| `ariaLabel` | `string` | `'Primary'` | `aria-label` for the `<nav>` |

Behavior:
- **Floating frosted-glass capsule.** `position: fixed` floating above the
  bottom edge (`bottom: calc(env(safe-area-inset-bottom) + 10px)`) with side
  margins; rounded-999 capsule with heavy `backdrop-filter` blur, a translucent
  tint, a hairline edge, and a soft lifted shadow. Capped at `maxWidth` and
  centered.
- **Soft highlight tile = active cue.** The active destination sits inside a
  lighter, neutral rounded-rect tile on the glass. Icons are monochrome —
  active glyph full-contrast (`var(--text)`, heavier stroke), inactive muted
  (`var(--sub)`). No labels, no brand accent, no underline.
- **Account = profile avatar.** The account tab passes `renderIcon` to draw a
  plain circular avatar (hairline edge); the highlight tile behind it marks it
  active (no colored ring).
- **Tap feedback only.** A quick press-scale on tap; `prefers-reduced-motion:
  reduce` removes it. No magnification / glide.
- **Theme-aware:** dark frosted capsule + light glyphs in dark mode; a white
  frosted capsule + dark glyphs in light mode (via `[data-theme="light"]`
  overrides). The active tile flips to a bright frosted tile in light mode.

`aux` (an optional extra destination) is folded **inline** into the capsule —
Instagram keeps every destination in the one bar, never a detached side pill.

### `<JasperFloatingButton>` — `JasperFloatingButton.jsx`

The AtmosFlow AI launcher, detached from the dock and floated on the right
edge. Liquid-glass circle with the breathing-glow brain mark.

```jsx
{userMode !== 'fm' && (
  <JasperFloatingButton active={faOpen} onClick={openJasper} />
)}
```

| Prop | Type | Default | Description |
|---|---|---|---|
| `onClick` | `function` | – | Opens the assistant |
| `active` | `boolean` | `false` | Reflects open state (`aria-pressed`) |
| `label` | `string` | `'AtmosFlow AI'` | Accessible name |

Behavior:
- **Instagram-style scroll response:** full size (60px) at the top / while
  scrolling up; shrinks (46px) while scrolling down so it stays out of the
  way while reading. `requestAnimationFrame`-throttled scroll listener.
- Dark-glass in dark mode, white capsule in light mode (mirrors the dock).
- `prefers-reduced-motion: reduce` calms the glow + transitions.

### AtmosFlow AI primitives (Jasper)

Extracted from `FieldAssistant.jsx` during the Phase 4 design-system
pass so other AI surfaces (e.g. `JasperWatchPanel`, future inline-AI
widgets) can adopt the same feel without re-copying inline styles.
Tokens live in `src/styles/jasper-tokens.js`.

| Primitive | File | Purpose |
|---|---|---|
| `<JasperContextChip>` | `JasperContextChip.jsx` | Small pill that surfaces what the AI assistant knows about the user's situation. Three tones (`accent` / `warn` / `success`) keyed off `JASPER_CHIP_TONES`. |
| `<JasperSuggestionCard>` | `JasperSuggestionCard.jsx` | Empty-state suggestion card with tinted icon tile + uppercase category label + question body. Hover/focus lifts 1px and adds a soft cyan glow. |

Token surface (`src/styles/jasper-tokens.js`):

| Export | Purpose |
|---|---|
| `JASPER_SPRING` | iOS sheet-present cubic-bezier. Use for sheet entrances. |
| `JASPER_EASE_OUT` | Ease-out-quart. Use for bubble / chip / hover transitions. |
| `JASPER_DURATION.{backdrop,sheet,enter,hover}` | Tuned timings; tweak in one place. |
| `JASPER_STAGGER_MS` | Inter-item delay for chip / card list reveals (60ms). |
| `jasperAtmosphere(base?, strengthPct?)` | Radial cyan halo gradient for the sheet background. |
| `JASPER_SHEET_SHADOW` | Top-anchored elevation shadow + accent halo edge. |
| `jasperComposerFocusShadow()` | Composer focus ring (soft cyan halo). |
| `JASPER_CHIP_TONES.{accent,warn,success}` | `{ fg, bg, bd }` palette consumed by `<JasperContextChip>`. |
| `JASPER_KEYFRAMES_CSS` | The full animation rule set (keyframes + reduced-motion overrides + suggestion-card hover rules). Mount once per surface in a `<style>` block. |

Host surfaces must mount `JASPER_KEYFRAMES_CSS` somewhere in their tree —
the primitives reference class names defined in that block.

### V3-surface primitives (Logger Studio)

Plain V3-token primitives (solid surfaces, neutral borders — **not**
soft-glass: no blur, spring, or haptics) extracted from `SensorDataPage`
during the Logger Studio redesign. They sit alongside the soft-glass set
in this directory; reach for them on V3-surface screens.

| Primitive | File | Purpose |
|---|---|---|
| `<SegmentedControl>` | `SegmentedControl.jsx` | Tablist of pill buttons for a view switch. `options=[{value,label,badge?}]`, controlled via `value` / `onChange`. |
| `<Chip>` | `Chip.jsx` | Rounded pill. Static label (no `onClick`), action chip (`onClick`), or toggle (`onClick` + `selected`, optional leading ✓ via `checkmark`). |
| `<CollapsibleCard>` | `CollapsibleCard.jsx` | GlassCard with a micro-label header that toggles its body; optional dim `summary` while collapsed. |
| `<GhostButton>` | `GhostButton.jsx` | Low-emphasis bordered button. `style` overrides spacing / danger color. Exports `ghostButtonStyle`. |
| `<Select>` | `Select.jsx` | Compact themed native `<select>`. Exports `selectStyle`. |
| `<StatTile>` | `StatTile.jsx` | Labelled numeric readout tile (`label` / `value`). |
| `<RoleBadge>` | `RoleBadge.jsx` | Tiny uppercase outlined dataset-role tag (indoor / outdoor / zone). Exports `ROLE_TONE`. |
| `<InlineError>` | `InlineError.jsx` | Danger-tinted inline message box. Exports `inlineErrorStyle`. |

Contract pinned by `tests/components/sensor-ui-primitives.test.jsx`.

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

`tests/components/AtmosFlowFloatingDock.test.jsx` pins:

- Rendering/a11y: `tablist`/`tab` roles, every tab named via `aria-label`,
  active tab `aria-selected` + `aria-current`.
- Icon-only: no visible text labels are rendered (Instagram style).
- Navigation: a tap fires the tab's `onClick`.
- `aux`: an optional extra destination is folded inline into the bar.

`tests/components/JasperFloatingButton.test.jsx` pins: accessible launcher
fires `onClick`; full size at top; shrinks scrolling down, grows scrolling up.

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
