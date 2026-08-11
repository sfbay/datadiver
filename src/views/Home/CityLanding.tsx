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
 * The non-SF city landing (spec §B1) — layout renders from CityConfig +
 * manifest, but the ticker hook and deck copy are OAKLAND'S (gate or
 * parameterize before a third city mounts this). Deliberately absent:
 * investigation cards, PulseTeaser, Neighborhood Profiles, AlertsRibbon
 * (SF-scoped backend), the Dana comic row. The status chip never says
 * "Live" and never navigates — this city has no /live, and its freshest
 * stream lags days.
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
    const raf = requestAnimationFrame(() => setMounted(true))
    const t = setTimeout(() => setShowTicker(true), 300)
    return () => {
      cancelAnimationFrame(raf)
      clearTimeout(t)
    }
  }, [])

  // Oakland-specific hero art (Dana diving the Estuary past the Port cranes) —
  // distinct from SF's; generated to match the mirrored SF hero treatment.
  const heroBg = isDarkMode ? '/dana-oakland-dark-hero-bg.webp' : '/dana-oakland-light-hero-bg.webp'

  const cards = liveManifest(city.manifest)
    .filter((e) => e.homeCard)
    .sort((a, b) => a.homeCard!.order - b.homeCard!.order)

  return (
    <div className="h-full overflow-y-auto">
      <div className="max-w-[1800px] mx-auto px-[clamp(16px,3vw,64px)] py-8">
        {/* Hero — mirrors SF's proportions and image treatment (Home.tsx):
            a tall cinematic band with Dana on the right and text capped to
            the left half, a directional gradient reveal, top-right terracotta
            glow, rule-eyebrow, and staggered entrance. City-authored deck and
            the non-navigating "Updated" chip (no "Live" — Oakland has no /live). */}
        <header
          className="glow-host mb-20 relative z-10 overflow-hidden rounded-3xl flex flex-col justify-center"
          style={{ '--glow': '#b85a33', minHeight: 'clamp(0px, 30vw, 600px)' } as CSSProperties}
        >
          {/* Large terracotta corner glow behind Dana — anchored top-right so
              the disc bleeds in from off-canvas as warm light from above. */}
          <div
            className="glow-corner is-lg"
            style={{ top: -80, left: 'auto', right: -60, opacity: 0.55 }}
          />
          {/* Background illustration — pushed hard right so Dana clears the text */}
          <img
            src={heroBg}
            alt=""
            aria-hidden="true"
            className={`absolute inset-0 w-full h-full object-cover transition-opacity duration-1000 ${mounted ? 'opacity-100' : 'opacity-0'}`}
            style={{ objectPosition: '62% center' }}
          />
          {/* Gradient overlay — opaque on the left for text legibility, fades to
              transparent on the right so the illustration reads. */}
          <div className="absolute inset-0 bg-gradient-to-r from-white/90 via-white/60 via-45% to-transparent dark:from-slate-950/95 dark:via-slate-950/60 dark:via-45% dark:to-transparent" />
          {/* Extra flat overlay on narrow screens where text and Dana overlap */}
          <div className="absolute inset-0 bg-white/50 dark:bg-slate-950/50 desk:hidden" />

          {/* Text panel — capped to the left half on desktop so Dana shows on
              the right (matches SF); full width under a wash on mobile. */}
          <div className="relative py-6 px-8 desk:py-8 desk:px-14 desk:max-w-[min(50%,640px)]">
            <div className={`transition-all duration-1000 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
              <div className="flex items-center gap-2.5 mb-6">
                <div className="h-[1px] w-8 bg-terracotta-500/60" />
                <p className="text-label font-mono tracking-[0.25em] uppercase text-terracotta-500">
                  {city.name} Open Data
                </p>
              </div>
            </div>

            <h1
              className={`font-display text-ink dark:text-white leading-[0.9] mb-6 transition-all duration-1000 delay-150 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-12'}`}
              style={{ fontSize: 'clamp(2.25rem, 4vw + 0.75rem, 5rem)' }}
            >
              <em
                style={{
                  textShadow:
                    '0 0 18px rgba(184, 90, 51, 0.55), 0 0 42px rgba(184, 90, 51, 0.30), 0 0 96px rgba(184, 90, 51, 0.14)',
                }}
              >
                Dive
              </em>{' '}
              toward
              <br />
              civic
              <br />
              accountability.
            </h1>

            <p
              className={`text-lg text-slate-500 dark:text-slate-400 max-w-md leading-relaxed transition-all duration-1000 delay-300 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}
            >
              Crime, 311, parking and campaign money across {city.areas.count}{' '}
              {city.areas.nounPlural} — straight from {city.portal.name}, named
              the way Oaklanders know their neighborhoods.
            </p>

            <div className={`flex flex-col items-start gap-4 mt-6 desk:flex-row desk:items-center transition-all duration-1000 delay-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${mounted ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-8'}`}>
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
          {indicators.lastUpdated !== null && indicators.items.length === 0 ? (
            <p className="text-micro font-mono text-slate-500 dark:text-slate-400 py-4">
              Nothing current enough to quote right now — ticker figures wait
              for each feed&rsquo;s completeness edge (parking citations alone
              run ~11 weeks behind). All four Oakland views below are open.
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
              subtitle="The full DataDiver — 23 datasets, elections, housing & The Last 48"
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
              to="/about#oakland-beats"
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
