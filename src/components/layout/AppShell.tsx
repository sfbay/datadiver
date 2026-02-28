import { type ReactNode } from 'react'
import { useNavigate, useLocation } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useUrlSync } from '@/hooks/useUrlSync'
import DateRangePicker from '@/components/filters/DateRangePicker'

const NAV_ITEMS = [
  {
    path: '/',
    label: 'Overview',
    shortLabel: 'OV',
    description: 'Data stories & viz picker',
    accentColor: '#a78bfa',
  },
  {
    path: '/emergency-response',
    label: 'Emergency Response',
    shortLabel: 'ER',
    description: 'Fire, Police, EMS response times',
    accentColor: '#ff4d4d',
  },
  {
    path: '/parking-revenue',
    label: 'Parking Revenue',
    shortLabel: 'PR',
    description: 'Meter revenue & patterns',
    accentColor: '#60a5fa',
  },
] as const

export default function AppShell({ children }: { children: ReactNode }) {
  const navigate = useNavigate()
  const location = useLocation()
  const { isDarkMode, toggleDarkMode, isSidebarOpen, toggleSidebar } = useAppStore()
  useUrlSync()

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
        {/* Brand mark */}
        <div className={`flex items-center gap-3 py-5 border-b border-slate-200/50 dark:border-white/[0.04] ${isSidebarOpen ? 'px-5' : 'px-2.5 justify-center'}`}>
          <button
            onClick={toggleSidebar}
            className="group relative flex items-center justify-center w-8 h-8 rounded-lg
              bg-gradient-to-br from-signal-blue via-signal-violet to-signal-blue
              shadow-lg shadow-signal-blue/20
              hover:shadow-signal-blue/40
              transition-all duration-300"
            aria-label="Toggle sidebar"
          >
            <span className="text-white font-display text-base font-normal italic leading-none translate-y-[0.5px]">
              D
            </span>
          </button>
          {isSidebarOpen && (
            <div className="flex flex-col min-w-0">
              <span className="font-display text-xl italic text-ink dark:text-white leading-none tracking-tight">
                DataDiver
              </span>
              <span className="text-[10px] text-slate-400 dark:text-slate-500 font-mono uppercase tracking-widest mt-0.5">
                SF Open Data
              </span>
            </div>
          )}
        </div>

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
                    ? 'bg-slate-100 dark:bg-white/[0.06]'
                    : 'hover:bg-slate-50 dark:hover:bg-white/[0.03]'
                  }
                `}
              >
                {/* Accent indicator */}
                <div className={`
                  flex-shrink-0 flex items-center justify-center
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
                </div>
                {isSidebarOpen && (
                  <div className="flex flex-col min-w-0">
                    <span className={`text-[13px] font-semibold truncate transition-colors
                      ${isActive ? 'text-ink dark:text-white' : 'text-slate-600 dark:text-slate-400'}`}>
                      {item.label}
                    </span>
                    <span className="text-[10px] text-slate-400 dark:text-slate-600 truncate">
                      {item.description}
                    </span>
                  </div>
                )}
              </button>
            )
          })}
        </nav>

        {/* Date range picker */}
        {isSidebarOpen && (
          <div className="px-1 py-2 border-t border-slate-200/50 dark:border-white/[0.04]">
            <DateRangePicker />
          </div>
        )}

        {/* Footer controls */}
        <div className={`border-t border-slate-200/50 dark:border-white/[0.04] ${isSidebarOpen ? 'p-3' : 'p-1.5'}`}>
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
        </div>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-hidden relative">
        {children}
      </main>
    </div>
  )
}
