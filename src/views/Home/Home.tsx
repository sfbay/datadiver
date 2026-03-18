import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'

const VISUALIZATIONS = [
  {
    path: '/emergency-response',
    title: 'Emergency Response Times',
    subtitle: 'SFFD / EMS Dispatch Analysis',
    badge: 'ER',
    description:
      'How fast do first responders reach you? Map response time inequities across 41 neighborhoods.',
    stats: [
      { label: 'Timestamps', value: '7 per call' },
      { label: 'Records/yr', value: '~600K' },
      { label: 'Neighborhoods', value: '41' },
    ],
    accentColor: '#ff4d4d',
  },
  {
    path: '/parking-revenue',
    title: 'Parking Meter Revenue',
    subtitle: 'SFMTA Revenue Patterns',
    badge: 'PR',
    description:
      'Where does the city earn from parking? Uncover revenue flows, payment trends, and meter utilization.',
    stats: [
      { label: 'Active meters', value: '~37K' },
      { label: 'Detail level', value: 'Every session' },
      { label: 'Meter types', value: '6' },
    ],
    accentColor: '#60a5fa',
  },
  {
    path: '/dispatch-911',
    title: '911 Dispatch: Sensitive Calls',
    subtitle: 'SFPD Temporal Pattern Analysis',
    badge: '911',
    description:
      'When do domestic violence calls peak? How do crisis calls differ from the citywide average? Temporal analysis of calls where geography is protected.',
    stats: [
      { label: 'Total records', value: '~7.5M' },
      { label: 'Sensitive calls', value: '~181K' },
      { label: 'Timestamps', value: '6 per call' },
    ],
    accentColor: '#a78bfa',
  },
  {
    path: '/311-cases',
    title: '311 Service Requests',
    subtitle: 'SF311 Civic Complaint Analysis',
    badge: '311',
    description:
      'Where do complaints concentrate? Discover hotspots, resolution patterns, and density anomalies across neighborhoods.',
    stats: [
      { label: 'Total records', value: '~8.4M' },
      { label: 'Categories', value: '25' },
      { label: 'Years of data', value: '18' },
    ],
    accentColor: '#10b981',
  },
  {
    path: '/crime-incidents',
    title: 'Crime Incidents',
    subtitle: 'SFPD Reports & 911 Cross-Reference',
    badge: 'CI',
    description:
      'Where does crime cluster? Explore SFPD incident reports, resolution outcomes, and cross-reference with 911 dispatch calls.',
    stats: [
      { label: 'Categories', value: '~50' },
      { label: '911 linked', value: '~60%' },
      { label: 'Neighborhoods', value: '41' },
    ],
    accentColor: '#ef4444',
  },
  {
    path: '/parking-citations',
    title: 'Parking Citations',
    subtitle: 'SFMTA Citation Analysis',
    badge: 'PC',
    description:
      'Where do tickets cluster? Explore citation patterns, violation hotspots, fine revenue, and out-of-state vehicles across the city.',
    stats: [
      { label: 'Total records', value: '~23.3M' },
      { label: 'Violation types', value: '~40' },
      { label: 'Revenue tracking', value: 'Yes' },
    ],
    accentColor: '#f97316',
  },
  {
    path: '/traffic-safety',
    title: 'Traffic Safety',
    subtitle: 'Vision Zero Crash & Speed Analysis',
    badge: 'TS',
    description:
      'Where do crashes happen? Analyze collision severity, pedestrian & cyclist risk, speed cameras, and road conditions for Vision Zero.',
    stats: [
      { label: 'Crash records', value: '~64K' },
      { label: 'Camera sites', value: '~100+' },
      { label: 'Severity levels', value: '4' },
    ],
    accentColor: '#dc2626',
  },
  {
    path: '/business-activity',
    title: 'Business Activity',
    subtitle: 'Opening & Closing Trends',
    badge: 'BA',
    description:
      'Where are businesses opening and closing? Track neighborhood economic vitality, sector shifts, and net formation trends across San Francisco.',
    stats: [
      { label: 'Records', value: '~356K' },
      { label: 'Active', value: '~164K' },
      { label: 'Sectors', value: '15+' },
    ],
    accentColor: '#10b981',
  },
  {
    path: '/demographics',
    title: 'Demographics Explorer',
    subtitle: 'U.S. Census Bureau · ACS Estimates',
    badge: 'DM',
    description:
      'How do neighborhoods compare? Explore income, race, language, education, and housing across SF — and correlate demographics with civic outcomes.',
    stats: [
      { label: 'Neighborhoods', value: '37' },
      { label: 'Variables', value: '35' },
      { label: 'Source', value: 'ACS 5-yr' },
    ],
    accentColor: '#7c3aed',
  },
] as const

