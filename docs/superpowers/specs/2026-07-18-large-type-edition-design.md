# DataDiver Large Type Edition — Design

**Date:** 2026-07-18
**Status:** Approved by Jesse (phased, all 3 phases). Requested by Miles.
**Research brief:** session scratchpad `large-type-brief.md` (audit numbers summarized inline)

## Goal

A first-party "large type" mode for readers who need bigger text — holistic, not a font-size
bump. The interface's density must *degrade gracefully*: micro-labels grow a lot, display
type barely moves, and layouts reflow rather than clip.

## Audit facts that shape the design (2026-07-18 greps)

- The component layer is **px-riddled**: 1,106 arbitrary `text-[Npx]` classes across 109/330
  files vs. 136 rem-based `text-*` utilities (8:1). A bare root-scale toggle reaches ~11% of
  real type declarations.
- **68% of arbitrary sizes are 9–10px** (748 instances) — the Space Mono micro-label idiom.
  This is precisely what "unreadable" means for a large-type reader; raising this floor is
  the highest-value single move.
- **`tokens.css:130-141` already defines a full rem type scale** (`--text-micro` …
  `--text-mega`) with **zero component references** — dormant infrastructure. The mechanism
  is "activate what exists," not "build a scale."
- **Breakpoint blind spot:** `useIsMobile.ts` (767px) and `MapSidebar`'s
  `NARROW_BREAKPOINT=1024` key off physical pixels — large type shrinks the *effective*
  viewport but triggers no density reduction. Must be taught about effective width.
- **No CSS lever reaches:** 46 D3 SVG `font-size` attrs (15 chart files), Mapbox basemap
  labels (`softenBasemapLabels` sets paint only, never `text-size`), 3 hardcoded
  `.datadiver-tooltip` px sizes in `index.css`.
- 62 fixed `w-[Npx]` containers risk clipping when text grows but the box doesn't (About
  860px prose column, Pulse 1180px wire column, Demographics 420px, CityBudget ledger
  cells, `MapSidebar`'s px `lean` variant…). `DetailPanelShell` (rem widths + `max-h-[80vh]`
  + overflow-auto) is already well-prepared.
- No `prefers-*` media query exposes text-size preference — this must be an in-app toggle.
  Browser zoom stays unblocked (no `maximum-scale`); the toggle is **additive** to the
  user's own zoom, "one more notch," per WCAG 1.4.4/1.4.12 spirit.

## Mechanism (combined, approved)

Root-scale multiplier **+** the dormant token scale as vocabulary **+** reader-surface
treatment first:

- **State:** `typeScale: 'default' | 'large'` in `appStore`, localStorage-persisted,
  hydrated at store init — the exact `isDarkMode` recipe. Typed as a union so a future
  `'largest'` tier needs no migration.
- **Toggle:** a single visible control sited as the sibling of the dark-mode toggle in
  AppShell — not buried in a settings page. Plan pins exact placement.
- **Root scale:** `html[data-type-scale="large"] { font-size: 118% }` (conservative start;
  112.5–118% range, not 125–150%, while px debt remains).
- **Token floor-raise:** `[data-type-scale="large"]` overrides in `tokens.css` raise
  `--text-micro`/`--text-label` disproportionately (≈10px → 13px equivalent) while
  `--text-hero`/`--text-mega` (already `clamp()`-based) stay nearly flat. Disproportionate
  scaling is the "super smart" part: the problem is the 9px labels, not the hero.
- **Tailwind wiring:** expose the token scale as real utility names via the `@theme` block
  (`text-micro`, `text-label`, `text-caption`, `text-small`) so `text-[9px]` swaps 1:1 for
  a semantic class — matches the house "pigment naming, not hex" ethos.

## Phases (each ships independently)

### Phase 1 — S/M: toggle + editorial surfaces (Pulse, About)

- `typeScale` store field + AppShell toggle + `data-type-scale` root attribute + the 118%
  rule.
- Convert **Pulse** (WireCard is already rem-based — the only `text-[Nrem]` file in the
  codebase) and **About** (larger px sizes, easy conversions; its 860px prose column
  becomes `max-w` rem) so both read excellently in large type.
- Acceptance: toggling on Pulse/About produces coherent scaling with no clipped or
  overlapping text; the rest of the app is unchanged and unbroken (root scale affects only
  the 136 rem utilities elsewhere — verify no layout breakage on the map views' rem-based
  chrome, e.g. sidebar `w-80`).

### Phase 2 — L: token-floor migration across dashboards ("holistic" happens here)

- Wire the token utilities into `@theme`; sweep the 748 9–10px instances and the 8
  `*DetailPanel.tsx` files (densest surface) onto `text-micro`/`text-label`/`text-caption`
  — mechanical, objectively checkable (same computed size pre-toggle), a strong
  `mech-sweeper` delegation candidate with `opus-validator` gate per house delegation
  conventions. Judgment calls (micro vs. label per site) stay Claude-side.
- Add the floor-raise overrides in `tokens.css`.
- **Fix the breakpoint blind spot:** when `typeScale === 'large'`, density-reduction
  thresholds account for effective width (synthetic bump of the compare width — e.g.
  treat `innerWidth / 1.18` — in `useIsMobile` and `MapSidebar`'s narrow check; a full
  container-query migration is out of scope).
- Normalize the fixed-width containers that would clip (case-by-case: `max-w` + rem, or
  wrap; `MapSidebar`'s px `lean` variant normalizes to a rem width).
- Acceptance: large type on every dataset view leaves stat cards, detail panels, sidebars,
  and filter chips legible and unclipped; visual-regression pass over the touched views
  (the artifact-preview discipline used for the email design system).

### Phase 3 — M: charts + map text (what CSS can't reach)

- **D3:** parametrize the 46 hardcoded SVG `font-size` attrs off a shared helper that reads
  `typeScale` (explicit value threaded per chart; ~20–30% bump). `DorlingCartogram`'s
  radius-derived label size gets its own formula floor, not a flat bump.
- **Mapbox:** extend `softenBasemapLabels()` to also `setLayoutProperty('text-size', …)`
  per label group when large type is active (reusing `classifyLabelLayer()`), re-tuned
  visually via the existing `?labeltune=1` overlay; scale the one dataset-layer text-size
  expression (`neighborhoodMapLayers.ts:30`); fix the 3 hardcoded `.datadiver-tooltip` px
  sizes.
- Acceptance: chart axes/legends and map labels visibly participate in large type; map
  legibility re-checked on both themes.

## Non-goals

- A `'largest'` third tier (union type leaves the door open; not built now).
- Container-query re-architecture of the responsive system.
- Changing default-mode visual design — with the toggle off, the app renders
  pixel-identical (Phase 2's class swaps must preserve computed sizes exactly).
- Print styles, email templates (email has its own design system).

## Risks

- Phase 2's regression surface is wide (~110 files) — mitigated by the objectively-checkable
  swap rule, delegation gates, and per-view visual passes.
- 118% root scale interacts with `clamp()` type (rem floors scale, vw terms don't) — hero
  scales slightly less than body; acceptable and arguably desirable.
- Sequencing with the concurrent RCV animation work: both touch Elections-adjacent files.
  **RCV merges first; large-type rebases over it.**
