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

import { createContext, useContext, useEffect, useState, type ReactNode, type ComponentPropsWithRef } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useDraggableSheet } from '@/hooks/useDraggableSheet'

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

type MapSidebarWidth = 'default' | 'lean'

interface MapSidebarProps {
  children: ReactNode
  /** Open-width variant. 'default' = 320px (w-80). 'lean' = 260px (w-[260px]) for map-hero-forward views like The Last 48. */
  width?: MapSidebarWidth
  /** Props spread onto the inner scroll <div>. Required if children need the
   *  scrolling element to be a listbox (role + aria-activedescendant must sit
   *  on the scrolling element for scrollIntoView + activedescendant to work).
   *  Accepts ref (via ComponentPropsWithRef) so FlowRail can forward its
   *  scrollRef for auto-scroll on new events and selection changes. */
  scrollContainerProps?: ComponentPropsWithRef<'div'>
}

export default function MapSidebar({ children, width = 'default', scrollContainerProps }: MapSidebarProps) {
  const isOpen = useAppStore((s) => s.isContextSidebarOpen)
  const toggle = useAppStore((s) => s.toggleContextSidebar)
  const isMobile = useIsMobile()
  // Persistent list sheet — opens at 'peek' so the map is fully visible; drag
  // the handle up to browse, down to peek. No backdrop (the map stays usable).
  const sheet = useDraggableSheet({ initial: 'peek' })

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
  // lean variant: 260px full (map-hero-forward views), still 240px compressed
  const widthClass = isOpen
    ? (isNarrow ? 'w-60' : (width === 'lean' ? 'w-[260px]' : 'w-80'))
    : 'w-9'

  // Below md the sidebar is a bottom sheet: a slim handle peeks at the bottom
  // when closed; tapping it slides the panel up over a backdrop. Ephemeral
  // sheetOpen (default closed) — never reads the persisted desktop flag.
  if (isMobile) {
    return (
      <MapSidebarContext.Provider value={{ isCompressed: false }}>
        <aside
          style={sheet.sheetStyle}
          className="fixed inset-x-0 bottom-0 z-30 rounded-t-2xl
            bg-white dark:bg-slate-900 border-t border-slate-200/60 dark:border-white/10
            shadow-[0_-8px_30px_rgba(0,0,0,0.18)] flex flex-col"
        >
          {/* Drag handle — ↕ resize between peek / half / full; tap to cycle */}
          <div
            {...sheet.handleProps}
            className="h-9 flex-shrink-0 flex items-center justify-center w-full cursor-grab touch-none"
            aria-label="Resize panel"
          >
            <span className="w-9 h-1 rounded-full bg-slate-300 dark:bg-white/20 pointer-events-none" />
          </div>
          <div
            {...scrollContainerProps}
            className={`flex-1 overflow-y-auto flex flex-col min-h-0 ${scrollContainerProps?.className ?? ''}`}
          >
            {children}
          </div>
        </aside>
      </MapSidebarContext.Provider>
    )
  }

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
            -left-3.5 w-7 h-14 flex items-center justify-center
            rounded-lg
            bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl
            border border-slate-300/80 dark:border-white/15
            shadow-md shadow-slate-900/15 dark:shadow-black/50
            text-slate-700 dark:text-slate-200
            hover:text-slate-900 dark:hover:text-white
            hover:bg-white dark:hover:bg-slate-900
            hover:shadow-lg hover:scale-105
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
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          >
            <path d={isOpen ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
          </svg>
        </button>

        {/* Inner scroll container — keeps the chevron pinned to the visible
            viewport even when children content is scrolled. */}
        {isOpen && (
          <div
            {...scrollContainerProps}
            className={`flex-1 overflow-y-auto flex flex-col min-h-0 ${scrollContainerProps?.className ?? ''}`}
          >
            {children}
          </div>
        )}
      </aside>
    </MapSidebarContext.Provider>
  )
}
