import type { LateFilingsResult } from '@/hooks/useLateFilings'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'

/**
 * Oakland-only view-level surface for the dedicated late-window FPPC sets
 * (496 independent expenditures w/ support/oppose, 497 late contributions).
 * Renders only when the city's ledger has lateIEScope === 'view'.
 */
export default function LateFilingsSection({ data }: { data: LateFilingsResult }) {
  if (data.targets === null) return null
  const top = data.targets.filter((t) => t.kind !== 'unattributed').slice(0, 5)
  const maxTotal = Math.max(...top.map((t) => t.support + t.oppose), 1)

  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
        Late Filings — Independent Expenditures
      </p>
      <p className="text-micro text-slate-400 dark:text-slate-500 mb-3">
        Money disclosed in the late-filing windows before an election (FPPC 496/497) — not the full ledger.
      </p>

      {top.length === 0 && !data.isLoading && (
        <p className="text-micro text-slate-500">No late independent expenditures in this cycle.</p>
      )}

      <div className="space-y-2">
        {top.map((t) => {
          const total = t.support + t.oppose
          return (
            <div key={t.target}>
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-label text-slate-700 dark:text-slate-200 font-medium truncate max-w-[70%]">
                  {t.target}
                  <span className="text-nano font-mono text-slate-400 ml-1.5 uppercase">{t.kind}</span>
                </span>
                <span className="text-micro font-mono text-slate-400">{formatCurrency(total)}</span>
              </div>
              <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-200/50 dark:bg-slate-800/50">
                <div className="h-full" style={{ width: `${(t.support / maxTotal) * 100}%`, backgroundColor: '#7a9954' }} />
                <div className="h-full" style={{ width: `${(t.oppose / maxTotal) * 100}%`, backgroundColor: '#963e30' }} />
              </div>
              <div className="flex justify-between text-nano font-mono mt-0.5">
                <span className="text-moss-500">for {formatCurrency(t.support)}</span>
                {t.oppose > 0 && <span className="text-brick-500">against {formatCurrency(t.oppose)}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {data.lateContribCount > 0 && (
        <p className="text-micro font-mono text-slate-500 mt-3">
          Late contributions (497): {formatCurrency(data.lateContribTotal)} across {data.lateContribCount.toLocaleString()} filings
        </p>
      )}
      {data.nullDateCount > 0 && (
        <p className="text-nano text-slate-400/70 dark:text-slate-600 mt-2">
          Note: {data.nullDateCount.toLocaleString()} campaign payments totaling {formatCurrency(data.nullDateTotal)} carry
          no date in the source data and are excluded from all date-filtered figures on this page.
        </p>
      )}
    </div>
  )
}
