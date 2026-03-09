import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import { useDispatchCrossRef } from '@/hooks/useDispatchCrossRef'
import type { PoliceIncident } from '@/types/datasets'
import { parseDateTime, formatDate, diffHours, formatResolution } from '@/utils/time'
import { DISPOSITION_LABELS } from '@/utils/colors'
import ShareLinkButton from '@/components/ui/ShareLinkButton'

interface CrimeDetail {
  incidentId: string
  incidentNumber: string
  cadNumber: string | null
  category: string
  subcategory: string
  description: string
  resolution: string
  intersection: string
  neighborhood: string
  policeDistrict: string
  timestamps: {
    incident: string | null
    report: string | null
  }
}

function buildDetail(record: PoliceIncident): CrimeDetail {
  return {
    incidentId: record.incident_id,
    incidentNumber: record.incident_number || '',
    cadNumber: record.cad_number || null,
    category: record.incident_category || 'Unknown',
    subcategory: record.incident_subcategory || '',
    description: record.incident_description || '',
    resolution: record.resolution || 'Unknown',
    intersection: record.intersection || 'Unknown',
    neighborhood: record.analysis_neighborhood || 'Unknown',
    policeDistrict: record.police_district || 'Unknown',
    timestamps: {
      incident: record.incident_datetime || null,
      report: record.report_datetime || null,
    },
  }
}

const POLICE_TIMELINE = [
  { key: 'incident', label: 'Incident' },
  { key: 'report', label: 'Report Filed' },
] as const

const DISPATCH_TIMELINE = [
  { key: 'received_datetime', label: 'Received' },
  { key: 'dispatch_datetime', label: 'Dispatched' },
  { key: 'onscene_datetime', label: 'On Scene' },
  { key: 'close_datetime', label: 'Closed' },
] as const

