/** MapSidebar — shared right-context sidebar for the seven map-based views.
 *
 *  Three states:
 *    1. Open + wide screen (≥1024px) — 320px width, full data density.
 *    2. Open + narrow screen (<1024px) — 240px width, compressed mode flagged
 *       via context so children can drop secondary elements (sparklines, σ
 *       chips, YoY deltas) and tighten spacing.
 *    3. Collapsed (any width) — 36px stub showing only the chevron toggle,
 *       so the map gets full canvas. User-toggled, persisted to localStorage.
 *
 *  Mirrors the left-nav AppShell collapse pattern (open/closed via Zustand,
 *  localStorage-persisted, chevron toggle). Same animation curve and timing.
 *
 *  Children read `useMapSidebarMode().isCompressed` to decide what to render
 *  in the narrow case. The wrapper does not impose a layout on children —
 *  it just sets width, chrome, and the compression flag.
 */

import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { useAppStore } from '@/stores/appStore'

interface MapSidebarContextValue {
  isCompressed: boolean
}

const MapSidebarContext = createContext<MapSidebarContextValue>({ isCompressed: false })

/** Hook for sidebar children. Returns isCompressed=true when sidebar is open
 *  but on a narrow screen — children should drop secondary elements and
 *  tighten spacing in this case. */
export function useMapSidebarMode(): MapSidebarContextValue {
  return useContext(MapSidebarContext)
}

const NARROW_BREAKPOINT = 1024

interface MapSidebarProps {
  children: ReactNode
}

export default function MapSidebar({ children }: MapSidebarProps) {
  const isOpen = useAppStore((s) => s.isContextSidebarOpen)
  const toggle = useAppStore((s) => s.toggleContextSidebar)

  // Track viewport width so compressed mode kicks in below the breakpoint.
  // SSR-safe via initializer; updated on resize via listener.
  const [isNarrow, setIsNarrow] = useState(() =>
    typeof window !== 'undefined' ? window.innerWidth < NARROW_BREAKPOINT : false,
  )

  useEffect(() => {
    const onResize = () => setIsNarrow(window.innerWidth < NARROW_BREAKPOINT)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  const isCompressed = isOpen && isNarrow

  // 320px full / 240px compressed / 36px collapsed-stub
  const widthClass = isOpen ? (isNarrow ? 'w-60' : 'w-80') : 'w-9'

  return (
    <MapSidebarContext.Provider value={{ isCompressed }}>
      <aside
        className={`
          ${widthClass}
          relative flex-shrink-0 flex flex-col
          border-l border-slate-200/50 dark:border-white/[0.04]
          ${isOpen ? 'overflow-y-auto' : 'overflow-hidden'}
          bg-white/50 dark:bg-slate-900/30
          backdrop-blur-xl
          transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        `}
      >
        {/* Chevron toggle — sits at top-left, pointing into the map area when
            open (collapse hint) and back into the sidebar when collapsed
            (expand hint). Absolutely positioned so it doesn't shift content. */}
        <button
          onClick={toggle}
          className="absolute top-3 left-1 z-10 w-7 h-7 rounded-md flex items-center justify-center
            text-slate-400 dark:text-slate-600
            hover:text-slate-600 dark:hover:text-slate-300
            hover:bg-slate-100 dark:hover:bg-white/[0.04]
            transition-all duration-150"
          aria-label={isOpen ? 'Collapse context sidebar' : 'Expand context sidebar'}
          title={isOpen ? 'Collapse' : 'Expand context'}
        >
          <svg
            width="14"
            height="14"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.5"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={isOpen ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
          </svg>
        </button>

        {isOpen && children}
      </aside>
    </MapSidebarContext.Provider>
  )
}
