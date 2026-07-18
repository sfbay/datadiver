# Large Type Edition — Phase 1 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship a first-party "large type" reading mode: a `typeScale` store field, a root-scale CSS multiplier, an AppShell toggle sibling to the dark-mode toggle, and a full px→rem conversion of the two editorial surfaces (Pulse, About) so they read excellently at 118% scale. With the toggle off, the app must render pixel-identical to today.

**Architecture:** `typeScale: 'default' | 'large'` lives in `appStore.ts`, hydrated from `localStorage` at store init (mirrors `isSidebarOpen`'s recipe — see Global Constraints for why not `isDarkMode`'s) and applied to the DOM via `document.documentElement.setAttribute('data-type-scale', ...)` in two places, exactly mirroring how `isDarkMode` applies `.classList.toggle('dark', ...)`: inside the Zustand setter (immediate, synchronous with the click) and inside a `useEffect` in `App.tsx` keyed on the store value (covers mount/hydration). A pure `parseTypeScale()` helper is split into its own leaf module (`src/stores/typeScale.ts`) so it's unit-testable under the project's node-only Vitest config — `appStore.ts` itself can't be imported by a test today (it touches `window.matchMedia`/`localStorage` at module-eval time with no DOM present). `index.css` gets one new rule, `html[data-type-scale="large"] { font-size: 118% }`. Pulse and About get every `text-[Npx]` / px `fontSize` converted to the exact equivalent rem, plus the two `w-[860px]` prose-column instances (About) and the one `max-w-[1180px]` wire-column instance (Pulse) converted to rem so they grow with the root scale instead of clipping.

**Tech Stack:** React 18 + TypeScript, Zustand, Vitest (node environment, no jsdom), Tailwind v4, Vite.

**Spec:** `docs/superpowers/specs/2026-07-18-large-type-edition-design.md` (Phase 1 only — Phases 2–3 explicitly out of scope for this plan).

## Global Constraints

- Work on branch `feat/large-type-p1` (create from `main` at start; never commit to `main`).
- **Hard constraint (verbatim from spec):** With the toggle off, the app renders pixel-identical — every px→rem conversion must preserve the exact computed size at default scale (e.g. `11px` → `0.6875rem`). Every conversion in this plan is checked to 4 decimal places against `N / 16`.
- **Resolved ambiguity — which store recipe "isDarkMode" means:** `isDarkMode` in `appStore.ts` (line 83) hydrates from `window.matchMedia('(prefers-color-scheme: dark)').matches` and is **never written to `localStorage`** — `toggleDarkMode` only touches `document.documentElement.classList`. It is NOT persisted across sessions today. `isSidebarOpen`/`isContextSidebarOpen` (lines 84–85, 110–119) are the fields that actually follow "hydrate from `localStorage` at init, write back in the setter." Since the spec explicitly requires `typeScale` to be `localStorage`-persisted, this plan mirrors **`isSidebarOpen`'s persistence recipe** and **`isDarkMode`'s DOM-application mechanism** (the setter mutates `document.documentElement` directly, and `App.tsx` independently re-applies it in a `useEffect` keyed on the store value — both places, matching the existing redundant-but-consistent pattern). This does not change any spec requirement; it only says which existing code each piece of `typeScale` is modeled on.
- **Resolved ambiguity — Pulse's non-text px geometry:** `SignalGlyph.tsx`'s `size` prop (SVG `width`/`height`, JS-computed, not CSS) and `DeviationBar.tsx`'s `h-[22px]` track height / `top-[calc(50%-10px)]` tick geometry are decorative graphic dimensions, not text. No CSS root-scale lever reaches an SVG `width`/`height` attribute — scaling them would require threading `typeScale` into leaf visual components via the store, which is the same class of problem as the D3 SVG `font-size` attrs the spec explicitly defers to Phase 3 ("what CSS can't reach"). Left untouched in Phase 1; flagged here so a future Phase 3 pass picks it up alongside the D3 sweep. `WireCard.tsx`'s `min-h-[120px]` is a **minimum**, not a fixed height — text growing inside it cannot clip (the card grows), so it needs no conversion.
- **Resolved ambiguity — About.tsx's other fixed widths:** the spec calls out only "About's `w-[860px]` prose column" (the `Stack` table and `Findings` grid containers, lines 175 and 255 — both literally `860px`). `Prose`'s own `max-w-[760px]` (the actual body-copy measure), the page wrapper's `max-w-[1100px]`, the `Stack` table's `w-[140px]` label column, and the sources table's `min-w-[680px]` are left untouched — none of them clip (text wraps inside all four), and converting the outer page/column widths is Phase-2-flavored "holistic" work the spec assigns elsewhere. Only the two literal `860px` instances convert.
- Do **not** wire `tokens.css`'s `--text-*` scale into the `@theme` block, do not touch `useIsMobile`/`MapSidebar` breakpoints, do not touch any D3 `.attr('font-size', ...)` or Mapbox `text-size` — all Phase 2/3.
- Never run `pnpm dev` (tarmac owns the dev server). Typecheck gate: `npx tsc -b`. Ground-truth verification build: `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Run tests with `npx vitest run <file>`.
- Every commit message ends with:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
  ```

