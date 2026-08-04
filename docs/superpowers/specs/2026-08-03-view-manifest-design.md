# View Manifest — stage 1b of the Oakland geography program

**Date:** 2026-08-03 · **Stage:** 1b of the program in
`2026-08-03-oakland-geography-program-design.md` (see its §4, amended today) ·
**Gate:** zero visible SF change — SF is pixel-identical and URL-identical, same
acceptance method as stage 1a (PR #141).

## Problem

View registration is scattered across independently-authored tables that only agree
by discipline: `NAV_ITEMS` (AppShell), `VISUALIZATIONS` (Home), `DATASET_ROUTES`
(OmniSearch), `ERA_SOURCES` (eraSources.ts), the `ViewId` union (types/datasets.ts),
and the App.tsx route table. A 7-agent survey (2026-08-03) measured the drift:

- `ViewId` in `types/datasets.ts:677` is stale at **12 of 20** real views — missing
  `business`, `city-budget`, `elections`, `neighborhood`, `pulse`, `live`, `alerts`,
  `about`. `eraSourceFor` papers over it with an unsafe `as ViewId` cast.
- `useViewIndicators.ts` re-declares its own 12-member `ViewId` that drifted
  *differently* (adds `city-budget` + `advertising` — the latter is a CityBudget
  tab, not a view; its own transformer hardcodes `'city-budget'` as the nav
  target, disagreeing with its key). **Verified dead code**: repo-wide grep finds
  the hook imported by nothing; single commit; the live ticker runs on the
  heartbeat-ticker/pulse machinery instead.
- Home's `/live` card carries pre-rebrand copy ("Live Feeds", "Scanner Radio ·
  SFPD, SFFD, EMS") — rendering on production at both call sites (desktop grid +
  mobile explorations).
- ⌘K search cannot find 13 routed views by name (Elections, Pulse, About, …) —
  `DATASET_ROUTES` reaches only 11 views through dataset entries.
- The sweep found four more view-keyed surfaces the original list of six missed:
  `UNDERLAY_PRESETS` (censusVariables.ts, keys `'last48'` where canonical is
  `'live'`), the dead `CityConfig.camera.slots` scaffolding from stage 1a (zero
  reads; same `'last48'` key), `DATELESS_VIEWS`/`REDIRECT_VIEWS` (useUrlSync),
  and 14 scattered `ExportButton` filename literals (third spelling: `'last-48'`).

The canonical view list (App.tsx routes; `/` → `home`; the three `/business/…`
detail routes collapse to `business` per `parseRoute`; redirects are not views):

> home · emergency-response · parking-revenue · dispatch-911 · 311-cases ·
> crime-incidents · parking-citations · traffic-safety · housing ·
> business-activity · business · campaign-finance · demographics · city-budget ·
> elections · neighborhood · pulse · live · alerts · about — **20 viewIds**.

## Decisions (Jesse, 2026-08-03)

1. **`useViewIndicators` is deleted, not absorbed.** The program spec's
   `indicatorKey` field is dropped (YAGNI — no ticker consumer exists; git
   history keeps the transformer ideas). Program spec §4 amended.
2. **Scope = the six surfaces + three clean wins**: `UNDERLAY_PRESETS`,
   `DATELESS_VIEWS`/`REDIRECT_VIEWS`, and wiring `camera.slots`. Export
   filenames stay put (ledgered — 14 file touches for a cosmetic constant).
3. **1b stays gate-pure; one visible-fixes PR lands immediately after** (§7):
   fresh Last 48 card copy, the task-#97 catch-all-clobber guard, ⌘K view-name
   entries. The parity walk carries zero known-diff exceptions.

## §1 The manifest module — `src/cities/manifest.ts` (new leaf)

Owns the canonical **`ViewId` union (all 20 members)** — replacing the stale union
in `types/datasets.ts` (deleted there along with the dead `ViewState` interface;
the only importer, eraSources, is rebuilt by this stage) — and the entry shape:

