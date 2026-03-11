import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { Cases311Record } from '@/types/datasets'
import { parseDateTime, formatDate, formatResolution, diffHours } from '@/utils/time'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

interface CaseDetail {
  requestId: string
  serviceName: string
  serviceSubtype: string
  serviceDetails: string
  status: string
  address: string
  neighborhood: string
  district: string
  source: string
  agency: string
  mediaUrl: string | null
  timestamps: {
    requested: string | null
    updated: string | null
    closed: string | null
  }
}

function buildDetail(record: Cases311Record): CaseDetail {
  return {
    requestId: record.service_request_id,
    serviceName: record.service_name || 'Unknown',
    serviceSubtype: record.service_subtype || '',
    serviceDetails: record.service_details || '',
    status: record.status_description || 'Unknown',
    address: record.address || 'Unknown',
    neighborhood: record.analysis_neighborhood || 'Unknown',
    district: record.supervisor_district || 'Unknown',
    source: record.source || 'Unknown',
    agency: record.agency_responsible || 'Unknown',
    mediaUrl: record.media_url || null,
    timestamps: {
      requested: record.requested_datetime || null,
      updated: record.updated_datetime || null,
      closed: record.closed_date || null,
    },
  }
}

const TIMELINE_STEPS = [
  { key: 'requested', label: 'Filed' },
  { key: 'updated', label: 'Last Updated' },
  { key: 'closed', label: 'Closed' },
] as const

export default function CaseDetailPanel() {
  const { selected311Case, setSelected311Case } = useAppStore()
  const [detail, setDetail] = useState<CaseDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch full record on selection (no $select restriction — get all fields)
  useEffect(() => {
    if (!selected311Case) {
      setDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchDataset<Cases311Record>('cases311', {
      $where: `service_request_id = '${selected311Case}'`,
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
  }, [selected311Case])

  const onClose = useCallback(() => setSelected311Case(null), [setSelected311Case])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selected311Case) url.searchParams.set('detail', selected311Case)
    return url.toString()
  }, [selected311Case])

  const isOpen = detail?.status === 'Open'
  const resolutionHours = detail?.timestamps.requested && detail?.timestamps.closed
    ? diffHours(detail.timestamps.requested, detail.timestamps.closed)
    : null

  return (
    <DetailPanelShell
      open={!!selected311Case}
      onClose={onClose}
      isLoading={isLoading}
      spinnerClass="border-emerald-400"
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-emerald-500"
    >
      {detail && (
        <>
          {/* Header info */}
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Case #{detail.requestId}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
            {detail.serviceName}
          </p>
          {detail.serviceSubtype && (
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mb-1">
              {detail.serviceSubtype}
            </p>
          )}

          {/* Status badge */}
          <div className="mb-3">
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
              isOpen
                ? 'bg-amber-500/10 text-amber-500'
                : 'bg-emerald-500/10 text-emerald-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${isOpen ? 'bg-amber-500' : 'bg-emerald-500'}`} />
              {detail.status}
            </span>
          </div>

          {/* Location */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.address}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; District {detail.district}
            </p>
          </div>

          {/* Filed date/time */}
          {detail.timestamps.requested && (
            <div className="mb-4">
              <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                {formatDate(detail.timestamps.requested, 'long')}
              </p>
              <p className="text-[10px] font-mono text-slate-800 dark:text-slate-200 font-semibold">
                {new Date(detail.timestamps.requested).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          )}

          {/* Case Timeline */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Case Timeline
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>

          <div className="space-y-0">
            {TIMELINE_STEPS.map((step, i) => {
              const ts = detail.timestamps[step.key]
              const prevTs = i > 0 ? detail.timestamps[TIMELINE_STEPS[i - 1].key] : null
              const elapsed = ts && prevTs ? diffHours(prevTs, ts) : null
              const time = parseDateTime(ts)

              return (
                <div key={step.key} className="flex items-start gap-2.5 relative">
                  {/* Vertical line */}
                  <div className="flex flex-col items-center w-3 flex-shrink-0">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-emerald-500' : 'bg-slate-600/30'}`}
                    />
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div className={`w-px h-6 ${ts ? 'bg-emerald-500/30' : 'bg-slate-600/10'}`} />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 pb-1 -mt-0.5">
                    <div className="flex items-baseline justify-between">
                      <p className={`text-[11px] font-medium ${ts ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
                        {step.label}
                      </p>
                      {time && (
                        <p className="text-[10px] font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                          {formatDate(time, 'short')}
                        </p>
                      )}
                    </div>
                    {elapsed !== null && elapsed > 0 && (
                      <p className="text-[9px] font-mono text-emerald-500/70">
                        +{formatResolution(elapsed)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Resolution summary */}
          {resolutionHours !== null && resolutionHours > 0 && (
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">Total Resolution</p>
                <p className="text-sm font-bold font-mono text-emerald-500">
                  {formatResolution(resolutionHours)}
                </p>
              </div>
            </div>
          )}

          {/* Details section */}
          <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08] space-y-1.5">
            {detail.serviceDetails && (
              <div>
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Details</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed">{detail.serviceDetails}</p>
              </div>
            )}
            <div className="flex items-baseline justify-between">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Source</p>
              <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.source}</p>
            </div>
            <div className="flex items-baseline justify-between">
              <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Agency</p>
              <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.agency}</p>
            </div>
            {detail.mediaUrl && (
              <div>
                <a
                  href={detail.mediaUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-[10px] font-mono text-emerald-500 hover:text-emerald-400 transition-colors underline"
                >
                  View attached media →
                </a>
              </div>
            )}
          </div>
        </>
      )}
    </DetailPanelShell>
  )
}
