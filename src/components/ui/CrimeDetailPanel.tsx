import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import { useDispatchCrossRef } from '@/hooks/useDispatchCrossRef'
import { useActiveCity } from '@/cities/useActiveCity'
import { BeatPanelLabel } from './AreaLabel'
import type { PoliceIncident } from '@/types/datasets'
import {
  normalizeHistoricalIncident,
  HISTORICAL_SELECT_FIELDS,
  type HistoricalIncidentRow,
} from '@/views/CrimeIncidents/crimeEra'
import {
  OAKLAND_CRIME_SELECT,
  titleCaseCrimetype,
  classifyOaklandCase,
  type OaklandCrimeRow,
} from '@/views/CrimeIncidents/crimeDialect'
import { parseDateTime, formatDate, diffHours, formatResolution } from '@/utils/time'
import { parseSfLocal } from '@/utils/sfTime'
import { DISPOSITION_LABELS } from '@/utils/colors'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

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

interface OaklandCrimeDetail {
  casenumber: string
  category: string          // derived display category (HOMICIDE split); title-cased at render
  charges: string[]         // distinct description values, published order
  beat: string
  address: string
  datetime: string | null
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
  const city = useActiveCity()
  const { selectedCrimeIncident, setSelectedCrimeIncident } = useAppStore()
  const [detail, setDetail] = useState<CrimeDetail | null>(null)
  const [oakDetail, setOakDetail] = useState<OaklandCrimeDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  // Fetch full record on selection
  useEffect(() => {
    if (!selectedCrimeIncident) {
      setDetail(null)
      setOakDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    if (city.id !== 'sf') {
      // One case = MANY charge rows (worst observed all-time is 52, case
      // 13-000001; 60 covers it with headroom). Fetch them all and render
      // the charges list — no archive fallback, no 911 section (Oakland
      // publishes neither).
      fetchDataset<OaklandCrimeRow>('policeIncidents', {
        $where: `casenumber = '${selectedCrimeIncident.replace(/'/g, "''")}'`,
        $select: OAKLAND_CRIME_SELECT,
        $limit: 60,
      }, { cityId: 'oakland' })
        .then((rows) => {
          if (cancelled || rows.length === 0) return
          const charges = [...new Set(rows.map((r) => r.description).filter(Boolean))] as string[]
          // Headline the DERIVED category. For the HOMICIDE code, rank across
          // ALL charges (Homicide > Death Investigations > Other) so a murder
          // case that also carries an assault charge reads as Homicide, not the
          // survivor row's Other. Other crimetypes headline as published.
          const rawType = rows[0].crimetype ?? ''
          const displayCategory = rawType === 'HOMICIDE' ? classifyOaklandCase(charges) : rawType
          setOakDetail({
            casenumber: rows[0].casenumber ?? selectedCrimeIncident,
            category: displayCategory,
            charges,
            beat: rows[0].policebeat ?? '',
            address: rows[0].address ?? '',
            datetime: rows[0].datetime ?? null,
          })
        })
        .catch(() => { if (!cancelled) setOakDetail(null) })
        .finally(() => { if (!cancelled) setIsLoading(false) })
      return () => { cancelled = true }
    }

    // A pre-2018 dot's id is a `pdid` from the historical extract and cannot
    // exist in the 2018+ dataset, so a single lookup there would leave the
    // panel permanently blank. Fall back to the archive and normalize it into
    // the same shape. See src/views/CrimeIncidents/crimeEra.ts.
    fetchDataset<PoliceIncident>('policeIncidents', {
      $where: `incident_id = '${selectedCrimeIncident}'`,
      $limit: 1,
    })
      .then(async (records) => {
        if (records.length > 0) return records[0]
        const legacy = await fetchDataset<HistoricalIncidentRow>('policeIncidentsHistorical', {
          $where: `pdid = '${selectedCrimeIncident}'`,
          $select: HISTORICAL_SELECT_FIELDS,
          $limit: 1,
        })
        const normalized = legacy[0] ? normalizeHistoricalIncident(legacy[0]) : null
        return normalized as PoliceIncident | null
      })
      .then((record) => {
        if (!cancelled && record) {
          setDetail(buildDetail(record))
        }
      })
      .catch(() => {
        if (!cancelled) setDetail(null)
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [selectedCrimeIncident, city.id])

  // 911 cross-reference (lazy fetch) — inert for Oakland, which has no cadNumber
  const { dispatch, isLoading: dispatchLoading, error: dispatchError } = useDispatchCrossRef(city.id === 'sf' ? detail?.cadNumber ?? null : null)

  const onClose = useCallback(() => setSelectedCrimeIncident(null), [setSelectedCrimeIncident])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedCrimeIncident) url.searchParams.set('detail', selectedCrimeIncident)
    return url.toString()
  }, [selectedCrimeIncident])

  const reportLag = detail?.timestamps.incident && detail?.timestamps.report
    ? diffHours(detail.timestamps.incident, detail.timestamps.report)
    : null

  const isOpen = detail?.resolution === 'Open or Active'

  return (
    <DetailPanelShell
      open={!!selectedCrimeIncident}
      onClose={onClose}
      isLoading={isLoading}
      spinnerClass="border-brick-400"
      widthClass="w-80"
      mobileCompact
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-brick-500"
    >
      {city.id === 'sf' ? detail && (
        <>
          {/* Header */}
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Incident #{detail.incidentNumber}
          </p>
          <p className="text-sm font-semibold text-ink dark:text-white mb-0.5">
            {detail.category}
          </p>
          {detail.subcategory && (
            <p className="text-micro text-slate-600 dark:text-slate-300 font-mono mb-1">
              {detail.subcategory}
            </p>
          )}

          {/* Resolution badge */}
          <div className="mb-3">
            <span className={`inline-flex items-center gap-1 text-micro font-mono px-2 py-0.5 rounded-full ${
              isOpen
                ? 'bg-teal-500/10 text-teal-500'
                : detail.resolution.includes('Arrest') ? 'bg-brick-500/10 text-brick-500'
                : 'bg-slate-500/10 text-slate-500'
            }`}>
              <span className={`w-1.5 h-1.5 rounded-full ${
                isOpen ? 'bg-teal-500' : detail.resolution.includes('Arrest') ? 'bg-brick-500' : 'bg-slate-500'
              }`} />
              {detail.resolution}
            </span>
          </div>

          {/* Description */}
          {detail.description && (
            <p className="text-micro text-slate-700 dark:text-slate-300 leading-relaxed mb-3">
              {detail.description}
            </p>
          )}

          {/* Location */}
          <div className="mb-4">
            <p className="text-micro text-slate-700 dark:text-slate-300">{detail.intersection}</p>
            <p className="text-micro text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; {detail.policeDistrict} District
            </p>
          </div>

          {/* Police Timeline */}
          <div className="flex items-center gap-2 mb-3">
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
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
                  <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mb-2">
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
                          <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-brick-500' : 'bg-slate-600/30'}`} />
                          {i < POLICE_TIMELINE.length - 1 && (
                            <div className={`w-px h-6 ${ts ? 'bg-brick-500/30' : 'bg-slate-600/10'}`} />
                          )}
                        </div>
                        <div className="flex-1 pb-1 -mt-0.5">
                          <div className="flex items-baseline justify-between">
                            <p className={`text-label font-medium ${ts ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
                              {step.label}
                            </p>
                            {timeStr && (
                              <p className="text-micro font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                                {timeStr}
                              </p>
                            )}
                          </div>
                          {elapsed !== null && elapsed > 0 && (
                            <p className="text-nano font-mono text-brick-500/70">
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
                <p className="text-micro font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">Incident→Report</p>
                <p className="text-sm font-bold font-mono text-brick-500">
                  {formatResolution(reportLag)}
                </p>
              </div>
            </div>
          )}

          {/* 911 Dispatch Cross-Reference */}
          <div className="mt-4">
            <div className="flex items-center gap-2 mb-3">
              <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                911 Dispatch
              </p>
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
            </div>

            {!detail.cadNumber && (
              <p className="text-micro text-slate-500 dark:text-slate-400 italic">
                No linked 911 call (report-only)
              </p>
            )}

            {detail.cadNumber && dispatchLoading && (
              <div className="flex items-center gap-2 py-2">
                <div className="w-3 h-3 border border-plum-400 border-t-transparent rounded-full animate-spin" />
                <span className="text-micro text-slate-400 font-mono">Loading dispatch record...</span>
              </div>
            )}

            {detail.cadNumber && !dispatchLoading && dispatchError && !dispatch && (
              <p className="text-micro text-slate-500 dark:text-slate-400 italic">
                No matching dispatch record
              </p>
            )}

            {dispatch && !dispatchLoading && (
              <div className="space-y-2">
                {/* Dispatch info */}
                <div className="space-y-1.5">
                  <div className="flex items-baseline justify-between">
                    <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Original Call</p>
                    <p className="text-micro text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">
                      {dispatch.call_type_original_desc || dispatch.call_type_original || 'Unknown'}
                    </p>
                  </div>
                  {dispatch.call_type_final_desc !== dispatch.call_type_original_desc && (
                    <div className="flex items-baseline justify-between">
                      <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Final Call</p>
                      <p className="text-micro text-slate-700 dark:text-slate-300 text-right max-w-[60%] truncate">
                        {dispatch.call_type_final_desc || dispatch.call_type_final || 'Unknown'}
                      </p>
                    </div>
                  )}
                  <div className="flex items-baseline justify-between">
                    <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Priority</p>
                    <p className="text-micro text-slate-700 dark:text-slate-300">
                      {dispatch.priority_final || dispatch.priority_original || 'Unknown'}
                    </p>
                  </div>
                  <div className="flex items-baseline justify-between">
                    <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Disposition</p>
                    <p className="text-micro text-slate-700 dark:text-slate-300">
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
                          <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mb-2">
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
                            <div className={`w-2 h-2 rounded-full flex-shrink-0 ${ts ? 'bg-plum-500' : 'bg-slate-600/30'}`} />
                            {i < DISPATCH_TIMELINE.length - 1 && (
                              <div className={`w-px h-6 ${ts ? 'bg-plum-500/30' : 'bg-slate-600/10'}`} />
                            )}
                          </div>
                          <div className="flex-1 pb-1 -mt-0.5">
                            <div className="flex items-baseline justify-between">
                              <p className={`text-label font-medium ${ts ? 'text-slate-800 dark:text-slate-100' : 'text-slate-400 dark:text-slate-600'}`}>
                                {step.label}
                              </p>
                              {timeStr && (
                                <p className="text-micro font-mono text-slate-700 dark:text-slate-300 tabular-nums">
                                  {timeStr}
                                </p>
                              )}
                            </div>
                            {elapsed !== null && elapsed > 0 && (
                              <p className="text-nano font-mono text-plum-500/70">
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
                      <p className="text-micro font-mono uppercase tracking-wider text-slate-600 dark:text-slate-300">911 Call→Report</p>
                      <p className="text-sm font-bold font-mono text-plum-500">
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
                <p className="text-nano font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">CAD #</p>
                <p className="text-micro font-mono text-slate-700 dark:text-slate-300">{detail.cadNumber}</p>
              </div>
            </div>
          )}
        </>
      ) : (
        oakDetail && (
          <>
            {/* Header */}
            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
              Case #{oakDetail.casenumber}
            </p>
            <p className="text-sm font-semibold text-ink dark:text-white mb-3">
              {titleCaseCrimetype(oakDetail.category)}
            </p>

            {/* Location */}
            <div className="mb-4">
              <p className="text-micro text-slate-700 dark:text-slate-300">{oakDetail.address || 'Unknown'}</p>
              <p className="text-micro text-slate-500 dark:text-slate-400">
                {oakDetail.beat ? <BeatPanelLabel areas={city.areas} id={oakDetail.beat} /> : 'Beat unknown'}
              </p>
            </div>

            {/* Incident time */}
            {oakDetail.datetime && (
              <p className="text-micro font-mono text-slate-600 dark:text-slate-300 mb-4">
                {new Date(parseSfLocal(oakDetail.datetime)).toLocaleString('en-US', {
                  weekday: 'short', month: 'short', day: 'numeric', year: 'numeric',
                  hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles',
                })}
              </p>
            )}

            {/* Charges — one row per charge filed on the case; the reason the
                dataset has duplicate casenumbers, surfaced as the feature. */}
            <div className="flex items-center gap-2 mb-2">
              <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
                Charges ({oakDetail.charges.length})
              </p>
              <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
            </div>
            <ul className="space-y-1 mb-2">
              {oakDetail.charges.map((c) => (
                <li key={c} className="flex items-start gap-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-brick-500/70 mt-1.5 flex-shrink-0" />
                  <span className="text-micro text-slate-700 dark:text-slate-300 leading-relaxed">{c}</span>
                </li>
              ))}
            </ul>
          </>
        )
      )}
    </DetailPanelShell>
  )
}
