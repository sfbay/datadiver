import { useState, useMemo } from 'react'
import { getCity, CITIES, crossCityPath, isViewLive } from '@/cities/registry'
import { viewPath, type CityId } from '@/cities/routing'
import { useRouteView } from '@/cities/useActiveCity'
import { liveManifest } from '@/cities/manifest'
import { composeAreaLabel, censusUnitLabel } from '@/cities/areaLabel'
import { useFunderTypeahead } from '@/hooks/useFunderTypeahead'
import { fppcBuildersFor } from '@/views/CampaignFinance/fppcDialect'
import { funderKey, formatFunderParam, displayName } from '@/lib/funders/funderKey'
import { toSentenceCase } from '@/utils/format'
import { SUBCATEGORY_WATCH, formatSubParam } from '@/views/CrimeIncidents/subcategoryWatch'
import { SF_CRIME_GROUPS } from '@/views/CrimeIncidents/crimeGroups'
import { SF_SERVICE_GROUPS } from '@/views/Cases311/serviceGroups'

// A local copy of TopRecipientsChart's `formatCurrency`, NOT an import of it:
// this module is tested under vitest's node environment (pure functions
// only, per vitest.config.ts), and TopRecipientsChart pulls in `useAppStore`
// (`@/stores/appStore`), whose module-eval calls `window.matchMedia` —
// importing it here would break useOmniSearch.test.ts with
// "ReferenceError: window is not defined". Keep this in sync with
// TopRecipientsChart.tsx's version if that formatting ever changes.
function formatCurrency(value: number): string {
  if (value >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`
  if (value >= 1_000) return `$${(value / 1_000).toFixed(0)}K`
  return `$${value.toFixed(0)}`
}

export type SearchCategory = 'view' | 'place' | 'dataset' | 'vendor' | 'time' | 'city' | 'region' | 'funder' | 'topic'

export interface SearchResult {
  id: string
  category: SearchCategory
  label: string
  sublabel: string
  icon: string
  path: string
  params?: Record<string, string>
  /** Canonical short id rendered as its OWN span beside the label, so a
   *  truncating row can never clip it away (the beat/region idiom: the code
   *  is the precise unit the data uses, the name is the human handle). */
  code?: string
}

// Built once per city per session, on first use — the same cost profile as
// the old module-eval SF index, but the index now follows the URL's city.
const indexCache = new Map<CityId, SearchResult[]>()
const regionCache = new Map<CityId, SearchResult[]>()
const topicCache = new Map<CityId, SearchResult[]>()

export function buildSearchIndex(cityId: CityId): SearchResult[] {
  const cached = indexCache.get(cityId)
  if (cached) return cached
  const city = getCity(cityId)
  const results: SearchResult[] = []

  // Views first — typing a view's own name ('Elections', 'Housing') is the
  // strongest intent signal ⌘K gets, and manifest-only views (no
  // omniDatasetKeys) previously had no row at all. Dormant entries are excluded.
  for (const entry of liveManifest(city.manifest)) {
    results.push({
      id: `view-${entry.viewId}`,
      category: 'view',
      label: entry.navLabel,
      sublabel: entry.navDescription,
      icon: '🧭',
      path: viewPath(cityId, entry.viewId),
    })
  }

  // Areas → place results. Destination + param come from the city config;
  // labels are the composed editorial form ('Rockridge & Shafter · 12Y' —
  // composeAreaLabel is identity for SF). The sublabel keeps the literal
  // area noun (from city.areas.noun, e.g. 'police beat') + the code so the
  // legacy query shape 'beat 12y' keeps matching the label||sublabel
  // substring filter. searchExcluded ids (LKM1/PDT2) get no row — a famous
  // name over a near-empty destination is absence rendered as presence.
  // The param carries the RAW id the destination view's ?neighborhood= reads.
  const { viewId: placeView, param: placeParam } = city.areas.placeDestination
  for (const name of city.areas.names) {
    if (city.areas.searchExcluded?.has(name)) continue
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: composeAreaLabel(city.areas, name),
      sublabel: city.areas.displayName
        ? `${city.areas.noun[0].toUpperCase()}${city.areas.noun.slice(1)} ${name}`
        : `${city.name} ${city.areas.noun}`,
      icon: '📍',
      path: viewPath(cityId, placeView),
      params: { [placeParam]: name },
    })
  }

  // datasetKey → owning view, inverted from the manifest's omniDatasetKeys
  // (replaces the retired DATASET_ROUTES table). Only live entries' claims count.
  const datasetView = new Map<string, string>()
  for (const entry of liveManifest(city.manifest)) {
    for (const key of entry.omniDatasetKeys ?? []) datasetView.set(key, entry.viewId)
  }

  // Datasets → dataset results (only those a view claims), registry order
  for (const [key, config] of Object.entries(city.datasets)) {
    const viewId = datasetView.get(key)
    if (!viewId) continue
    results.push({
      id: `dataset-${key}`,
      category: 'dataset',
      label: config.name,
      sublabel: config.description.slice(0, 60),
      icon: '📊',
      path: viewPath(cityId, viewId),
    })
  }

  indexCache.set(cityId, results)
  return results
}

/**
 * Region rows for a TWO-GEOGRAPHY city. Oakland paints its Demographics
 * explorer on 10 coarse planning regions, but no reader thinks in planning
 * regions — they think 'Rockridge'. So every region gets a row AND every one
 * of the city's 131 official neighborhood memberships gets a row landing on
 * the region CONTAINING it: the familiar name stays findable without the index
 * ever claiming the map draws that neighborhood. The `In <region>` sublabel
 * runs the query the other way too — a region's name finds all of its members.
 *
 * A SEPARATE builder, not a fourth section of buildSearchIndex, because these
 * rows must rank below the city-switch rows too — and those are concatenated
 * after the index (see buildFullIndex). Folding them in put `city-sf` at
 * position 20 for the query 'san' on an Oakland route, i.e. off the 8-row cap.
 *
 * Two guards, and the city must pass BOTH:
 *   - `census.regions` — the two-geography claim itself. SF, whose 41
 *     neighborhoods ARE its census spine, emits nothing here.
 *   - `isViewLive(cityId, 'demographics')` — the destination has to exist.
 *     Unreachable today (Oakland's entry is live), but it makes this section
 *     consistent with the other two, which both derive from liveManifest, and
 *     it is the difference between 141 working rows and 141 dead ones for a
 *     future city that registers regions before turning the view on.
 *
 * Cached per city like the main index: the hook re-filters on every keystroke,
 * and rebuilding 141 rows per character is waste with no upside.
 */
export function buildRegionRows(cityId: CityId): SearchResult[] {
  const cached = regionCache.get(cityId)
  if (cached) return cached
  const city = getCity(cityId)
  const rows: SearchResult[] = []
  const regions = city.census?.regions
  if (regions && isViewLive(cityId, 'demographics')) {
    const demographicsPath = viewPath(cityId, 'demographics')
    for (const code of Object.keys(regions.names)) {
      rows.push({
        id: `region-${code}`,
        category: 'region',
        label: censusUnitLabel(city, code),
        code,
        sublabel: `${city.name} demographic region`,
        icon: '🗺️',
        path: demographicsPath,
        params: { nh: code },
      })
    }
    for (const [code, names] of Object.entries(regions.members)) {
      for (const name of names) {
        rows.push({
          // Keyed on code AND name: two of Oakland's neighborhoods
          // ('Coliseum Industrial Complex', 'East 14th Street Business')
          // genuinely straddle CE and E, and each gets a row per region —
          // picking one arbitrarily would be a quiet lie. OmniSearch uses
          // `r.id` as the React list key, so the two rows must not collide.
          id: `region-${code}-${name}`,
          category: 'region',
          label: name,
          code,
          sublabel: `In ${censusUnitLabel(city, code)}`,
          icon: '📍',
          path: demographicsPath,
          params: { nh: code },
        })
      }
    }
  }
  regionCache.set(cityId, rows)
  return rows
}

/** The crime quick groups as search rows: authored label + a sublabel naming
 *  3–4 members that exist in the LIVE vocabulary. 'Weapons Offence',
 *  'Vandalism' and 'Drug Violation' are legacy spellings — harmless inside
 *  the `IN()` the row deep-links to, never advertised in copy. Keys are
 *  SF_CRIME_GROUPS keys; a key missing there is a build-time error below. */
const CRIME_GROUP_ROWS: { group: string; slug: string; label: string; sublabel: string }[] = [
  { group: 'Violent', slug: 'violent', label: 'Violent crime', sublabel: 'Assault · Robbery · Homicide · Sex offenses' },
  { group: 'Property', slug: 'property', label: 'Property crime', sublabel: 'Larceny theft · Burglary · Motor vehicle theft · Arson' },
  { group: 'Quality of Life', slug: 'quality-of-life', label: 'Quality-of-life offenses', sublabel: 'Drug offense · Disorderly conduct · Liquor laws · Prostitution' },
]

/** The 311 quick groups as search rows. Keys are SF_SERVICE_GROUPS keys. */
const SERVICE_GROUP_ROWS: { group: string; slug: string; label: string }[] = [
  { group: 'Quality of Life', slug: 'quality-of-life', label: 'Graffiti & street cleaning' },
  { group: 'Infrastructure', slug: 'infrastructure', label: 'Streetlights, potholes & sidewalks' },
  { group: 'Enforcement', slug: 'enforcement', label: 'Encampments & abandoned vehicles' },
]

/** `?categories=` codec — byte-for-byte what CrimeIncidents.tsx and
 *  Cases311.tsx write (`Array.from(cats).map(encodeURIComponent).join(',')`)
 *  and parse (`split(',').map(decodeURIComponent)`). */
function formatCategoriesParam(members: readonly string[]): string {
  return members.map(encodeURIComponent).join(',')
}

/**
 * Topic rows — SF only. The free-text gap the old ribbon died of ('car
 * break-ins', 'shoplifting', 'graffiti', 'encampments' all returned nothing)
 * closed with rows built from AUTHORED leaves, never from the live vocabulary:
 *
 *   1. Every SUBCATEGORY_WATCH pair that carries a `label` (the 'crime' and
 *      'enforcement' kinds; 'admin' entries have no label and get no row) →
 *      /crime-incidents?sub= via formatSubParam, the merge folded in so the
 *      row lands on exactly the set the sidebar's checkbox filters on.
 *      Enforcement rows say so in the sublabel — a 'drug' query must read
 *      'Drug enforcement · Officer-initiated', never a crime headline.
 *   2. The three crime quick groups → /crime-incidents?categories=
 *   3. The three 311 quick groups → /311-cases?categories=
 *
 * Sublabels deliberately avoid the generic words 'crime' and 'report': the
 * filter is a substring test with an 8-row cap, and a one-word query like
 * 'crime' must keep landing on the view + dataset rows it lands on today,
 * not spend the cap on 15 topic rows (pinned in useOmniSearch.test.ts).
 *
 * Oakland has no subcategory drill and no authored groups → []. Cached per
 * city like the other builders.
 */
export function buildTopicRows(cityId: CityId): SearchResult[] {
  const cached = topicCache.get(cityId)
  if (cached) return cached
  const rows: SearchResult[] = []
  if (cityId === 'sf') {
    const crimePath = viewPath('sf', 'crime-incidents')
    for (const [key, entry] of Object.entries(SUBCATEGORY_WATCH)) {
      if (!entry.label) continue
      const enforcement = entry.kind === 'enforcement'
      rows.push({
        id: `topic-sub-${key}`,
        category: 'topic',
        label: entry.label,
        sublabel: enforcement ? 'Officer-initiated · SFPD subcategory' : 'SFPD subcategory',
        icon: '🏷',
        path: crimePath,
        params: { sub: formatSubParam([key, ...(entry.merge ?? [])]) },
      })
    }
    for (const g of CRIME_GROUP_ROWS) {
      const members = SF_CRIME_GROUPS[g.group]
      if (!members) throw new Error(`buildTopicRows: no crime group '${g.group}'`)
      rows.push({
        id: `topic-crime-${g.slug}`,
        category: 'topic',
        label: g.label,
        sublabel: g.sublabel,
        icon: '🏷',
        path: crimePath,
        params: { categories: formatCategoriesParam(members) },
      })
    }
    const casesPath = viewPath('sf', '311-cases')
    for (const g of SERVICE_GROUP_ROWS) {
      const members = SF_SERVICE_GROUPS[g.group]
      if (!members) throw new Error(`buildTopicRows: no 311 group '${g.group}'`)
      rows.push({
        id: `topic-311-${g.slug}`,
        category: 'topic',
        label: g.label,
        sublabel: `311 requests · ${g.group}`,
        icon: '🏷',
        path: casesPath,
        params: { categories: formatCategoriesParam(members) },
      })
    }
  }
  topicCache.set(cityId, rows)
  return rows
}

/** One "Switch to {city}" row per OTHER city — same-view path when live
 *  there, else that city's home (crossCityPath). Built per-render, never
 *  cached: the target moves with the current view. */
export function buildCityRows(currentCityId: CityId, currentViewId: string): SearchResult[] {
  return (Object.keys(CITIES) as CityId[])
    .filter((id) => id !== currentCityId)
    .map((id) => ({
      id: `city-${id}`,
      category: 'city' as const,
      label: `Switch to ${CITIES[id].name}`,
      sublabel: `${CITIES[id].name} civic data · ${CITIES[id].abbrev}`,
      icon: '🌉',
      path: crossCityPath(id, currentViewId),
    }))
}

/**
 * The full candidate list the hook filters, in RANK ORDER — this composition
 * IS the ranking. The filter is a plain substring test with no scoring and a
 * hard 8-row cap, so a section's position in this array decides what a reader
 * ever sees.
 *
 * views → places → datasets → topics → city switch → regions.
 *
 * Topics sit below datasets and above the city row: they are few (21 on SF)
 * with specific labels, so they rarely crowd a query, but the city-switch
 * row must stay reachable — a broad word that happened to hit several topic
 * sublabels would otherwise push 'Switch to Oakland' past the cap.
 *
 * Regions go last because they are the only unbounded section (Oakland: 141
 * rows against 70 for everything else combined), and a broad substring hits a
 * lot of them: 'oak' matches 74 region rows alongside 4 views, 6 places and 5
 * datasets, so regions-first would spend the entire cap on regions and hide
 * every view. City rows sit above them for the same reason — 'san' matches 17
 * region rows on an Oakland route, which was enough to push `city-sf` to
 * position 20 while it was ranked below them.
 *
 * Exported so the ordering can be pinned directly rather than re-derived in a
 * test — a test that rebuilt this concatenation itself would keep passing if
 * the hook's real order changed.
 */
export function buildFullIndex(cityId: CityId, currentViewId: string): SearchResult[] {
  return [
    ...buildSearchIndex(cityId),
    ...buildTopicRows(cityId),
    ...buildCityRows(cityId, currentViewId),
    ...buildRegionRows(cityId),
  ]
}

/**
 * Live ⌘K funder rows (spec §3.2, §4 "Entry points"). Row shape follows the
 * typeahead builder's projection — `city` and `entity_code` are optional
 * (an org row carries no first name), `gifts`/`total` arrive as strings
 * (Socrata aggregate serialization).
 *
 * Rows sharing a `funderKey` are SUMMED, not first-wins. The typeahead's
 * GROUP BY is case-sensitive — 'DANIEL LURIE' (31 gifts) and 'Daniel Lurie'
 * (34 gifts) come back as two groups — while the funder card the row lands
 * on merges them by case-folded key. A hero-scale row must not show a
 * different number than its destination, so gifts and totals are added
 * across the group; `city` is the first row's. The merge also de-dupes ids,
 * which would otherwise collide as React list keys.
 */
export function buildFunderRows(rows: {
  transaction_first_name?: string
  transaction_last_name: string
  entity_code?: string
  city?: string
  gifts: string
  total: string
}[]): SearchResult[] {
  const order: string[] = []
  const groups = new Map<string, { city?: string; gifts: number; total: number }>()
  for (const row of rows) {
    const key = funderKey(row)
    const g = groups.get(key)
    if (g) {
      g.gifts += Number(row.gifts)
      g.total += Number(row.total)
    } else {
      order.push(key)
      groups.set(key, { city: row.city, gifts: Number(row.gifts), total: Number(row.total) })
    }
  }
  return order.map((key) => {
    const g = groups.get(key)!
    const total = formatCurrency(g.total)
    return {
      id: `funder:${key}`,
      category: 'funder' as const,
      label: displayName(key),
      sublabel: `${g.city ? toSentenceCase(g.city) + ' · ' : ''}${total} · ${g.gifts} gift${g.gifts === 1 ? '' : 's'}`,
      icon: '◎',
      path: '/campaign-finance',
      params: { funder: formatFunderParam(key) },
    }
  })
}

export interface UseOmniSearchOptions {
  /** "Is this search surface actually showing" — the gate on the funder
   *  typeahead (a Socrata request per debounced keystroke). The hook holds
   *  NO open/close state of its own: every surface owns its visibility and
   *  passes it in — the ⌘K modal passes AppShell's `omniOpen`, the Home box
   *  passes its input's focus state. Defaults to false, so a caller that
   *  forgets never fires a request. */
  active?: boolean
  /** A view row to drop from the static results — Home passes 'home' so
   *  Enter on the Home box can never "navigate" to the page the reader is
   *  already on. The modal passes nothing. */
  omitViewId?: string
}

export function useOmniSearch(options?: UseOmniSearchOptions) {
  const { cityId, viewId } = useRouteView()
  const [query, setQuery] = useState('')
  const active = options?.active ?? false
  const omitId = options?.omitViewId ? `view-${options.omitViewId}` : null

  // Called UNCONDITIONALLY (hooks-order rule) — Oakland (and any future
  // non-SF city) passes `null` builders, which the hook reads as "no
  // funder dialect available" and never fetches.
  const { rows: funderTypeaheadRows, pending: searching } = useFunderTypeahead(
    query,
    active,
    cityId === 'sf' ? fppcBuildersFor('sf').funder : null
  )

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    const staticFiltered = buildFullIndex(cityId, viewId).filter(
      (r) =>
        r.id !== omitId &&
        (r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q))
    )
    // Static rows keep priority — funder rows only fill remaining slots.
    return [...staticFiltered, ...buildFunderRows(funderTypeaheadRows)].slice(0, 8)
  }, [query, cityId, viewId, omitId, funderTypeaheadRows])

  /** `searching` = a funder typeahead request is in flight (or scheduled) —
   *  the surface can say "Searching donors…" instead of "No matches" and
   *  must refuse Enter on an empty, still-loading list. */
  return { query, setQuery, results, searching }
}
