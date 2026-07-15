import { useState, useMemo } from 'react'
import { SF_NEIGHBORHOODS } from '@/utils/geo'
import { DATASETS } from '@/api/datasets'

export type SearchCategory = 'place' | 'dataset' | 'vendor' | 'time'

export interface SearchResult {
  id: string
  category: SearchCategory
  label: string
  sublabel: string
  icon: string
  path: string
  params?: Record<string, string>
}

/** Dataset key → view route mapping */
const DATASET_ROUTES: Record<string, string> = {
  fireEMSDispatch: '/emergency-response',
  policeIncidents: '/crime-incidents',
  dispatch911Realtime: '/dispatch-911',
  dispatch911Historical: '/dispatch-911',
  cases311: '/311-cases',
  parkingRevenue: '/parking-revenue',
  parkingCitations: '/parking-citations',
  trafficCrashes: '/traffic-safety',
  businessLocations: '/business-activity',
  campaignFinance: '/campaign-finance',
  vendorPayments: '/city-budget',
  budget: '/city-budget',
  spendingRevenue: '/city-budget',
}

/** Build the static index once at module level */
function buildIndex(): SearchResult[] {
  const results: SearchResult[] = []

  // Neighborhoods → place results
  for (const name of SF_NEIGHBORHOODS) {
    results.push({
      id: `place-${name}`,
      category: 'place',
      label: name,
      sublabel: 'San Francisco neighborhood',
      icon: '📍',
      path: '/neighborhood',
      params: { nh: name },
    })
  }

  // Datasets → dataset results (only those with a mapped route)
  for (const [key, config] of Object.entries(DATASETS)) {
    const route = DATASET_ROUTES[key]
    if (!route) continue
    results.push({
      id: `dataset-${key}`,
      category: 'dataset',
      label: config.name,
      sublabel: config.description.slice(0, 60),
      icon: '📊',
      path: route,
    })
  }

  return results
}

export const SEARCH_INDEX = buildIndex()

function getIndex(): SearchResult[] {
  return SEARCH_INDEX
}

export function useOmniSearch() {
  const [query, setQuery] = useState('')
  const [isOpen, setIsOpen] = useState(false)

  const results = useMemo<SearchResult[]>(() => {
    const q = query.trim().toLowerCase()
    if (!q) return []
    return getIndex()
      .filter(
        (r) =>
          r.label.toLowerCase().includes(q) ||
          r.sublabel.toLowerCase().includes(q)
      )
      .slice(0, 8)
  }, [query])

  const open = () => setIsOpen(true)
  const close = () => {
    setIsOpen(false)
    setQuery('')
  }
  const toggle = () => (isOpen ? close() : open())

  return { query, setQuery, results, isOpen, open, close, toggle }
}