```ts
export interface ViewManifestEntry {
  viewId: ViewId
  navLabel: string          // 'The Last 48'
  navShortLabel: string     // 'LIVE' — the 2-5 char badge
  navDescription: string    // '48 hours of live civic data'
  accentColor: string       // pigment hex
  navPulse?: true           // the live-dot (today: hardcoded path==='/live' in AppShell render)
  homeCard?: {              // presence = the view gets a Home viz card
    title: string; subtitle: string
    order: number           // Home grid order ≠ nav order today; this preserves it (§2)
  }
  // (as-built: badge dropped — character-identical to navShortLabel for all 14
  // cards, Home renders that; description/stats dropped — verified dead at both
  // render sites, copy preserved in git history)
  eraSource?: EraSource     // EraSource INTERFACE moves here; query builders stay in
                            // api/eraSources.ts. As-built: EraSource.datasetKey is typed
                            // `string` (a key into the owning city's registry, membership
                            // pinned by tests) — importing DatasetKey would drag
                            // api/datasets into the leaf for a string-wide alias.
  underlayPreset?: readonly CensusVariable[]  // census-variable IDS via `import type` (bundle rule below)
  dateless?: true           // live: useUrlSync strips start/end/tod/compare
  omniDatasetKeys?: readonly string[]  // dataset keys that surface this view in ⌘K
}
```

