import { useNavigate } from 'react-router-dom'
import { useEffect, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import CivicTicker, { useResponsiveTickerSize } from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import { usePreloadCache } from '@/hooks/usePreloadCache'
import { useNeighborhoodProfiles } from '@/views/Neighborhood/useNeighborhoodProfiles'
import CivicFingerprint from '@/views/Neighborhood/CivicFingerprint'
import { DOMAINS } from '@/views/Neighborhood/types'

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
  {
    path: '/elections',
    title: 'Elections',
    subtitle: 'SF Dept of Elections · Results & RCV',
    badge: 'EL',
    description:
      'How does your neighborhood vote? Explore ranked choice voting rounds, ballot measures, and play back decades of election results on an interactive map.',
    stats: [
      { label: 'Elections', value: '5+' },
      { label: 'RCV rounds', value: 'All' },
      { label: 'Measures', value: '1961–now' },
    ],
    accentColor: '#6366f1',
  },
  {
    path: '/campaign-finance',
    title: 'Campaign Finance',
    subtitle: 'SF Ethics Commission Filings',
    badge: 'CF',
    description:
      'Follow the money. Track contributions, spending, and independent expenditures across SF election cycles.',
    stats: [
      { label: 'Source', value: 'SF Ethics' },
      { label: 'Filings', value: 'A/E/I/D' },
      { label: 'Cycles', value: '4+' },
    ],
    accentColor: '#14b8a6',
  },
  {
    path: '/city-budget',
    title: 'City Budget',
    subtitle: 'SF Controller · Spending & Vendors',
    badge: 'BU',
    description:
      'Where does the money go? Explore $14B+ in city spending, vendor payments, advertising compliance, and anomaly detection.',
    stats: [
      { label: 'Payments', value: '7.9M' },
      { label: 'Vendors', value: '12K+' },
      { label: 'Since', value: 'FY2007' },
    ],
    accentColor: '#0ea5e9',
  },
  {
    path: '/live-feeds',
    title: 'Live Feeds',
    subtitle: 'Scanner Radio · SFPD, SFFD, EMS',
    badge: 'LIVE',
    description:
      'Listen in. Scanner radio feeds for police, fire, and EMS — organized by district with contextual neighborhood data.',
    stats: [
      { label: 'Services', value: '3' },
      { label: 'Districts', value: '10+' },
      { label: 'Status', value: 'Live' },
    ],
    accentColor: '#f59e0b',
  },
] as const

