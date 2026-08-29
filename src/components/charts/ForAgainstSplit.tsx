import type { CampaignIERow, CampaignDonorRow } from '@/types/datasets'
import { formatCurrency } from './TopRecipientsChart'
import { toSentenceCase } from '@/utils/format'
import FunderList, { funderFromDonorRow, type Funder } from './FunderList'

interface Props {
  supportTotal: number
  opposeTotal: number
  directContribTotal: number
  topDonors: CampaignDonorRow[]
  ieSupport: CampaignIERow[]
  ieOppose: CampaignIERow[]
}

export default function ForAgainstSplit({
  supportTotal, opposeTotal, directContribTotal,
  topDonors, ieSupport, ieOppose,
}: Props) {
  const supportFunders: Funder[] = [
    ...topDonors.map(funderFromDonorRow),
    ...ieSupport.map((d, i): Funder => ({ key: `ie|${d.filer_name}|${i}`, name: toSentenceCase(d.filer_name), chip: 'IE', amount: parseFloat(d.total) || 0 })),
  ].sort((a, b) => b.amount - a.amount).slice(0, 7)

  const opposeFunders: Funder[] = ieOppose.map((d, i): Funder => ({
    key: `ie|${d.filer_name}|${i}`, name: toSentenceCase(d.filer_name), chip: 'IE', amount: parseFloat(d.total) || 0,
  })).slice(0, 7)

  const maxFunderAmount = Math.max(...supportFunders.map(f => f.amount), ...opposeFunders.map(f => f.amount), 1)

  return (
    <div className="grid grid-cols-2 gap-4">
      {/* Support side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-moss-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-moss-400 text-sm font-semibold">SUPPORT</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(directContribTotal + supportTotal)}
        </p>
        {directContribTotal > 0 && (
          <p className="text-micro text-slate-500 dark:text-slate-400 mb-1">
            {formatCurrency(directContribTotal)} direct + {formatCurrency(supportTotal)} IE
          </p>
        )}

        <FunderList label="Top Funders" funders={supportFunders} max={maxFunderAmount} color="#7a9954" emptyText="No direct contributions found" />
      </div>

      {/* Oppose side */}
      <div className="glass-card rounded-xl p-4 border-l-2 border-brick-500/50">
        <div className="flex items-center gap-2 mb-3">
          <span className="text-brick-400 text-sm font-semibold">OPPOSE</span>
        </div>
        <p className="font-mono text-lg text-ink dark:text-white mb-4">
          {formatCurrency(opposeTotal)}
        </p>

        <FunderList label="Top Funders" funders={opposeFunders} max={maxFunderAmount} color="#b85545" emptyText="No opposing expenditures on record" />
      </div>
    </div>
  )
}
