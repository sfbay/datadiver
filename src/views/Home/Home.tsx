import { useNavigate } from 'react-router-dom'
import { useEffect, useState, type CSSProperties } from 'react'
import { useAppStore } from '@/stores/appStore'
import CivicTicker, { useResponsiveTickerSize } from '@/components/ui/CivicTicker'
import { useCivicIndicators } from '@/hooks/useCivicIndicators'
import { formatApTime } from '@/utils/format'
import { usePreloadCache } from '@/hooks/usePreloadCache'
import { useNeighborhoodProfiles } from '@/views/Neighborhood/useNeighborhoodProfiles'
import CivicFingerprint from '@/views/Neighborhood/CivicFingerprint'
import { DOMAINS } from '@/views/Neighborhood/types'
import DeficitCounter from '@/components/investigations/DeficitCounter'
import ResponseEquity from '@/components/investigations/ResponseEquity'
import DispatchUnanswered from '@/components/investigations/DispatchUnanswered'
import ComplianceTracker from '@/components/investigations/ComplianceTracker'
import Last48Pulse from '@/components/investigations/Last48Pulse'
import VisionZeroCounter from '@/components/investigations/VisionZeroCounter'
import VizCard from '@/components/ui/VizCard'
import AlertsRibbon from '@/components/home/AlertsRibbon'

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
    accentColor: '#b85a33', // terracotta-600
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
    accentColor: '#3f7573', // teal-600
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
    accentColor: '#474e74', // indigo-600
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
    accentColor: '#5c7a3d', // moss-600
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
    accentColor: '#963e30', // brick-600
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
    accentColor: '#d47149', // terracotta-500
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
    accentColor: '#963e30', // brick-600
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
    accentColor: '#5c7a3d', // moss-600
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
    accentColor: '#8b6282', // plum-500
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
    accentColor: '#616a96', // indigo-500
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
    accentColor: '#8b6282', // plum-500
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
    accentColor: '#b58620', // ochre-600
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
    accentColor: '#d4a435', // ochre-500
  },
] as const

