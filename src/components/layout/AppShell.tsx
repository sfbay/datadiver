import { type ReactNode, type CSSProperties, useState, useEffect } from 'react'
import OmniSearch from '@/components/search/OmniSearch'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useUrlSync } from '@/hooks/useUrlSync'
import DateRangePicker from '@/components/filters/DateRangePicker'

// Earth-tone refactor — each nav item carries a pigment from the design
// system palette (terracotta / ochre / moss / teal / brick / indigo / plum).
// Pigment drives: nav-tag fill, sidebar active-state corner glow, viz card
// glow on the Overview grid, on-map detail glows. Same color = same dataset
// across every surface; deliberately not interchangeable.
const NAV_ITEMS = [
  {
    path: '/live-feeds',
    label: 'The Last 48',
    shortLabel: 'LIVE',
    description: "What's flowed in across SF in the past 48 hours",
    accentColor: '#d4a435', // ochre-500 — live / warm yellow
  },
  {
    path: '/',
    label: 'Overview',
    shortLabel: 'OV',
    description: 'Data stories & viz picker',
    accentColor: '#b85a33', // terracotta-600 — primary brand
  },
  {
    path: '/emergency-response',
    label: 'Emergency Response',
    shortLabel: 'ER',
    description: 'Fire, Police, EMS response times',
    accentColor: '#b85a33', // terracotta-600 — emergency / alert
  },
  {
    path: '/parking-revenue',
    label: 'Parking Revenue',
    shortLabel: 'PR',
    description: 'Meter revenue & patterns',
    accentColor: '#3f7573', // teal-600 — info / Dana's color
  },
  {
    path: '/dispatch-911',
    label: '911 Dispatch',
    shortLabel: '911',
    description: 'Sensitive call temporal patterns',
    accentColor: '#474e74', // indigo-600 — rare cool, sensitivity
  },
  {
    path: '/311-cases',
    label: '311 Cases',
    shortLabel: '311',
    description: '311 service request patterns',
    accentColor: '#5c7a3d', // moss-600 — civic upkeep / growth
  },
  {
    path: '/crime-incidents',
    label: 'Crime Incidents',
    shortLabel: 'CI',
    description: 'SFPD incidents & 911 cross-ref',
    accentColor: '#963e30', // brick-600 — danger / critical
  },
  {
    path: '/parking-citations',
    label: 'Parking Citations',
    shortLabel: 'PC',
    description: 'SFMTA citation patterns & fines',
    accentColor: '#d47149', // terracotta-500 — kin to PR teal but warmer
  },
  {
    path: '/traffic-safety',
    label: 'Traffic Safety',
    shortLabel: 'TS',
    description: 'Vision Zero crash & speed analysis',
    accentColor: '#963e30', // brick-600 — danger semantic, twin to Crime
  },
  {
    path: '/business-activity',
    label: 'Business Activity',
    shortLabel: 'BA',
    description: 'Business opening & closing trends',
    accentColor: '#5c7a3d', // moss-600 — formation / success
  },
  {
    path: '/business',
    label: 'Business Search',
    shortLabel: 'BS',
    description: 'Search businesses, chains, and owners',
    accentColor: '#3f7573', // teal-600 — info, twin to BA but cooler
  },
  {
    path: '/campaign-finance',
    label: 'Campaign Finance',
    shortLabel: 'CF',
    description: 'Campaign contributions & spending',
    accentColor: '#8b6282', // plum-500 — campaign finance / agency routing
  },
  {
    path: '/demographics',
    label: 'Demographics',
    shortLabel: 'DM',
    description: 'Census demographics & civic correlations',
    accentColor: '#8b6282', // plum-500 — editorial cool, civic profiling
  },
  {
    path: '/city-budget',
    label: 'City Budget',
    shortLabel: 'BU',
    description: 'Budget, spending, vendor & ad tracking',
    accentColor: '#b58620', // ochre-600 — money / traditional ledger
  },
  {
    path: '/elections',
    label: 'Elections',
    shortLabel: 'EL',
    description: 'Live results, RCV & historical playback',
    accentColor: '#616a96', // indigo-500 — civic ceremony
  },
  {
    path: '/neighborhood',
    label: 'Neighborhoods',
    shortLabel: 'NH',
    description: 'Cross-dataset civic profiles',
    accentColor: '#5c9693', // teal-500 — Dana's color, civic-place
  },
] as const

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDarkMode, toggleDarkMode, isSidebarOpen, toggleSidebar, dateRange } = useAppStore()
  useUrlSync()

  const [omniOpen, setOmniOpen] = useState(false)

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault()
        setOmniOpen((v) => !v)
      }
    }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [])

  return (
    <div className="flex h-screen overflow-hidden bg-paper dark:bg-slate-950 noise-bg">
      {/* Sidebar */}
      <aside
        className={`
          relative flex flex-col
          bg-white/50 dark:bg-slate-900/50
          backdrop-blur-xl
          border-r border-slate-200/50 dark:border-white/[0.04]
          transition-all duration-500 ease-[cubic-bezier(0.16,1,0.3,1)]
          z-20
          ${isSidebarOpen ? 'w-64' : 'w-[52px]'}
        `}
      >
        {/* Drawer-pull collapse toggle — vertically centered on the right
            edge of the nav, sticking half into the main content area.
            Mirror-symmetric with the right context sidebar's pill so both
            sidebars share the same toggle vocabulary. Chevron always points
            in the direction the sidebar will move when clicked. */}
        <button
          onClick={toggleSidebar}
          className="absolute top-1/2 -translate-y-1/2 z-30
            -right-3.5 w-7 h-14 flex items-center justify-center
            rounded-lg
            bg-white/95 dark:bg-slate-900/90 backdrop-blur-xl
            border border-slate-300/80 dark:border-white/15
            shadow-md shadow-slate-900/15 dark:shadow-black/50
            text-slate-700 dark:text-slate-200
            hover:text-slate-900 dark:hover:text-white
            hover:bg-white dark:hover:bg-slate-900
            hover:shadow-lg hover:scale-105
            transition-all duration-150"
          aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          title={isSidebarOpen ? 'Collapse' : 'Expand sidebar'}
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
            <path d={isSidebarOpen ? 'M10 3L5 8l5 5' : 'M6 3l5 5-5 5'} />
          </svg>
        </button>

        {/* Brand mark */}
        <div className={`flex items-center gap-3 py-5 border-b border-slate-200/50 dark:border-white/[0.04] ${isSidebarOpen ? 'px-5' : 'px-2.5 justify-center'}`}>
          <button
            onClick={toggleSidebar}
            className="group relative flex items-center justify-center w-8 h-8 rounded-full
              overflow-hidden
              shadow-lg shadow-slate-500/10 dark:shadow-black/30
              hover:shadow-slate-500/20 dark:hover:shadow-black/50
              ring-1 ring-slate-200/50 dark:ring-white/10
              transition-all duration-300"
            aria-label="Toggle sidebar"
          >
            <img
              src={isDarkMode ? '/dana-badge-mono.png' : '/dana-badge.png'}
              alt="DataDiver"
              className="w-full h-full object-cover"
            />
          </button>
          {isSidebarOpen && (
            <div className="flex flex-col min-w-0 flex-1">
              <span className="font-display text-xl italic text-ink dark:text-white leading-none tracking-tight">
                DataDiver
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                SF Open Data
              </span>
            </div>
          )}
        </div>

        {/* Date range picker — full when open, compact indicator when collapsed */}
        {isSidebarOpen ? (
          <div className="px-3 pt-3 pb-1 border-b border-slate-200/50 dark:border-white/[0.04]">
            <DateRangePicker />
          </div>
        ) : (
          <button
            onClick={toggleSidebar}
            className="flex flex-col items-center gap-0.5 py-3 border-b border-slate-200/50 dark:border-white/[0.04]
              text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
            title={`${new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })} – ${new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`}
          >
            <svg className="w-4 h-4" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round">
              <rect x="2" y="3" width="12" height="11" rx="1.5" />
              <path d="M5 1.5v2M11 1.5v2M2 7h12" />
            </svg>
            <span className="text-[7px] font-mono leading-tight">
              {new Date(dateRange.start).toLocaleDateString('en-US', { month: 'short' })}–{new Date(dateRange.end).toLocaleDateString('en-US', { month: 'short' })}
            </span>
          </button>
        )}

        {/* Navigation */}
        <nav className={`flex-1 py-4 space-y-0.5 overflow-y-auto ${isSidebarOpen ? 'px-3' : 'px-1.5'}`}>
          {isSidebarOpen && (
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 px-2 mb-2">
              Visualizations
            </p>
          )}
          {NAV_ITEMS.map((item) => {
            const isActive = location.pathname === item.path
            return (
              <button
                key={item.path}
                onClick={() => navigate(item.path)}
                className={`
                  group w-full flex items-center rounded-lg text-left
                  transition-all duration-200
                  ${isSidebarOpen ? 'gap-3 px-3 py-2.5' : 'justify-center p-2.5'}
                  ${isActive
                    ? 'glow-host bg-slate-100 dark:bg-white/[0.06]'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }
                `}
                style={isActive ? ({ '--glow': item.accentColor } as CSSProperties) : undefined}
              >
                {/* Active-state corner glow — anchored top-left of the nav row,
                    pigment from the dataset's accentColor. */}
                {isActive && <div className="glow-corner is-sm" />}
                {/* Accent indicator */}
                <div className={`
                  relative flex-shrink-0 flex items-center justify-center
                  rounded-md text-[10px] font-mono font-bold tracking-wider
                  transition-all duration-200
                  ${isSidebarOpen ? 'w-8 h-8' : 'w-7 h-7'}
                  ${isActive
                    ? 'text-white shadow-lg'
                    : 'text-slate-500 dark:text-slate-500 bg-slate-100 dark:bg-white/[0.04]'
                  }
                `}
                style={isActive ? {
                  backgroundColor: item.accentColor,
                  boxShadow: `0 4px 12px ${item.accentColor}40`,
                } : undefined}
                >
                  {item.shortLabel}
                  {item.path === '/live-feeds' && (
                    <span className="pulse-live absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brick-500" />
                  )}
                </div>
                {isSidebarOpen && (
                  <div className="relative flex flex-col min-w-0">
                    <span className={`text-[14px] font-semibold truncate transition-colors
                      ${isActive ? 'text-ink dark:text-white' : 'text-slate-700 dark:text-slate-300'}`}>
                      {item.label}
                    </span>
                    <span className="text-[11px] text-slate-500 dark:text-slate-400 truncate">
                      {item.description}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </nav>

        {/* Footer controls */}
        <div className={`border-t border-slate-200/50 dark:border-white/[0.04] ${isSidebarOpen ? 'p-3 space-y-0.5' : 'p-1.5 space-y-0.5'}`}>
          <button
            onClick={toggleDarkMode}
            className={`
              w-full flex items-center rounded-lg
              text-slate-500 dark:text-slate-500
              hover:bg-slate-50 dark:hover:bg-white/[0.03]
              transition-all duration-200 text-sm
              ${isSidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center p-2.5'}
            `}
          >
            <div className="relative w-5 h-5 flex items-center justify-center">
              <svg
                className={`w-4 h-4 transition-all duration-500 ${isDarkMode ? 'rotate-0 scale-100' : 'rotate-90 scale-0'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ position: 'absolute' }}
              >
                <path d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" />
              </svg>
              <svg
                className={`w-4 h-4 transition-all duration-500 ${isDarkMode ? '-rotate-90 scale-0' : 'rotate-0 scale-100'}`}
                viewBox="0 0 20 20"
                fill="currentColor"
                style={{ position: 'absolute' }}
              >
                <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
              </svg>
            </div>
            {isSidebarOpen && (
              <span className="text-[13px] font-medium">{isDarkMode ? 'Light' : 'Dark'}</span>
            )}
          </button>

          {/* Collapse / expand toggle */}
          <button
            onClick={toggleSidebar}
            className={`
              w-full flex items-center rounded-lg
              text-slate-400 dark:text-slate-600
              hover:text-slate-600 dark:hover:text-slate-400
              hover:bg-slate-50 dark:hover:bg-white/[0.03]
              transition-all duration-200 text-sm
              ${isSidebarOpen ? 'gap-3 px-3 py-2' : 'justify-center p-2.5'}
            `}
            aria-label={isSidebarOpen ? 'Collapse sidebar' : 'Expand sidebar'}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 16 16"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              className={`transition-transform duration-300 ${isSidebarOpen ? '' : 'rotate-180'}`}
            >
              <path d="M10 3L5 8l5 5" />
            </svg>
            {isSidebarOpen && (
              <span className="text-[13px] font-medium">Collapse</span>
            )}
          </button>
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>

      <OmniSearch mode="modal" isOpen={omniOpen} onClose={() => setOmniOpen(false)} />
    </div>
  )
}
