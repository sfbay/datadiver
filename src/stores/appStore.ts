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
  setLoading: (loading: boolean) => void
  setError: (error: string | null) => void
}

// Default to last 30 days
const now = new Date()
const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000)

export const useAppStore = create<AppState>((set) => ({
  currentView: 'home',
  isDarkMode: window.matchMedia('(prefers-color-scheme: dark)').matches,
  isSidebarOpen: true,
  dateRange: {
    start: thirtyDaysAgo.toISOString().split('T')[0],
    end: now.toISOString().split('T')[0],
  },
  selectedNeighborhood: null,
  isLoading: false,
  error: null,

  setView: (view) => set({ currentView: view, error: null }),
  toggleDarkMode: () =>
    set((state) => {
      const next = !state.isDarkMode
      document.documentElement.classList.toggle('dark', next)
      return { isDarkMode: next }
    }),
  toggleSidebar: () => set((state) => ({ isSidebarOpen: !state.isSidebarOpen })),
  setDateRange: (start, end) => set({ dateRange: { start, end } }),
  setSelectedNeighborhood: (neighborhood) => set({ selectedNeighborhood: neighborhood }),
  setLoading: (loading) => set({ isLoading: loading }),
  setError: (error) => set({ error }),
}))
