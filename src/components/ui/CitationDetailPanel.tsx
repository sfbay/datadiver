import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { ParkingCitationRecord } from '@/types/datasets'
import { formatDate, formatCurrency } from '@/utils/time'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

interface CitationDetail {
  citationNumber: string
  violation: string
  violationDesc: string
  fineAmount: number
  location: string
  neighborhood: string
  district: string
  issuedDatetime: string
  plateState: string
}

function buildDetail(record: ParkingCitationRecord): CitationDetail {
  return {
    citationNumber: record.citation_number,
    violation: record.violation || '',
    violationDesc: record.violation_desc || 'Unknown',
    fineAmount: parseFloat(record.fine_amount) || 0,
    location: record.citation_location || 'Unknown',
    neighborhood: record.analysis_neighborhood || 'Unknown',
    district: record.supervisor_districts || 'Unknown',
    issuedDatetime: record.citation_issued_datetime || '',
    plateState: record.vehicle_plate_state || 'Unknown',
  }
}

export default function CitationDetailPanel() {
  const { selectedCitation, setSelectedCitation } = useAppStore()
  const [detail, setDetail] = useState<CitationDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!selectedCitation) {
      setDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchDataset<ParkingCitationRecord>('parkingCitations', {
      $where: `citation_number = '${selectedCitation}'`,
      $limit: 1,
    })
      .then((records) => {
        if (!cancelled && records.length > 0) {
          setDetail(buildDetail(records[0]))
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedCitation])

  const onClose = useCallback(() => setSelectedCitation(null), [setSelectedCitation])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedCitation) url.searchParams.set('detail', selectedCitation)
    return url.toString()
  }, [selectedCitation])

  const isOutOfState = detail?.plateState && detail.plateState !== 'CA' && detail.plateState !== 'Unknown'

  return (
    <DetailPanelShell
      open={!!selectedCitation}
      onClose={onClose}
      isLoading={isLoading}
      spinnerClass="border-orange-400"
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-orange-500"
    >
      {detail && (
        <>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Citation #{detail.citationNumber}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
            {detail.violationDesc}
          </p>
          {detail.violation && (
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mb-2">
              Code: {detail.violation}
            </p>
          )}

          {/* Fine amount — prominent */}
          <div className="mb-3 p-2 rounded-lg bg-orange-500/10">
            <p className="text-[9px] font-mono uppercase tracking-wider text-orange-400">Fine</p>
            <p className="text-xl font-bold font-mono text-orange-500">
              {formatCurrency(detail.fineAmount)}
            </p>
          </div>

          {/* Location */}
          <div className="mb-3">
            <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.location}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; District {detail.district}
            </p>
          </div>

          {/* Issued date/time */}
          {detail.issuedDatetime && (
            <div className="mb-3">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mb-0.5">
                Issued
              </p>
              <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                {formatDate(detail.issuedDatetime, 'long')}
              </p>
              <p className="text-[10px] font-mono text-slate-800 dark:text-slate-200 font-semibold">
                {new Date(detail.issuedDatetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          )}

          {/* Plate state */}
          <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
            <div className="flex items-center justify-between">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">
                Plate State
              </p>
              <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
                isOutOfState
                  ? 'bg-blue-500/10 text-blue-400'
                  : 'bg-slate-100 dark:bg-white/[0.04] text-slate-500'
              }`}>
                {detail.plateState}
                {isOutOfState && ' (Out of State)'}
              </span>
            </div>
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
