// src/views/Pulse/Pulse.tsx
//
// The Pulse — a plain-English wire of "what stands out in SF right now,"
// rendered as a grid of signal TILES (not stacked sentences). The publication-
// on-top-of-the-tool surface: each card digs into the map as evidence.
//
// Detection is reused (useAnomalyBaseline + useCivicIndicators); prose +
// visual encoding come from the tested pulsePhrase layer.

import { useCallback, useMemo } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { usePulseWire } from './usePulseWire'
import WireCard from './WireCard'
import { formatApTime } from '@/utils/format'

const MAX_VISIBLE = 24

export default function Pulse() {
  const { items, isLoading } = usePulseWire()

  // Place filter lives in the URL (?nh=) so a filtered wire is a sendable
  // link — mirrors Last48's ?nh= pattern (replace, redundant-write guard).
  // 'all' (no param) | 'citywide' (lowercase — can't collide with a real
  // neighborhood name) | <neighborhood>.
  const [searchParams, setSearchParams] = useSearchParams()
  const place = searchParams.get('nh') ?? 'all'
  const setPlace = useCallback((next: string) => {
    setSearchParams((prev) => {
      if ((prev.get('nh') ?? 'all') === next) return prev
      const np = new URLSearchParams(prev)
      if (next === 'all') np.delete('nh')
      else np.set('nh', next)
      return np
    }, { replace: true })
  }, [setSearchParams])

  // Neighborhoods that actually have a signal right now (the filter only offers
  // real choices, ranked by their strongest card).
  const neighborhoods = useMemo(() => {
    const seen = new Set<string>()
    const ordered: string[] = []
    for (const i of items) {
      if (i.place && !seen.has(i.place)) {
        seen.add(i.place)
        ordered.push(i.place)
      }
    }
    return ordered
  }, [items])

  const hasCitywide = useMemo(() => items.some((i) => !i.place), [items])

  // Keep the pre-cap count: a silent MAX_VISIBLE cut would read as "this is
  // everything" — the truncation note below the grid names what was trimmed.
  const { visible, filteredTotal } = useMemo(() => {
    const filtered =
      place === 'all'
        ? items
        : place === 'citywide'
          ? items.filter((i) => !i.place)
          : items.filter((i) => i.place === place)
    return { visible: filtered.slice(0, MAX_VISIBLE), filteredTotal: filtered.length }
  }, [items, place])

  // One "updated" stamp for the wire (each card's compute time is ~identical —
  // per-card timestamps would be uniform noise, rejected in the Phase-1 card
  // studies). SF wall clock via formatApTime.
  const updatedAt = useMemo(
    () => (items.length ? Math.max(...items.map((i) => i.at)) : null),
    [items],
  )

  return (
    <div className="h-full overflow-y-auto bg-paper-50 dark:bg-espresso-950">
      <div
        className="mx-auto max-w-[73.75rem] py-[clamp(28px,4vw,56px)]"
        style={{ paddingInline: 'clamp(20px,4vw,48px)' }}
      >
        {/* ── Masthead ───────────────────────────────────────────── */}
        <header className="mb-6">
          <p className="font-mono text-[0.6875rem] tracking-[0.25em] uppercase text-terracotta-600 dark:text-terracotta-400 mb-3">
            <span className="text-paper-600">──</span> The Pulse
            {updatedAt !== null && (
              <span className="normal-case tracking-normal text-paper-500 dark:text-paper-600">
                {'  '}· updated {formatApTime(updatedAt)}
              </span>
            )}
          </p>
          <h1 className="font-display text-[clamp(2rem,4vw,3.25rem)] leading-[1.05] tracking-tight
                         text-ink dark:text-paper-50">
            Trending now in San Francisco
          </h1>
          <p className="mt-3 font-serif text-[clamp(0.95rem,1.3vw,1.1rem)] leading-relaxed
                        text-paper-700 dark:text-paper-400 max-w-[58ch]">
            The freshest public data, scanned for the handful of things running hot — or unusually
            quiet. Each card's color is its feed; the arrow and bar show which way, and how far from
            normal. Every tile digs into the records.
          </p>

          {/* colour legend — colour means the feed; shape means the signal */}
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 font-mono text-[0.625rem] text-paper-600 dark:text-paper-500">
            <span className="text-paper-500 dark:text-paper-600">color = feed</span>
            {[
              ['#b85a33', '911'],
              ['#963e30', 'Fire/EMS'],
              ['#5c9693', '311'],
            ].map(([c, label]) => (
              <span key={label} className="inline-flex items-center gap-1.5">
                <span className="w-2.5 h-2.5 rounded-sm" style={{ backgroundColor: c }} />
                {label}
              </span>
            ))}
            <span className="text-paper-600 dark:text-paper-700">·</span>
            <span>arrow + bar = direction &amp; how far from normal</span>
          </div>
        </header>

        {/* ── Neighborhood filter ──────────────────────────────────
            overscroll-x-contain: keep the chip row's horizontal scroll from
            bleeding into iOS back-swipe navigation at the row's edges */}
        {!isLoading && (neighborhoods.length > 0 || hasCitywide) && (
          <div className="flex items-center gap-1.5 mb-5 overflow-x-auto overscroll-x-contain pb-1 -mx-1 px-1">
            <FilterChip label="All" active={place === 'all'} onClick={() => setPlace('all')} />
            {hasCitywide && (
              <FilterChip label="Citywide" active={place === 'citywide'} onClick={() => setPlace('citywide')} />
            )}
            {neighborhoods.map((nh) => (
              <FilterChip key={nh} label={nh} active={place === nh} onClick={() => setPlace(nh)} />
            ))}
          </div>
        )}

        {/* ── The wire (grid of tiles) ───────────────────────────── */}
        {isLoading ? (
          <CardSkeletonGrid />
        ) : visible.length === 0 ? (
          <EmptyWire
            place={place !== 'all' && items.length > 0 ? place : null}
            onShowAll={() => setPlace('all')}
          />
        ) : (
          <>
            {/* min(320px,100%): a bare 320px minmax overflows horizontally on
                <360px viewports once the page padding is subtracted */}
            <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-5 gap-y-4">
              {visible.map((item) => (
                <WireCard key={item.id} item={item} />
              ))}
            </div>
            {filteredTotal > MAX_VISIBLE && (
              <p className="mt-4 font-mono text-[0.625rem] text-paper-500 dark:text-paper-600">
                Showing the {MAX_VISIBLE} strongest of {filteredTotal} signals.
              </p>
            )}
          </>
        )}

        {/* ── Footer note ────────────────────────────────────────── */}
        <p className="mt-8 font-mono text-[0.625rem] leading-relaxed text-paper-500 dark:text-paper-600 max-w-[70ch]">
          Watching 911, Fire&nbsp;/&nbsp;EMS, and 311 across San Francisco's 41 neighborhoods, plus
          citywide trends. "Stands out" compares the last two days to the same stretch in recent
          weeks and a year ago — never on data a department hasn't published yet.{' '}
          <Link to="/about#whats-unusual" className="underline hover:text-terracotta-600 dark:hover:text-terracotta-400">
            How we decide what's unusual
          </Link>
          .
        </p>
      </div>
    </div>
  )
}

function FilterChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex-shrink-0 rounded-full px-3 py-1 pointer-coarse:px-3.5 pointer-coarse:py-2 font-mono text-[0.6875rem] tracking-wide whitespace-nowrap transition-colors ${
        active
          ? 'bg-terracotta-600 text-paper-50 dark:bg-terracotta-500'
          : 'bg-paper-200/50 dark:bg-espresso-800/60 text-paper-700 dark:text-paper-400 hover:bg-paper-200 dark:hover:bg-espresso-800'
      }`}
      aria-pressed={active}
    >
      {label}
    </button>
  )
}

function CardSkeletonGrid() {
  return (
    <div className="grid grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-x-5 gap-y-4 animate-pulse">
      {Array.from({ length: 6 }).map((_, i) => (
        <div key={i} className="rounded-xl border border-paper-200/60 dark:border-espresso-800/70 pl-5 pr-4 py-4">
          <div className="h-4 w-2/3 rounded bg-paper-200 dark:bg-espresso-800 mb-3" />
          <div className="flex items-center gap-3">
            <div className="h-6 w-6 rounded bg-paper-200 dark:bg-espresso-800" />
            <div className="h-9 w-20 rounded bg-paper-200 dark:bg-espresso-800" />
          </div>
        </div>
      ))}
    </div>
  )
}

// `place` set = a filter (often an arriving ?nh= link) excluded everything —
// say so honestly instead of implying the whole city is quiet. null = the
// wire itself is empty.
function EmptyWire({ place, onShowAll }: { place: string | null; onShowAll: () => void }) {
  if (place) {
    const label = place === 'citywide' ? 'citywide' : `in ${place}`
    return (
      <div className="py-16 text-center">
        <p className="font-display text-[clamp(1.25rem,2vw,1.6rem)] text-ink dark:text-paper-100">
          Nothing's standing out {label} right now.
        </p>
        <p className="mt-2 font-serif text-paper-600 dark:text-paper-500">
          Running close to normal — but other parts of the city have signals.
        </p>
        <button
          type="button"
          onClick={onShowAll}
          className="mt-5 rounded-full px-4 py-1.5 font-mono text-[0.6875rem] tracking-wide
                     bg-terracotta-600 text-paper-50 dark:bg-terracotta-500 hover:bg-terracotta-700
                     dark:hover:bg-terracotta-600 transition-colors"
        >
          Show the whole wire
        </button>
      </div>
    )
  }
  return (
    <div className="py-16 text-center">
      <p className="font-display text-[clamp(1.25rem,2vw,1.6rem)] text-ink dark:text-paper-100">
        Nothing's standing out right now.
      </p>
      <p className="mt-2 font-serif text-paper-600 dark:text-paper-500">
        The city's running close to normal across the board — which is its own kind of news.
      </p>
    </div>
  )
}
