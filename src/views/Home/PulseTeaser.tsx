// src/views/Home/PulseTeaser.tsx
//
// A compact, findings-first preview of The Pulse for Home — the ticket-stub
// card's BODY (feed-coloured glyph + big-number anchor + deviation bar), minus
// the stub, since every teaser entry is citywide (no neighborhood to name).
// Same visual language as /pulse, sized to a 3-up strip that drives into the
// full wire.
//
// PRESENTATIONAL ONLY — fed by Home's EXISTING useCivicIndicators result (the
// data the ticker already fetched), so it adds ZERO network. It does not call
// useCivicIndicators itself: that hook isn't single-flighted, so a second
// consumer would double the ~10 indicator queries on cold load (see
// feedback_frontpage_load_perf). Neighborhood-level anomalies only render on
// the dedicated /pulse view (which loads the 48h window); the teaser stays free.

import { Link } from 'react-router-dom'
import { useMemo } from 'react'
import type { TickerItem } from '@/types/ticker'
import { tickerToWireItem, rankWire, type WireItem } from '@/lib/pulse/pulsePhrase'
import SignalGlyph from '@/views/Pulse/SignalGlyph'
import DeviationBar from '@/views/Pulse/DeviationBar'

const TEASER_COUNT = 3

export default function PulseTeaser({ items, isLoading }: { items: TickerItem[]; isLoading: boolean }) {
  const wire = useMemo(() => {
    const written = items
      .map(tickerToWireItem)
      .filter((w): w is NonNullable<typeof w> => w !== null)
    return rankWire(written).slice(0, TEASER_COUNT)
  }, [items])

  if (!isLoading && wire.length === 0) return null

  return (
    <section aria-label="The Pulse — trending now in San Francisco">
      <div className="flex items-baseline justify-between gap-4 mb-3">
        <p className="font-mono text-label tracking-[0.25em] uppercase text-terracotta-600 dark:text-terracotta-400">
          <span className="text-paper-600">──</span> The Pulse
        </p>
        <Link
          to="/pulse"
          className="font-mono text-label tracking-wide text-paper-600 dark:text-paper-400
                     hover:text-terracotta-600 dark:hover:text-terracotta-400 transition-colors whitespace-nowrap"
        >
          See everything trending →
        </Link>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3 animate-pulse">
          {Array.from({ length: TEASER_COUNT }).map((_, i) => (
            <div key={i} className="h-[110px] rounded-xl border border-paper-200/60 dark:border-espresso-800/70" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-[repeat(auto-fit,minmax(240px,1fr))] gap-3">
          {wire.map((item) => (
            <MiniCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </section>
  )
}

function MiniCard({ item }: { item: WireItem }) {
  const color = item.pigment ?? '#8a7050'
  return (
    <Link
      to={item.evidenceHref}
      aria-label={`${item.bigValue} ${item.signalLabel}. Open the records.`}
      className="group block rounded-xl px-3.5 py-3
                 border border-paper-200/70 dark:border-espresso-800
                 bg-paper-100 dark:bg-espresso-900
                 hover:border-paper-300 dark:hover:border-espresso-700 transition-colors"
    >
      <div className="flex items-start justify-between gap-2 mb-1">
        <h3 className="font-display text-[15px] leading-tight tracking-tight text-ink dark:text-paper-100">
          {item.subject}
        </h3>
        <span className="flex-shrink-0 font-mono text-[8.5px] tracking-[0.18em] uppercase text-paper-500 dark:text-paper-600 pt-0.5">
          {item.kind === 'incident' ? 'Live' : 'Citywide'}
        </span>
      </div>
      <div className="flex items-center gap-2">
        <SignalGlyph type={item.signalType} magnitude={item.magnitude} size={18} color={color} />
        {/* Feed-coloured big number — matches WireCard so Home and /pulse
            read as one voice. */}
        <span
          className="font-display italic text-[26px] leading-[0.85] tabular-nums"
          style={{ color }}
        >
          {item.bigValue}
        </span>
      </div>
      {item.ratio !== undefined && <DeviationBar ratio={item.ratio} color={color} />}
      <p className="mt-1 font-mono text-[9.5px] leading-tight text-paper-600 dark:text-paper-500">
        <span className="text-paper-500 dark:text-paper-600">{item.context}</span>
        {item.factLine && <> · {item.factLine}</>}
      </p>
    </Link>
  )
}
