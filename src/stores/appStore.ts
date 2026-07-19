import { create } from 'zustand'
import type { ViewId } from '@/types/datasets'
import type { ComparisonMode } from '@/utils/comparisonMode'
import { parseTypeScale, type TypeScale } from '@/stores/typeScale'

interface AppState {
  /** Current active view */
  currentView: ViewId

  /** Dark mode toggle */
  isDarkMode: boolean

  /** Left nav sidebar open state */
  isSidebarOpen: boolean

  /** Right context sidebar open state (per-view neighborhood ranking, patterns, etc.) */
  isContextSidebarOpen: boolean

  /** Type-scale reading preference. 'large'/'xl' apply a root font-size
   *  bump (html[data-type-scale="large"|"xl"] in index.css) plus the
   *  Pulse/About rem conversions in this phase. String union so 'xl' —
   *  added per Jesse's feedback — needed no migration. */
  typeScale: TypeScale

  /** Global date range filter */
  dateRange: { start: string; end: string }

  /** Currently selected neighborhood (cross-view) */
  selectedNeighborhood: string | null

  /** Time-of-day hour filter (null = all hours) */
  timeOfDayFilter: { startHour: number; endHour: number } | null

  /** Comparison mode (null = off). Presets follow the date range; pinned dates stay put. */
  comparisonMode: ComparisonMode

  /** Selected incident call_number for detail panel (null = closed) */
  selectedIncident: string | null

  /** Selected 311 case service_request_id for detail panel (null = closed) */
  selected311Case: string | null

  /** Selected crime incident incident_id for detail panel (null = closed) */
  selectedCrimeIncident: string | null

  /** Selected parking meter post_id for detail panel (null = closed) */
  selectedMeter: string | null

  /** Selected parking citation citation_number for detail panel (null = closed) */
  selectedCitation: string | null

  /** Selected traffic crash unique_id for detail panel (null = closed) */
  selectedCrash: string | null

  /** Selected business uniqueid for detail panel (null = closed) */
  selectedBusiness: string | null

  /** Loading state */
  isLoading: boolean

  /** Error state */
  error: string | null

  /** Actions */
  setView: (view: ViewId) => void
  toggleDarkMode: () => void
  toggleSidebar: () => void
  toggleContextSidebar: () => void
  setTypeScale: (scale: TypeScale) => void
  setDateRange: (start: string, end: string) => void
  setSelectedNeighborhood: (neighborhood: string | null) => void
  setTimeOfDayFilter: (filter: { startHour: number; endHour: number } | null) => void
  setComparisonMode: (mode: ComparisonMode) => void
  setSelectedIncident: (callNumber: string | null) => void
  setSelected311Case: (id: string | null) => void
  setSelectedCrimeIncident: (id: string | null) => void
  setSelectedMeter: (id: string | null) => void
  setSelectedCitation: (id: string | null) => void
  setSelectedCrash: (id: string | null) => void
  setSelectedBusiness: (id: string | null) => void
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// Default to last 30 days
const now = new Date()
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

export const useAppStore = create<AppState>((set) => ({
  currentView: 'home',
  isDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  isSidebarOpen: localStorage.getItem('dd-sidebar') !== 'collapsed',
  isContextSidebarOpen: localStorage.getItem('dd-context-sidebar') !== 'collapsed',
  typeScale: parseTypeScale(localStorage.getItem('dd-type-scale')),
  dateRange: {
    start: thirtyDaysAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  },
  selectedNeighborhood: null,
  timeOfDayFilter: null,
  comparisonMode: null,
  selectedIncident: null,
  selected311Case: null,
  selectedCrimeIncident: null,
  selectedMeter: null,
  selectedCitation: null,
  selectedCrash: null,
  selectedBusiness: null,
  isLoading: false,
  error: null,

  setView: (view) => set({ currentView: view, error: null }),
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.isDarkMode
      document.documentElement.classList.toggle('dark', next)
      return { isDarkMode: next }
    }),
  toggleSidebar: () => set((state) => {
    const next = !state.isSidebarOpen
    localStorage.setItem('dd-sidebar', next ? 'open' : 'collapsed')
    return { isSidebarOpen: next }
  }),
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
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setSelectedNeighborhood: (neighborhood) => set({ selectedNeighborhood: neighborhood }),
  setTimeOfDayFilter: (filter) => set({ timeOfDayFilter: filter }),
  setComparisonMode: (mode) => set({ comparisonMode: mode }),
  setSelectedIncident: (callNumber) => set({ selectedIncident: callNumber }),
  setSelected311Case: (id) => set({ selected311Case: id }),
  setSelectedCrimeIncident: (id) => set({ selectedCrimeIncident: id }),
  setSelectedMeter: (id) => set({ selectedMeter: id }),
  setSelectedCitation: (id) => set({ selectedCitation: id }),
  setSelectedCrash: (id) => set({ selectedCrash: id }),
  setSelectedBusiness: (id) => set({ selectedBusiness: id }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
