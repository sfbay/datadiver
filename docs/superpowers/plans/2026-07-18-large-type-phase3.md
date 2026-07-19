# Large Type Phase 3 — Charts + Map Text Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the text CSS can't reach — D3/SVG chart labels, Mapbox map labels, map tooltips, and Pulse glyph geometry — participate in Large Type mode (`typeScale: 'default' | 'large' | 'xl'`).

**Architecture:** Rem-first. Every SVG/HTML text size that is today a hardcoded px value becomes a rem value emitted via **inline style** (never the SVG `font-size` *attribute* — SVG 1.1's attribute grammar predates `rem`; inline style is plain CSS where rem is guaranteed and wins the cascade). The root `html[data-type-scale]` percentage then scales those glyphs live with **zero re-render plumbing** — identical mechanism to Phase 2's tokens. JS threads the scale factor only where px is mandatory or a fit constraint exists: (1) Mapbox `text-size` (px-only API — scale the stock camera-expression *outputs*, cached per layer so re-applies never compound), (2) DorlingCartogram (labels must fit inside px-computed circles — gates rise and char budgets shrink with the factor), (3) HorizontalBarChart (px text measurement for the hover marquee).

**Tech Stack:** React 18 + TypeScript, D3.js, Mapbox GL JS v3, Zustand (`appStore.typeScale`), node-only Vitest.

## Global Constraints

- **Pixel-identical at default.** With `typeScale: 'default'` (16px root), every conversion must render exactly as before: px → rem is always exact N/16 (no rounding). Factor-parametrized code must reproduce today's values verbatim at factor 1.
- **Conversion table (exact, use verbatim):** `7px → 0.4375rem` · `8px → 0.5rem` · `9px → 0.5625rem` · `10px → 0.625rem` · `11px → 0.6875rem` · `12px → 0.75rem` · `13px → 0.8125rem`.
- **Inline style, never SVG attribute:** D3 `.attr('font-size', …)` becomes `.style('font-size', '<rem>')`; JSX `fontSize={N}` becomes `style={{ fontSize: '<rem>' }}` (merged into an existing `style` prop if one exists). Rationale: SVG 1.1 attribute lengths exclude `rem`; inline style is unambiguous CSS.
- **Proportional scaling only for SVG/map text — NO floor-raise.** SVG layouts are px-fixed; the CSS floor-raise's extra boost exists for reflowing HTML. Chart/map text gets the root factor (`SCALE_FACTORS`: default 1, large 1.18, xl 1.33) and nothing more. Do NOT use `var(--text-nano)`-style tokens in SVG.
- The scale factor source of truth is `SCALE_FACTORS` from `src/stores/typeScale.ts` — never a new literal.
- Decorative geometry stays px (stroke widths, `border-l-2`, 1.5px ring borders, notch tabs) — Phase 2 convention.
- `md:` is banned in app code; write `desk:` (not expected to arise here, but binding).
- Verify with `npx tsc -b` before any push; final build via `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Every commit message ends with BOTH trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3`
- Branch: `feat/large-type-phase3` (already created).
- Vitest is node-only (no DOM) — pure leaf modules only; never import `appStore.ts` or anything touching `window` in a test's import graph.

**Out of scope:** email templates, print, `sm:/lg:/xl:/2xl:` physical breakpoints, the Phase-2 follow-up class sweeps (`text-[8px]` etc. — those are Tailwind classes, a different surface), MapLabelTuner UI extension (hand-tune via HMR on the constants instead; see Task 4 notes), `.datadiver-tooltip` padding/radius (geometry, stays px).

---

### Task 1: Non-chart rem conversions — tooltips, inline popup HTML, SignalGlyph, DeviationBar

Purely mechanical conversions on surfaces where rem alone finishes the job.

**Files:**
- Modify: `src/index.css` (the `.datadiver-tooltip` block, ~lines 479–505)
- Modify: `src/views/BusinessSearch/components/ChainMap.tsx:96-97`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx:583`
- Modify: `src/views/BusinessActivity/BusinessActivity.tsx:594-596`
- Modify: `src/views/Neighborhood/Neighborhood.tsx:297,298,312,313`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx:514`
- Modify: `src/views/Elections/Elections.tsx:269`
- Modify: `src/views/CityBudget/CityBudget.tsx:1830,1933`
- Modify: `src/views/Pulse/SignalGlyph.tsx`
- Modify: `src/views/Pulse/DeviationBar.tsx`

**Interfaces:**
- Consumes: nothing from other tasks.
- Produces: nothing consumed by later tasks (self-contained).

- [ ] **Step 1: Convert the three `.datadiver-tooltip` sizes in `src/index.css`**

In the `.datadiver-tooltip .mapboxgl-popup-content` rule: `font-size: 11px;` → `font-size: 0.6875rem;`
In `.datadiver-tooltip .tooltip-label`: `font-size: 9px;` → `font-size: 0.5625rem;`
In `.datadiver-tooltip .tooltip-value`: `font-size: 13px;` → `font-size: 0.8125rem;`

Plus one more px text size found outside the tooltip block, the map attribution credit (~line 213):
`.mapboxgl-ctrl-attrib { font-size: 9px !important; …}` → `font-size: 0.5625rem !important;`

Touch nothing else in these blocks (padding, letter-spacing, opacity, colors stay).

- [ ] **Step 2: Convert inline `font-size:Npx` in tooltip/popup template strings**

These are HTML strings passed to Mapbox popups. Apply the conversion table character-exactly (`font-size:10px` → `font-size:0.625rem`; no space after the colon in these strings — preserve existing spacing):

| File | Sites |
|---|---|
| `ChainMap.tsx` 96, 97 | `10px` ×2 |
| `CrimeIncidents.tsx` 583 | `9px` |
| `BusinessActivity.tsx` 594, 595, 596 | `10px`, `10px`, `9px` |
| `Neighborhood.tsx` 297, 298, 312, 313 | `13px`, `10px`, `10px`, `11px` |
| `TrafficSafety.tsx` 514 | `10px` |
| `Elections.tsx` 269 | `10px` |

And two JSX inline styles in `CityBudget.tsx` (the `↓ ↓ ↓` trapezoid connector glyphs) at lines 1830 and 1933: `fontSize: '12px'` → `fontSize: '0.75rem'`.

- [ ] **Step 3: SignalGlyph — rem-size the three render paths**

In `src/views/Pulse/SignalGlyph.tsx`, the `size` prop (px number; callers pass 12/18/22) currently lands as px. Keep the prop API; convert at render:

Live-dot span: `style={{ width: size, height: size }}` → `style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }}`

Milestone svg: `<svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>` → `<svg viewBox="0 0 24 24" style={{ width: `${size / 16}rem`, height: `${size / 16}rem` }} aria-hidden>`

Chevron svg (bottom of file): same replacement — drop `width={size} height={size}`, add the same `style`. The `viewBox` makes the chevron geometry scale proportionally; do NOT touch `strokeWidth={2.4}` (decorative stroke).

- [ ] **Step 4: DeviationBar — rem the three px arbitrary values**

In `src/views/Pulse/DeviationBar.tsx`:
- `h-[22px]` → `h-[1.375rem]` (container)
- `top-[calc(50%-10px)]` → `top-[calc(50%-0.625rem)]` (usual tick)
- `-top-[11px]` → `-top-[0.6875rem]` (tick label)

Leave `border-l-2`, the `1.5px solid` ring border, and all existing rem-based utilities (`h-2`, `w-3.5`, `text-[0.5rem]`) untouched.

- [ ] **Step 5: Verify inventory + typecheck**

Run: `grep -rn "font-size:[0-9]" src/views/ src/index.css | grep -v "0\."`
Expected: **0 lines** (all px sites converted; rem values contain `0.`).
Run: `grep -n "fontSize: '1" src/views/CityBudget/CityBudget.tsx`
Expected: **0 lines**.
Run: `npx tsc -b`
Expected: clean exit.

- [ ] **Step 6: Commit**

```bash
git add src/index.css src/views/BusinessSearch/components/ChainMap.tsx src/views/CrimeIncidents/CrimeIncidents.tsx src/views/BusinessActivity/BusinessActivity.tsx src/views/Neighborhood/Neighborhood.tsx src/views/TrafficSafety/TrafficSafety.tsx src/views/Elections/Elections.tsx src/views/CityBudget/CityBudget.tsx src/views/Pulse/SignalGlyph.tsx src/views/Pulse/DeviationBar.tsx
git commit -m "feat(large-type): rem-convert tooltips, popup HTML, SignalGlyph, DeviationBar (Phase 3)"
```

---

### Task 2: D3/JSX chart font-size sweep — attr→style, px→rem (50 sites, 21 files)

Mechanical sweep over every flat (non-fit-constrained) chart text site. **Excludes** `DorlingCartogram.tsx` and `HorizontalBarChart.tsx` entirely — they carry fit/measurement logic and are Task 3.

**Files (site counts pinned — the acceptance inventory):**

| File | Sites | Sizes |
|---|---|---|
| `src/components/charts/PeriodBreakdownChart.tsx` | 2 | 8px ×2 |
| `src/components/charts/SeverityBreakdown.tsx` | 2 | 9px ×2 |
| `src/components/charts/BatteryTrendChart.tsx` | 3 | 9, 8, 8 |
| `src/components/charts/TopRecipientsChart.tsx` | 2 | 11, 10 |
| `src/components/charts/TrendChart.tsx` | 2 | 8 ×2 |
| `src/components/charts/ContributionTimeline.tsx` | 3 | 8, 7, 8 |
| `src/components/charts/CorrelationScatter.tsx` | 4 | 9, 9, 10, 10 |
| `src/components/charts/ResponseHistogram.tsx` | 1 | 9 |
| `src/components/charts/AdSpendCompositionChart.tsx` | 6 | unitless 9, 8, 9, 8, 8, 7 |
| `src/components/charts/NetFormationChart.tsx` | 3 | 8, 7, 7 |
| `src/components/charts/SpendingTrend.tsx` | 3 | 9, 9, 8 |
| `src/components/charts/SpendingTimeline.tsx` | 2 | 8 ×2 |
| `src/components/charts/FineHistogram.tsx` | 1 | 9 |
| `src/components/charts/HourlyHeatgrid.tsx` | 2 | 8 ×2 |
| `src/components/charts/DepartmentBars.tsx` | 2 | 9 ×2 |
| `src/components/charts/ResolutionHistogram.tsx` | 1 | 9 |
| `src/components/charts/FundingSourcesChart.tsx` | 2 | 11, 10 |
| `src/views/CityBudget/VendorProfile.tsx` | 2 | 7 ×2 |
| `src/components/charts/RCVSankey.tsx` (JSX) | 2 | 9 ×2 |
| `src/components/charts/RCVRoundChart.tsx` (JSX) | 6 | 8, 9, 8, 8, 7, 7 |
| `src/views/Neighborhood/CivicFingerprint.tsx` (JSX) | 1 | 7 |

Total: 43 D3 sites + 9 JSX sites = **52**.

**Interfaces:**
- Consumes: nothing.
- Produces: after this task, `.attr('font-size'` survives ONLY in `DorlingCartogram.tsx` (2) and `HorizontalBarChart.tsx` (3) — Task 3's acceptance baseline.

**Substitution rules (apply the Global Constraints conversion table):**
1. `.attr('font-size', '<N>px')` → `.style('font-size', '<rem>')` — including sites inside `.call((g) => …)` chains; the rest of the chain is untouched.
2. `.attr('font-size', <N>)` (unitless number, AdSpendCompositionChart) → `.style('font-size', '<rem>')`
3. JSX `fontSize={<N>}` on SVG `<text>` → delete the `fontSize` prop, add `style={{ fontSize: '<rem>' }}`. If the element already has a `style` prop, merge the key into the existing object instead.

Nothing else changes: `font-family`, `font-weight`, `fill` attrs stay exactly as-is.

- [ ] **Step 1: Apply the substitutions across all 21 files** (this is mech-sweeper material — hand each batch the table above and the three rules; opus-validator replay-verifies: removed lines + rules must reproduce added lines byte-identically)

- [ ] **Step 2: Verify inventory**

Run: `grep -rn "\.attr('font-size'" src/ --include='*.tsx' | grep -cv "DorlingCartogram\|HorizontalBarChart"`
Expected: `0`
Run: `grep -rn "fontSize={" src/components/charts/ src/views/Neighborhood/CivicFingerprint.tsx | wc -l`
Expected: `0`
Run: `grep -rn "\.style('font-size'" src/ --include='*.tsx' | wc -l`
Expected: `43`
Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add -A src/components/charts src/views/CityBudget/VendorProfile.tsx src/views/Neighborhood/CivicFingerprint.tsx
git commit -m "feat(large-type): chart text to rem via inline style — 50 sites, root scale reaches SVG (Phase 3)"
```

---

### Task 3: Fit-constrained charts — DorlingCartogram formula + HorizontalBarChart measurement

The two charts where text size interacts with px-computed layout, so the JS factor must participate.

**Files:**
- Create: `src/components/charts/dorlingLabel.ts`
- Test: `src/components/charts/dorlingLabel.test.ts`
- Modify: `src/components/charts/DorlingCartogram.tsx` (label block ~lines 127–160, effect deps ~line 215)
- Modify: `src/components/charts/HorizontalBarChart.tsx` (4 font-size sites, effect deps ~line 229)

**Interfaces:**
- Consumes: `SCALE_FACTORS` and `TypeScale` from `src/stores/typeScale.ts`; `useAppStore` from `@/stores/appStore`.
- Produces: `dorlingLabel(r: number, factor: number): DorlingLabelSpec` where `DorlingLabelSpec = { showName: boolean; nameFontRem: string; nameMaxChars: number; showPop: boolean; popFontRem: string }`.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/charts/dorlingLabel.test.ts
import { describe, expect, it } from 'vitest'
import { dorlingLabel } from './dorlingLabel'

describe('dorlingLabel', () => {
  it('factor 1 reproduces the legacy inline formulas exactly', () => {
    const s = dorlingLabel(20, 1)
    expect(s.showName).toBe(true)                                   // 20 > 18
    expect(s.showPop).toBe(false)                                   // 20 < 25
    expect(s.nameFontRem).toBe(`${Math.min(11, 20 * 0.42) / 16}rem`)
    expect(s.popFontRem).toBe(`${Math.min(9, 20 * 0.3) / 16}rem`)
    expect(s.nameMaxChars).toBe(Math.floor(20 * 0.38))              // 7
  })

  it('gates rise with the factor so labels that no longer fit are dropped', () => {
    expect(dorlingLabel(20, 1).showName).toBe(true)     // 20 > 18
    expect(dorlingLabel(20, 1.33).showName).toBe(false) // 20 < 18*1.33 = 23.94
    expect(dorlingLabel(30, 1).showPop).toBe(true)      // 30 > 25
    expect(dorlingLabel(30, 1.33).showPop).toBe(false)  // 30 < 25*1.33 = 33.25
  })

  it('char budget shrinks as glyphs grow; the rem value itself is factor-independent', () => {
    expect(dorlingLabel(40, 1.33).nameMaxChars).toBeLessThan(dorlingLabel(40, 1).nameMaxChars)
    expect(dorlingLabel(40, 1.33).nameFontRem).toBe(dorlingLabel(40, 1).nameFontRem)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/charts/dorlingLabel.test.ts`
Expected: FAIL — cannot resolve `./dorlingLabel`.

- [ ] **Step 3: Implement the leaf module**

```ts
// src/components/charts/dorlingLabel.ts
//
// Pure label-fit math for DorlingCartogram, split out so the fit rules are
// unit-testable under the node-only Vitest config (the chart itself needs DOM).
//
// Why a formula, not a flat bump (Large Type Phase 3): a Dorling label must
// fit INSIDE its circle, whose radius is layout-computed in px and does NOT
// grow with the root font-size. Font sizes are emitted in rem (the root %
// scales the rendered glyphs), so at large/xl the same rem value paints more
// px — the budget the circle can spend on characters shrinks. `factor` (the
// root multiplier from SCALE_FACTORS) therefore RAISES the show gates and
// SHRINKS the char budget in step with the glyph growth. At factor 1 every
// value is identical to the pre-Phase-3 inline formulas.

export interface DorlingLabelSpec {
  /** Show the name label at all? (legacy gate: r > 18) */
  showName: boolean
  /** Name font-size as a rem string — the root scale applies the growth */
  nameFontRem: string
  /** Truncation budget for the name (legacy: floor(r * 0.38)) */
  nameMaxChars: number
  /** Show the population sub-label? (legacy gate: r > 25) */
  showPop: boolean
  popFontRem: string
}

export function dorlingLabel(r: number, factor: number): DorlingLabelSpec {
  return {
    showName: r > 18 * factor,
    nameFontRem: `${Math.min(11, r * 0.42) / 16}rem`,
    nameMaxChars: Math.floor((r * 0.38) / factor),
    showPop: r > 25 * factor,
    popFontRem: `${Math.min(9, r * 0.3) / 16}rem`,
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/components/charts/dorlingLabel.test.ts`
Expected: PASS (3 tests). Also run the full suite to confirm nothing else broke: `npx vitest run` → all green.

- [ ] **Step 5: Wire DorlingCartogram onto the spec**

In `src/components/charts/DorlingCartogram.tsx`:

Add imports and subscription (the file already imports `useAppStore` for `isDarkMode` — mirror that):

```ts
import { dorlingLabel } from './dorlingLabel'
import { SCALE_FACTORS } from '@/stores/typeScale'
// inside the component, next to the isDarkMode selector:
const typeScale = useAppStore((s) => s.typeScale)
// inside the effect, before the label blocks:
const labelFactor = SCALE_FACTORS[typeScale]
```

Name-label block — replace the gate, sizing, baseline coupling, and truncation:

```ts
    // Name label (only when the scaled label still fits the circle)
    circleGroups
      .filter((d) => dorlingLabel(d.r, labelFactor).showName)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', (d) => (dorlingLabel(d.r, labelFactor).showPop ? 'auto' : 'middle'))
      .attr('dy', (d) => (dorlingLabel(d.r, labelFactor).showPop ? '-0.2em' : '0'))
      .attr('fill', labelColor)
      .style('font-size', (d) => dorlingLabel(d.r, labelFactor).nameFontRem)
      .attr('font-family', 'Inter, sans-serif')
      .attr('font-weight', '600')
      .attr('pointer-events', 'none')
      .text((d) => {
        // Truncate long names to fit — budget shrinks as the root scale grows
        const maxChars = dorlingLabel(d.r, labelFactor).nameMaxChars
        return d.name.length > maxChars ? d.name.slice(0, maxChars - 1) + '…' : d.name
      })
```

(The `dominant-baseline`/`dy` conditions were `d.r > 25` — the same threshold as the sub-label gate; they express "shift the name up when the pop label shows below", so they follow `showPop`.)

Population sub-label block:

```ts
    // Population sub-label (only when radius fits both labels at this scale)
    circleGroups
      .filter((d) => dorlingLabel(d.r, labelFactor).showPop)
      .append('text')
      .attr('text-anchor', 'middle')
      .attr('dominant-baseline', 'hanging')
      .attr('dy', '0.4em')
      .attr('fill', subLabelColor)
      .style('font-size', (d) => dorlingLabel(d.r, labelFactor).popFontRem)
      .attr('font-family', '"JetBrains Mono", monospace')
      .attr('pointer-events', 'none')
      .text((d) => {
        const pop = d.population
        return pop >= 1000 ? (pop / 1000).toFixed(1) + 'k' : String(pop)
      })
```

Effect dep array: append `typeScale` → `}, [data, colorScale, width, height, isDarkMode, onHover, onSelect, typeScale])`.

- [ ] **Step 6: HorizontalBarChart — rem sites + re-measure on toggle**

In `src/components/charts/HorizontalBarChart.tsx`:
- Convert all 3 `.attr('font-size', '9px')` sites (including the off-screen `measureEl`) to `.style('font-size', '0.5625rem')`. The marquee measurement (`getComputedTextLength`) resolves the rendered size at call time, so measuring in rem is automatically correct at the current scale.
- Add a `typeScale` subscription so a live toggle re-renders and re-measures (import `useAppStore` from `@/stores/appStore` if the file doesn't already use it; add `const typeScale = useAppStore((s) => s.typeScale)` and append `typeScale` to the effect dep array at ~line 229).

- [ ] **Step 7: Verify + commit**

Run: `grep -rn "\.attr('font-size'" src/ --include='*.tsx' | wc -l`
Expected: `0`
Run: `npx tsc -b && npx vitest run`
Expected: clean, all tests green.

```bash
git add src/components/charts/dorlingLabel.ts src/components/charts/dorlingLabel.test.ts src/components/charts/DorlingCartogram.tsx src/components/charts/HorizontalBarChart.tsx
git commit -m "feat(large-type): fit-aware Dorling labels + marquee re-measure — factor-threaded charts (Phase 3)"
```

---

### Task 4: Mapbox label text-size scaling — basemap + neighborhood choropleth

The one surface where px is mandatory (Mapbox `text-size`). Two sub-surfaces: the stock basemap labels (scaled in `MapView` from cached originals) and our own `nh-choropleth-labels` expression (factor-parametrized at build).

**Files:**
- Create: `src/components/maps/labelTextSize.ts`
- Test: `src/components/maps/labelTextSize.test.ts`
- Modify: `src/components/maps/MapView.tsx` (style.load handler ~line 194, new effect)
- Modify: `src/views/Neighborhood/neighborhoodMapLayers.ts` (the choropleth export)
- Modify: `src/views/Neighborhood/Neighborhood.tsx` (~lines 17, 185)

**Interfaces:**
- Consumes: `SCALE_FACTORS` from `src/stores/typeScale.ts`.
- Produces: `scaleTextSizeValue(value: unknown, factor: number): unknown | null` (null = "unrecognized shape — leave the layer at stock size"); `neighborhoodChoroplethLayers(textFactor: number): mapboxgl.AnyLayer[]` replacing the `NEIGHBORHOOD_CHOROPLETH_LAYERS` constant.

- [ ] **Step 1: Write the failing test**

```ts
// src/components/maps/labelTextSize.test.ts
import { describe, expect, it } from 'vitest'
import { scaleTextSizeValue } from './labelTextSize'

describe('scaleTextSizeValue', () => {
  it('scales a bare number', () => {
    expect(scaleTextSizeValue(12, 1.18)).toBeCloseTo(14.16)
  })

  it('factor 1 is a deep identity', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 11, 18, 16]
    expect(scaleTextSizeValue(expr, 1)).toEqual(expr)
  })

  it('scales interpolate OUTPUTS only, never the zoom stops', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 9, 14, 12]
    expect(scaleTextSizeValue(expr, 1.33)).toEqual([
      'interpolate', ['linear'], ['zoom'], 10, 0, 12, 9 * 1.33, 14, 12 * 1.33,
    ])
  })

  it('scales step outputs at positions 2, 4, 6…', () => {
    const expr = ['step', ['zoom'], 10, 14, 12, 16, 14]
    expect(scaleTextSizeValue(expr, 2)).toEqual(['step', ['zoom'], 20, 14, 24, 16, 28])
  })

  it('returns null for unrecognized shapes so callers skip the layer', () => {
    expect(scaleTextSizeValue(['match', ['get', 'class'], 'a', 10, 12], 1.18)).toBeNull()
    expect(scaleTextSizeValue('16', 1.18)).toBeNull()
    expect(scaleTextSizeValue(['interpolate', ['linear'], ['zoom'], 10, ['match', ['get', 'x'], 'a', 1, 2]], 1.18)).toBeNull()
  })

  it('does not mutate the input expression', () => {
    const expr = ['interpolate', ['linear'], ['zoom'], 10, 11, 18, 16]
    const copy = JSON.parse(JSON.stringify(expr))
    scaleTextSizeValue(expr, 1.33)
    expect(expr).toEqual(copy)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/components/maps/labelTextSize.test.ts`
Expected: FAIL — cannot resolve `./labelTextSize`.

- [ ] **Step 3: Implement the pure scaler**

```ts
// src/components/maps/labelTextSize.ts
//
// Pure scaling of Mapbox `text-size` values for Large Type mode. Leaf module
// (no mapbox import) so the node-only Vitest config can test it.
//
// Mapbox text-size is px-only — the one text surface the root-% rem mechanism
// can't reach — and stock basemap values are camera expressions. `["zoom"]`
// may only appear as the input of a TOP-LEVEL "interpolate"/"step", so
// wrapping the whole expression in ["*", factor, …] is invalid; instead the
// expression is rebuilt with each numeric OUTPUT multiplied (zoom stops
// untouched). Any shape we don't recognize returns null and the caller leaves
// that layer at stock size — degrade to "not scaled", never to a corrupted
// style.

export function scaleTextSizeValue(value: unknown, factor: number): unknown | null {
  if (typeof value === 'number') return value * factor
  if (!Array.isArray(value)) return null
  const op = value[0]
  if (op === 'interpolate') {
    // ['interpolate', <type>, <input>, stop, output, stop, output, …]
    const out = [...value]
    for (let i = 4; i < out.length; i += 2) {
      const scaled = scaleTextSizeValue(out[i], factor)
      if (scaled === null) return null
      out[i] = scaled
    }
    return out
  }
  if (op === 'step') {
    // ['step', <input>, output0, stop, output, stop, output, …]
    const out = [...value]
    for (let i = 2; i < out.length; i += 2) {
      const scaled = scaleTextSizeValue(out[i], factor)
      if (scaled === null) return null
      out[i] = scaled
    }
    return out
  }
  return null
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/components/maps/labelTextSize.test.ts`
Expected: PASS (6 tests).

- [ ] **Step 5: Wire MapView — cache stock sizes at style.load, apply the current factor, re-apply on toggle**

In `src/components/maps/MapView.tsx`:

Add imports:

```ts
import { SCALE_FACTORS } from '@/stores/typeScale'
import { scaleTextSizeValue } from './labelTextSize'
```

Add two module-level helpers below `softenBasemapLabels`:

```ts
/** Stock `text-size` per basemap symbol layer, captured at style.load BEFORE
 *  any scaling (and before app layers mount — useMapLayer adds those on later
 *  ticks), so re-applies never compound a factor onto an already-scaled value
 *  and never touch app-owned symbol layers like nh-choropleth-labels. */
function collectStockTextSizes(map: mapboxgl.Map): Map<string, unknown> {
  const cache = new Map<string, unknown>()
  for (const layer of map.getStyle().layers || []) {
    if (layer.type !== 'symbol') continue
    const layout = (layer as mapboxgl.SymbolLayer).layout
    if (!layout || layout['text-field'] === undefined) continue
    // undefined text-size means the Mapbox default (16px)
    cache.set(layer.id, map.getLayoutProperty(layer.id, 'text-size') ?? 16)
  }
  return cache
}

/** Large Type participation for basemap labels: rewrite each cached stock
 *  text-size with its numeric outputs × factor. Factor 1 restores stock. */
function applyLabelTextScale(map: mapboxgl.Map, cache: Map<string, unknown>, factor: number) {
  for (const [id, orig] of cache) {
    const scaled = scaleTextSizeValue(orig, factor)
    if (scaled === null) continue
    try {
      map.setLayoutProperty(id, 'text-size', scaled)
    } catch (_err) {
      // Some composite basemap layers reject layout edits — skip them.
    }
  }
}
```

In the component, add a subscription and a cache ref next to the existing `isDarkMode` selector:

```ts
const typeScale = useAppStore((s) => s.typeScale)
const labelSizeCache = useRef<Map<string, unknown>>(new Map())
```

Extend `handleStyleLoad` (inside the mount effect) — after the `softenBasemapLabels` call:

```ts
    const handleStyleLoad = () => {
      applyTerrainAndFog(map, useAppStore.getState().isDarkMode)
      softenBasemapLabels(map, useAppStore.getState().isDarkMode)
      labelSizeCache.current = collectStockTextSizes(map)
      applyLabelTextScale(map, labelSizeCache.current, SCALE_FACTORS[useAppStore.getState().typeScale])
    }
```

Add a new effect after the mount effect (reads live state at fire time, mirroring the theme pattern):

```ts
  // Re-scale basemap labels when the Large Type tier changes mid-session.
  // If the style is still loading, skip — handleStyleLoad reads the live
  // typeScale when it fires, so the current factor lands either way.
  useEffect(() => {
    const map = mapRef.current
    if (!map || !map.isStyleLoaded()) return
    applyLabelTextScale(map, labelSizeCache.current, SCALE_FACTORS[typeScale])
  }, [typeScale])
```

- [ ] **Step 6: Parametrize the neighborhood choropleth labels**

In `src/views/Neighborhood/neighborhoodMapLayers.ts`, replace the `NEIGHBORHOOD_CHOROPLETH_LAYERS` constant with a builder (the other exports stay):

```ts
import { scaleTextSizeValue } from '@/components/maps/labelTextSize'

/** Stock label sizing — outputs are scaled by the Large Type factor; the 0 at
 *  zoom 10 stays 0 at every factor, preserving the fade-in behavior. */
const NH_LABEL_TEXT_SIZE = ['interpolate', ['linear'], ['zoom'], 10, 0, 12, 9, 14, 12]

/** Mapbox layer configs for the neighborhood choropleth. `textFactor` is
 *  SCALE_FACTORS[typeScale] — Mapbox text-size is px-only, so map labels are
 *  the one text surface the root-% rem mechanism can't reach (Phase 3). */
export function neighborhoodChoroplethLayers(textFactor: number): mapboxgl.AnyLayer[] {
  return [
    {
      id: 'nh-choropleth-fill',
      type: 'fill',
      source: 'nh-boundaries',
      paint: {
        'fill-color': '#64748b', // set dynamically via buildZScoreColorExpression
        'fill-opacity': 0.3,
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'nh-choropleth-outline',
      type: 'line',
      source: 'nh-boundaries',
      paint: {
        'line-color': 'rgba(255,255,255,0.2)',
        'line-width': ['interpolate', ['linear'], ['zoom'], 10, 1, 14, 2],
      },
    } as mapboxgl.AnyLayer,
    {
      id: 'nh-choropleth-labels',
      type: 'symbol',
      source: 'nh-boundaries',
      layout: {
        'text-field': ['get', 'nhood'],
        'text-size': scaleTextSizeValue(NH_LABEL_TEXT_SIZE, textFactor),
        'text-font': ['DIN Pro Medium', 'Arial Unicode MS Regular'],
        'text-anchor': 'center',
        'text-allow-overlap': false,
      },
      paint: {
        'text-color': ['interpolate', ['linear'], ['zoom'], 10, 'rgba(255,255,255,0)', 12, 'rgba(255,255,255,0.5)', 14, 'rgba(255,255,255,0.7)'],
        'text-halo-color': 'rgba(0,0,0,0.7)',
        'text-halo-width': 1.2,
      },
    } as mapboxgl.AnyLayer,
  ]
}
```

In `src/views/Neighborhood/Neighborhood.tsx`: swap the import (`NEIGHBORHOOD_CHOROPLETH_LAYERS` → `neighborhoodChoroplethLayers`), then at ~line 185:

```ts
  const typeScale = useAppStore((s) => s.typeScale)  // add selector if not present; import useAppStore if absent
  const choroplethLayers = useMemo(() => neighborhoodChoroplethLayers(SCALE_FACTORS[typeScale]), [typeScale])
  useMapLayer(mapInstance, 'nh-boundaries', boundaries, choroplethLayers)
```

(`useMapLayer`'s third effect pushes layout properties when the config object changes — verified at `src/hooks/useMapLayer.ts:118-120` — so a toggle updates the mounted layer live. Import `SCALE_FACTORS` from `@/stores/typeScale` and `useMemo` from react if absent.)

- [ ] **Step 7: Verify + commit**

Run: `npx tsc -b && npx vitest run`
Expected: clean, all green.
Run: `grep -rn "NEIGHBORHOOD_CHOROPLETH_LAYERS" src/ | wc -l`
Expected: `0` (constant fully replaced).

```bash
git add src/components/maps/labelTextSize.ts src/components/maps/labelTextSize.test.ts src/components/maps/MapView.tsx src/views/Neighborhood/neighborhoodMapLayers.ts src/views/Neighborhood/Neighborhood.tsx
git commit -m "feat(large-type): Mapbox label text-size participates — cached stock scaling + factor-built nh labels (Phase 3)"
```

**Tuning note (no task):** per-group size trims and MapLabelTuner UI are deliberately NOT built (YAGNI). The QA pass judges legibility per theme; if a group needs trimming, hand-edit a multiplier into `applyLabelTextScale` under HMR (MapView remounts the map on HMR, re-running the pipeline) and only then consider promoting it to a `LABEL_STYLES` field.

---

### Task 5: Docs — CLAUDE.md + spec shipped-amendments

Runs AFTER the controller's browser QA gate (see Verification below) so the docs describe what actually shipped, including any QA-driven adjustments.

**Files:**
- Modify: `CLAUDE.md` (the "### Large Type mode (Phases 1–2, July 2026)" section)
- Modify: `docs/superpowers/specs/2026-07-18-large-type-edition-design.md` (append a section)

**Interfaces:** none — prose.

- [ ] **Step 1: Update CLAUDE.md**

Retitle the section to "### Large Type mode (Phases 1–3, July 2026)". Replace the final paragraph (the one beginning "Phase 3 (D3 SVG `font-size` attrs, …) is still specced-only") with:

```markdown
- **Phase 3 (shipped July 18 2026): chart + map text.** Rem-first: all D3/JSX SVG text sizes are emitted as rem via **inline style** (`.style('font-size', '0.5625rem')` / `style={{ fontSize }}`) — NEVER the SVG `font-size` attribute (SVG 1.1 attribute grammar predates rem) and NEVER `text-*` tokens in SVG (px-fixed SVG layouts get the proportional root factor only, no floor-raise). The root % scales them live with no re-render plumbing. JS threads `SCALE_FACTORS` only where px is mandatory: Mapbox `text-size` (`scaleTextSizeValue` in `src/components/maps/labelTextSize.ts` rewrites camera-expression OUTPUTS — `["*", f, expr]` is invalid around a `["zoom"]` interpolate; MapView caches stock sizes per layer at style.load so re-applies never compound and app layers are never touched), DorlingCartogram (`dorlingLabel.ts`: show-gates rise and char budgets shrink with the factor — labels must fit px-computed circles), and HorizontalBarChart (marquee px measurement re-runs on toggle). `.datadiver-tooltip` and popup-HTML font sizes are rem. New hardcoded px font sizes in charts/tooltips are a regression — use rem inline style.
```

- [ ] **Step 2: Append the spec amendment**

At the end of `docs/superpowers/specs/2026-07-18-large-type-edition-design.md`:

```markdown
## Phase 3 shipped amendments (July 18 2026)

- **Rem-first replaced the planned JS helper.** The spec's "shared helper that
  reads typeScale, explicit value threaded per chart" predates Phase 2's token
  architecture. Shipped mechanism: SVG/HTML text sizes emit rem via INLINE
  STYLE and the root % scales them live — no chart re-renders, no threading.
  Style (not the SVG font-size attribute) because SVG 1.1's attribute grammar
  excludes rem; inline style is plain CSS. JS threads the factor only where px
  is mandatory or a fit constraint exists (Mapbox text-size; DorlingCartogram
  circle-fit; HorizontalBarChart marquee measurement).
- **Proportional, not floor-raised.** Chart/map text scales by exactly
  SCALE_FACTORS (1.18/1.33 — the spec's "~20–30% bump"). The CSS floor-raise
  is for reflowing HTML; px-fixed SVG layouts would clip under its extra
  boost.
- **Real inventory: 52 flat sites + 2 fit-constrained files + 14 popup-HTML
  sites + 4 CSS sizes (3 tooltip + the `.mapboxgl-ctrl-attrib` credit line)**
  (the spec's "46" was the pre-Phase-2 grep; the RCV charts added JSX
  `fontSize` sites since).
- **Mapbox architecture:** `["zoom"]` may only appear at the top level of
  `interpolate`/`step`, so stock expressions can't be wrapped in `["*"]` —
  `scaleTextSizeValue` rebuilds them with numeric OUTPUTS multiplied,
  returning null (= leave at stock size) for unrecognized shapes. MapView
  captures stock values per symbol layer at style.load — before app layers
  mount — so re-applies never compound and never touch app-owned labels. The
  neighborhood choropleth labels build from the same scaler at config time.
- **MapLabelTuner text-size UI: skipped (YAGNI).** Legibility was QA'd
  visually per theme; trims would be hand-edited under HMR first.
- **Dorling formula floor realized as fit-coupling:** gates rise (r > 18f /
  25f) and truncation budgets shrink (÷f) as glyphs grow, so labels never
  overflow their circles; factor 1 is byte-identical to the legacy formulas.
```

- [ ] **Step 3: Commit**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-18-large-type-edition-design.md
git commit -m "docs(large-type): Phase 3 mechanics in CLAUDE.md + spec shipped-amendments"
```

---

## Verification (controller-run browser QA gate, between Task 4 and Task 5)

Per the render-feature browser gate: live preview + DOM probes, not diff review alone.

1. **Mechanism probe (do this FIRST, right after Task 2 lands):** on a chart view, `getComputedStyle` of a converted SVG `<text>` must read exactly 9px at default, 10.62px at large (`0.5625rem` × 1.18 root), 11.97px at xl. If inline-style rem does NOT scale in SVG, stop the line and escalate — the architecture assumption failed.
2. Default-tier pixel-identity spot checks: tooltip hover cards, Pulse cards (SignalGlyph/DeviationBar), 3–4 chart views — computed sizes identical to pre-branch prod.
3. The motivator: CityBudget at xl — the "$82.2M"-style D3 value labels. Text now grows 33%; verify labels don't clip worse at card edges. Catalog any clipping chart-by-chart; fixes are review findings (targeted margin bumps), not silent scope.
4. Mapbox: basemap labels visibly larger at large/xl on BOTH themes (light + dark), still legible over choropleths; toggle default→xl→default restores stock sizes exactly (the cache restore path). Neighborhood view labels scale and the zoom-10 fade-in still works.
5. Dorling (Demographics): at xl, fewer circles carry labels (raised gates), no label overflows its circle; default identical to prod.
6. `~/dev/devman/tools/devman-build.mjs pnpm build` green before PR.
