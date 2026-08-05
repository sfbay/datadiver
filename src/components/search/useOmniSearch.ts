import { useState, useMemo } from 'react'
import { getCity } from '@/cities/registry'
import { viewPath, type CityId } from '@/cities/routing'
import { useRouteView } from '@/cities/useActiveCity'

export type SearchCategory = 'view' | 'place' | 'dataset' | 'vendor' | 'time'

export interface SearchResult {
  id: string
  category: SearchCategory
  label: string
  sublabel: string
  icon: string
  path: string
  params?: Record<string, string>
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
  // omniDatasetKeys) previously had no row at all.
  for (const entry of city.manifest) {
    results.push({
      id: `view-${entry.viewId}`,
      category: 'view',
      label: entry.navLabel,
      sublabel: entry.navDescription,
      icon: '🧭',
      path: viewPath(cityId, entry.viewId),
    })
  }

  // Areas → place results (SF: the 41 Analysis Neighborhoods)
  for (const name of city.areas.names) {
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: name,
      sublabel: `${city.name} ${city.areas.noun}`,
      icon: '📍',
      path: viewPath(cityId, 'neighborhood'),
      params: { nh: name },
    })
  }

  // datasetKey → owning view, inverted from the manifest's omniDatasetKeys
  // (replaces the retired DATASET_ROUTES table).
  const datasetView = new Map<string, string>()
  for (const entry of city.manifest) {
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

export function useOmniSearch() {
  const { cityId } = useRouteView()
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return buildSearchIndex(cityId)
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query, cityId])

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setQuery('')
  }
  const toggle = () => (isOpen ? close() : open())

  return { query, setQuery, results, isOpen, open, close, toggle }
}