export default function Home() {
  const navigate = useNavigate()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const [mounted, setMounted] = useState(false)
  const [comicOpen, setComicOpen] = useState(false)
  const tickerSize = useResponsiveTickerSize('hero')
  const indicators = useCivicIndicators()
  const dateRange = useAppStore((s) => s.dateRange)
  const { profiles, isLoading: profilesLoading } = useNeighborhoodProfiles(dateRange)
  usePreloadCache() // silently warm all view caches in background

  // Top 5 most anomalous neighborhoods for the featured section
  const featuredNeighborhoods = profiles
    .filter((p) => p.totalEvents > 0)
    .sort((a, b) => b.anomalyCount - a.anomalyCount || b.compositeZScore - a.compositeZScore)
    .slice(0, 5)

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
  }, [])

  // Esc to close comic modal
  useEffect(() => {
    if (!comicOpen) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setComicOpen(false) }
    document.addEventListener('keydown', handler)
    return () => document.removeEventListener('keydown', handler)
  }, [comicOpen])

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
            style={{ objectPosition: '62% center' }}
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
              className={`text-5xl md:text-7xl lg:text-[5.5rem] text-ink dark:text-white leading-[0.95] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              style={{ fontFamily: '"Instrument Serif", Georgia, serif' }}
            >
              <em className="not-italic">Dive beneath</em>
              <br />
              <span className="text-slate-300 dark:text-slate-400">the surface.</span>
            </h1>

            <p
              className={`text-lg text-slate-500 dark:text-slate-400 max-w-md leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              Civic data brought to life. Explore trends, patterns and flow to reveal
              stories with impact hidden in public datasets.
            </p>

            <div className={`flex items-center gap-4 mt-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono uppercase tracking-wider text-signal-emerald/80">
                <span className="w-1.5 h-1.5 rounded-full bg-signal-emerald pulse-live" />
                Live data from datasf.sfgov.org
              </span>
              <span className="text-[11px] font-mono text-slate-400/80 dark:text-slate-400/60 whitespace-nowrap">
                Jesse Garnier with Claude · SF State Journalism
              </span>
            </div>
          </div>
        </header>

        {/* Dana Comic Strip Ribbon */}
        <section
          className={`relative z-10 mb-6 transition-all duration-1000 delay-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <button
            onClick={() => setComicOpen(true)}
            className="w-full group flex items-center gap-5 glass-card rounded-2xl px-5 py-3 hover:bg-white/[0.06] transition-all duration-300 overflow-hidden text-left"
          >
            {/* Comic thumbnail */}
            <img
              src="/dana-comic-1-thumb.jpg"
              alt="Dana the DataDiver comic strip"
              className="w-28 h-16 object-cover rounded-lg flex-shrink-0 ring-1 ring-white/10 group-hover:ring-white/20 transition-all"
            />
            {/* Text */}
            <div className="flex-1 min-w-0">
              <p className="text-sm font-display italic text-ink dark:text-white leading-tight">
                Meet Dana, the data-diving Harbor Seal!
              </p>
              <p className="text-[11px] text-slate-400 dark:text-slate-500 mt-0.5">
                Follow her adventures diving for data — and fish! New comic strips & data tidbits on Instagram.
              </p>
            </div>
            {/* Arrow */}
            <div className="flex-shrink-0 text-slate-400 dark:text-slate-600 group-hover:text-ink dark:group-hover:text-white transition-colors">
              <svg className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M3 8h10M10 4.5L13.5 8 10 11.5" />
              </svg>
            </div>
          </button>
        </section>

        {/* Dana Comic Modal */}
        {comicOpen && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center p-6"
            onClick={() => setComicOpen(false)}
          >
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/70 backdrop-blur-sm" />
            {/* Modal */}
            <div
              className="relative max-w-3xl w-full animate-in fade-in zoom-in-95 duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={() => setComicOpen(false)}
                className="absolute -top-3 -right-3 z-10 w-8 h-8 rounded-full bg-slate-800 border border-white/10 flex items-center justify-center text-slate-400 hover:text-white hover:bg-slate-700 transition-colors shadow-lg"
              >
                <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                  <path d="M3 3l8 8M11 3l-8 8" />
                </svg>
              </button>
              {/* Comic image */}
              <img
                src="/dana-comic-1r.jpg"
                alt="Dana the DataDiver — Comic Strip #1"
                className="w-full rounded-xl shadow-2xl ring-1 ring-white/10"
              />
              {/* Caption */}
              <div className="mt-3 flex items-center justify-between">
                <p className="text-[11px] font-mono text-slate-400">
                  Dana the DataDiver · Comic #1 · datadiver.vercel.app
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  Press Esc or click outside to close
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Civic Data Ticker — living indicators from across all datasets */}
        <section
          className={`relative z-10 mb-16 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <CivicTicker
            items={indicators.items}
            size={tickerSize}
            isLoading={indicators.isLoading}
            lastUpdated={indicators.lastUpdated ?? undefined}
          />
        </section>

        {/* Neighborhood Profiles — featured section */}
        <section
          className={`relative z-10 mb-12 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <button
            onClick={() => navigate('/neighborhood')}
            className="w-full text-left group"
          >
            <div className="glass-card rounded-2xl overflow-hidden hover:bg-white/[0.04] transition-all duration-300">
              {/* Header */}
              <div className="px-6 pt-5 pb-3 flex items-center justify-between">
                <div>
                  <div className="flex items-center gap-2.5">
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-purple-500/15 text-purple-400 tracking-wider">
                      NH
                    </span>
                    <h2 className="text-[17px] font-display italic text-white leading-none">
                      Neighborhood Profiles
                    </h2>
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1.5">
                    5 datasets, 41 neighborhoods — civic fingerprints reveal each community's unique signature
                  </p>
                </div>
                <div className="flex-shrink-0 text-slate-500 group-hover:text-purple-400 transition-colors">
                  <svg className="w-5 h-5 group-hover:translate-x-0.5 transition-transform" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M4 10h12M12 5.5L16.5 10 12 14.5" />
                  </svg>
                </div>
              </div>

              {/* Fingerprint row */}
              <div className="px-6 pb-5 pt-1">
                {profilesLoading ? (
                  <div className="flex items-center gap-6 py-4">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div key={i} className="flex flex-col items-center gap-2 flex-1">
                        <div className="w-16 h-16 rounded-full bg-white/[0.03] animate-pulse" />
                        <div className="w-20 h-2 rounded bg-white/[0.04] animate-pulse" />
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    {featuredNeighborhoods.map((profile, i) => (
                      <div
                        key={profile.name}
                        className="flex flex-col items-center flex-1 min-w-0 group/fp"
                        style={{ animationDelay: `${600 + i * 80}ms` }}
                      >
                        <div className="relative">
                          <CivicFingerprint
                            profile={profile}
                            size={80}
                            showLabels={false}
                            animate={mounted}
                          />
                          {/* Anomaly count badge */}
                          {profile.anomalyCount > 0 && (
                            <span className="absolute -top-1 -right-1 text-[8px] font-mono font-bold w-4 h-4 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center ring-1 ring-amber-500/20">
                              {profile.anomalyCount}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-slate-400 text-center leading-tight mt-1.5 truncate w-full">
                          {profile.name}
                        </p>
                        <p className="text-[9px] font-mono text-slate-600 tabular-nums">
                          {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}σ
                        </p>
                      </div>
                    ))}
                  </div>
                )}

                {/* Domain legend */}
                <div className="flex items-center justify-center gap-4 mt-4 pt-3 border-t border-white/[0.04]">
                  {DOMAINS.map((d) => (
                    <span key={d.key} className="flex items-center gap-1.5">
                      <span className="w-1 h-1 rounded-full" style={{ backgroundColor: d.color }} />
                      <span className="text-[8px] font-mono text-slate-500 uppercase tracking-wider">{d.short}</span>
                    </span>
                  ))}
                </div>
              </div>
            </div>
          </button>
        </section>

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

          <div className="grid gap-5 md:grid-cols-2 lg:grid-cols-3">
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
