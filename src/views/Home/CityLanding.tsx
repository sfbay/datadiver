import { Link, useNavigate } from 'react-router-dom'
import { useEffect, useState, type CSSProperties } from 'react'
import { useActiveCity } from '@/cities/useActiveCity'
import { viewPath } from '@/cities/routing'
import { liveManifest } from '@/cities/manifest'
import { useAppStore } from '@/stores/appStore'
import CivicTicker, { useResponsiveTickerSize } from '@/components/ui/CivicTicker'
import { useOaklandIndicators } from '@/hooks/useOaklandIndicators'
import { formatApTime } from '@/utils/format'
import VizCard from '@/components/ui/VizCard'

/**
 * The non-SF city landing (spec §B1) — a lean mini-Home rendered entirely
 * from CityConfig + manifest. Deliberately absent: investigation cards,
 * PulseTeaser, Neighborhood Profiles, AlertsRibbon (SF-scoped backend),
 * the Dana comic row. The status chip never says "Live" and never
 * navigates — this city has no /live, and its freshest stream lags days.
 */
export default function CityLanding() {
  const navigate = useNavigate()
  const city = useActiveCity()
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const [mounted, setMounted] = useState(false)
  const [showTicker, setShowTicker] = useState(false)
  const tickerSize = useResponsiveTickerSize('hero')
  // Deferred like SF's ticker: the hero paints before the 8-query battery.
  const indicators = useOaklandIndicators({ enabled: showTicker })

  useEffect(() => {
    requestAnimationFrame(() => setMounted(true))
    const t = setTimeout(() => setShowTicker(true), 300)
    return () => clearTimeout(t)
  }, [])

  const heroBg = isDarkMode ? '/dana-dark-hero-bg.png' : '/dana-light-hero-bg.png'

  const cards = liveManifest(city.manifest)
    .filter((e) => e.homeCard)
    .sort((a, b) => a.homeCard!.order - b.homeCard!.order)

  return (
    <div className="min-h-full overflow-y-auto">
      <div className="max-w-[1800px] mx-auto px-[clamp(16px,3vw,64px)] py-8">
        {/* Hero — same brand register as SF's, city-authored deck */}
        <header
          className="glow-host mb-14 relative z-10 overflow-hidden rounded-3xl flex flex-col justify-center"
          style={{ '--glow': '#b85a33', minHeight: 'clamp(0px, 22vw, 440px)' } as CSSProperties}
        >
          <div className="glow-corner" />
          <div
            className="absolute inset-0 bg-cover bg-center opacity-30 dark:opacity-40"
            style={{ backgroundImage: `url(${heroBg})` }}
          />
          <div className="relative px-[clamp(20px,4vw,64px)] py-12">
            <p className="text-label font-mono uppercase tracking-[0.25em] text-terracotta-500 mb-4">
              {city.name} Open Data
            </p>
            <h1
              className="font-display italic text-ink dark:text-white leading-[0.95] tracking-tight mb-5"
              style={{ fontSize: 'clamp(2.25rem, 4vw + 1rem, 5rem)' }}
            >
              <em>Dive</em> beneath
              <br />
              the surface.
            </h1>
            <p className="text-[1.0625rem] leading-relaxed text-slate-600 dark:text-slate-300 max-w-xl mb-6">
              Crime, 311, parking and campaign money across {city.areas.count}{' '}
              {city.areas.nounPlural} — straight from {city.portal.name}, named
              the way Oaklanders know their neighborhoods.
            </p>
            <div className="flex flex-wrap items-center gap-4">
              <a
                href="mailto:jesse@jlabsf.org?subject=%5BDataDiver%5D%20Inquiry"
                className="text-label font-mono text-slate-400/80 dark:text-slate-400/60 whitespace-nowrap text-left
                  hover:text-slate-600 dark:hover:text-slate-300 underline decoration-slate-400/30 underline-offset-2
                  decoration-dotted transition-colors"
              >
                Development and Design By
                <br />
                Assoc. Prof. Jesse Garnier,
                <br />
                SF State Journalism
              </a>
              {/* Status chip — non-navigating, no "Live" claim, no pulse dot.
                  The timestamp is when DataDiver last pulled — each feed
                  publishes on its own (often long) lag; see About. */}
              <span
                className="inline-flex items-center gap-2 desk:ml-5 px-3.5 py-1.5 rounded-full
                  text-micro font-mono uppercase tracking-wider whitespace-nowrap
                  bg-paper-200/70 dark:bg-espresso-800 text-slate-600 dark:text-slate-300"
                title={`When DataDiver last refreshed from ${city.portal.host} — each dataset publishes on its own schedule; parking citations run ~11 weeks behind.`}
              >
                {indicators.lastUpdated
                  ? `Updated ${formatApTime(indicators.lastUpdated.getTime())} · ${city.portal.host}`
                  : city.portal.host}
              </span>
            </div>
          </div>
        </header>

        {/* Ticker — four completeness-edged items, or their HONEST ABSENCE.
            CivicTicker renders a skeleton whenever items is empty (even with
            isLoading false), so a fully-suppressed day gets the note, never a
            forever-skeleton (plan-verify C4). */}
        <div className={`mb-14 transition-opacity duration-700 ${mounted ? 'opacity-100' : 'opacity-0'}`}>
          {showTicker && !indicators.isLoading && indicators.items.length === 0 ? (
            <p className="text-micro font-mono text-slate-500 dark:text-slate-400 py-4">
              No stream is current enough to quote right now — every figure on
              this page waits for its feed&rsquo;s completeness edge, and parking
              citations alone run ~11 weeks behind. The four views below are live.
            </p>
          ) : (
            <CivicTicker
              items={indicators.items}
              size={tickerSize}
              isLoading={indicators.isLoading || !showTicker}
              lastUpdated={indicators.lastUpdated ?? undefined}
              heroHeader={{ label: 'Civic Data · Oakland', live: false }}
            />
          )}
        </div>

        {/* View cards + the SF doorway */}
        <section className="mb-16">
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/80 dark:text-slate-600 mb-4">
            {'──'} Visualizations
          </p>
          <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
            {cards.map((e, i) => (
              <VizCard
                key={e.viewId}
                title={e.homeCard!.title}
                subtitle={e.homeCard!.subtitle}
                badge={e.navShortLabel}
                accentColor={e.accentColor}
                onClick={() => navigate(viewPath(city.id, e.viewId))}
                delay={i * 60}
                mounted={mounted}
              />
            ))}
            <VizCard
              title="San Francisco"
              subtitle="The full DataDiver — nine datasets, elections, housing & The Last 48"
              badge="SF"
              accentColor="#b85a33"
              onClick={() => navigate('/')}
              delay={cards.length * 60}
              mounted={mounted}
            />
          </div>
        </section>

        {/* Footer — portal credit + the HOVER-FREE beat-name disclosure
            (spec §B5 carry: load-bearing the day this page ships) */}
        <footer className="mt-16 pt-6 border-t border-slate-200/50 dark:border-white/[0.04]">
          <p className="text-micro text-slate-400/60 dark:text-slate-600 font-mono">
            Data sourced from{' '}
            <a
              href={`https://${city.portal.host}`}
              target="_blank"
              rel="noopener noreferrer"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              {city.portal.host}
            </a>{' '}
            via the Socrata SODA API · beat names are DataDiver&rsquo;s synthesis of
            official City boundaries and community policing names —{' '}
            <Link
              to="/about"
              className="underline underline-offset-2 hover:text-slate-500 dark:hover:text-slate-400 transition-colors"
            >
              method in About
            </Link>
          </p>
        </footer>
      </div>
    </div>
  )
}
