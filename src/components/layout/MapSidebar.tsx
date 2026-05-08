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
          bg-white/50 dark:bg-slate-900/30
          backdrop-blur-xl
          transition-[width] duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]
        `}
      >
        {/* Chevron toggle — half-tabbed onto the sidebar's left edge, vertically
            centered. Sits on the boundary line between map and sidebar so it
            never overlaps content (tab strips, headers) regardless of which
            view is rendered. Lives OUTSIDE the inner scroll container so it
            stays visible when sidebar contents are scrolled. */}
        <button
          onClick={toggle}
          className="absolute top-1/2 -translate-y-1/2 z-20
            -left-3 w-6 h-12 flex items-center justify-center
            rounded-l-lg
            bg-white/70 dark:bg-slate-900/60 backdrop-blur-xl
            border border-r-0 border-slate-200/60 dark:border-white/[0.06]
            text-slate-500 dark:text-slate-500
            hover:text-slate-800 dark:hover:text-slate-200
            hover:bg-white/95 dark:hover:bg-slate-900/85
            transition-all duration-150"
          aria-label={isOpen ? 'Collapse context sidebar' : 'Expand context sidebar'}
          title={isOpen ? 'Collapse' : 'Expand context'}
        >
          <svg
            width="12"
            height="12"
            viewBox="0 0 16 16"
            fill="none"
            stroke="currentColor"
            strokeWidth="1.75"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={isOpen ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
          </svg>
        </button>

        {/* Inner scroll container — keeps the chevron pinned to the visible
            viewport even when children content is scrolled. */}
        {isOpen && (
          <div className="flex-1 overflow-y-auto flex flex-col min-h-0">
            {children}
          </div>
        )}
      </aside>
    </MapSidebarContext.Provider>
  )
}
