import type { CampaignIERow, CampaignDonorRow } from '@/types/datasets'
import { formatCurrency } from './TopRecipientsChart'

/** Convert ALL-CAPS names to Sentence Case (e.g., "GOLDMAN" → "Goldman") */
function toSentenceCase(name: string): string {
  if (!name) return name
  return name.replace(/\b([A-Z])([A-Z]+)\b/g, (_, first, rest) =>
    first + rest.toLowerCase()
  )
}

interface Props {
  supportTotal: number
  opposeTotal: number
  directContribTotal: number
  topDonors: CampaignDonorRow[]
  ieSupport: CampaignIERow[]
  ieOppose: CampaignIERow[]
}

function MiniBar({ value, max, color }: { value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0
  return (
    <div className="w-full h-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-sm overflow-hidden">
      <div className="h-full rounded-sm" style={{ width: `${pct}%`, backgroundColor: color, opacity: 0.7 }} />
    </div>
  )
}

export default function ForAgainstSplit({
  supportTotal, opposeTotal, directContribTotal,
  topDonors, ieSupport, ieOppose,
}: Props) {
  const supportFunders = [
    ...topDonors.map(d => ({ name: toSentenceCase(d.transaction_last_name), amount: parseFloat(d.total) || 0 })),
    ...ieSupport.map(d => ({ name: `IE: ${toSentenceCase(d.filer_name)}`, amount: parseFloat(d.total) || 0 })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 7)

  const opposeFunders = ieOppose.map(d => ({
    name: toSentenceCase(d.filer_name),
    amount: parseFloat(d.total) || 0,
  })).slice(0, 7)

  const maxFunderAmount = Math.max(
    ...supportFunders.map(f => f.amount),
    ...opposeFunders.map(f => f.amount),
    1
  )

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Support side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-emerald-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-emerald-400 text-sm font-semibold">SUPPORT</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(directContribTotal + supportTotal)}
        </p>
        {directContribTotal > 0 && (
          <p className="text-[10px] text-slate-500 dark:text-slate-400 mb-1">
            {formatCurrency(directContribTotal)} direct + {formatCurrency(supportTotal)} IE
          </p>
        )}

        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-2 mt-4">
          Top Funders
        </p>
        <div className="space-y-1.5">
          {supportFunders.map((f, i) => (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[60%]">{f.name}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">{formatCurrency(f.amount)}</span>
              </div>
              <MiniBar value={f.amount} max={maxFunderAmount} color="#10b981" />
            </div>
          ))}
          {supportFunders.length === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No direct contributions found</p>
          )}
        </div>
      </div>

      {/* Oppose side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-red-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-red-400 text-sm font-semibold">OPPOSE</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(opposeTotal)}
        </p>

        <p className="text-[9px] font-mono uppercase tracking-[0.15em] text-slate-400 dark:text-slate-500 mb-2 mt-4">
          Top Funders
        </p>
        <div className="space-y-1.5">
          {opposeFunders.map((f, i) => (
            <div key={i}>
              <div className="flex justify-between text-[10px] mb-0.5">
                <span className="text-slate-600 dark:text-slate-300 truncate max-w-[60%]">{f.name}</span>
                <span className="font-mono text-slate-500 dark:text-slate-400">{formatCurrency(f.amount)}</span>
              </div>
              <MiniBar value={f.amount} max={maxFunderAmount} color="#ef4444" />
            </div>
          ))}
          {opposeFunders.length === 0 && (
            <p className="text-[10px] text-slate-400 dark:text-slate-500 italic">No opposing expenditures on record</p>
          )}
        </div>
      </div>
    </div>
  )
}
