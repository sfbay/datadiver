# Large Type Phase 2 — Token-Floor Migration Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the px-frozen dashboard micro-labels participate in Large Type by swapping the ~850 `text-[9|10|11px]` sites onto three `@theme` token utilities, raising those tokens' floor disproportionately under `data-type-scale`, converting the mobile-shell breakpoint (JS **and** CSS) to effective width, and un-freezing the fixed-px containers that would clip.

**Architecture:** Activate the dormant `tokens.css` type scale by moving `--text-micro`/`--text-label` into the `@theme` block of `src/index.css` (Tailwind v4 requires the `--text-*` namespace inside `@theme` to generate utilities) and adding a new `--text-nano` (9px) stop. Utilities compile to `font-size: var(--text-*)`, so a single `html[data-type-scale="large"], html[data-type-scale="xl"]` override block raises the floor for both tiers — xl's extra size comes from its larger root percentage. For breakpoints, JS becomes the single source of truth: a leaf module computes effective viewport width (`innerWidth ÷ scale factor`) and stamps `html[data-vp="mobile"|"desk"]`; `useIsMobile` reads effective width, and the shell's `md:` CSS variants are renamed to a new `desk:` custom variant driven by that attribute (the exact mechanism the existing `dark:` variant uses) — so JS and CSS flip together, including when large type shrinks the effective viewport.

**Tech Stack:** Vite + React 18 + TypeScript, Tailwind v4 (`@theme`, `@custom-variant`), Zustand, Vitest (node env — pure functions only).

**Branch:** `feat/large-type-phase2` off `main`.

## Global Constraints

