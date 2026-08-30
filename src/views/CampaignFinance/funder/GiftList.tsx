// Gift list (spec §4F) — collapsed `<details>` of every itemized gift, newest
// first. `profile.giftList` already carries cash/in-kind rows AND the
// unmatched (pending) late notices as `kind: 'notice'` — matched notices were
// dropped upstream in funderStats (they're the same gift reported early).
// The year filter narrows to the strip's selected year regardless of
// `capped` (unlike Recipients, whose year-derived totals are unavailable
// once the underlying gift rows are capped — this list IS those rows).
import { toSentenceCase } from '@/utils/format'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'
import { apDay } from '@/components/charts/FunderList'
import type { FunderGift } from '@/lib/funders/types'

const KIND_LABEL: Record<FunderGift['kind'], string> = {
  cash: 'cash',
  'in-kind': 'in-kind',
  notice: 'notice',
}

export default function GiftList({ gifts, capped, year }: {
  gifts: FunderGift[]
  capped: boolean
  year: number | null
}) {
  const rows = year === null ? gifts : gifts.filter((g) => g.year === year)
  const yearSuffix = year !== null ? ` in ${year}` : ''
  const summary = capped ? `newest 5,000 gifts${yearSuffix}` : `all ${rows.length} gifts${yearSuffix}`

  return (
    <details className="mt-4 group">
      <summary className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 cursor-pointer select-none hover:text-plum-500 dark:hover:text-plum-400 transition-colors">
        {summary}
      </summary>
      <div className="mt-2 space-y-0.5">
        {rows.map((g) => (
          <div
            key={g.id}
            className="flex justify-between items-baseline gap-2 text-micro py-0.5 border-b border-slate-100/40 dark:border-white/[0.03]"
          >
            <span className="min-w-0 flex-1 flex items-baseline gap-1.5">
              <span className="shrink-0 font-mono text-slate-400 dark:text-slate-500 tabular-nums whitespace-nowrap">
                {apDay(g.date) ?? '—'} {g.year || ''}
              </span>
              <span className="truncate text-slate-600 dark:text-slate-300">{toSentenceCase(g.filerName)}</span>
            </span>
            <span className="shrink-0 flex items-baseline gap-1.5">
              <span className="font-mono text-slate-500 dark:text-slate-400 tabular-nums">{formatCurrency(g.amount)}</span>
              <span
                className={`px-1 rounded text-nano font-mono uppercase tracking-widest ${
                  g.kind === 'notice'
                    ? 'bg-ochre-500/15 text-ochre-500'
                    : 'bg-slate-200/60 dark:bg-white/[0.06] text-slate-500'
                }`}
              >
                {KIND_LABEL[g.kind]}
              </span>
            </span>
          </div>
        ))}
        {rows.length === 0 && (
          <p className="text-micro text-slate-400 dark:text-slate-500 italic mt-1">
            No gifts{yearSuffix}.
          </p>
        )}
      </div>
    </details>
  )
}
