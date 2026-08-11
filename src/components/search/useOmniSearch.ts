import { useState, useMemo } from 'react'
import { getCity, CITIES, crossCityPath } from '@/cities/registry'
import { viewPath, type CityId } from '@/cities/routing'
import { useRouteView } from '@/cities/useActiveCity'
import { liveManifest } from '@/cities/manifest'
import { composeAreaLabel, censusUnitLabel } from '@/cities/areaLabel'

export type SearchCategory = 'view' | 'place' | 'dataset' | 'vendor' | 'time' | 'city' | 'region'

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

  // Regions → region results. A TWO-GEOGRAPHY city (Oakland) paints its
  // Demographics explorer on coarse planning regions, but no reader thinks in
  // planning regions — they think 'Rockridge'. So every region gets a row AND
  // every one of the city's official neighborhoods gets a row that lands on
  // the region CONTAINING it: the familiar name stays findable without the
  // index ever claiming the map draws that neighborhood. The `In <region>`
  // sublabel runs the query the other way too — typing a region's name finds
  // all of its members.
  //
  // LAST in the index, deliberately: the hook's filter has no scoring — array
  // order IS the ranking — under a hard 8-row cap. Oakland's 141 rows placed
  // ahead of the views would push every view and dataset off the list for a
  // common substring like 'east'.
  //
  // Guarded on `census.regions`, which is exactly the two-geography claim: SF,
  // whose 41 neighborhoods ARE its census spine, emits nothing here. (The
  // destination's liveness is assumed rather than checked — a city registers
  // regions to drive the Demographics view, and Oakland's entry is live.)
  const regions = city.census?.regions
  if (regions) {
    const demographicsPath = viewPath(cityId, 'demographics')
    for (const code of Object.keys(regions.names)) {
      results.push({
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
        results.push({
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

  indexCache.set(cityId, results)
  return results
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

export function useOmniSearch() {
  const { cityId, viewId } = useRouteView()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return [...buildSearchIndex(cityId), ...buildCityRows(cityId, viewId)]
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, cityId, viewId])

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setQuery('')
  }
  const toggle = () => (isOpen ? close() : open())

  return { query, setQuery, results, isOpen, open, close, toggle }
}