---

### Task 1: `typeScale` store field, DOM mechanism, root CSS rule

**Files:**
- Create: `src/stores/typeScale.ts`
- Create: `src/stores/typeScale.test.ts`
- Modify: `src/stores/appStore.ts`
- Modify: `src/App.tsx`
- Modify: `src/index.css`

**Interfaces:**
- `type TypeScale = 'default' | 'large'`
- `parseTypeScale(raw: string | null): TypeScale` (pure)
- `AppState.typeScale: TypeScale`
- `AppState.setTypeScale: (scale: TypeScale) => void`

- [ ] **Step 1: Write the failing test**

Create `src/stores/typeScale.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { parseTypeScale } from './typeScale'

describe('parseTypeScale', () => {
  it('returns "large" only for the exact stored value "large"', () => {
    expect(parseTypeScale('large')).toBe('large')
  })

  it('defaults to "default" for null (unset localStorage key)', () => {
    expect(parseTypeScale(null)).toBe('default')
  })

  it('defaults to "default" for the literal string "default"', () => {
    expect(parseTypeScale('default')).toBe('default')
  })

  it('defaults to "default" for any unrecognized/stale value', () => {
    expect(parseTypeScale('largest')).toBe('default')
    expect(parseTypeScale('')).toBe('default')
    expect(parseTypeScale('true')).toBe('default')
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run src/stores/typeScale.test.ts`
Expected: FAIL — `Cannot find module './typeScale'` (file doesn't exist yet).

- [ ] **Step 3: Write the implementation**

Create `src/stores/typeScale.ts`:

```ts
// src/stores/typeScale.ts
//
// Pure hydration logic for the type-scale preference, split out of
// appStore.ts so it's unit-testable under this project's node-only Vitest
// config (`vitest.config.ts`: `environment: 'node' // pure functions only —
// no DOM needed`). appStore.ts touches `window.matchMedia`/`localStorage`
// at module-eval time (same as the existing isDarkMode/isSidebarOpen
// fields), which makes the store module itself unimportable in a test
// without a DOM — this leaf module has neither dependency, so it can be.
//
// String union (not boolean) so a future 'largest' tier needs no
// migration — same rationale as ComparisonMode in utils/comparisonMode.ts.

export type TypeScale = 'default' | 'large'

/** Parse the raw localStorage value into a valid TypeScale, defaulting to
 *  'default' for anything else (null/unset, or a stale value left behind
 *  by a future tier that got rolled back) — mirrors isSidebarOpen's
 *  tri-state-safe `!== 'collapsed'` comparison in appStore.ts, just
 *  phrased as an allow-list instead of a deny-list since this is a 2-way
 *  (soon 3-way) union rather than a boolean. */
export function parseTypeScale(raw: string | null): TypeScale {
  return raw === 'large' ? 'large' : 'default'
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run src/stores/typeScale.test.ts`
Expected: PASS (4 tests).

- [ ] **Step 5: Wire into `appStore.ts`**

Add the import (top of file, alongside the existing `@/` imports):

```ts
import { create } from 'zustand'
import type { ViewId } from '@/types/datasets'
import type { ComparisonMode } from '@/utils/comparisonMode'
import { parseTypeScale, type TypeScale } from '@/stores/typeScale'
```

Add to the `AppState` interface, directly after `isContextSidebarOpen`:

```ts
  /** Right context sidebar open state (per-view neighborhood ranking, patterns, etc.) */
  isContextSidebarOpen: boolean

  /** Type-scale reading preference. 'large' applies a root font-size bump
   *  (html[data-type-scale="large"] in index.css) plus the Pulse/About
   *  rem conversions in this phase. String union so a future 'largest'
   *  tier needs no migration. */
  typeScale: TypeScale

```

Add to the actions block of the interface, directly after `toggleContextSidebar`:

```ts
  toggleContextSidebar: () => void
  setTypeScale: (scale: TypeScale) => void
```

In the store body, add the hydrated field directly after `isContextSidebarOpen`:

```ts
  isContextSidebarOpen: localStorage.getItem('dd-context-sidebar') !== 'collapsed',
  typeScale: parseTypeScale(localStorage.getItem('dd-type-scale')),
```

Add the setter directly after `toggleContextSidebar`'s implementation:

```ts
  toggleContextSidebar: () => set((state) => {
    const next = !state.isContextSidebarOpen
    localStorage.setItem('dd-context-sidebar', next ? 'open' : 'collapsed')
    return { isContextSidebarOpen: next }
  }),
  setTypeScale: (scale) => set(() => {
    localStorage.setItem('dd-type-scale', scale)
    document.documentElement.setAttribute('data-type-scale', scale)
    return { typeScale: scale }
  }),
```

- [ ] **Step 6: Apply the DOM mechanism in `App.tsx` (mirrors the `isDarkMode` `useEffect`)**

In `src/App.tsx`, directly after the existing dark-mode effect:

```tsx
export default function App() {
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const typeScale = useAppStore((s) => s.typeScale)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  useEffect(() => {
    document.documentElement.setAttribute('data-type-scale', typeScale)
  }, [typeScale])
```

- [ ] **Step 7: Add the root CSS rule**

In `src/index.css`, insert directly after the base `html { ... }` block (before `body { ... }`):

```css
html {
  font-family: var(--font-sans);
  letter-spacing: -0.02em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  font-feature-settings: "cv11", "ss01";
}

/* Large Type Edition (Phase 1) — root-scale multiplier, applied via the
   data-type-scale attribute that appStore's setTypeScale action + App.tsx's
   useEffect set on <html> (mirrors the .dark class mechanism used for dark
   mode). Conservative 118% on purpose — the component layer is still
   mostly px outside Pulse/About (see docs/superpowers/specs/
   2026-07-18-large-type-edition-design.md); Phase 2 raises the dormant
   tokens.css --text-* floor so more of the app actually participates. */
html[data-type-scale="large"] {
  font-size: 118%;
}

body {
```

- [ ] **Step 8: Typecheck**

Run: `npx tsc -b`
Expected: clean (no errors).

- [ ] **Step 9: Commit**

```bash
git add src/stores/typeScale.ts src/stores/typeScale.test.ts src/stores/appStore.ts src/App.tsx src/index.css
git commit -m "$(cat <<'EOF'
feat(type-scale): typeScale store field + DOM mechanism + root CSS rule

Adds the localStorage-persisted typeScale preference ('default'|'large'),
applied to <html data-type-scale> the same way isDarkMode applies .dark —
inside the setter for immediate effect, and via a useEffect in App.tsx for
hydration. The 118% root rule lands in index.css but nothing references
data-type-scale="large" yet, so this is a no-op until Task 2's toggle ships.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
EOF
)"
```

---

### Task 2: AppShell toggle

**Files:**
- Modify: `src/components/layout/AppShell.tsx`

**Interfaces:**
- Consumes `typeScale`/`setTypeScale` from `useAppStore()` (Task 1).

- [ ] **Step 1: Destructure the new store fields**

`src/components/layout/AppShell.tsx` line 153, add `typeScale, setTypeScale`:

```tsx
  const { isDarkMode, toggleDarkMode, typeScale, setTypeScale, isSidebarOpen: deskRailOpen, toggleSidebar, dateRange } = useAppStore()
```

- [ ] **Step 2: Add the toggle button as a sibling of the dark-mode toggle**

The dark-mode button lives in the footer controls `<div>` (lines 382–446), followed immediately by the collapse/expand toggle. Insert the new button between them — same wrapper classes, same icon-crossfade idiom (two absolutely-positioned glyphs swapped via `rotate`/`scale` transitions, exactly like the sun/moon SVGs), same action-oriented label pattern (`{isDarkMode ? 'Light' : 'Dark'}` labels what clicking switches *to* — mirrored here as `{typeScale === 'large' ? 'Default Type' : 'Large Type'}`):

```tsx
          <button
            onClick={toggleDarkMode}
            className={`
              w-full flex items-center rounded-lg
              text-slate-500 dark:text-slate-500
              hover:bg-slate-50 dark:hover:bg-white/[0.03]
              transition-all duration-200 text-sm
              ${isSidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center p-2.5'}
            `}
          >
            <div className="relative w-5 h-5 flex items-center justify-center">
              <svg
                className={`w-4 h-4 transition-all duration-500 ${isDarkMode ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ position: 'absolute' }}
              >
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
              </svg>
              <svg
                className={`w-4 h-4 transition-all duration-500 ${isDarkMode ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ position: 'absolute' }}
              >
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            </div>
            {isSidebarOpen && (
              <span className="text-[13px] font-medium">{isDarkMode ? 'Light' : 'Dark'}</span>
            )}
          </button>

          {/* Type-scale toggle — sibling of dark mode, same icon-crossfade +
              action-labeled idiom. 'A' glyphs of two sizes stand in for the
              sun/moon SVGs (no stock "text size" icon in the existing set);
              aria-pressed/aria-label added beyond the dark toggle's markup
              since this control is itself an accessibility feature. */}
          <button
            onClick={() => setTypeScale(typeScale === 'large' ? 'default' : 'large')}
            aria-pressed={typeScale === 'large'}
            aria-label={typeScale === 'large' ? 'Switch to default type size' : 'Switch to large type'}
            title={typeScale === 'large' ? 'Default type' : 'Large type'}
            className={`
              w-full flex items-center rounded-lg
              text-slate-500 dark:text-slate-500
              hover:bg-slate-50 dark:hover:bg-white/[0.03]
              transition-all duration-200 text-sm
              ${isSidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center p-2.5'}
            `}
          >
            <div className="relative w-5 h-5 flex items-center justify-center">
              <span
                className={`absolute font-mono font-bold text-[15px] leading-none transition-all duration-500 ${typeScale === 'large' ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}
                aria-hidden="true"
              >
                A
              </span>
              <span
                className={`absolute font-mono font-bold text-[11px] leading-none transition-all duration-500 ${typeScale === 'large' ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}
                aria-hidden="true"
              >
                A
              </span>
            </div>
            {isSidebarOpen && (
              <span className="text-[13px] font-medium">{typeScale === 'large' ? 'Default Type' : 'Large Type'}</span>
            )}
          </button>

          {/* Collapse / expand toggle */}
```

- [ ] **Step 3: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 4: Commit**

```bash
git add src/components/layout/AppShell.tsx
git commit -m "$(cat <<'EOF'
feat(type-scale): AppShell toggle, sibling of dark mode

Same icon-crossfade + action-labeled idiom as the dark-mode button
directly above it. Clicking flips typeScale between 'default' and
'large', which now actually does something visually (Task 1's CSS rule
+ Task 3/4's Pulse/About conversions).

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
EOF
)"
```

---

### Task 3: About.tsx conversion sweep

**Files:**
- Modify: `src/views/About/About.tsx`

**Interfaces:** none (pure class-string edits, no props/behavior change).

About.tsx has **31 arbitrary `text-[Npx]` instances** and **2 `max-w-[860px]` instances** (the "prose column" the spec calls out — the `Stack` table wrapper at line 175 and the `Findings` grid at line 255). Every `text-[Npx]` token in the file is unambiguous (Tailwind arbitrary-value syntax appears nowhere else as plain text), so the conversion is a safe whole-file literal-token sweep per distinct px value — this is the same "objectively-checkable, same computed size pre-toggle" mechanical swap rule the spec cites for Phase 2's larger sweep, just done directly here since the file count is small.

Exact conversions (verified `N / 16`, all exact, ≤4 decimals):

| px | rem | count in file |
|---|---|---:|
| 10px | 0.625rem | 6 |
| 11px | 0.6875rem | 1 |
| 12px | 0.75rem | 13 |
| 13px | 0.8125rem | 7 |
| 14px | 0.875rem | 2 |
| 15px | 0.9375rem | 1 |
| 17px | 1.0625rem | 1 |
| 860px (max-w) | 53.75rem | 2 |

(`style={{ fontSize: 'clamp(2rem, 3vw + 1rem, 3.5rem)' }}` at line 125 is already rem-based — no change, no action.)

- [ ] **Step 1: Pre-sweep verification — confirm the counts above**

```bash
grep -oE "text-\[[0-9]+px\]" src/views/About/About.tsx | sort | uniq -c
grep -c "max-w-\[860px\]" src/views/About/About.tsx
```
Expected:
```
   6 text-[10px]
   1 text-[11px]
  13 text-[12px]
   7 text-[13px]
   2 text-[14px]
   1 text-[15px]
   1 text-[17px]
```
and `2`.

- [ ] **Step 2: Apply the sweep**

```bash
sed -i '' \
  -e 's/text-\[10px\]/text-[0.625rem]/g' \
  -e 's/text-\[11px\]/text-[0.6875rem]/g' \
  -e 's/text-\[12px\]/text-[0.75rem]/g' \
  -e 's/text-\[13px\]/text-[0.8125rem]/g' \
  -e 's/text-\[14px\]/text-[0.875rem]/g' \
  -e 's/text-\[15px\]/text-[0.9375rem]/g' \
  -e 's/text-\[17px\]/text-[1.0625rem]/g' \
  -e 's/max-w-\[860px\]/max-w-[53.75rem]/g' \
  src/views/About/About.tsx
```

- [ ] **Step 3: Post-sweep verification**

```bash
grep -oE "text-\[[0-9]+px\]" src/views/About/About.tsx
grep -c "max-w-\[860px\]" src/views/About/About.tsx
grep -oE "text-\[0\.[0-9]+rem\]|max-w-\[53\.75rem\]" src/views/About/About.tsx | sort | uniq -c
```
Expected: first two commands print nothing / `0`. Third prints:
```
   6 text-[0.625rem]
   1 text-[0.6875rem]
  13 text-[0.75rem]
   7 text-[0.8125rem]
   2 text-[0.875rem]
   1 text-[0.9375rem]
   2 max-w-[53.75rem]
```
(`1.0625rem` for the single 17px instance won't match the `0\.` prefix in the grep pattern — confirm it separately: `grep -c "text-\[1.0625rem\]" src/views/About/About.tsx` → `1`.)

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean (pure string literal changes — Tailwind arbitrary values aren't typechecked, but this confirms nothing else broke).

- [ ] **Step 5: Commit**

```bash
git add src/views/About/About.tsx
git commit -m "$(cat <<'EOF'
feat(type-scale): About.tsx — 31 text sizes + prose-column width to rem

Every text-[Npx] on the page (10/11/12/13/14/15/17px) converts 1:1 to its
exact rem equivalent (N/16, verified to 4 decimals — computed size at
default 100% root is unchanged). The two max-w-[860px] "prose column"
containers (Stack table, Findings grid) convert to max-w-[53.75rem] so
they grow under the 118% type-scale rule instead of forcing extra wraps
at a fixed pixel width.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
EOF
)"
```

---

### Task 4: Pulse surface conversion sweep

**Files:**
- Modify: `src/views/Pulse/Pulse.tsx`
- Modify: `src/views/Pulse/WireCard.tsx`
- Modify: `src/views/Pulse/DeviationBar.tsx`
- `src/views/Pulse/SignalGlyph.tsx`: **no change** — see Global Constraints ("Resolved ambiguity — Pulse's non-text px geometry").

**Interfaces:** none (pure class-string edits).

The brief's claim that "WireCard is already rem-based" is **only partly true**: it has 2 already-rem font sizes (`text-[1.05rem]`, `text-[2.3rem]`, both correctly left alone) but *also* 2 remaining px text sizes (`text-[10px]`, `text-[13px]`) that need the same conversion as everywhere else. Full inventory across the three files:

| File | px | rem | count |
|---|---|---|---:|
| Pulse.tsx | 10px | 0.625rem | 3 |
| Pulse.tsx | 11px | 0.6875rem | 3 |
| Pulse.tsx | max-w-[1180px] | max-w-[73.75rem] | 1 |
| WireCard.tsx | 10px | 0.625rem | 1 |
| WireCard.tsx | 13px | 0.8125rem | 1 |
| DeviationBar.tsx | 8px | 0.5rem | 1 |

Total: **9 text-size conversions + 1 width conversion** across the Pulse surface.

- [ ] **Step 1: Pre-sweep verification**

```bash
grep -oE "text-\[[0-9.]+(px|rem)\]" src/views/Pulse/Pulse.tsx | sort | uniq -c
grep -c "max-w-\[1180px\]" src/views/Pulse/Pulse.tsx
grep -oE "text-\[[0-9.]+(px|rem)\]" src/views/Pulse/WireCard.tsx | sort | uniq -c
grep -oE "text-\[[0-9.]+(px|rem)\]" src/views/Pulse/DeviationBar.tsx
```
Expected:
```
   3 text-[10px]
   3 text-[11px]
```
`1` (max-w count)
```
   1 text-[1.05rem]
   1 text-[13px]
   1 text-[2.3rem]
   1 text-[10px]
```
`text-[8px]`

- [ ] **Step 2: Apply the sweep**

```bash
sed -i '' \
  -e 's/text-\[10px\]/text-[0.625rem]/g' \
  -e 's/text-\[11px\]/text-[0.6875rem]/g' \
  -e 's/max-w-\[1180px\]/max-w-[73.75rem]/g' \
  src/views/Pulse/Pulse.tsx

sed -i '' \
  -e 's/text-\[10px\]/text-[0.625rem]/g' \
  -e 's/text-\[13px\]/text-[0.8125rem]/g' \
  src/views/Pulse/WireCard.tsx

sed -i '' \
  -e 's/text-\[8px\]/text-[0.5rem]/g' \
  src/views/Pulse/DeviationBar.tsx
```

- [ ] **Step 3: Post-sweep verification**

```bash
grep -oE "text-\[[0-9]+px\]" src/views/Pulse/Pulse.tsx src/views/Pulse/WireCard.tsx src/views/Pulse/DeviationBar.tsx
grep -c "max-w-\[1180px\]" src/views/Pulse/Pulse.tsx
grep -c "max-w-\[73.75rem\]" src/views/Pulse/Pulse.tsx
grep -oE "text-\[1\.05rem\]|text-\[2\.3rem\]" src/views/Pulse/WireCard.tsx
```
Expected: first command prints nothing (zero remaining px instances in any of the three files); `max-w-[1180px]` count is `0`; `max-w-[73.75rem]` count is `1`; the already-rem WireCard classes (`1.05rem`, `2.3rem`) are still present, untouched.

- [ ] **Step 4: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 5: Commit**

```bash
git add src/views/Pulse/Pulse.tsx src/views/Pulse/WireCard.tsx src/views/Pulse/DeviationBar.tsx
git commit -m "$(cat <<'EOF'
feat(type-scale): Pulse surface — 9 text sizes + wire-column width to rem

Pulse.tsx (6), WireCard.tsx (2 — the brief's "already rem-based" claim
missed these), and DeviationBar.tsx (1) convert their remaining px text
sizes to the exact rem equivalent. Pulse's max-w-[1180px] wire column
converts to max-w-[73.75rem] so it grows under 118% type-scale.
SignalGlyph.tsx is untouched — its SVG size prop is JS-computed geometry,
not CSS, and is deferred to the Phase 3 D3/SVG sweep alongside the
DeviationBar track's decorative dimensions.

Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
Claude-Session: https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
EOF
)"
```

---

### Task 5: Final verification

**Files:** none (verification only).

- [ ] **Step 1: Full test suite**

Run: `npx vitest run`
Expected: all suites pass, including the new `src/stores/typeScale.test.ts` (4 tests).

- [ ] **Step 2: Typecheck**

Run: `npx tsc -b`
Expected: clean.

- [ ] **Step 3: Ground-truth build**

Run: `~/dev/devman/tools/devman-build.mjs pnpm build`
Expected: succeeds (this is the Vercel-equivalent build — `tsc -b && tsc --noEmit -p api/tsconfig.json && vite build` — and records the result in DevMan ship-health).

- [ ] **Step 4: Manual QA pass** (existing tarmac dev server on 5174 — never start `pnpm dev` via Bash)

  - [ ] Load `/pulse`, toggle Large Type on via the new AppShell button. Confirm: no clipped or overlapping text on any wire card, the wire column visibly widens, the filter-chip row and footer note both scale legibly, nothing overflows horizontally.
  - [ ] Load `/about` with Large Type still on. Confirm: header, section rules, the Stack table, the Data Sources table (horizontal scroll still works, nothing collapses), every `Finding` card, and the RCV/compliance prose sections all read cleanly with no clipped text; the Stack/Findings `860px`→`53.75rem` columns visibly widen.
  - [ ] Repeat both pages in dark mode with Large Type on (Pulse and About both support `.dark` — confirm no contrast/legibility regression from the type-scale rule interacting with dark-mode CSS).
  - [ ] Toggle Large Type **off**. Confirm Pulse and About look pixel-identical to their pre-Phase-1 appearance (spot-check a few of the converted sizes visually — a 10px vs 0.625rem label should be indistinguishable).
  - [ ] Reload the page with Large Type left on. Confirm the preference persists (localStorage `dd-type-scale` survives a hard reload — this is the localStorage-hydration path from Task 1).
  - [ ] Navigate to one map-hero dataset view (e.g. `/emergency-response`) with Large Type on. Confirm the rem-based chrome (sidebar `w-80`, stat cards, filter chips) grows proportionally without breaking layout — per the spec's acceptance note, this view is NOT converted in Phase 1, so its many `text-[Npx]` instances will visibly stay small next to the now-larger rem-based surrounding chrome; that's expected and fine for Phase 1 (Phase 2 evens it out). What must NOT happen: overlapping elements, horizontal scroll on the page shell, or a broken sidebar collapse/expand toggle. If something breaks unacceptably here, the fallback lever is scoping the root-scale rule (e.g. applying `data-type-scale` only within `#root .editorial-surface` wrappers on Pulse/About instead of `<html>`) — do not implement this unless the check above actually fails.
  - [ ] Confirm the AppShell toggle itself: icon crossfades, label swaps between "Large Type"/"Default Type", state matches `aria-pressed`, and it works identically in the collapsed (icon-only) sidebar state.

- [ ] **Step 5: Update CLAUDE.md** (Views inventory / Key Conventions, whichever the merge PR's reviewer prefers) to note the shipped `typeScale` toggle and its Pulse/About scope, so the Phase 2 plan can cite it as done.

- [ ] **Step 6: Open the PR**

```bash
git push -u origin feat/large-type-p1
gh pr create --title "Large Type Edition — Phase 1 (toggle + Pulse/About)" --body "$(cat <<'EOF'
## Summary
- `typeScale: 'default' | 'large'` in appStore, localStorage-persisted, applied via `data-type-scale` on `<html>` (mirrors the isDarkMode DOM mechanism).
- New AppShell toggle, sibling of the dark-mode button.
- `html[data-type-scale="large"] { font-size: 118% }` in index.css.
- Pulse (9 sites) + About (31 sites) fully converted from px to rem; About's 860px prose columns and Pulse's 1180px wire column now grow with the scale.
- Toggle-off state is pixel-identical (every conversion is an exact N/16 rem equivalent).
- Phases 2 (dashboard-wide token sweep + breakpoint fix) and 3 (D3/Mapbox text) are out of scope per the approved spec.

## Test plan
- [ ] `npx vitest run` — all green, including new `typeScale.test.ts`
- [ ] `npx tsc -b` — clean
- [ ] `~/dev/devman/tools/devman-build.mjs pnpm build` — succeeds
- [ ] Manual QA per Task 5 Step 4 (Pulse + About, both themes, on/off, persistence, one map-view sanity check)

🤖 Generated with [Claude Code](https://claude.com/claude-code)

https://claude.ai/code/session_01GLquB1sVWyVsdgUKwSQqQ3
EOF
)"
```