export default function Home() {
  const navigate = useNavigate()
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-16 relative">
        {/* Hero */}
        <header className="mb-20 relative z-10">
          <div className="flex items-start gap-10 md:gap-16">
            <div className="flex-1 min-w-0">
              <div className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <div className="flex items-center gap-2.5 mb-6">
                  <div className="h-[1px] w-8 bg-signal-blue/60" />
                  <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-signal-blue">
                    San Francisco Open Data
                  </p>
                </div>
              </div>

              <h1
                className={`font-display text-6xl md:text-[5.5rem] text-ink dark:text-white leading-[0.95] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              >
                <em className="not-italic">Dive beneath</em>
                <br />
                <span className="text-slate-300 dark:text-slate-600">the surface.</span>
              </h1>

              <p
                className={`text-lg text-slate-500 dark:text-slate-400 max-w-xl leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
              >
                Civic data made visible. Explore emergency response patterns, revenue flows,
                and the stories hidden in San Francisco's public datasets.
              </p>

              <div className={`flex items-center gap-4 mt-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-signal-emerald/80">
                  <span className="w-1.5 h-1.5 rounded-full bg-signal-emerald pulse-live" />
                  Live data from data.sfgov.org
                </span>
              </div>
            </div>

            <div
              className={`hidden md:block flex-shrink-0 w-56 lg:w-72 transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <img
                src="/dana-diving.png"
                alt="Dana the Data Diving Harbor Seal"
                className="w-full h-auto"
                style={{ filter: 'drop-shadow(0 8px 24px rgba(0,0,0,0.08))' }}
              />
            </div>
          </div>
        </header>

        {/* Visualization Cards */}
        <section className="relative z-10">
          <div
            className={`flex items-center gap-2.5 mb-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100' : 'opacity-0'}`}
          >
            <p className="text-[9px] font-mono uppercase tracking-[0.25em] text-slate-400/60 dark:text-slate-600">
              Explorations
            </p>
            <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
          </div>

          <div className="grid gap-6 md:grid-cols-2">
            {VISUALIZATIONS.map((viz, idx) => (
              <button
                key={viz.path}
                onClick={() => navigate(viz.path)}
                className={`
                  group text-left overflow-hidden relative
                  rounded-3xl rounded-bl-none
                  transition-all duration-500
                  ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
                `}
                style={{ transitionDelay: `${600 + idx * 100}ms` }}
              >
                {/* Frosted glass backdrop — colored radial glow + noise */}
                <div
                  className="absolute inset-0 transition-opacity duration-500"
                  style={{
                    background: `
                      radial-gradient(ellipse at 70% 30%, ${viz.accentColor}18 0%, transparent 70%),
                      radial-gradient(ellipse at 20% 80%, ${viz.accentColor}0c 0%, transparent 60%),
                      linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.65) 100%)
                    `,
                  }}
                />
                <div
                  className="absolute inset-0 opacity-30 group-hover:opacity-50 transition-opacity duration-500"
                  style={{
                    background: `
                      radial-gradient(ellipse at 70% 30%, ${viz.accentColor}28 0%, transparent 60%),
                      radial-gradient(ellipse at 20% 80%, ${viz.accentColor}18 0%, transparent 50%)
                    `,
                  }}
                />
                {/* Dark mode base */}
                <div className="absolute inset-0 hidden dark:block" style={{
                  background: `
                    radial-gradient(ellipse at 70% 30%, ${viz.accentColor}15 0%, transparent 60%),
                    radial-gradient(ellipse at 20% 80%, ${viz.accentColor}0a 0%, transparent 50%),
                    linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.85) 100%)
                  `,
                }} />
                {/* Noise texture overlay */}
                <div className="absolute inset-0 noise-bg opacity-60 dark:opacity-40" />

                {/* Notched corner — arrow lives here */}
                <div
                  className="absolute top-0 left-0 w-11 h-11 flex items-center justify-center z-20
                    rounded-br-2xl
                    transition-all duration-300
                    group-hover:w-12 group-hover:h-12 group-hover:shadow-lg"
                  style={{
                    backgroundColor: viz.accentColor,
                    boxShadow: `0 2px 8px ${viz.accentColor}40`,
                  }}
                >
                  <svg
                    className="w-4 h-4 text-white transition-transform duration-300 group-hover:translate-x-0.5 group-hover:-translate-y-0.5"
                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M3 13L13 3M13 3H6M13 3v7" />
                  </svg>
                </div>

                {/* Content */}
                <div className="relative p-6 pl-16">
                  {/* Badge + Title */}
                  <div className="flex items-start gap-3 mb-4">
                    <div
                      className="flex-shrink-0 w-8 h-8 rounded-md flex items-center justify-center
                        text-[10px] font-mono font-bold tracking-wider text-white/90"
                      style={{ backgroundColor: viz.accentColor + '30' }}
                    >
                      {viz.badge}
                    </div>
                    <div className="min-w-0">
                      <h3 className="font-display text-xl italic text-ink dark:text-white leading-tight">
                        {viz.title}
                      </h3>
                      <p className="text-[11px] font-mono uppercase tracking-wider text-slate-400 dark:text-slate-500 mt-1">
                        {viz.subtitle}
                      </p>
                    </div>
                  </div>

                  <p className="text-[13px] text-slate-500 dark:text-slate-400 leading-relaxed mb-5">
                    {viz.description}
                  </p>

                  {/* Data stats */}
                  <div className="grid grid-cols-3 gap-3 pt-4 border-t border-slate-300/20 dark:border-white/[0.06]">
                    {viz.stats.map((stat) => (
                      <div key={stat.label}>
                        <p className="text-[9px] font-mono uppercase tracking-wider text-slate-400/60 dark:text-slate-500">
                          {stat.label}
                        </p>
                        <p className="text-sm font-mono font-semibold text-ink dark:text-white mt-0.5">
                          {stat.value}
                        </p>
                      </div>
                    ))}
                  </div>
                </div>
              </button>
            ))}
          </div>
        </section>

        {/* Attribution */}
        <footer className={`mt-20 pt-6 border-t border-slate-200/50 dark:border-white/[0.04] transition-all duration-1000 delay-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          <p className="text-[10px] text-slate-400/60 dark:text-slate-600 font-mono">
            Data sourced from{' '}
            <a
              href="https://data.sfgov.org"
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              data.sfgov.org
            </a>{' '}
            via the Socrata SODA API
          </p>
        </footer>
      </div>
    </div>
  )
}