export default function Home() {
  const navigate = useNavigate()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const [mounted, setMounted] = useState(false)
  const [comicOpen, setComicOpen] = useState(false)
  const [showTicker, setShowTicker] = useState(false)
  const [showProfiles, setShowProfiles] = useState(false)
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
    // Stagger lower-priority sections so hero vizzes get query priority
    const t1 = setTimeout(() => setShowTicker(true), 500)
    const t2 = setTimeout(() => setShowProfiles(true), 1000)
    return () => { clearTimeout(t1); clearTimeout(t2) }
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
      {/* Liquid wrapper — flows from a comfortable mobile/laptop minimum to
          ~1800px on ultrawide displays. Padding uses clamp so the inset
          breathes proportionally instead of stair-stepping at breakpoints.
          Echoes the 1990s/2000s LiquidEx pattern (percentage-width tables
          with spacer-GIF gutters), updated with modern clamp() controls. */}
      <div className="mx-auto pt-8 pb-16 relative w-full max-w-[1800px] px-[clamp(16px,3vw,64px)]">
        {/* OmniSearch ribbon hidden pending entity-search infrastructure —
            the static index only matches neighborhoods + dataset names, so
            queries like "salesforce" or "uber" silently produced no results.
            Ribbon will debut alongside vendor / business / committee
            indexing in a follow-up PR. ⌘K modal kept active as a
            power-user surface (limited but discoverable only by intent). */}

        {/* Hero — full-width background with Dana on right, text on left.
            min-height scales with the viewport so the hero stays cinematic at
            wide widths instead of looking shallow. clamp(0, 30vw, 600px) means:
            no effect at narrow viewports (content height wins), kicks in at
            ~1280px+ where 30vw exceeds the natural text-panel height, and caps
            at 600px so it can't grow indefinitely on ultrawide. */}
        <header
          className="glow-host mb-20 relative z-10 overflow-hidden rounded-3xl flex flex-col justify-center"
          style={{
            '--glow': '#b85a33',
            minHeight: 'clamp(0px, 30vw, 600px)',
          } as CSSProperties}
        >
          {/* Large terracotta corner glow behind Dana — anchored top-right
              with a generous offset so the disc bleeds in from off-canvas
              and reads as warm light catching her from above. */}
          <div
            className="glow-corner is-lg"
            style={{ top: -80, left: 'auto', right: -60, opacity: 0.55 }}
          />
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

          {/* Text content — left side on desktop, full width with overlay on mobile.
              Cap at 640px on ultrawide so the headline + body never stretch into
              uncomfortable line lengths. The hero card itself keeps growing with
              the viewport (revealing more of the bg illustration on the right);
              only the text panel inside it caps. */}
          <div className="relative py-6 px-8 md:py-8 md:px-14 md:max-w-[min(50%,640px)]">
            <div className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="h-[1px] w-8 bg-signal-blue/60" />
                <p className="text-[11px] font-mono tracking-[0.25em] uppercase text-signal-blue">
                  San Francisco Open Data
                </p>
              </div>
            </div>

            <h1
              className={`font-display text-ink dark:text-white leading-[0.9] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              style={{
                // Fluid type: scales smoothly from 2.75rem at narrow viewports
                // to 7rem at ~2000px-wide displays. No breakpoint jumps — the
                // headline grows continuously with the viewport. The 5vw + 1rem
                // formula gives enough kick at desktop sizes without overshooting
                // on ultrawide.
                fontSize: 'clamp(2.75rem, 5vw + 1rem, 7rem)',
              }}
            >
              <em
                style={{
                  textShadow:
                    '0 0 18px rgba(92, 150, 147, 0.55), 0 0 42px rgba(92, 150, 147, 0.30), 0 0 96px rgba(92, 150, 147, 0.14)',
                }}
              >
                Dive
              </em>{' '}
              beneath
              <br />
              <span className="text-slate-300 dark:text-slate-400">the surface.</span>
            </h1>

            <p
              className={`text-lg text-slate-500 dark:text-slate-400 max-w-md leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              Bring civic data to life, instantly. Visualize trends, patterns and 24/7
              flow to turn public data into public insight.
            </p>

            <div className={`flex items-center gap-4 mt-6 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              {/* Credit links to /about — top-line authorship is the author's
                  alone (academic convention); Claude's role is disclosed in
                  full on the About page. */}
              <button
                onClick={() => navigate('/about')}
                className="text-[11px] font-mono text-slate-400/80 dark:text-slate-400/60 whitespace-nowrap text-left
                  hover:text-slate-600 dark:hover:text-slate-300 underline decoration-slate-400/30 underline-offset-2
                  decoration-dotted transition-colors"
              >
                Development and Design By
                <br />
                Assoc. Prof. Jesse Garnier,
                <br />
                SF State Journalism
              </button>
              {/* Health pill — inverse text on a solid moss fill. The
                  timestamp is when DataDiver last successfully pulled from
                  DataSF — NOT the data's own vintage, which varies per
                  dataset (each feed publishes on its own lag; see /about).
                  Errors turn the pill ochre rather than pretending.
                  Clicking it opens The Last 48 — "Live" IS that view. */}
              <button
                onClick={() => navigate('/live-feeds')}
                className={`inline-flex items-center gap-2 ml-5 pl-2.5 pr-3.5 py-1.5 rounded-full
                  text-[10px] font-mono uppercase tracking-wider whitespace-nowrap text-[#f5ecd9]
                  shadow-sm cursor-pointer transition-[filter] hover:brightness-110
                  ${indicators.error ? 'bg-[#b58620]' : 'bg-[#5c7a3d]'}`}
                title="When DataDiver last refreshed from datasf.sfgov.org — each dataset publishes on its own schedule. Open The Last 48 →"
              >
                <span className="w-1.5 h-1.5 rounded-full bg-current pulse-live flex-shrink-0" />
                {indicators.error
                  ? 'DataSF · retrying'
                  : indicators.lastUpdated
                    ? `Live · updated ${formatApTime(indicators.lastUpdated.getTime())}`
                    : 'Live · datasf.sfgov.org'}
              </button>
            </div>
          </div>
        </header>

        {/* Newsletter + Dana row — liquid 2:1 (Dana 1fr left, newsletter
            2fr right). Flex-wrap with proportional grow factors instead of
            a viewport breakpoint: side-by-side when the row fits, items
            wrap to their own full-width lines when it doesn't. DOM order
            keeps the newsletter FIRST (it earned first-after-hero placement
            + keyboard-tab priority), so the visual left/right swap is done
            with order utilities that only apply once the row container is
            wide enough to be side-by-side (wrap point = 460+300+24px of
            flex-basis). The newsletter carries real content (headline,
            pitch, chips, CTA) so it earns the wide column; the comic tile
            reads as a compact feature panel beside it. */}
        <div className="@container relative z-10 mb-6 flex flex-wrap items-stretch gap-6">
          <div className="flex-[2_1_460px] min-w-0 @min-[784px]:order-2">
            <AlertsRibbon mounted={mounted} />
          </div>

          {/* Dana Comic Tile — container-queried, not viewport-queried.
              When the tile itself is narrower than ~672px (@2xl) — i.e. when
              it's sitting in the 1fr column — it stacks vertically: comic
              art fills the top (object-cover, matching the ribbon's height),
              caption below. When it wraps to a full-width line (mobile,
              mid-width), it reverts to the original horizontal ribbon. */}
          <section
            className={`@container flex-[1_1_300px] min-w-0 relative z-10 transition-all duration-1000 delay-400 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            <button
              onClick={() => setComicOpen(true)}
              className="dd-ribbon-hover w-full h-full group flex items-center @max-2xl:flex-col @max-2xl:items-stretch gap-[clamp(20px,2vw,40px)] @max-2xl:gap-3 glass-card rounded-2xl px-[clamp(20px,2vw,40px)] @max-2xl:px-4 py-[clamp(12px,1.2vw,24px)] @max-2xl:py-4 hover:bg-white/[0.06] transition-all duration-300 overflow-hidden text-left relative isolate"
              style={{ '--glow': '#5c9693' } as CSSProperties}
            >
              {/* Comic thumbnail — horizontal mode: fluid inline-ish sizing
                  (~112px narrow → ~200px ultrawide, ~7:4 crop). Vertical
                  mode: fills the tile's remaining height, object-cover. */}
              <div className="relative rounded-lg overflow-hidden flex-shrink-0 ring-1 ring-white/10 group-hover:ring-white/20 transition-all z-10 w-[clamp(112px,11vw,200px)] h-[clamp(64px,6.3vw,114px)] @max-2xl:w-full @max-2xl:h-auto @max-2xl:flex-1 @max-2xl:min-h-[120px]">
                <img
                  src="/dana-comic-1-thumb.jpg"
                  alt="Dana the DataDiver comic strip"
                  className="w-full h-full object-cover"
                />
                {/* Espresso veil — the full-brightness cream comic dominates
                    the dark page; this pulls it into the room's light. Hover
                    lifts it, same register as the tile's glow. Light mode
                    needs no veil (cream art on a cream page). */}
                <div
                  aria-hidden
                  className="absolute inset-0 pointer-events-none transition-colors duration-300 dark:bg-[#1e140d]/35 dark:group-hover:bg-[#1e140d]/15"
                />
              </div>
              {/* Text — typography scales fluidly with the thumbnail so the
                  ribbon reads as a single proportional composition rather
                  than a small image with under-served copy beside it. */}
              <div className="flex-1 min-w-0 @max-2xl:flex-none relative z-10">
                <p
                  className="font-display italic text-ink dark:text-white leading-tight"
                  style={{ fontSize: 'clamp(0.95rem, 1.1vw + 0.5rem, 1.6rem)' }}
                >
                  Meet Dana, the data-diving Harbor Seal!
                </p>
                <p
                  className="text-slate-500 dark:text-slate-400 mt-1 leading-snug"
                  style={{ fontSize: 'clamp(0.72rem, 0.55vw + 0.4rem, 1rem)' }}
                >
                  Follow Dana's adventures diving for civic data — and fish! New comic strips &amp; data tidbits on Instagram.
                </p>
              </div>
              {/* Arrow — horizontal mode only; the vertical tile's whole
                  surface already reads as one tap target. */}
              <div className="@max-2xl:hidden flex-shrink-0 text-slate-400 dark:text-slate-600 group-hover:text-ink dark:group-hover:text-white transition-colors relative z-10">
                <svg
                  viewBox="0 0 16 16" fill="none" stroke="currentColor"
                  strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"
                  className="group-hover:translate-x-0.5 transition-transform"
                  style={{ width: 'clamp(16px, 1.4vw, 28px)', height: 'clamp(16px, 1.4vw, 28px)' }}
                >
                  <path d="M3 8h10M10 4.5L13.5 8 10 11.5" />
                </svg>
              </div>
            </button>
          </section>
        </div>

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
                  Dana the DataDiver · Comic #1 · datadiver.jlabsf.org
                </p>
                <p className="text-[10px] font-mono text-slate-500">
                  Press Esc or click outside to close
                </p>
              </div>
            </div>
          </div>
        )}

        {/* Visualizations — hero data stories */}
        <section
          className={`relative z-10 mb-8 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
        >
          <div
            className="glow-host flex items-center gap-2.5 mb-4 py-1"
            style={{ '--glow': '#b85a33' } as CSSProperties}
          >
            <div className="glow-corner is-sm" />
            <p className="relative text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
              Visualizations
            </p>
            <div className="relative flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
          </div>
          {/* Auto-fit fluid grid: 1 column when viewport < 460px, 2 columns
              from there to ~960px, 3 columns at ~1380px, 4 columns at ~1840px+.
              No breakpoint jumps — the grid reflows continuously as the
              viewport widens. Each card stays in the [460px, 1fr] band. */}
          <div className="grid gap-4 grid-cols-[repeat(auto-fit,minmax(460px,1fr))]">
            <Last48Pulse />
            <DeficitCounter />
            <ResponseEquity />
            <DispatchUnanswered />
            <VisionZeroCounter />
            <ComplianceTracker />
          </div>
        </section>

        {/* Civic Data Ticker — delayed 500ms to let hero vizzes load first */}
        {showTicker && (
          <section
            className={`relative z-10 mb-16 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
          >
            <CivicTicker
              items={indicators.items}
              size={tickerSize}
              isLoading={indicators.isLoading}
              lastUpdated={indicators.lastUpdated ?? undefined}
            />
          </section>
        )}

        {/* Neighborhood Profiles — delayed 1000ms to let hero vizzes + ticker load first */}
        {showProfiles && (
        <section
          className={`relative z-10 mb-12 transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-6'}`}
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
                    <span className="text-[10px] font-mono font-semibold px-2 py-0.5 rounded-md bg-plum-500/15 text-plum-500 tracking-wider">
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
                <div className="flex-shrink-0 text-slate-500 group-hover:text-plum-500 transition-colors">
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
                            <span className="absolute -top-1 -right-1 text-[8px] font-mono font-bold w-4 h-4 rounded-full bg-ochre-500/20 text-ochre-500 flex items-center justify-center ring-1 ring-ochre-500/20">
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
        )}

        {/* Visualization Cards */}
        <section className="relative z-10">
          <div
            className={`glow-host flex items-center gap-2.5 mb-6 py-1 transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100' : 'opacity-0'}`}
            style={{ '--glow': '#5c9693' } as CSSProperties}
          >
            <div className="glow-corner is-sm" />
            <p className="relative text-[10px] font-mono uppercase tracking-[0.25em] text-slate-500 dark:text-slate-400">
              Explorations
            </p>
            <div className="relative flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
          </div>

          {/* Auto-fit explorations grid: ~2 columns at narrow viewports, scaling
              up to 6+ columns on ultrawide. Smaller minmax than the viz grid
              since each tile is a smaller card. */}
          <div className="grid gap-2.5 grid-cols-[repeat(auto-fit,minmax(220px,1fr))]">
            {VISUALIZATIONS.map((viz, idx) => (
              <VizCard
                key={viz.path}
                title={viz.title}
                subtitle={viz.subtitle}
                badge={viz.badge}
                accentColor={viz.accentColor}
                onClick={() => navigate(viz.path)}
                delay={600 + idx * 60}
                mounted={mounted}
              />
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
