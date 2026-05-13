// src/views/Last48/modes/AnomalyRail.tsx
//
// Right-rail ranked list for HOTSPOTS mode. Shows the top-30
// neighborhoods by |z-score| with their σ value, color-coded by
// magnitude. Click a row → handler flies the map / opens peek.

function zColor(z: number): string {
  if (z >= 2)   return '#963e30'  // brick — strong above
  if (z >= 1)   return '#d47149'  // terracotta
  if (z >= 0.5) return '#d4a435'  // ochre
  if (z <= -0.5) return '#a8926a' // paper — unusually quiet
  return '#7a5f42'                 // muted — normal
}

interface Props {
  /** Combined per-neighborhood z-score (averaged across selected datasets) */
  combinedAnomalies: Record<string, number>
  selectedNeighborhood?: string
  onSelect: (neighborhood: string) => void
}

export default function AnomalyRail({ combinedAnomalies, selectedNeighborhood, onSelect }: Props) {
  const entries = Object.entries(combinedAnomalies)
    .filter(([, z]) => Math.abs(z) >= 0.5)
    .sort(([, a], [, b]) => Math.abs(b) - Math.abs(a))
    .slice(0, 30)

  return (
    <aside className="w-[clamp(180px,16vw,260px)] border-l border-paper-200/40 dark:border-espresso-700 bg-paper-50/40 dark:bg-espresso-950/60 flex flex-col">
      <div className="px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800">
        <h2 className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          STANDS OUT
        </h2>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5">
          vs typical 48h window · 12-week baseline
        </p>
      </div>

      <div className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
        {entries.map(([nh, z], idx) => {
          const isSel = nh === selectedNeighborhood
          return (
            <button
              key={nh}
              type="button"
              onClick={() => onSelect(nh)}
              className={`
                text-left px-2 py-1.5 rounded font-mono text-[10px] flex items-center justify-between gap-2
                ${isSel
                  ? 'bg-ochre-500/20 ring-1 ring-ochre-500'
                  : 'hover:bg-paper-200/40 dark:hover:bg-espresso-800/60'}
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
        })}
        {entries.length === 0 && (
          <div className="text-paper-500 dark:text-paper-600 text-center italic py-6">
            no notable anomalies right now
          </div>
        )}
      </div>
    </aside>
  )
}
