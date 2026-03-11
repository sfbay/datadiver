import { create } from 'zustand'
import type { ViewId } from '@/types/datasets'

interface AppState {
  /** Current active view */
  currentView: ViewId

  /** Dark mode toggle */
  isDarkMode: boolean

  /** Sidebar open state */
  isSidebarOpen: boolean

  /** Global date range filter */
  dateRange: { start: string; end: string }

  /** Currently selected neighborhood (cross-view) */
  selectedNeighborhood: string | null

  /** Time-of-day hour filter (null = all hours) */
  timeOfDayFilter: { startHour: number; endHour: number } | null

  /** Comparison period offset in days (null = off) */
  comparisonPeriod: number | null

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
  setDateRange: (start: string, end: string) => void
  setSelectedNeighborhood: (neighborhood: string | null) => void
  setTimeOfDayFilter: (filter: { startHour: number; endHour: number } | null) => void
  setComparisonPeriod: (days: number | null) => void
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
  dateRange: {
    start: thirtyDaysAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  },
  selectedNeighborhood: null,
  timeOfDayFilter: null,
  comparisonPeriod: null,
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
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setSelectedNeighborhood: (neighborhood) => set({ selectedNeighborhood: neighborhood }),
  setTimeOfDayFilter: (filter) => set({ timeOfDayFilter: filter }),
  setComparisonPeriod: (days) => set({ comparisonPeriod: days }),
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