**Bundle rule (load-bearing):** the manifest is pure data. No component imports
(or every city pulls every view's lazy chunk), and no heavyweight data imports
either — the manifest is reachable from the entry bundle via `fetchDataset` →
registry → CityConfig. That is why `underlayPreset` holds **id strings**: `CensusVariable` is a
string-union TYPE, so the manifest carries the ids at zero bundle cost and views
pass them straight to `UnderlayPicker` (whose `presets` prop already consumes
ids), keeping the full census-variable definitions out of the entry graph
(frontpage-perf rule). No resolver helper needed — the picker resolves ids
against `CENSUS_VARIABLES` inside its own lazy chunk. Moving the `EraSource` interface into the
manifest module (types are leaf-safe) avoids a module cycle
`sf/manifest → api/eraSources → api/datasets → cities/registry → sf/manifest`;
`api/eraSources.ts` re-exports the type so existing type importers don't churn.

## §2 The SF manifest data + the CityConfig join

- New `src/cities/sf/manifest.ts` authors all 20 entries. **Array order = nav
  order** (today's `NAV_ITEMS` order, which matches CLAUDE.md's documented order).
- `CityConfig` gains `manifest: readonly ViewManifestEntry[]` and
  `redirects: readonly { from: string; to: ViewId }[]` — SF:
  `[{ from: 'live-feeds', to: 'live' }]`; Oakland: both empty.
- **Home grid order is a separate historical order** (Emergency Response first,
  Live last — 14 cards; home/alerts/pulse/neighborhood/about have their own Home
  surfaces and `business` is absent without recorded reason). `homeCard.order`
  transcribes today's sequence exactly; deriving the grid from nav order would
  visibly reshuffle Home and break the gate.
- **All rendered copy migrates verbatim** — including the stale Scanner Radio
  card (§7 fixes it). As-built: the old cards' `description`/`stats` chips
  ('~23.3M', '41', '29 yrs') were verified DEAD (no render site) and dropped
  rather than migrated; git history keeps the copy.
- `camera.slots` is wired, not deleted: SF slot key renames `last48` → `live`;
  `Last48Map` reads `city.camera.slots.live` instead of importing `LAST48_CAMERA`
  — identical numbers (`sfCity` already copies them from `LAST48_CAMERA`), zero
  visible change, and Oakland inherits per-view camera overrides in stage 3.

## §3 Readers — before → after

| Surface | Today | After 1b |
|---|---|---|
| `AppShell` | private `NAV_ITEMS` array (20 rows) | derives rows from `useActiveCity().manifest`; `path = viewPath(cityId, viewId)`; live-dot from `navPulse`. Nav becomes city-aware for the stage 4 switcher. |
| `Home` | private `VISUALIZATIONS` (14 rows) | derives from entries with `homeCard`, sorted by `homeCard.order` |
| OmniSearch | `DATASET_ROUTES` + `SEARCH_INDEX` built once at module eval; imports `SF_NEIGHBORHOODS` + `DATASETS` directly | `buildSearchIndex(cityId)` memoized per city; iterates `city.datasets` in the same object order as today; routes from the manifest's `omniDatasetKeys` inverted to a datasetKey→viewId lookup; paths via `viewPath()`; places from `city.areas.names`. SF output element-for-element identical. |
| Era Track | `ERA_SOURCES` table + `if (cityId !== 'sf')` guard, unsafe `as ViewId` cast | `eraSourceFor(cityId, viewId)` = manifest lookup, same signature, callers untouched. Oakland → undefined naturally (no entries); `/live` prohibition holds naturally (no `eraSource` field). |
| Underlays | `UNDERLAY_PRESETS[literal] ?? []` at 9 view call sites; `'last48'` drift | new `useViewEntry()` hook (active city's entry for the current route); views pass `entry?.underlayPreset ?? []` straight to the picker; the entry lives under `live` |
| `useUrlSync` | `DATELESS_VIEWS` / `REDIRECT_VIEWS` module Sets | `manifestEntry?.dateless` / `city.redirects`. Skip-sync semantics UNCHANGED in 1b — the `cityId !== 'sf'` STAGE 3 CONTRACT clause stays; the #97 fix waits for §7. |
| `App.tsx` | 20 hand-written `<Route>` rows | rows derive from the SF manifest over a component map `Record<ViewId, ComponentType>` (Home stays the eager import; the other 19 stay `lazy()`). Hand-written rows remain for: the three `/business/…` detail routes, redirect rows (derived from `city.redirects` via one search+hash-preserving component replacing `LiveFeedsRedirect`), `/oakland/*`, and the catch-all `*`. |

## §4 Deletions

`src/hooks/useViewIndicators.ts` (dead: hook + drifted local union + transformers) ·
`ViewState` + the 12-member `ViewId` in `types/datasets.ts` · `ERA_SOURCES` table ·
`UNDERLAY_PRESETS` · `NAV_ITEMS` · `VISUALIZATIONS` · `DATASET_ROUTES`.

## §5 Tests and pins

- **By construction (no test):** route table ↔ manifest equality — routes derive
  from the manifest.
- **Compile-time (tsc, not Vitest):** component coverage — `Record<ViewId,
  ComponentType>` requires every union member as a key; a manifest view without a
  component fails the build. (Components are city-agnostic; the manifest decides
  which cities mount them.)
- **Vitest pins (node-safe; import only the data leaf):** viewId uniqueness +
  set-equality against the literal 20; `homeCard.order` uniqueness; `live` is
  dateless and era-free; SF `redirects` contains `live-feeds → live`; the
  existing `eraSources.test.ts` integrity suite reshaped to iterate every city's
  manifest entries (clamp ordering, seam plausibility — same assertions);
  OmniSearch SF-parity: rebuilt `buildSearchIndex('sf')` ids + paths match
  today's index (extends `useOmniSearch.test.ts`).

## §6 Verification (acceptance gate)

Stage 1a's method verbatim: full `pnpm build` via the devman wrapper + `pnpm test`;
then the parity-probe walk (branch `vite preview` vs production, identical probes,
hidden-tab parity rules per the parity-probe memory) over the stage 1a deep-link
inventory **plus**: sidebar nav DOM identical; Home grid order identical; ⌘K probe
queries ("Mission", "eviction", "meter") return identical results; Era Track on
`/crime-incidents` + `/housing` identical; one underlay-preset spot check
(`/crime-incidents` picker lists the same variables); `/live-feeds?event=…`
redirect intact. Zero known-diff exceptions.

## §7 The visible-fixes follow-up PR (immediately after 1b merges)

Small, separate, deliberately visible — each item trivial once the manifest exists:

1. **Fresh Last 48 home card** — replace the Scanner Radio copy (draft for
   Jesse's word-check) in `sf/manifest.ts`.
2. **Task #97** — the root catch-all clobber: `useUrlSync` stands down when the
   parsed viewId has no manifest entry and is not a registered redirect (~5
   lines; junk URLs finally redirect Home cleanly instead of keeping their path
   and gaining date params).
3. **⌘K view-name entries** — each manifest entry emits a view result (label =
   `navLabel`), so "Elections" finds Elections. Editorial call on result
   category/icon happens in that PR.

## Out of scope / ledgered

- `ExportButton` filenames (14 inline literals, `'last-48'` spelling) — a future
  `exportName` manifest field; churn without user-visible payoff today.
- OmniSearch `'vendor' | 'time'` dead type members — untouched (Home.tsx already
  documents the ribbon as hidden pending entity-search infrastructure).
- `VISUALIZATIONS`' unexplained omission of `business` — preserved verbatim
  (adding a card is a visible change); noted for the follow-up PR discussion.
- `ALERT_STREAMS`' `'311-cases'` string collision with the viewId — view-adjacent,
  documented false-friend, no change.
