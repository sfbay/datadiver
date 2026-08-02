import { useMemo, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { BuyoutRow } from '@/types/datasets'
import { parseAmount } from '@/views/Housing/buyoutScale'
import { formatDate, formatNumber } from '@/utils/time'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

const BUYOUTS_PREFIX = 'buyouts:'

interface BuyoutDetailPanelProps {
  /** Already-loaded buyout rows (map query) — lookup only, no extra fetch. */
  rows: BuyoutRow[]
  /** True while the buyout query that backs `rows` is still in flight. */
  isLoading: boolean
  /** Amount-missing agreements dated ≥ this read "pending entry" (Rent Board
   *  keys amounts in ~3 months behind); older ones "undisclosed". */
  pendingCutoffIso?: string
}

/**
 * Buyout agreement detail panel. Client-side lookup by case_number from the
 * already-loaded rows — see EvictionDetailPanel for why this diverges from
 * the fetch-on-select CrimeDetailPanel/CaseDetailPanel pattern. A stale deep
 * link renders the shell open but empty (no fetch to retry).
 */
export default function BuyoutDetailPanel({ rows, isLoading, pendingCutoffIso }: BuyoutDetailPanelProps) {
  const { selectedHousingEvent, setSelectedHousingEvent } = useAppStore()

  const caseId = selectedHousingEvent?.startsWith(BUYOUTS_PREFIX)
    ? selectedHousingEvent.slice(BUYOUTS_PREFIX.length)
    : null

  const record = useMemo(
    () => (caseId ? rows.find((r) => r.case_number === caseId) ?? null : null),
    [rows, caseId]
  )

  const onClose = useCallback(() => setSelectedHousingEvent(null), [setSelectedHousingEvent])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedHousingEvent) url.searchParams.set('detail', selectedHousingEvent)
    return url.toString()
  }, [selectedHousingEvent])

  const amount = record ? parseAmount(record.buyout_amount) : null
  const amountPending = amount == null && pendingCutoffIso != null
    && (record?.buyout_agreement_date ?? '') >= pendingCutoffIso
  const amountStr = amount != null
    ? `$${formatNumber(Math.round(amount))}`
    : (amountPending ? 'Amount pending entry' : 'Amount undisclosed')
  const tenantCount = record?.number_of_tenants ? parseInt(record.number_of_tenants, 10) : null

  return (
    <DetailPanelShell
      open={!!caseId}
      onClose={onClose}
      isLoading={!record && isLoading}
      spinnerClass="border-ochre-400"
      widthClass="w-80"
      mobileCompact
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-ochre-500"
      glowColor="#d4a435"
    >
      {record && (
        <>
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Buyout Agreement
          </p>
          <p className="text-sm font-semibold text-ink dark:text-white mb-0.5">
            {record.buyout_agreement_date ? formatDate(record.buyout_agreement_date, 'long') : 'Date unknown'}
          </p>
          <p className="text-micro text-slate-600 dark:text-slate-300 font-mono mb-3">
            {record.address || 'Address unavailable'}
          </p>

          <div className="mb-3">
            <span className="inline-flex items-center gap-1 text-sm font-bold font-mono px-2 py-0.5 rounded-full bg-ochre-500/10 text-ochre-500">
              {amountStr}
            </span>
          </div>

          <div className="space-y-1.5">
            {tenantCount != null && (
              <div className="flex items-baseline justify-between">
                <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Tenants</p>
                <p className="text-micro text-slate-700 dark:text-slate-300">{tenantCount}</p>
              </div>
            )}
            {record.pre_buyout_disclosure_declaration_date && (
              <div className="flex items-baseline justify-between">
                <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Declaration Date</p>
                <p className="text-micro text-slate-700 dark:text-slate-300">
                  {formatDate(record.pre_buyout_disclosure_declaration_date, 'long')}
                </p>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">District</p>
              <p className="text-micro text-slate-700 dark:text-slate-300">
                {record.supervisor_district ? `District ${record.supervisor_district}` : 'Unknown'}
              </p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Neighborhood</p>
              <p className="text-micro text-slate-700 dark:text-slate-300">{record.analysis_neighborhood || 'Unknown'}</p>
            </div>
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
