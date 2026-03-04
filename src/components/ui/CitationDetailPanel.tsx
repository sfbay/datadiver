import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { ParkingCitationRecord } from '@/types/datasets'
import { formatDate, formatCurrency } from '@/utils/time'
import ShareLinkButton from '@/components/ui/ShareLinkButton'

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
  const panelRef = useRef<HTMLDivElement>(null)

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

  useEffect(() => {
    if (!selectedCitation) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedCitation(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [selectedCitation, setSelectedCitation])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedCitation) url.searchParams.set('detail', selectedCitation)
    return url.toString()
  }, [selectedCitation])

  if (!selectedCitation) return null

  const isOutOfState = detail?.plateState && detail.plateState !== 'CA' && detail.plateState !== 'Unknown'

  return (
    <div
      ref={panelRef}
      className="absolute top-5 right-5 z-30 rounded-xl p-4 w-72 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20"
    >
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <ShareLinkButton buildUrl={buildShareUrl} accentClass="text-orange-500" />
        <button
          onClick={() => setSelectedCitation(null)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-orange-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {detail && !isLoading && (
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
    </div>
  )
}
