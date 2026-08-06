// src/cities/manifest.ts
// The canonical view vocabulary + the per-view manifest entry shape.
// PURE DATA LEAF — no component imports (a component here would pull every
// view's lazy chunk into every city's bundle) and no runtime imports of
// heavyweight modules (this module rides the entry bundle via the city
// registry). Type-only imports are fine: they erase at compile time.

import type { CensusVariable } from '@/types/census'

/** Every view family the app can mount — one per top-level route. Detail
 *  routes collapse to their family ('/business/chain/x' → 'business', per
 *  parseRoute) and redirects are not views. Order here is arbitrary; NAV
 *  order is each city's manifest array order. */
export const VIEW_IDS = [
  'home', 'alerts', 'live', 'pulse', 'emergency-response', 'crime-incidents',
  'traffic-safety', 'housing', 'elections', 'city-budget', 'parking-revenue',
  'dispatch-911', '311-cases', 'parking-citations', 'business-activity',
  'business', 'campaign-finance', 'demographics', 'neighborhood', 'about',
] as const
export type ViewId = (typeof VIEW_IDS)[number]

export interface EraSeam {
  year: number
  /** Reader-facing. Rendered beside a dashed rule on the strip. */
  label: string
}

export interface EraSource {
  /** Key into the owning CITY's dataset registry (city.datasets). */
  datasetKey: string
  dateField: string
  /** Count expression for the annual strip. Default count(*). Oakland crime
   *  uses count(distinct casenumber): one row per CHARGE (~15.5% dup rows),
   *  so a row count overstates incidents ~18%. */
  countExpr?: string
  /** Inclusive year bounds; null upper = open to today. Guards published-range
   *  junk — this is load-bearing, not cosmetic (see parking-citations). */
  clamp: [number, number | null]
  /** Set when the clamp HIDES published rows. Rendered on the axis, because a
   *  silently narrowed domain is the same class of dishonesty as a silently
   *  dropped row. Omit when the clamp merely matches the real data floor. */
  clampNote?: string
  /** A second, older extract covering the years BELOW `untilYear`. SFPD is the
   *  only such case: wg3w-h783 starts 2018 and tmnf-yvry covers 2003–2017, so
   *  a single query against the modern set would leave the strip's pre-2018
   *  half empty while the domain claimed to reach 2003.
   *  `untilYear` is EXCLUSIVE and doubles as the modern query's lower bound,
   *  which is what stops the 4.5-month overlap between the two extracts from
   *  being counted twice (see src/views/CrimeIncidents/crimeEra.ts). */
  historical?: { datasetKey: string; dateField: string; untilYear: number }
  seams?: EraSeam[]
}

export interface ViewManifestEntry {
  viewId: ViewId
  navLabel: string
  /** 2–5 char badge; doubles as the Home viz card's badge. */
  navShortLabel: string
  navDescription: string
  /** Pigment hex — same pigment for this dataset on every surface. */
  accentColor: string
  /** The nav badge's live-dot (The Last 48 only). */
  navPulse?: true
  /** Presence = the view gets a Home viz-picker card. `order` is the Home
   *  grid's own historical sequence — NOT nav order, and must never be
   *  derived from it (the zero-visible-change gate forbids reshuffling). */
  homeCard?: { title: string; subtitle: string; order: number }
  eraSource?: EraSource
  /** Suggested ACS variables for the demographic underlay picker. Ids only —
   *  the full configs live in censusVariables.ts, outside the entry bundle. */
  underlayPreset?: readonly CensusVariable[]
  /** The view ignores the global date range; useUrlSync strips date params. */
  dateless?: true
  /** Dataset keys (into the city's registry) that surface this view in ⌘K. */
  omniDatasetKeys?: readonly string[]
  /** Registered (era facts, ⌘K claims) but not yet routable: the city's
   *  catch-all still redirects this slug Home. Dormant entries are excluded
   *  from routes, nav, ⌘K, era activation, and URL param sync — one authored
   *  fact drives all five (the stage-2 'three stand-downs' contract,
   *  amended for partial dormancy by the stage-3 spec §2). */
  dormant?: true
}

/** The entries a city actually routes/renders. Everything liveness-gated
 *  (App routes, AppShell nav, ⌘K, useUrlSync, useEraSeries) derives from
 *  this ONE filter — never re-implement the predicate inline. */
export function liveManifest(entries: readonly ViewManifestEntry[]): ViewManifestEntry[] {
  return entries.filter((e) => e.dormant !== true)
}