export default function CrimeDetailPanel() {
  const { selectedCrimeIncident, setSelectedCrimeIncident } = useAppStore()
  const [detail, setDetail] = useState<CrimeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch full record on selection
  useEffect(() => {
    if (!selectedCrimeIncident) {
      setDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchDataset<PoliceIncident>('policeIncidents', {
      $where: `incident_id = '${selectedCrimeIncident}'`,
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
  }, [selectedCrimeIncident])

  // Close on outside click
  useEffect(() => {
    if (!selectedCrimeIncident) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedCrimeIncident(null)
      }
    }
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [selectedCrimeIncident, setSelectedCrimeIncident])

  // 911 cross-reference (lazy fetch)
  const { dispatch, isLoading: dispatchLoading, error: dispatchError } = useDispatchCrossRef(detail?.cadNumber ?? null)

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedCrimeIncident) url.searchParams.set('detail', selectedCrimeIncident)
    return url.toString()
  }, [selectedCrimeIncident])

  if (!selectedCrimeIncident) return null

  const reportLag = detail?.timestamps.incident && detail?.timestamps.report
    ? diffHours(detail.timestamps.incident, detail.timestamps.report)
    : null

  const isOpen = detail?.resolution === 'Open or Active'

  return (
    <div
      ref={panelRef}
      className="absolute top-5 right-5 z-30 rounded-xl p-4 w-80 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20"
    >
      {/* Top-right actions */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <ShareLinkButton buildUrl={buildShareUrl} accentClass="text-red-500" />
        <button
          onClick={() => setSelectedCrimeIncident(null)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-red-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {detail && !isLoading && (
        <>
          {/* Header */}
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Incident #{detail.incidentNumber}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
            {detail.category}
          </p>
          {detail.subcategory && (
            <p className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mb-1">
              {detail.subcategory}
            </p>
          )}

          {/* Resolution badge */}
          <div className="mb-3">
            <span className={`inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full ${
              isOpen
                ? 'bg-blue-500/10 text-blue-500'
                : detail.resolution.includes('Arrest') ? 'bg-red-500/10 text-red-500'
                : 'bg-slate-500/10 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isOpen ? 'bg-blue-500' : detail.resolution.includes('Arrest') ? 'bg-red-500' : 'bg-slate-500'
              }`} />
              {detail.resolution}
            </span>
          </div>

          {/* Description */}
          {detail.description && (
            <p className="text-[10px] text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              {detail.description}
            </p>
          )}

          {/* Location */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.intersection}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; {detail.policeDistrict} District
            </p>
          </div>

          {/* Police Timeline */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Incident Timeline
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>

          {(() => {
            const firstTime = parseDateTime(detail.timestamps.incident)
            const allTimes = POLICE_TIMELINE.map((s) => parseDateTime(detail.timestamps[s.key]))
            const sameDay = allTimes.every((t, _, arr) =>
              t && arr[0] && t.toDateString() === arr[0].toDateString()
            )

            return (
              <>
                {/* Date header */}
                {firstTime && (
                  <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-2">
                    {firstTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                  </p>
                )}

                <div className="space-y-0">
                  {POLICE_TIMELINE.map((step, i) => {
                    const ts = detail.timestamps[step.key]
                    const prevTs = i > 0 ? detail.timestamps[POLICE_TIMELINE[i - 1].key] : null
                    const elapsed = ts && prevTs ? diffHours(prevTs, ts) : null
                    const time = parseDateTime(ts)

                    const timeStr = time
                      ? sameDay
                        ? time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        : time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                      : null

                    return (
                      <div key={step.key} className="flex items-start gap-2.5 relative">
                        <div className="flex flex-col items-center w-3 flex-shrink-0">
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-red-500' : 'bg-slate-600/30'}`} />
                          {i < POLICE_TIMELINE.length - 1 && (
                            <div className={`w-px h-6 ${ts ? 'bg-red-500/30' : 'bg-slate-600/10'}`} />
                          )}
                        </div>
                        <div className="flex-1 pb-1 -mt-0.5">
                          <div className="flex items-baseline justify-between">
                            <p className={`text-[11px] font-medium ${ts ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
                              {step.label}
                            </p>
                            {timeStr && (
                              <p className="text-[10px] font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                                {timeStr}
                              </p>
                            )}
                          </div>
                          {elapsed !== null && elapsed > 0 && (
                            <p className="text-[9px] font-mono text-red-500/70">
                              +{elapsed < 1 ? `${Math.round(elapsed * 60)}min` : formatResolution(elapsed)}
                            </p>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              </>
            )
          })()}

          {/* Report lag summary */}
          {reportLag !== null && reportLag > 0 && (
            <div className="mt-2 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">Incident→Report</p>
                <p className="text-sm font-bold font-mono text-red-500">
                  {formatResolution(reportLag)}
                </p>
              </div>
            </div>
          )}

          {/* 911 Dispatch Cross-Reference */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                911 Dispatch
              </p>
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
            </div>

            {!detail.cadNumber && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                No linked 911 call (report-only)
              </p>
            )}

            {detail.cadNumber && dispatchLoading && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-3 h-3 border border-violet-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-[10px] text-slate-400 font-mono">Loading dispatch record...</span>
              </div>
            )}

            {detail.cadNumber && !dispatchLoading && dispatchError && !dispatch && (
              <p className="text-[10px] text-slate-500 dark:text-slate-400 italic">
                No matching dispatch record
              </p>
            )}

            {dispatch && !dispatchLoading && (
              <div className="space-y-2">
                {/* Dispatch info */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Original Call</p>
                    <p className="text-[10px] text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">
                      {dispatch.call_type_original_desc || dispatch.call_type_original || 'Unknown'}
                    </p>
                  </div>
                  {dispatch.call_type_final_desc !== dispatch.call_type_original_desc && (
                    <div className="flex items-baseline justify-between">
                      <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Final Call</p>
                      <p className="text-[10px] text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">
                        {dispatch.call_type_final_desc || dispatch.call_type_final || 'Unknown'}
                      </p>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Priority</p>
                    <p className="text-[10px] text-slate-700 dark:text-slate-300">
                      {dispatch.priority_final || dispatch.priority_original || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Disposition</p>
                    <p className="text-[10px] text-slate-700 dark:text-slate-300">
                      {DISPOSITION_LABELS[dispatch.disposition] || dispatch.disposition || 'Unknown'}
                    </p>
                  </div>
                </div>

                {/* Dispatch timeline */}
                <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                  {(() => {
                    const dispFirstTime = parseDateTime(dispatch.received_datetime ?? null)
                    const dispAllTimes = DISPATCH_TIMELINE.map((s) => parseDateTime((dispatch[s.key as keyof typeof dispatch] as string) ?? null))
                    const dispSameDay = dispAllTimes.every((t, _, arr) =>
                      t && arr[0] && t.toDateString() === arr[0].toDateString()
                    )

                    return (
                      <>
                        {dispFirstTime && (
                          <p className="text-[10px] font-mono text-slate-500 dark:text-slate-400 mb-2">
                            {dispFirstTime.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric', year: 'numeric' })}
                          </p>
                        )}
                        <div className="space-y-0">
                  {DISPATCH_TIMELINE.map((step, i) => {
                      const ts = dispatch[step.key as keyof typeof dispatch] as string | undefined
                      const prevKey = i > 0 ? DISPATCH_TIMELINE[i - 1].key : null
                      const prevTs = prevKey ? (dispatch[prevKey as keyof typeof dispatch] as string | undefined) : null
                      const elapsed = ts && prevTs ? diffHours(prevTs, ts) : null
                      const time = parseDateTime(ts ?? null)

                      const timeStr = time
                        ? dispSameDay
                          ? time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                          : time.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' }) + ' ' + time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })
                        : null

                      return (
                        <div key={step.key} className="flex items-start gap-2.5 relative">
                          <div className="flex flex-col items-center w-3 flex-shrink-0">
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-violet-500' : 'bg-slate-600/30'}`} />
                            {i < DISPATCH_TIMELINE.length - 1 && (
                              <div className={`w-px h-6 ${ts ? 'bg-violet-500/30' : 'bg-slate-600/10'}`} />
                            )}
                          </div>
                          <div className="flex-1 pb-1 -mt-0.5">
                            <div className="flex items-baseline justify-between">
                              <p className={`text-[11px] font-medium ${ts ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
                                {step.label}
                              </p>
                              {timeStr && (
                                <p className="text-[10px] font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                                  {timeStr}
                                </p>
                              )}
                            </div>
                            {elapsed !== null && elapsed > 0 && (
                              <p className="text-[9px] font-mono text-violet-500/70">
                                +{elapsed < 1 ? `${Math.round(elapsed * 60)}min` : formatResolution(elapsed)}
                              </p>
                            )}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                      </>
                    )
                  })()}
                </div>

                {/* Dispatch → Report lag */}
                {dispatch.received_datetime && detail.timestamps.report && (
                  <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
                    <div className="flex items-baseline justify-between">
                      <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">911 Call→Report</p>
                      <p className="text-sm font-bold font-mono text-violet-500">
                        {(() => {
                          const lag = diffHours(dispatch.received_datetime, detail.timestamps.report!)
                          return lag !== null && lag > 0 ? formatResolution(lag) : 'N/A'
                        })()}
                      </p>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* CAD number badge */}
          {detail.cadNumber && (
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-baseline justify-between">
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">CAD #</p>
                <p className="text-[10px] font-mono text-slate-700 dark:text-slate-300">{detail.cadNumber}</p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