- **Default renders pixel-identical AND behavior-identical.** With the toggle off, every class swap must preserve computed sizes exactly (`text-[9px]` = 0.5625rem, `text-[10px]` = 0.625rem, `text-[11px]` = 0.6875rem at the 16px default root — the token values are exactly these rems), and the breakpoint conversion must flip at exactly the same widths as today (effective = physical at scale 1; `data-vp` flips at 768 innerWidth, same as the old `(max-width: 767px)` media query).
- **Floor-raise covers BOTH `large` and `xl`** (spec amendment, PR #126) — one shared override block satisfies this.
- **No `--text-*--line-height` companion vars.** The utilities must emit `font-size` only, exactly like the `text-[Npx]` classes they replace (which never set line-height). Task 1 verifies this in the built CSS.
- **Root scale values are pinned:** `large` = 118%, `xl` = 133% (`src/index.css` `html[data-type-scale]` rules). `SCALE_FACTORS` in `src/stores/typeScale.ts` must match; a test pins them.
- **Breakpoints go FULL-SPEC** (Jesse's call, 2026-07-18): both `useIsMobile` (768) and `MapSidebar`'s narrow check (1024) compare **effective** width, and every `md:` class in `src/` is renamed to the `desk:` custom variant so CSS follows the same source. After Task 7, `md:` must not appear in app code — new code uses `desk:`.
- Known accepted limit: `sm:`/`lg:`/`xl:`/`2xl:` variants (≈48 cosmetic sites) stay physical-px — they aren't paired with JS branches; note in the spec amendment, revisit only if QA finds a real defect.
- Out of scope, do not touch: `text-[8px]` (83 sites), `text-[12px]` (51), `text-[13px]` (19) — noted follow-up; D3 SVG `font-size` attrs, Mapbox `text-size`, `.datadiver-tooltip` px sizes (Phase 3); inline `style={{ fontSize }}` sites (Phase 3); container-query migration.
- Typecheck gate before push: `npx tsc -b`. Full-build gate: `~/dev/devman/tools/devman-build.mjs pnpm build`. Never `pnpm dev` via Bash (tarmac owns dev servers).
- Commit messages end with both trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3`

## Sweep inventory (fresh grep, 2026-07-18)

366 × `text-[9px]`, 372 × `text-[10px]`, 112 × `text-[11px]` across ~100 `.tsx` files. No `text-[Npx]/leading` slash-syntax sites exist (verified) — every occurrence is a bare class token, so plain string replacement is exact. Variant prefixes (`md:text-[10px]`, `dark:…`) survive replacement untouched because only the class token is replaced. `md:` variants: ~65 tokens across 19 files (list in Task 7). `useIsMobile`/`isMobileViewport` callers: `AppShell.tsx`, `MapSidebar.tsx`, `NeighborhoodSidebar.tsx` only. `useDraggableSheet` has no internal width gating (parents' `isMobile` branches mount the sheets). The only `@media` rule in `index.css` is `prefers-reduced-motion`.

---

### Task 1: Token activation + floor-raise + DetailPanel pilot cohort

**Files:**
- Modify: `src/styles/tokens.css:138-141` (remove `--text-label`/`--text-micro`, leave pointer comment)
- Modify: `src/index.css` (`@theme` block ~line 6; after the `html[data-type-scale="xl"]` rule ~line 158)
- Modify: `src/components/ui/*DetailPanel*.tsx` + `src/components/ui/DetailPanelShell.tsx` (9 files — the densest surface, the spec's named pilot cohort)

**Interfaces:**
- Produces: Tailwind utilities `text-nano` (9px), `text-micro` (10px), `text-label` (11px) — later sweep tasks depend on these compiling.

- [ ] **Step 1: Pre-check — the new class names are unclaimed**

Run: `grep -rn 'text-nano\|text-micro\|text-label' src/`
Expected: zero matches. If anything matches, STOP and report (name collision would silently restyle existing code).

- [ ] **Step 2: Move micro/label out of tokens.css**

In `src/styles/tokens.css`, replace lines 138–141:

```css
  --text-small:   0.875rem;
  --text-caption: 0.75rem;
  --text-label:   0.6875rem;
  --text-micro:   0.625rem;
```

with:

```css
  --text-small:   0.875rem;
  --text-caption: 0.75rem;
  /* --text-label / --text-micro (plus the new --text-nano) live in the
     @theme block of src/index.css — Tailwind v4 only generates text-*
     utilities from the --text-* namespace INSIDE @theme, and a single
     definition site prevents value drift. Large Type Phase 2. */
```

- [ ] **Step 3: Add the utilities to `@theme` in `src/index.css`**

Inside the existing `@theme` block (after the font-family/color entries, before the closing brace), add:

```css
  /* Large Type Phase 2 — micro-type scale (moved from tokens.css; the
     floor-raise overrides live next to the html[data-type-scale] rules
     further down). Deliberately NO --text-*--line-height companions:
     these utilities must emit font-size only, exactly like the
     text-[Npx] arbitrary classes they replace. */
  --text-nano:  0.5625rem;  /* 9px  at default root — new stop; no 9px token existed */
  --text-micro: 0.625rem;   /* 10px at default root */
  --text-label: 0.6875rem;  /* 11px at default root */
```

- [ ] **Step 4: Add the floor-raise override block**

In `src/index.css`, immediately after the `html[data-type-scale="xl"]` rule, add:

```css
/* Phase 2 floor-raise: the micro-type tokens rise DISPROPORTIONATELY
   under large type — 9–11px Space Mono labels are what "unreadable"
   means for a large-type reader, while body/display already ride the
   root %. Values are base-rem, so the root multiplier compounds:
   micro = 0.6875rem × 118% ≈ 13.0px (large), × 133% ≈ 14.6px (xl).
   ONE shared block covers both tiers (spec amendment requirement) —
   xl's extra size comes from its larger root %. Utilities compile to
   font-size: var(--text-*), and html[data-type-scale] (0,1,1) beats
   the @theme-emitted :root (0,1,0), so the override cascades. */
html[data-type-scale="large"],
html[data-type-scale="xl"] {
  --text-nano:  0.625rem;   /* 9px sites  → ~11.8px large / ~13.3px xl */
  --text-micro: 0.6875rem;  /* 10px sites → ~13.0px large / ~14.6px xl */
  --text-label: 0.75rem;    /* 11px sites → ~14.2px large / ~16.0px xl */
}
```

- [ ] **Step 5: Sweep the DetailPanel cohort**

Run:

```bash
perl -pi -e 's/text-\[9px\]/text-nano/g; s/text-\[10px\]/text-micro/g; s/text-\[11px\]/text-label/g' \
  src/components/ui/BusinessDetailPanel.tsx src/components/ui/CaseDetailPanel.tsx \
  src/components/ui/CitationDetailPanel.tsx src/components/ui/CrashDetailPanel.tsx \
  src/components/ui/CrimeDetailPanel.tsx src/components/ui/DetailPanelShell.tsx \
  src/components/ui/IncidentDetailPanel.tsx src/components/ui/MeterDetailPanel.tsx \
  src/components/ui/VendorDetailPanel.tsx
```

- [ ] **Step 6: Verify the cohort is clean and the build emits font-size-only utilities**

Run: `grep -rE 'text-\[(9|10|11)px\]' src/components/ui/*DetailPanel*.tsx src/components/ui/DetailPanelShell.tsx | wc -l`
Expected: `0`

Run: `~/dev/devman/tools/devman-build.mjs pnpm build` then:

```bash
grep -oE '\.text-(nano|micro|label)\{[^}]*\}' dist/assets/*.css
```

Expected — three rules, each containing ONLY a font-size declaration referencing its var, e.g. `.text-micro{font-size:var(--text-micro)}`. **If any rule contains `line-height`, STOP** — Tailwind emitted a companion; report before proceeding (it would change line spacing vs the px classes, violating pixel-identical).

- [ ] **Step 7: Commit**

```bash
git add src/styles/tokens.css src/index.css src/components/ui/
git commit -m "feat(large-type): activate micro-type token scale + floor-raise; sweep DetailPanels"
```

---

### Task 2: Store hardening folds (first-paint flash, quota throw, class idiom)

**Files:**
- Modify: `src/stores/appStore.ts:129-133` (setTypeScale) and module tail (eval-time attribute)
- Modify: `src/components/layout/AppShell.tsx:415,423` (dark-button inline style → class)

**Interfaces:**
- Produces: `data-type-scale` is guaranteed present on `<html>` from module eval onward — Task 6's `effectiveViewportWidth()` reads it. (Task 6 later appends `syncViewportMode()` calls beside both attribute writes added here.)

- [ ] **Step 1: Wrap the localStorage write in setTypeScale**

In `src/stores/appStore.ts`, replace:

```ts
  setTypeScale: (scale) => set(() => {
    localStorage.setItem('dd-type-scale', scale)
    document.documentElement.setAttribute('data-type-scale', scale)
    return { typeScale: scale }
  }),
```

with:

```ts
  setTypeScale: (scale) => set(() => {
    try {
      localStorage.setItem('dd-type-scale', scale)
    } catch {
      // Private-mode / quota failures must not block the in-session toggle;
      // the preference just won't persist.
    }
    document.documentElement.setAttribute('data-type-scale', scale)
    return { typeScale: scale }
  }),
```

- [ ] **Step 2: Apply the attribute at module eval**

At the bottom of `src/stores/appStore.ts` (module scope, after the `create<AppState>()(...)` call closes), add:

```ts
// Apply the persisted type scale at module eval — the store module is
// imported synchronously before React's first render, so stored-large/xl
// users never flash default-size text. App.tsx's effect re-applies it on
// later state changes (the same dual-application recipe as dark mode).
document.documentElement.setAttribute('data-type-scale', useAppStore.getState().typeScale)
```

- [ ] **Step 3: Harmonize the dark-button positioning idiom**

In `src/components/layout/AppShell.tsx`, both sun/moon `<svg>` elements (lines 415 and 423) use `style={{ position: 'absolute' }}` while the newer type-scale controls use Tailwind's `absolute` class. On each of the two svgs: delete the `style={{ position: 'absolute' }}` prop and prepend `absolute ` to the existing `className` template string, e.g.:

```tsx
<svg
  className={`absolute w-4 h-4 transition-all duration-500 ${isDarkMode ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}
  viewBox="0 0 20 20"
  fill="currentColor"
>
```

- [ ] **Step 4: Verify**

Run: `npx tsc -b`
Expected: clean.

Run: `pnpm vitest run src/stores/typeScale.test.ts`
Expected: all existing parseTypeScale tests PASS (unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add src/stores/appStore.ts src/components/layout/AppShell.tsx
git commit -m "fix(large-type): eval-time attr application kills first-paint flash; setTypeScale quota-safe"
```

---

### Task 3: Sweep batch — remaining `src/components`

**Files:**
- Modify: every `src/components/**/*.tsx` file still containing `text-[9px]`/`text-[10px]`/`text-[11px]` (discover with the grep in Step 1; DetailPanels were done in Task 1)

**Interfaces:**
- Consumes: `text-nano` / `text-micro` / `text-label` utilities from Task 1.

This task is strictly mechanical — a `mech-sweeper` delegation candidate (verification command below proves completion objectively; opus-validator gates acceptance per house delegation rules).

- [ ] **Step 1: List the in-scope files**

Run: `grep -rlE 'text-\[(9|10|11)px\]' src/components --include='*.tsx'`
Record the list (roughly 25–30 files: charts wrappers, filters, layout, export, investigations, ui).

- [ ] **Step 2: Apply the mapping to exactly those files**

```bash
grep -rlE 'text-\[(9|10|11)px\]' src/components --include='*.tsx' | \
  xargs perl -pi -e 's/text-\[9px\]/text-nano/g; s/text-\[10px\]/text-micro/g; s/text-\[11px\]/text-label/g'
```

- [ ] **Step 3: Verify zero remaining + typecheck**

Run: `grep -rE 'text-\[(9|10|11)px\]' src/components --include='*.tsx' | wc -l`
Expected: `0`

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components
git commit -m "feat(large-type): micro-type token sweep — src/components"
```

---

### Task 4: Sweep batch — views group 1 (ledger-heavy dashboards)

**Files:**
- Modify: all `.tsx` under `src/views/CityBudget`, `src/views/CampaignFinance`, `src/views/BusinessSearch`, `src/views/BusinessActivity`, `src/views/Alerts`, `src/views/Cases311`, `src/views/CrimeIncidents`, `src/views/Demographics`, `src/views/Dispatch911` containing the target classes

Identical procedure to Task 3 with the scope swapped. Also a `mech-sweeper` candidate.

- [ ] **Step 1: Apply the mapping**

```bash
grep -rlE 'text-\[(9|10|11)px\]' \
  src/views/CityBudget src/views/CampaignFinance src/views/BusinessSearch \
  src/views/BusinessActivity src/views/Alerts src/views/Cases311 \
  src/views/CrimeIncidents src/views/Demographics src/views/Dispatch911 \
  --include='*.tsx' | \
  xargs perl -pi -e 's/text-\[9px\]/text-nano/g; s/text-\[10px\]/text-micro/g; s/text-\[11px\]/text-label/g'
```

- [ ] **Step 2: Verify zero remaining in scope + typecheck**

Run:

```bash
grep -rE 'text-\[(9|10|11)px\]' \
  src/views/CityBudget src/views/CampaignFinance src/views/BusinessSearch \
  src/views/BusinessActivity src/views/Alerts src/views/Cases311 \
  src/views/CrimeIncidents src/views/Demographics src/views/Dispatch911 \
  --include='*.tsx' | wc -l
```

Expected: `0`

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Commit**

```bash
git add src/views
git commit -m "feat(large-type): micro-type token sweep — ledger-heavy views"
```

---

### Task 5: Sweep batch — all remaining sites + repo-wide zero gate

**Files:**
- Modify: every remaining `.tsx` under `src/` containing the target classes (Elections, EmergencyResponse, Home, Last48, Neighborhood, ParkingCitations, ParkingRevenue, TrafficSafety, and any straggler)

Also a `mech-sweeper` candidate.

- [ ] **Step 1: Apply the mapping repo-wide (previous batches are already clean, so this catches exactly the remainder)**

```bash
grep -rlE 'text-\[(9|10|11)px\]' src --include='*.tsx' | \
  xargs perl -pi -e 's/text-\[9px\]/text-nano/g; s/text-\[10px\]/text-micro/g; s/text-\[11px\]/text-label/g'
```

- [ ] **Step 2: Repo-wide zero gate + full build**

Run: `grep -rE 'text-\[(9|10|11)px\]' src --include='*.tsx' --include='*.ts' | wc -l`
Expected: `0`

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: build succeeds (`tsc -b && vite build`).

- [ ] **Step 3: Sanity-check the swap count against the inventory**

Run: `grep -rEo 'text-(nano|micro|label)\b' src --include='*.tsx' | wc -l`
Expected: ≈ 850 (366 + 372 + 112, ± any sites the earlier tasks legitimately touched). A wildly different number means the mapping over- or under-fired — investigate before committing.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(large-type): micro-type token sweep — remaining views (repo-wide zero)"
```

---

### Task 6: Effective-viewport core — SCALE_FACTORS, leaf module, useIsMobile + MapSidebar conversion

**Files:**
- Modify: `src/stores/typeScale.ts` (add `SCALE_FACTORS`)
- Create: `src/hooks/effectiveViewport.ts` (leaf module — imports ONLY `@/stores/typeScale`, so the node-only Vitest can test it; `useIsMobile.ts` can't host this because it will import `appStore`, which touches `matchMedia`/`localStorage` at eval and is unimportable in node tests)
- Modify: `src/hooks/useIsMobile.ts` (rewrite on effective width)
- Modify: `src/stores/appStore.ts` (stamp `data-vp` at eval + in setTypeScale)
- Modify: `src/App.tsx:62-70` (typeScale effect + new resize effect)
- Modify: `src/components/layout/MapSidebar.tsx:62-71` (narrow check)
- Test: `src/stores/typeScale.test.ts`, Create: `src/hooks/effectiveViewport.test.ts`

**Interfaces:**
- Consumes: `data-type-scale` DOM attribute guaranteed at module eval (Task 2); `parseTypeScale` from `src/stores/typeScale.ts`.
- Produces: `SCALE_FACTORS: Record<TypeScale, number>`; `effectiveViewportWidth(): number`; `syncViewportMode(): void` (stamps `html[data-vp="mobile"|"desk"]`); `MOBILE_BREAKPOINT = 768`. Task 7's `desk:` variant styles against `html[data-vp]`.

- [ ] **Step 1: Write the failing tests**

Append to `src/stores/typeScale.test.ts`:

```ts
import { SCALE_FACTORS } from './typeScale'

describe('SCALE_FACTORS', () => {
  it('pins the root multipliers to the index.css html[data-type-scale] rules', () => {
    expect(SCALE_FACTORS).toEqual({ default: 1, large: 1.18, xl: 1.33 })
  })
})
```

Create `src/hooks/effectiveViewport.test.ts`:

```ts
import { describe, it, expect, vi, afterEach } from 'vitest'
import { effectiveViewportWidth, syncViewportMode, MOBILE_BREAKPOINT } from './effectiveViewport'

function stubViewport(innerWidth: number, typeScaleAttr: string | null) {
  const setAttribute = vi.fn()
  vi.stubGlobal('window', { innerWidth })
  vi.stubGlobal('document', {
    documentElement: { getAttribute: () => typeScaleAttr, setAttribute },
  })
  return setAttribute
}

describe('effectiveViewportWidth', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('returns raw innerWidth at default scale', () => {
    stubViewport(1180, 'default')
    expect(effectiveViewportWidth()).toBe(1180)
  })

  it('divides by 1.18 under large', () => {
    stubViewport(1180, 'large')
    expect(effectiveViewportWidth()).toBeCloseTo(1000)
  })

  it('divides by 1.33 under xl', () => {
    stubViewport(1330, 'xl')
    expect(effectiveViewportWidth()).toBeCloseTo(1000)
  })

  it('treats a missing or garbage attribute as default', () => {
    stubViewport(900, null)
    expect(effectiveViewportWidth()).toBe(900)
    stubViewport(900, 'huge')
    expect(effectiveViewportWidth()).toBe(900)
  })

  it('is SSR-safe (no window → 0)', () => {
    vi.stubGlobal('window', undefined)
    expect(effectiveViewportWidth()).toBe(0)
  })
})

describe('syncViewportMode', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('stamps desk at/above the effective breakpoint', () => {
    const setAttribute = stubViewport(MOBILE_BREAKPOINT, 'default')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'desk')
  })

  it('stamps mobile below it', () => {
    const setAttribute = stubViewport(MOBILE_BREAKPOINT - 1, 'default')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'mobile')
  })

  it('large type flips a 900px viewport to mobile (900 ÷ 1.18 ≈ 763)', () => {
    const setAttribute = stubViewport(900, 'large')
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'mobile')
  })

  it('stamps desk when width is unreadable (0) — matches the old SSR-desktop default', () => {
    vi.stubGlobal('window', { innerWidth: 0 })
    const setAttribute = vi.fn()
    vi.stubGlobal('document', {
      documentElement: { getAttribute: () => 'default', setAttribute },
    })
    syncViewportMode()
    expect(setAttribute).toHaveBeenCalledWith('data-vp', 'desk')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `pnpm vitest run src/stores/typeScale.test.ts src/hooks/effectiveViewport.test.ts`
Expected: FAIL — `SCALE_FACTORS` not exported; `./effectiveViewport` does not exist.

- [ ] **Step 3: Implement the pure pieces**

Append to `src/stores/typeScale.ts`:

```ts
/** Root font-size multiplier per tier. MUST match the
 *  html[data-type-scale] font-size rules in src/index.css
 *  (large = 118%, xl = 133%) — typeScale.test.ts pins the values so
 *  the CSS and JS can't drift silently. */
export const SCALE_FACTORS: Record<TypeScale, number> = {
  default: 1,
  large: 1.18,
  xl: 1.33,
}
```

Create `src/hooks/effectiveViewport.ts`:

```ts
// src/hooks/effectiveViewport.ts
//
// Effective-viewport math for the Large Type edition. A leaf module (it
// imports only the pure stores/typeScale) so the node-only Vitest env can
// test it with stubbed globals — the same isolation recipe that keeps
// stores/typeScale.ts importable while appStore.ts is not.
import { SCALE_FACTORS, parseTypeScale } from '@/stores/typeScale'

/** The mobile-shell boundary, in EFFECTIVE px. Replaces the old
 *  matchMedia('(max-width: 767px)') check — CSS-side equivalents use the
 *  desk: custom variant (html[data-vp], stamped by syncViewportMode), not
 *  md: media queries, so JS and CSS key off this single number. */
export const MOBILE_BREAKPOINT = 768

/** innerWidth divided by the active type-scale factor. Large type shrinks
 *  how much CONTENT fits per physical pixel, so every JS density
 *  threshold compares against this, not raw innerWidth. Reads the
 *  data-type-scale DOM attribute (applied at appStore module eval)
 *  rather than the store so this stays store-free and node-testable.
 *  Returns 0 when there is no window (SSR/test guard). */
export function effectiveViewportWidth(): number {
  if (typeof globalThis.window === 'undefined' || typeof globalThis.document === 'undefined') return 0
  const raw = globalThis.document.documentElement.getAttribute('data-type-scale')
  return globalThis.window.innerWidth / SCALE_FACTORS[parseTypeScale(raw)]
}

/** Stamp html[data-vp="mobile"|"desk"] — the single source the desk:
 *  Tailwind variant (src/index.css @custom-variant) styles against.
 *  Called at appStore module eval (pre-first-paint), from setTypeScale
 *  (a scale change moves the effective breakpoint), and from App.tsx's
 *  resize listener. An unreadable width (0) stamps desk, matching the
 *  old hook's SSR-desktop default. */
export function syncViewportMode(): void {
  if (typeof globalThis.document === 'undefined') return
  const w = effectiveViewportWidth()
  const mode = w > 0 && w < MOBILE_BREAKPOINT ? 'mobile' : 'desk'
  globalThis.document.documentElement.setAttribute('data-vp', mode)
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `pnpm vitest run src/stores/typeScale.test.ts src/hooks/effectiveViewport.test.ts`
Expected: PASS (all cases).

- [ ] **Step 5: Rewrite useIsMobile on effective width**

Replace the entire contents of `src/hooks/useIsMobile.ts` with:

```ts
// src/hooks/useIsMobile.ts
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { effectiveViewportWidth, MOBILE_BREAKPOINT } from '@/hooks/effectiveViewport'

/** True when the EFFECTIVE viewport (innerWidth ÷ type-scale factor) is
 *  below the mobile breakpoint. Drives the JS-side mobile decisions that
 *  can't be expressed in CSS (sheet-vs-card render branches). CSS-side
 *  mobile styling uses the desk: custom variant (html[data-vp], stamped
 *  by syncViewportMode from the SAME effective width), so JS and CSS
 *  flip together — including when large type shrinks the effective
 *  viewport (e.g. a 900px window under 'large' is mobile: 900 ÷ 1.18 ≈
 *  763 < 768). Do NOT reintroduce md: media-query checks here. */
export function useIsMobile(): boolean {
  const typeScale = useAppStore((s) => s.typeScale)
  const [isMobile, setIsMobile] = useState(() => isMobileViewport())
  useEffect(() => {
    const onResize = () => setIsMobile(isMobileViewport())
    onResize() // resync — covers both mount gaps and typeScale-change re-runs
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [typeScale])
  return isMobile
}

/** Imperative check for non-React call sites (e.g. fly-to handlers).
 *  Effective-width-based; returns false when no window exists (SSR),
 *  matching the old matchMedia guard's behavior. */
export function isMobileViewport(): boolean {
  const w = effectiveViewportWidth()
  return w > 0 && w < MOBILE_BREAKPOINT
}
```

- [ ] **Step 6: Stamp data-vp beside both data-type-scale writes**

In `src/stores/appStore.ts`, add the import `import { syncViewportMode } from '@/hooks/effectiveViewport'` (no cycle: effectiveViewport imports only stores/typeScale). Then:

In `setTypeScale`, after the `document.documentElement.setAttribute('data-type-scale', scale)` line, add:

```ts
    syncViewportMode() // scale change moves the effective breakpoint
```

At the module tail (the Task 2 eval-time block), extend to:

```ts
// Apply the persisted type scale at module eval — the store module is
// imported synchronously before React's first render, so stored-large/xl
// users never flash default-size text. App.tsx's effect re-applies it on
// later state changes (the same dual-application recipe as dark mode).
// syncViewportMode must follow: html[data-vp] (which the desk: CSS
// variant styles against) depends on the type scale being stamped first.
document.documentElement.setAttribute('data-type-scale', useAppStore.getState().typeScale)
syncViewportMode()
```

- [ ] **Step 7: Keep data-vp fresh from App.tsx**

In `src/App.tsx`, add `import { syncViewportMode } from '@/hooks/effectiveViewport'`. Extend the existing typeScale effect and add a resize listener:

```ts
  const typeScale = useAppStore((s) => s.typeScale)
  useEffect(() => {
    document.documentElement.setAttribute('data-type-scale', typeScale)
    syncViewportMode() // effective breakpoint moved with the scale
  }, [typeScale])

  useEffect(() => {
    const onResize = () => syncViewportMode()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
```

- [ ] **Step 8: Wire MapSidebar's narrow check to effective width**

In `src/components/layout/MapSidebar.tsx`, add `effectiveViewportWidth` to the imports:

```ts
import { effectiveViewportWidth } from '@/hooks/effectiveViewport'
```

Then replace the narrow-tracking block (currently lines 62–71):

```ts
  // Track viewport width so compressed mode kicks in below the breakpoint.
  // SSR-safe via initializer; updated on resize via listener.
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < NARROW_BREAKPOINT : false,
  )

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
```

with:

```ts
  // Track viewport width so compressed mode kicks in below the breakpoint.
  // EFFECTIVE width (innerWidth ÷ type-scale factor): a large-type desktop
  // fits less content per physical pixel, so density reduction must kick
  // in earlier (e.g. 1024 × 1.18 ≈ 1208 physical px under 'large').
  // SSR-safe via initializer; updated on resize AND on type-scale changes
  // (setTypeScale writes the DOM attribute before the state commit, so
  // the effect re-run reads the fresh scale).
  const typeScale = useAppStore((s) => s.typeScale)
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? effectiveViewportWidth() < NARROW_BREAKPOINT : false,
  )

  useEffect(() => {
    const onResize = () => setIsNarrow(effectiveViewportWidth() < NARROW_BREAKPOINT)
    onResize() // resync for the typeScale-change re-run
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [typeScale])
```

(`useAppStore` is already imported in this file.)

- [ ] **Step 9: Typecheck and full test run**

Run: `npx tsc -b && pnpm vitest run`
Expected: clean typecheck; all suites pass.

- [ ] **Step 10: Commit**

```bash
git add src/stores/typeScale.ts src/stores/typeScale.test.ts src/hooks/effectiveViewport.ts src/hooks/effectiveViewport.test.ts src/hooks/useIsMobile.ts src/stores/appStore.ts src/App.tsx src/components/layout/MapSidebar.tsx
git commit -m "feat(large-type): effective-viewport core — SCALE_FACTORS, data-vp stamping, useIsMobile + MapSidebar on effective width"
```

---

### Task 7: `desk:` custom variant + repo-wide `md:` → `desk:` rename

**Files:**
- Modify: `src/index.css` (add `@custom-variant desk` beside the existing `@custom-variant dark`)
- Modify: the 19 files with `md:` variants (~65 tokens): `src/components/layout/AppShell.tsx`, `src/components/ui/DetailPanelShell.tsx`, `src/components/ui/BusinessDetailPanel.tsx`, `src/views/Neighborhood/NeighborhoodSidebar.tsx`, `src/views/Last48/detail/Last48EventCard.tsx`, `src/views/Last48/chrome/DatasetSuperChips.tsx`, `src/views/Last48/modes/FlowRail.tsx`, `src/views/Last48/Last48.tsx`, `src/views/Home/Home.tsx`, `src/views/Dispatch911/Dispatch911.tsx`, `src/views/CampaignFinance/CampaignFinance.tsx`, `src/views/BusinessSearch/BusinessSearch.tsx`, `src/views/BusinessActivity/BusinessActivity.tsx`, `src/views/TrafficSafety/TrafficSafety.tsx`, `src/views/ParkingRevenue/ParkingRevenue.tsx`, `src/views/ParkingCitations/ParkingCitations.tsx`, `src/views/EmergencyResponse/EmergencyResponse.tsx`, `src/views/CrimeIncidents/CrimeIncidents.tsx`, `src/views/Cases311/Cases311.tsx`

**Interfaces:**
- Consumes: `html[data-vp]` stamped by Task 6's `syncViewportMode()`.
- Produces: the `desk:` variant — the ONLY sanctioned way to write "≥ mobile breakpoint" CSS in app code from now on.

**Why this is safe:** `md:X` today means `@media (min-width: 768px)`. After Task 6, `data-vp="desk"` is stamped exactly when effective width ≥ 768 — at default scale that is exactly `innerWidth ≥ 768`, so behavior at default is identical. The variant mechanism (`:where()` keeps specificity at zero, cascade position handled by Tailwind) is the same one the codebase's `dark:` variant has used all along.

- [ ] **Step 1: Add the variant**

In `src/index.css`, directly below `@custom-variant dark (&:where(.dark, .dark *));`, add:

```css
/* Effective-width desktop variant (Large Type Phase 2). Replaces md: in
   app code: html[data-vp] is stamped by syncViewportMode() from EFFECTIVE
   viewport width (innerWidth ÷ type-scale factor), so a large-type reader
   on a 900px window correctly gets the mobile shell (900 ÷ 1.18 < 768).
   Media queries can't read attributes — this attribute-driven variant is
   how CSS follows the JS source of truth. Do not use md: in app code. */
@custom-variant desk (&:where(html[data-vp="desk"] *));
```

- [ ] **Step 2: Rename md: → desk: across the 19 files**

```bash
grep -rl '\bmd:' src --include='*.tsx' | xargs perl -pi -e 's/\bmd:/desk:/g'
```

- [ ] **Step 3: Fix the prose comments the rename touched**

The rename also rewrites `md:` mentions inside comments. Re-read and reword these three so the prose is true:
- `src/components/layout/AppShell.tsx:178` — "(md:-gated)" → "(desk:-gated)" reads correctly after rename; confirm the sentence still makes sense.
- `src/views/Neighborhood/NeighborhoodSidebar.tsx:271-273` — the comment explains "sheetStyle … attaches only below md; the md: …"; reword to "below the mobile breakpoint; the desk: classes cancel the sheet chrome on desktop."
- `src/hooks/useIsMobile.ts` — already rewritten in Task 6; confirm no stale `md:` mention survives.

- [ ] **Step 4: Verify zero md: remains, then build**

Run: `grep -rn '\bmd:' src --include='*.tsx' --include='*.ts' --include='*.css' | wc -l`
Expected: `0`

Run: `~/dev/devman/tools/devman-build.mjs pnpm build` then:

```bash
grep -c 'data-vp="desk"' dist/assets/*.css
```

Expected: ≥ 1 (the `desk:` variant rules are in the bundle).

- [ ] **Step 5: Commit**

```bash
git add src/index.css src
git commit -m "feat(large-type): desk: effective-width variant replaces md: across the shell"
```

---

### Task 8: Fixed-width container normalization

**Files:**
- Modify: the files listed in Step 1's table (text-bearing `w-[Npx]` containers → exact N/16 rem so they grow with the root scale; default remains pixel-identical since 1rem = 16px)

**Conversion rule:** a width is converted when the box CONTAINS TEXT that would clip or wrap badly as text grows; pure geometry stays px. Do NOT convert: `w-[5px]` accent rails (InvestigationCard, LivePreview), `w-[34px]` notch tabs (InvestigationCard), `max-w-[1800px]` page wrapper (Home — page-scale geometry, not a text container).

- [ ] **Step 1: Apply the conversions**

| File | From | To |
|---|---|---|
| `src/components/layout/MapSidebar.tsx` (2 sites, `lean` variant) | `w-[260px]` | `w-[16.25rem]` |
| `src/views/Demographics/Demographics.tsx` | `w-[420px]` | `w-[26.25rem]` |
| `src/views/Neighborhood/Neighborhood.tsx` | `w-[280px]` | `w-[17.5rem]` |
| `src/views/Neighborhood/NeighborhoodSidebar.tsx` (2 sites — after Task 7 these read `desk:w-[300px]`) | `desk:w-[300px]` | `desk:w-[18.75rem]` |
| `src/views/CityBudget/CityBudget.tsx` | `w-[140px]`×3 / `w-[120px]`×2 / `w-[300px]` / `w-[160px]` | `w-[8.75rem]` / `w-[7.5rem]` / `w-[18.75rem]` / `w-[10rem]` |
| `src/views/CityBudget/VendorProfile.tsx` | `w-[200px]`×2 / `w-[180px]` / `w-[160px]` / `w-[140px]` | `w-[12.5rem]`×2 / `w-[11.25rem]` / `w-[10rem]` / `w-[8.75rem]` |
| `src/views/CityBudget/VendorExplorer.tsx` | `w-[80px]` | `w-[5rem]` |
| `src/views/CampaignFinance/CampaignFinance.tsx` | `w-[140px]` | `w-[8.75rem]` |
| `src/views/Dispatch911/Dispatch911.tsx` | `w-[120px]` | `w-[7.5rem]` |
| `src/views/Elections/map/PrecinctLegend.tsx` | `w-[130px]` / `w-[120px]` | `w-[8.125rem]` / `w-[7.5rem]` |
| `src/views/Last48/chrome/LayerControls.tsx` | `w-[220px]` | `w-[13.75rem]` |
| `src/views/Last48/ambient/AmbientToggle.tsx` | `w-[180px]` | `w-[11.25rem]` |
| `src/views/Home/Home.tsx` | `w-[215px]` | `w-[13.4375rem]` |
| `src/views/Alerts/AlertsView.tsx` | `w-[640px]` | `w-[40rem]` |

- [ ] **Step 2: Sweep for any site the table missed and apply the same rule**

Run: `grep -rnE 'w-\[[0-9]+px\]' src --include='*.tsx'`
For each remaining hit: convert to N/16 rem if it wraps text, leave px if pure geometry (accent bars, notches, page wrappers). Note each leave-as-px decision in the task report.

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src
git commit -m "feat(large-type): rem-normalize text-bearing fixed-width containers"
```

---

### Task 9: Browser QA gate + docs (controller-run, not delegated)

Per the render-feature-browser-gate rule, layout/type features are accepted on **live DOM probes against a preview**, not on diff review. Run on the Vercel PR preview (or `pnpm build && vite preview` locally via tarmac).

- [ ] **Step 1: Computed-size probes (default = pixel-identical gate)**

On a dashboard view (e.g. `/emergency`), with the type slider at Default, run in the console:

```js
['text-nano','text-micro','text-label'].map(c => {
  const el = document.querySelector('.' + c)
  return c + ': ' + (el ? getComputedStyle(el).fontSize : 'NO ELEMENT')
})
```

Expected: `9px / 10px / 11px` exactly. Any other value fails the pixel-identical constraint.

- [ ] **Step 2: Floor-raise probes**

Switch the slider to Large, re-run the probe. Expected ≈ `11.8px / 13px / 14.2px`.
Switch to XL, re-run. Expected ≈ `13.3px / 14.6px / 16px`.
Also confirm `getComputedStyle(document.documentElement).fontSize` reads ≈ `18.88px` (large) / `21.28px` (xl).

- [ ] **Step 3: Breakpoint coherence probes (the full-spec acceptance)**

- Default scale, resize across 768px: the WHOLE shell flips at once (top bar + drawer + sheets + `desk:` styles) — identical widths to production today. `document.documentElement.dataset.vp` reads `mobile` below 768, `desk` at/above.
- At ~850px physical width: Default → desktop register everywhere; switch to Large → the ENTIRE shell coherently flips to the mobile register (850 ÷ 1.18 ≈ 720 < 768): drawer top bar appears, MapSidebar/NeighborhoodSidebar become sheets, `desk:`-styled chrome (FlowRail footer, event-card sizing) reads mobile. No hybrid states.
- Under Large, resize across ≈906px physical: coherent flip at the effective boundary.
- MapSidebar narrow: at ~1150px on a map view, Default → full width; Large → compressed `w-60` (1150 ÷ 1.18 ≈ 975 < 1024) without a resize; back to Default → full width returns.

- [ ] **Step 4: First-paint flash probe**

With Large stored (toggle it, reload): `document.documentElement.getAttribute('data-type-scale')` is `large` and `dataset.vp` is populated immediately at load; no visible default-size flash on a hard reload.

- [ ] **Step 5: Per-view visual pass**

At XL (worst case), both themes, ~1280px and ~1600px widths, walk: EmergencyResponse, CityBudget (ledger cells), Cases311, CrimeIncidents, TrafficSafety, ParkingCitations, ParkingRevenue, Dispatch911, Demographics, Elections, Last 48, Alerts, Home. Checking: stat cards, detail panels (open one per view), sidebars, filter chips — legible, unclipped, no horizontal scroll, no overlapping text. Log every defect; fix loop before merge.

- [ ] **Step 6: Docs**

- `CLAUDE.md` → Large Type mode section: Phase 2 shipped — token utilities live (`text-nano`/`text-micro`/`text-label`), floor-raise values, effective-width breakpoints. → Mobile/responsive section: breakpoint is now EFFECTIVE 768 (`useIsMobile`/`isMobileViewport` divide by the type-scale factor; CSS uses the `desk:` custom variant off `html[data-vp]`; **`md:` is banned in app code**; `sm:/lg:/2xl:` remain physical-px cosmetics).
- Spec `docs/superpowers/specs/2026-07-18-large-type-edition-design.md` → append Phase 2 shipped-amendments (nano stop, 11px inclusion, full-spec breakpoint mechanism via `data-vp`/`desk:`, caption/small not wired — YAGNI, nothing maps to them yet; `sm:/lg:` cosmetic variants stay physical).

- [ ] **Step 7: Commit docs**

```bash
git add CLAUDE.md docs/superpowers/specs/2026-07-18-large-type-edition-design.md
git commit -m "docs(large-type): Phase 2 shipped amendments"
```

---

## Follow-ups deliberately NOT in this plan

- `text-[8px]` (83), `text-[12px]` (51), `text-[13px]` (19) sites — candidate for a later sweep onto additional stops once Phase 2's look settles.
- `sm:`/`lg:`/`xl:`/`2xl:` variants (≈48 sites) stay physical-px — cosmetic only, no JS pairing; convert to effective-width variants only if QA surfaces a real defect.
- Phase 3: 46 D3 SVG `font-size` attrs, Mapbox label `text-size` via `softenBasemapLabels`, `.datadiver-tooltip` px sizes, `SignalGlyph`/`DeviationBar` JS-computed geometry.
- Collapsed-rail cycle-button discoverability (aria-only third state).
- Fixed **heights** (`h-[Npx]`) were not swept — Task 9 Step 5 watches for clipped rows; convert case-by-case if QA finds them.
