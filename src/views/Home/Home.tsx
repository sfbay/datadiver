import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'

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
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const [mounted, setMounted] = useState(false)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  const heroBg = isDarkMode ? '/dana-dark-hero-bg.png' : '/dana-light-hero-bg.png'

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-5xl mx-auto px-8 py-16 relative">
        {/* Hero — full-width background with Dana on right, text on left */}
        <header className="mb-20 relative z-10 overflow-hidden rounded-3xl">
          {/* Background image — pushed hard right so Dana clears the text */}
          <img
            src={heroBg}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}
            style={{ objectPosition: '60% center' }}
          />
          {/* Gradient overlay — stronger on left for text, fades to transparent on right */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/60 via-45% to-transparent dark:from-slate-950/95 dark:via-slate-950/60 dark:via-45% dark:to-transparent" />
          {/* Extra overlay on narrow screens where text and Dana overlap */}
          <div className="absolute inset-0 bg-white/50 dark:bg-slate-950/50 md:hidden" />

          {/* Text content — left side on desktop, full width with overlay on mobile */}
          <div className="relative py-6 px-8 md:py-8 md:px-14 md:max-w-[50%]">
            <div className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="h-[1px] w-8 bg-signal-blue/60" />
                <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-signal-blue">
                  San Francisco Open Data
                </p>
              </div>
            </div>

            <h1
              className={`font-display text-5xl md:text-7xl lg:text-[5.5rem] text-ink dark:text-white leading-[0.95] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
            >
              <em className="not-italic">Dive beneath</em>
              <br />
              <span className="text-slate-300 dark:text-slate-400">the surface.</span>
            </h1>

            <p
              className={`text-lg text-slate-500 dark:text-slate-400 max-w-md leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
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
                  rounded-[2rem] rounded-bl-none
                  transition-all duration-500
                  ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}
                `}
                style={{ transitionDelay: `${600 + idx * 100}ms` }}
              >
                {/* Frosted glass backdrop — colored radial glow + noise */}
                <div
                  className="absolute inset-0 transition-all duration-500 group-hover:opacity-100 opacity-70"
                  style={{
                    background: `
                      radial-gradient(ellipse at 70% 30%, ${viz.accentColor}1a 0%, transparent 70%),
                      radial-gradient(ellipse at 20% 80%, ${viz.accentColor}10 0%, transparent 60%),
                      linear-gradient(135deg, rgba(255,255,255,0.85) 0%, rgba(255,255,255,0.65) 100%)
                    `,
                  }}
                />
                <div
                  className="absolute inset-0 opacity-25 group-hover:opacity-70 transition-all duration-500"
                  style={{
                    background: `
                      radial-gradient(ellipse at 70% 30%, ${viz.accentColor}30 0%, transparent 60%),
                      radial-gradient(ellipse at 20% 80%, ${viz.accentColor}20 0%, transparent 50%)
                    `,
                  }}
                />
                {/* Dark mode base */}
                <div className="absolute inset-0 hidden dark:block transition-all duration-500 group-hover:opacity-100 opacity-80" style={{
                  background: `
                    radial-gradient(ellipse at 70% 30%, ${viz.accentColor}18 0%, transparent 60%),
                    radial-gradient(ellipse at 20% 80%, ${viz.accentColor}10 0%, transparent 50%),
                    linear-gradient(135deg, rgba(15,23,42,0.92) 0%, rgba(15,23,42,0.85) 100%)
                  `,
                }} />
                <div className="absolute inset-0 hidden dark:block opacity-0 group-hover:opacity-60 transition-all duration-500" style={{
                  background: `
                    radial-gradient(ellipse at 60% 40%, ${viz.accentColor}30 0%, transparent 50%)
                  `,
                }} />
                {/* Noise texture overlay */}
                <div className="absolute inset-0 noise-bg opacity-60 dark:opacity-40" />

                {/* Notched top-right corner — arrow lives here */}
                <div
                  className="absolute top-0 right-0 w-12 h-12 flex items-center justify-center z-20
                    rounded-bl-[1.5rem]
                    transition-all duration-300
                    group-hover:w-14 group-hover:h-14 group-hover:shadow-lg"
                  style={{
                    backgroundColor: viz.accentColor,
                    boxShadow: `0 2px 8px ${viz.accentColor}40`,
                  }}
                >
                  <svg
                    className="w-5 h-5 text-white transition-transform duration-300 group-hover:translate-x-0.5"
                    viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"
                  >
                    <path d="M3 8h10M10 4.5L13.5 8 10 11.5" />
                  </svg>
                </div>

                {/* Content */}
                <div className="relative p-6 pr-16">
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
