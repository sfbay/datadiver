import { useMemo, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import type { EvictionNoticeRow } from '@/types/datasets'
import { ALL_CAUSES, CAUSE_LABELS } from '@/views/Housing/causes'
import { formatDate } from '@/utils/time'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

const EVICTIONS_PREFIX = 'evictions:'

interface EvictionDetailPanelProps {
  /** Already-loaded eviction rows (map query) — lookup only, no extra fetch. */
  rows: EvictionNoticeRow[]
  /** True while the eviction query that backs `rows` is still in flight. */
  isLoading: boolean
}

/**
 * Eviction notice detail panel. Unlike CrimeDetailPanel/CaseDetailPanel (which
 * fetch the single record by id), Housing's map queries already load the full
 * row set (5000-row cap covers the eviction dataset comfortably per date
 * range), so this panel looks the selected row up client-side. A stale deep
 * link (id beyond the loaded set, or scoped out by an active cause/date
 * filter) renders the shell open with no content — same "blank card, just
 * the close button" idiom CrimeDetailPanel falls into on a 0-result fetch.
 */
export default function EvictionDetailPanel({ rows, isLoading }: EvictionDetailPanelProps) {
  const { selectedHousingEvent, setSelectedHousingEvent } = useAppStore()

  const evictionId = selectedHousingEvent?.startsWith(EVICTIONS_PREFIX)
    ? selectedHousingEvent.slice(EVICTIONS_PREFIX.length)
    : null

  const record = useMemo(
    () => (evictionId ? rows.find((r) => r.eviction_id === evictionId) ?? null : null),
    [rows, evictionId]
  )

  const onClose = useCallback(() => setSelectedHousingEvent(null), [setSelectedHousingEvent])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedHousingEvent) url.searchParams.set('detail', selectedHousingEvent)
    return url.toString()
  }, [selectedHousingEvent])

  const trueCauses = record ? ALL_CAUSES.filter((c) => record[c]) : []

  return (
    <DetailPanelShell
      open={!!evictionId}
      onClose={onClose}
      isLoading={!record && isLoading}
      spinnerClass="border-terracotta-400"
      widthClass="w-80"
      mobileCompact
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-terracotta-500"
      glowColor="#b85a33"
    >
      {record && (
        <>
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Eviction Notice
          </p>
          <p className="text-sm font-semibold text-ink dark:text-white mb-0.5">
            {formatDate(record.file_date, 'long')}
          </p>
          <p className="text-micro text-slate-600 dark:text-slate-300 font-mono mb-3">
            {record.address || 'Address unavailable'}
          </p>

          {/* Cause chips */}
          {trueCauses.length > 0 ? (
            <div className="flex flex-wrap gap-1 mb-3">
              {trueCauses.map((c) => (
                <span
                  key={c}
                  className="text-micro font-mono px-2 py-0.5 rounded-full bg-terracotta-500/10 text-terracotta-500"
                >
                  {CAUSE_LABELS[c]}
                </span>
              ))}
            </div>
          ) : (
            <p className="text-micro text-slate-500 dark:text-slate-400 italic mb-3">Cause not specified</p>
          )}

          <div className="space-y-1.5">
            <div className="flex items-baseline justify-between">
              <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">District</p>
              <p className="text-micro text-slate-700 dark:text-slate-300">
                {record.supervisor_district ? `District ${record.supervisor_district}` : 'Unknown'}
              </p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Neighborhood</p>
              <p className="text-micro text-slate-700 dark:text-slate-300">{record.neighborhood || 'Unknown'}</p>
            </div>
            {record.constraints_date && (
              <div className="flex items-baseline justify-between">
                <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Constraints Date</p>
                <p className="text-micro text-slate-700 dark:text-slate-300">{formatDate(record.constraints_date, 'long')}</p>
              </div>
            )}
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
