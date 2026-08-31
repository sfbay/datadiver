// The "What's moving" strip, rendered twice: once over crime buckets and once
// over enforcement. Same idiom, deliberately separate rankings — mixing an
// arrest-generated number into a crime headline is the error this whole
// design exists to avoid.
import type { Mover } from './subcategoryMovers'

function signed(pct: number): string {
  const n = Math.round(pct)
  return `${n > 0 ? '+' : ''}${n}%`
}

export default function SubcategoryStrip({
  eyebrow, movers, comparisonLabel, compared, selectedSubs, onSelect, emptyNote,
}: {
  eyebrow: string
  movers: Mover[]
  comparisonLabel: string
  /** False = no usable comparison window. Say so; never show thin numbers. */
  compared: boolean
  selectedSubs: Set<string>
  onSelect: (keys: string[]) => void
  emptyNote: string
}) {
  return (
    <div className="mb-4">
      <div className="flex items-baseline gap-2 mb-2">
        <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
          {eyebrow}
        </p>
        <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
        {compared && comparisonLabel && (
          <span className="text-nano font-mono text-slate-400 dark:text-slate-500 shrink-0">
            {comparisonLabel}
          </span>
        )}
      </div>

      {!compared || movers.length === 0 ? (
        <p className="text-micro text-slate-400 dark:text-slate-500 italic leading-snug">
          {emptyNote}
        </p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {movers.map((m) => {
              const on = m.keys.every((k) => selectedSubs.has(k))
              return (
                <button
                  key={m.key}
                  onClick={() => onSelect(m.keys)}
                  title={[
                    m.note,
                    `${m.current.toLocaleString()} now · ${m.prior.toLocaleString()} in the comparison window`,
                    m.subcategory,
                  ].filter(Boolean).join('\n')}
                  className={`flex items-baseline gap-1.5 px-2 py-1 rounded-md text-micro transition-all duration-150 cursor-pointer ${
                    on
                      ? 'bg-brick-500/15 text-brick-600 dark:text-brick-400 ring-1 ring-brick-500/30'
                      : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
                  }`}
                >
                  <span className="truncate max-w-[9rem]">{m.label}</span>
                  <span className="font-mono tabular-nums text-brick-500 dark:text-brick-400">
                    {signed(m.delta)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className="mt-1.5 text-nano text-slate-400 dark:text-slate-500 leading-snug">
            Ranked by change, on buckets with 150+ incidents in both windows.
            Record-keeping categories are excluded.
          </p>
        </>
      )}
    </div>
  )
}
