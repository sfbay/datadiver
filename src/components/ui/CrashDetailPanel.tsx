import { useState, useEffect, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { fetchDataset } from '@/api/client'
import type { TrafficCrashRecord } from '@/types/datasets'
import { formatDate } from '@/utils/time'
import { CRASH_SEVERITY_COLORS, CRASH_MODE_COLORS } from '@/utils/colors'
import DetailPanelShell from '@/components/ui/DetailPanelShell'

interface CrashDetail {
  uniqueId: string
  severity: string
  collisionType: string
  mode: string
  pedAction: string
  weather: string
  roadSurface: string
  roadCondition: string
  lighting: string
  killed: number
  injured: number
  primaryRd: string
  secondaryRd: string
  neighborhood: string
  policeDistrict: string
  supervisorDistrict: string
  collisionDatetime: string
}

function buildDetail(record: TrafficCrashRecord): CrashDetail {
  return {
    uniqueId: record.unique_id,
    severity: record.collision_severity || 'Unknown',
    collisionType: record.type_of_collision || 'Unknown',
    mode: record.dph_col_grp_description || 'Unknown',
    pedAction: record.ped_action || '',
    weather: record.weather_1 || 'Unknown',
    roadSurface: record.road_surface || 'Unknown',
    roadCondition: record.road_cond_1 || 'Unknown',
    lighting: record.lighting || 'Unknown',
    killed: parseInt(record.number_killed, 10) || 0,
    injured: parseInt(record.number_injured, 10) || 0,
    primaryRd: record.primary_rd || 'Unknown',
    secondaryRd: record.secondary_rd || '',
    neighborhood: record.analysis_neighborhood || 'Unknown',
    policeDistrict: record.police_district || 'Unknown',
    supervisorDistrict: record.supervisor_district || 'Unknown',
    collisionDatetime: record.collision_datetime || '',
  }
}

export default function CrashDetailPanel() {
  const { selectedCrash, setSelectedCrash } = useAppStore()
  const [detail, setDetail] = useState<CrashDetail | null>(null)
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!selectedCrash) {
      setDetail(null)
      return
    }

    let cancelled = false
    setIsLoading(true)

    fetchDataset<TrafficCrashRecord>('trafficCrashes', {
      $where: `unique_id = '${selectedCrash}'`,
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
  }, [selectedCrash])

  const onClose = useCallback(() => setSelectedCrash(null), [setSelectedCrash])

  const buildShareUrl = useCallback(() => {
    const url = new URL(window.location.href)
    if (selectedCrash) url.searchParams.set('detail', selectedCrash)
    return url.toString()
  }, [selectedCrash])

  const severityColor = detail ? CRASH_SEVERITY_COLORS[detail.severity] || '#64748b' : '#64748b'
  const modeColor = detail ? CRASH_MODE_COLORS[detail.mode] || '#64748b' : '#64748b'

  return (
    <DetailPanelShell
      open={!!selectedCrash}
      onClose={onClose}
      isLoading={isLoading}
      spinnerClass="border-red-400"
      buildShareUrl={buildShareUrl}
      shareAccentClass="text-red-500"
    >
      {detail && (
        <>
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1">
            Crash #{detail.uniqueId}
          </p>

          {/* Severity badge */}
          <div className="flex items-center gap-2 mb-2">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full text-white"
              style={{ backgroundColor: severityColor }}
            >
              {detail.severity}
            </span>
            <span
              className="inline-flex items-center gap-1 text-[10px] font-mono px-2 py-0.5 rounded-full"
              style={{ backgroundColor: modeColor + '20', color: modeColor }}
            >
              {detail.mode}
            </span>
          </div>

          {/* Collision type */}
          <p className="text-sm font-semibold text-slate-900 dark:text-white mb-1">
            {detail.collisionType}
          </p>

          {/* Casualties */}
          <div className="flex gap-3 mb-3 p-2 rounded-lg bg-red-500/5">
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-red-400">Killed</p>
              <p className="text-lg font-bold font-mono" style={{ color: detail.killed > 0 ? '#7f1d1d' : '#64748b' }}>
                {detail.killed}
              </p>
            </div>
            <div>
              <p className="text-[9px] font-mono uppercase tracking-wider text-amber-400">Injured</p>
              <p className="text-lg font-bold font-mono" style={{ color: detail.injured > 0 ? '#f59e0b' : '#64748b' }}>
                {detail.injured}
              </p>
            </div>
          </div>

          {/* Date/time */}
          {detail.collisionDatetime && (
            <div className="mb-3">
              <p className="text-[10px] font-mono text-slate-600 dark:text-slate-300">
                {formatDate(detail.collisionDatetime, 'long')}
              </p>
              <p className="text-[10px] font-mono text-slate-800 dark:text-slate-200 font-semibold">
                {new Date(detail.collisionDatetime).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' })}
              </p>
            </div>
          )}

          {/* Location */}
          <div className="mb-3">
            <p className="text-[10px] text-slate-700 dark:text-slate-300">
              {detail.primaryRd}{detail.secondaryRd ? ` at ${detail.secondaryRd}` : ''}
            </p>
            <p className="text-[10px] text-slate-500 dark:text-slate-400">
              {detail.neighborhood} &middot; {detail.policeDistrict} &middot; District {detail.supervisorDistrict}
            </p>
          </div>

          {/* Conditions section */}
          <div className="flex items-center gap-2 mb-2">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400">
              Conditions
            </p>
            <div className="flex-1 h-[1px] bg-slate-200 dark:bg-white/[0.08]" />
          </div>

          <div className="space-y-1.5 mb-3">
            {[
              ['Weather', detail.weather],
              ['Road Surface', detail.roadSurface],
              ['Road Condition', detail.roadCondition],
              ['Lighting', detail.lighting],
            ].map(([label, value]) => (
              <div key={label} className="flex items-baseline justify-between">
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">{label}</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300">{value}</p>
              </div>
            ))}
          </div>

          {/* Pedestrian action (if applicable) */}
          {detail.pedAction && detail.mode.includes('Ped') && (
            <div className="pt-2 border-t border-slate-200 dark:border-white/[0.08]">
              <div className="flex items-baseline justify-between">
                <p className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400">Ped Action</p>
                <p className="text-[10px] text-slate-700 dark:text-slate-300">{detail.pedAction}</p>
              </div>
            </div>
          )}
        </>
      )}
    </DetailPanelShell>
  )
}
