// Filed as (spec §4E) — one row per `variants` group: the same folded name
// filed at a different address/employer/ZIP combination. Unconditional: even
// when the common-name guard trips (§2), every filed variant still lists here
// — the guard only adds the masthead warning + ZIP narrowing chips, it never
// hides a row in this table. Sorted by dollars, muted register throughout.
import { toSentenceCase } from '@/utils/format'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'
import type { FunderVariant } from '@/lib/funders/types'

/** "occupation, employer" — sentence-cased, skipping blank/'NONE' fields
 *  (transaction_occupation/employer routinely arrive as literal "NONE"). */
function jobLine(v: FunderVariant): string | null {
  const parts = [v.occupation, v.employer]
    .map((s) => s?.trim())
    .filter((s): s is string => !!s && s.toUpperCase() !== 'NONE')
    .map(toSentenceCase)
  return parts.length ? parts.join(', ') : null
}

export default function FiledAs({ variants }: { variants: FunderVariant[] }) {
  if (variants.length === 0) return null
  const rows = [...variants].sort((a, b) => b.total - a.total)

  return (
    <div className="mt-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400 dark:text-slate-500 mb-2">
        ── Filed as
      </p>
      <div className="overflow-x-auto">
        <table className="w-full text-micro font-mono">
          <thead>
            <tr className="text-slate-400 dark:text-slate-500 border-b border-slate-200/50 dark:border-white/[0.06]">
              <th className="text-left py-1 pr-2 font-medium">Name</th>
              <th className="text-left py-1 pr-2 font-medium">City</th>
              <th className="text-left py-1 pr-2 font-medium">Occupation, employer</th>
              <th className="text-right py-1 pr-2 font-medium">Gifts</th>
              <th className="text-right py-1 font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((v, i) => {
              const name = toSentenceCase([v.first, v.last].filter(Boolean).join(' ')) || '—'
              const zip = (v.zip ?? '').slice(0, 5)
              const place = [v.city ? toSentenceCase(v.city) : null, zip].filter(Boolean).join(' ')
              const job = jobLine(v)
              return (
                <tr key={i} className="border-b border-slate-100/50 dark:border-white/[0.03]">
                  <td className="py-1 pr-2 text-slate-600 dark:text-slate-300 truncate max-w-[6.5rem]" title={name}>
                    {name}
                  </td>
                  <td className="py-1 pr-2 text-slate-400 dark:text-slate-500 truncate max-w-[5.5rem]" title={place || undefined}>
                    {place || '—'}
                  </td>
                  <td className="py-1 pr-2 text-slate-400 dark:text-slate-500 truncate max-w-[6.5rem]" title={job ?? undefined}>
                    {job ?? '—'}
                  </td>
                  <td className="py-1 pr-2 text-right text-slate-500 dark:text-slate-400 tabular-nums">{v.gifts}</td>
                  <td className="py-1 text-right text-ink dark:text-white tabular-nums">{formatCurrency(v.total)}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}
