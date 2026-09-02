// The "What's moving" strip, rendered twice: once over crime buckets and once
// over enforcement. Same idiom, deliberately separate rankings — mixing an
// arrest-generated number into a crime headline is the error this whole
// design exists to avoid.
//
// Two registers. 'sidebar' (default) reads on the cream/espresso sidebar
// surfaces and is byte-identical to the strip as first shipped; 'panel' reads
// on the pill bar's theme-invariant dark dropdown (bg-slate-900/95 in BOTH
// themes, so `dark:` variants would never fire in light mode and the default
// classes would print slate-500 text on near-black).
import { formatMoverDelta, type Mover } from './subcategoryMovers'
import { Skeleton } from '@/components/ui/Skeleton'

// Chip-shaped placeholders — same row height/gap as the real chips — for the
// window while both aggregate queries are still in flight. Loading is its
// own state, distinct from "queried and found nothing to rank": showing the
// muted sentence before the data exists would state a conclusion early.
const SKELETON_WIDTHS = ['5.5rem', '6.5rem', '4.5rem']

function ChipsSkeleton() {
  return (
    <div className="flex flex-wrap gap-1.5">
      {SKELETON_WIDTHS.map((w, i) => (
        <Skeleton key={i} className="h-6" style={{ width: w }} />
      ))}
    </div>
  )
}

export type StripRegister = 'sidebar' | 'panel'

export default function SubcategoryStrip({
  eyebrow, movers, comparisonLabel, compared, selectedSubs, onSelect, emptyNote, isLoading,
  register = 'sidebar',
}: {
  eyebrow: string
  movers: Mover[]
  comparisonLabel: string
  /** False = no usable comparison window. Say so; never show thin numbers. */
  compared: boolean
  selectedSubs: Set<string>
  onSelect: (keys: string[]) => void
  emptyNote: string
  /** True while either the current or comparison aggregate is still in
   *  flight. A state that is both loading and uncompared renders as loading
   *  — `compared` starts false before either query returns, so it can never
   *  be trusted to mean "queried and found nothing" until loading clears. */
  isLoading: boolean
  /** Surface the strip sits on. 'panel' = the always-dark pill-bar dropdown;
   *  it drops the outer margin (the panel spaces its blocks itself). */
  register?: StripRegister
}) {
  const panel = register === 'panel'
  const eyebrowCls = panel ? 'text-slate-500' : 'text-slate-400/60 dark:text-slate-600'
  const ruleCls = panel ? 'bg-white/[0.06]' : 'bg-slate-200/50 dark:bg-white/[0.04]'
  const mutedCls = panel ? 'text-slate-500' : 'text-slate-400 dark:text-slate-500'
  const chipOnCls = panel
    ? 'bg-brick-500/15 text-brick-400 ring-1 ring-brick-500/30'
    : 'bg-brick-500/15 text-brick-600 dark:text-brick-400 ring-1 ring-brick-500/30'
  const chipOffCls = panel
    ? 'bg-white/[0.04] text-slate-300 hover:bg-white/[0.08]'
    : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-white/[0.08]'
  const deltaCls = panel ? 'text-brick-400' : 'text-brick-500 dark:text-brick-400'

  return (
    <div className={panel ? '' : 'mb-4'}>
      <div className="flex items-baseline gap-2 mb-2">
        <p className={`text-nano font-mono uppercase tracking-[0.2em] ${eyebrowCls}`}>
          {eyebrow}
        </p>
        <div className={`flex-1 h-[1px] ${ruleCls}`} />
        {!isLoading && compared && comparisonLabel && (
          <span className={`text-nano font-mono ${mutedCls} shrink-0`}>
            {comparisonLabel}
          </span>
        )}
      </div>

      {isLoading ? (
        <ChipsSkeleton />
      ) : !compared || movers.length === 0 ? (
        <p className={`text-micro ${mutedCls} italic leading-snug`}>
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
                    on ? chipOnCls : chipOffCls
                  }`}
                >
                  <span className="truncate max-w-[9rem]">{m.label}</span>
                  <span className={`font-mono tabular-nums ${deltaCls}`}>
                    {formatMoverDelta(m.delta)}
                  </span>
                </button>
              )
            })}
          </div>
          <p className={`mt-1.5 text-nano ${mutedCls} leading-snug`}>
            Ranked by change, on buckets with 150+ incidents in both windows.
            Record-keeping categories are excluded.
          </p>
        </>
      )}
    </div>
  )
}
