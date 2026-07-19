// src/views/Last48/modes/AnomalyRail.tsx
//
// Right-rail ranked list for the anomaly choropleth. Always shows the top-N
// neighborhoods by |combined z|, even when none clear the notable
// threshold — so a reader can SEE what was checked and what the
// closest-to-anomaly values actually are. A dashed divider marks
// the notable threshold; rows above "stand out," rows below are
// ordinary fluctuation.
//
// Speaks the wire's language (roadmap item 6, PR 2): direction + magnitude
// via SignalGlyph chevrons and tier words from pulsePhrase.combinedDeviation
// — never a raw σ. A Stouffer-combined score has no single count/baseline
// behind it, so rows phrase deviation in words; the concrete numbers live in
// the peek's per-stream breakdown.

import { Link } from 'react-router-dom'
import MapSidebar from '@/components/layout/MapSidebar'
import { combinedDeviation, NEAR_USUAL_Z } from '@/lib/pulse/pulsePhrase'
import SignalGlyph, { signalColor } from '@/views/Pulse/SignalGlyph'

interface Props {
  /** Combined per-neighborhood z-score (Stouffer-combined across selected datasets) */
  combinedAnomalies: Record<string, number>
  selectedNeighborhood?: string
  onSelect: (neighborhood: string) => void
}

export default function AnomalyRail({ combinedAnomalies, selectedNeighborhood, onSelect }: Props) {
  // Sort everything we have by absolute z; always show at least top-12
  // even when below threshold, so the reader can verify what was checked.
  const allSorted = Object.entries(combinedAnomalies)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))

  const notable = allSorted.filter(([, z]) => Math.abs(z) >= NEAR_USUAL_Z)
  // If we have plenty of notable, render those (max 30); otherwise
  // pad with closest-to-threshold so the rail isn't empty.
  const TARGET_VISIBLE = 12
  const visible = notable.length >= TARGET_VISIBLE
    ? notable.slice(0, 30)
    : allSorted.slice(0, Math.max(TARGET_VISIBLE, notable.length))

  const checkedCount = allSorted.length

  return (
    <MapSidebar
      width="lean"
      scrollContainerProps={{ className: 'px-2 py-2 flex flex-col gap-1' }}
    >
      <div className="sticky top-0 z-10 px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-transparent flex-shrink-0 bg-paper-50/95 dark:bg-espresso-950/95 backdrop-blur-sm">
        <h2 className="font-mono text-micro tracking-widest text-paper-600 dark:text-paper-500">
          STANDS OUT
        </h2>
        <p className="font-mono text-nano text-paper-500 dark:text-paper-600 mt-0.5">
          vs a typical 48h · recent weeks
        </p>
        <p className="font-mono text-nano text-paper-500 dark:text-paper-600 mt-0.5">
          {notable.length > 0
            ? `${notable.length} stand out · ${checkedCount} checked`
            : `0 stand out · ${checkedCount} checked`}
        </p>
      </div>

      {visible.length === 0 && (
        <div className="text-paper-500 dark:text-paper-600 text-center italic py-6 text-micro">
          baseline still loading…
        </div>
      )}

      {visible.flatMap(([nh, z], idx) => {
        const isSel = nh === selectedNeighborhood
        const dev = combinedDeviation(z)
        const isNotable = !dev.near
        const prevWasNotable =
          idx === 0 ? true : Math.abs(visible[idx - 1][1]) >= NEAR_USUAL_Z
        const showDivider = !isNotable && prevWasNotable && notable.length > 0
        const color = dev.near ? '#7a5f42' : signalColor(dev.signalType, dev.magnitude)

        const row = (
          <button
            key={`row-${nh}`}
            type="button"
            onClick={() => onSelect(nh)}
            aria-label={`${nh}, ${dev.spoken}`}
            className={`
              text-left px-2 py-1.5 rounded font-mono text-micro flex items-center justify-between gap-2
              ${isSel
                ? 'bg-ochre-500/20 ring-1 ring-ochre-500'
                : 'hover:bg-paper-200/40 dark:hover:bg-espresso-800/60'}
              ${!isNotable ? 'opacity-60' : ''}
            `}
            aria-pressed={isSel}
          >
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span className="text-paper-500 dark:text-paper-600 tabular-nums">{idx + 1}·</span>
              <span className="text-paper-800 dark:text-paper-300 truncate">{nh}</span>
            </span>
            <span className="flex items-center gap-1 flex-shrink-0" aria-hidden>
              {!dev.near && (
                <SignalGlyph type={dev.signalType} magnitude={dev.magnitude} size={12} color={color} />
              )}
              <span className="text-nano" style={{ color }}>
                {dev.short}
              </span>
            </span>
          </button>
        )

        if (!showDivider) return [row]

        return [
          <div
            key="threshold-divider"
            className="my-1 flex items-center gap-2 text-paper-500 dark:text-paper-600"
          >
            <span className="flex-1 border-t border-dashed border-paper-300 dark:border-espresso-700" />
            <span className="font-mono text-[8px] tracking-widest uppercase">
              ordinary fluctuation
            </span>
            <span className="flex-1 border-t border-dashed border-paper-300 dark:border-espresso-700" />
          </div>,
          row,
        ]
      })}

      {/* Methodology footer — flex-shrink-0 so it stays pinned at the bottom.
          Dejargoned: the full machinery (thresholds, σ) is named on the one
          page allowed to — /about#whats-unusual. */}
      <div className="sticky bottom-0 z-10 px-3 py-2 border-t border-paper-200/40 dark:border-transparent flex-shrink-0 bg-paper-50/95 dark:bg-espresso-950/95 backdrop-blur-sm font-mono text-[8px] leading-snug text-paper-500 dark:text-paper-600">
        Compares this 48h with 42 typical two-day stretches over the trailing
        12 weeks, combined across streams. Full method:{' '}
        <Link to="/about#whats-unusual" className="underline decoration-dotted hover:text-paper-700 dark:hover:text-paper-400">
          how we decide what’s unusual
        </Link>.
      </div>
    </MapSidebar>
  )
}
