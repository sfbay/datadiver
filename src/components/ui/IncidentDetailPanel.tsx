import { useState, useEffect, useRef, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { FireEMSDispatch, IncidentDetail } from '@/types/datasets'
import { parseDateTime, formatDate, formatDuration, diffMinutes } from '@/utils/time'
import ShareLinkButton from '@/components/ui/ShareLinkButton'

function buildDetail(record: FireEMSDispatch): IncidentDetail {
  return {
    callNumber: record.call_number,
    callType: record.call_type || 'Unknown',
    callTypeGroup: record.call_type_group || 'Unknown',
    priority: record.final_priority || record.priority || 'Unknown',
    neighborhood: record.neighborhoods_analysis_boundaries || 'Unknown',
    district: record.supervisor_district || 'Unknown',
    address: record.address || 'Unknown',
    timestamps: {
      received: record.received_dttm || null,
      dispatch: record.dispatch_dttm || null,
      response: record.response_dttm || null,
      onScene: record.on_scene_dttm || null,
      transport: record.transport_dttm || null,
      hospital: record.hospital_dttm || null,
      available: record.available_dttm || null,
    },
  }
}

const TIMELINE_STEPS = [
  { key: 'received', label: 'Received' },
  { key: 'dispatch', label: 'Dispatched' },
  { key: 'response', label: 'En Route' },
  { key: 'onScene', label: 'On Scene' },
  { key: 'transport', label: 'Transport' },
  { key: 'hospital', label: 'Hospital' },
  { key: 'available', label: 'Available' },
] as const

export default function IncidentDetailPanel() {
  const { selectedIncident, setSelectedIncident } = useAppStore()
  const [detail, setDetail] = useState<IncidentDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Fetch full record on selection
  useEffect(() => {
    if (!selectedIncident) {
      setDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchDataset<FireEMSDispatch>('fireEMSDispatch', {
      $where: `call_number = '${selectedIncident}'`,
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
  }, [selectedIncident])

  // Close on outside click
  useEffect(() => {
    if (!selectedIncident) return
    const handler = (e: MouseEvent) => {
      if (panelRef.current && !panelRef.current.contains(e.target as Node)) {
        setSelectedIncident(null)
      }
    }
    // Delay to avoid catching the click that opened the panel
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [selectedIncident, setSelectedIncident])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedIncident) url.searchParams.set('detail', selectedIncident)
    return url.toString()
  }, [selectedIncident])

  if (!selectedIncident) return null

  return (
    <div
      ref={panelRef}
      className="absolute top-5 right-5 z-30 rounded-xl p-4 w-72 max-h-[80vh] overflow-y-auto animate-in fade-in slide-in-from-right-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20"
    >
      {/* Top-right actions */}
      <div className="absolute top-2 right-2 flex items-center gap-0.5">
        <ShareLinkButton buildUrl={buildShareUrl} accentClass="text-signal-amber" />
        <button
          onClick={() => setSelectedIncident(null)}
          className="w-6 h-6 flex items-center justify-center rounded-full text-slate-400 hover:text-white hover:bg-white/10 transition-all"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="M2 2l8 8M10 2l-8 8" />
          </svg>
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center justify-center py-8">
          <div className="w-5 h-5 border-2 border-signal-amber border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {detail && !isLoading && (
        <>
          {/* Header info */}
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Incident #{detail.callNumber}
          </p>
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-0.5">
            {detail.callType}
          </p>
          <p className="text-[10px] text-slate-600 dark:text-slate-300 font-mono mb-3">
            {detail.callTypeGroup} &middot; Priority {detail.priority}
          </p>

          {/* Location */}
          <div className="mb-4">
            <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.address}</p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; District {detail.district}
            </p>
          </div>

          {/* Date/Time */}
          {detail.timestamps.received && (
            <div className="mb-4">
              <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                {formatDate(detail.timestamps.received, 'long')}
              </p>
              <p className="text-[10px] font-mono text-slate-800 dark:text-slate-200 font-semibold">
                {new Date(detail.timestamps.received).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
              </p>
            </div>
          )}

          {/* Response Timeline */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Response Timeline
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>

          <div className="space-y-0">
            {TIMELINE_STEPS.map((step, i) => {
              const ts = detail.timestamps[step.key]
              const prevTs = i > 0 ? detail.timestamps[TIMELINE_STEPS[i - 1].key] : null
              const elapsed = ts && prevTs ? diffMinutes(prevTs, ts) : null
              const time = parseDateTime(ts)

              return (
                <div key={step.key} className="flex items-start gap-2.5 relative">
                  {/* Vertical line */}
                  <div className="flex flex-col items-center w-3 flex-shrink-0">
                    <div
                      className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-signal-blue' : 'bg-slate-600/30'}`}
                    />
                    {i < TIMELINE_STEPS.length - 1 && (
                      <div className={`w-px h-6 ${ts ? 'bg-signal-blue/30' : 'bg-slate-600/10'}`} />
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
                          {time.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', second: '2-digit' })}
                        </p>
                      )}
                    </div>
                    {elapsed !== null && elapsed > 0 && (
                      <p className="text-[9px] font-mono text-signal-amber/70">
                        +{formatDuration(elapsed)}
                      </p>
                    )}
                  </div>
                </div>
              )
            })}
          </div>

          {/* Total response time */}
          {detail.timestamps.received && detail.timestamps.onScene && (
            <div className="mt-3 pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-baseline justify-between">
                <p className="text-[10px] font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">Total to Scene</p>
                <p className="text-sm font-bold font-mono text-signal-amber">
                  {formatDuration(diffMinutes(detail.timestamps.received, detail.timestamps.onScene) || 0)}
                </p>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  )
}
