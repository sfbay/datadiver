// src/views/Last48/modes/AnomalyRail.tsx
//
// Right-rail ranked list for HOTSPOTS mode. Always shows the top-N
// neighborhoods by |z-score|, even when none clear the notable
// threshold — so a reader can SEE what was checked and what the
// closest-to-anomaly values actually are. A dashed divider marks
// the |σ| ≥ 0.5 threshold; rows above are "notable," rows below
// are "ordinary fluctuation."

import MapSidebar from '@/components/layout/MapSidebar'

function zColor(z: number): string {
  if (z >= 2)   return '#963e30'  // brick — strong above
  if (z >= 1)   return '#d47149'  // terracotta
  if (z >= 0.5) return '#d4a435'  // ochre
  if (z <= -0.5) return '#a8926a' // paper — unusually quiet
  return '#7a5f42'                 // muted — normal
}

const NOTABLE_THRESHOLD = 0.5

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

  const notable = allSorted.filter(([, z]) => Math.abs(z) >= NOTABLE_THRESHOLD)
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
      <div className="sticky top-0 z-10 px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800 flex-shrink-0 bg-paper-50/95 dark:bg-espresso-950/95 backdrop-blur-sm">
        <h2 className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          STANDS OUT
        </h2>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5">
          vs typical 48h window · 12-week baseline
        </p>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5">
          {notable.length > 0
            ? `${notable.length} notable · ${checkedCount} checked`
            : `0 notable · ${checkedCount} checked`}
        </p>
      </div>

      {visible.length === 0 && (
        <div className="text-paper-500 dark:text-paper-600 text-center italic py-6 text-[10px]">
          baseline still loading…
        </div>
      )}

      {visible.flatMap(([nh, z], idx) => {
        const isSel = nh === selectedNeighborhood
        const isNotable = Math.abs(z) >= NOTABLE_THRESHOLD
        const prevWasNotable =
          idx === 0 ? true : Math.abs(visible[idx - 1][1]) >= NOTABLE_THRESHOLD
        const showDivider = !isNotable && prevWasNotable && notable.length > 0

        const row = (
          <button
            key={`row-${nh}`}
            type="button"
            onClick={() => onSelect(nh)}
            className={`
              text-left px-2 py-1.5 rounded font-mono text-[10px] flex items-center justify-between gap-2
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
            <span className="tabular-nums" style={{ color: zColor(z) }}>
              {z >= 0 ? '+' : ''}{z.toFixed(1)}σ
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
              below notable (|σ| &lt; {NOTABLE_THRESHOLD})
            </span>
            <span className="flex-1 border-t border-dashed border-paper-300 dark:border-espresso-700" />
          </div>,
          row,
        ]
      })}

      {/* Methodology footer — flex-shrink-0 so it stays pinned at the bottom */}
      <div className="sticky bottom-0 z-10 px-3 py-2 border-t border-paper-200/40 dark:border-espresso-800 flex-shrink-0 bg-paper-50/95 dark:bg-espresso-950/95 backdrop-blur-sm font-mono text-[8px] leading-snug text-paper-500 dark:text-paper-600">
        Compares this 48h to 42 typical 48h windows over the trailing 12 weeks
        (per neighborhood per dataset, combined across streams). Threshold for
        "notable": |σ| ≥ {NOTABLE_THRESHOLD}.
      </div>
    </MapSidebar>
  )
}
