import { useState, useMemo, useCallback } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useDataset } from '@/hooks/useDataset'
import { useDispatchHourlyPattern } from '@/hooks/useHourlyPatternFactory'
import { useDispatchComparisonData } from '@/hooks/useComparisonDataFactory'
import { useAppStore } from '@/stores/appStore'
import type { DispatchCall, CallTypeAggRow, DispositionAggRow } from '@/types/datasets'
import { diffMinutes, formatDuration, formatNumber, formatDelta } from '@/utils/time'
import { SENSITIVITY_COLORS, DISPOSITION_LABELS } from '@/utils/colors'
import StatCard from '@/components/ui/StatCard'
import ResponseHistogram from '@/components/charts/ResponseHistogram'
import HourlyHeatgrid from '@/components/charts/HourlyHeatgrid'
import TrendChart from '@/components/charts/TrendChart'
import TimeOfDayFilter from '@/components/filters/TimeOfDayFilter'
import ComparisonToggle from '@/components/filters/ComparisonToggle'
import ExportButton from '@/components/export/ExportButton'
import HorizontalBarChart, { type BarDatum } from '@/components/charts/HorizontalBarChart'
import CallTypeFilter, { type CallTypeEntry } from '@/components/filters/CallTypeFilter'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import { Skeleton, SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import PeriodBreakdownChart from '@/components/charts/PeriodBreakdownChart'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useTrendBaseline } from '@/hooks/useTrendBaseline'
import type { TrendConfig } from '@/types/trends'
import InfoTip from '@/components/ui/InfoTip'

type SensitiveFilter = 'all' | 'sensitive' | 'non-sensitive'

const SENSITIVE_LABELS: Record<SensitiveFilter, string> = {
  all: 'All Calls',
  sensitive: 'Sensitive',
  'non-sensitive': 'Non-Sensitive',
}

const SELECT_FIELDS = 'cad_number,received_datetime,onscene_datetime,close_datetime,call_type_final_desc,disposition,sensitive_call,priority_final'

export default function Dispatch911() {
  const { dateRange, timeOfDayFilter, comparisonPeriod } = useAppStore()
  const [searchParams, setSearchParams] = useSearchParams()

  // View-local state synced to URL params
  const sensitiveFilter = (searchParams.get('sensitive') as SensitiveFilter) || 'all'
  const selectedCallTypesParam = searchParams.get('call_types')
  const selectedCallTypes = useMemo(
    () => selectedCallTypesParam ? new Set(selectedCallTypesParam.split(',')) : new Set<string>(),
    [selectedCallTypesParam]
  )

  const setSensitiveFilter = useCallback((filter: SensitiveFilter) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (filter === 'all') next.delete('sensitive')
      else next.set('sensitive', filter)
      return next
    }, { replace: true })
  }, [setSearchParams])

  const setSelectedCallTypes = useCallback((types: Set<string>) => {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev)
      if (types.size === 0) next.delete('call_types')
      else next.set('call_types', Array.from(types).join(','))
      return next
    }, { replace: true })
  }, [setSearchParams])

  // Build WHERE clause
  const filterClause = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`received_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`received_datetime <= '${dateRange.end}T23:59:59'`)

    if (sensitiveFilter === 'sensitive') conditions.push('sensitive_call = true')
    else if (sensitiveFilter === 'non-sensitive') conditions.push('sensitive_call = false')

    if (selectedCallTypes.size > 0) {
      const escaped = Array.from(selectedCallTypes).map((t) => `'${t.replace(/'/g, "''")}'`)
      conditions.push(`call_type_final_desc IN (${escaped.join(',')})`)
    }

    if (timeOfDayFilter) {
      const { startHour, endHour } = timeOfDayFilter
      if (startHour <= endHour) {
        conditions.push(`date_extract_hh(received_datetime) >= ${startHour} AND date_extract_hh(received_datetime) <= ${endHour}`)
      } else {
        conditions.push(`(date_extract_hh(received_datetime) >= ${startHour} OR date_extract_hh(received_datetime) <= ${endHour})`)
      }
    }

    return conditions.join(' AND ')
  }, [dateRange, sensitiveFilter, selectedCallTypes, timeOfDayFilter])

  const freshness = useDataFreshness('dispatch911Historical', 'received_datetime', dateRange)

  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'dispatch911Historical',
    dateField: 'received_datetime',
    // No neighborhoodField — 911 dispatch has no geo
  }), [])
  const trend = useTrendBaseline(trendConfig, dateRange)

  // Main records fetch
  const { data: rawData, isLoading, error, hitLimit } = useDataset<DispatchCall>(
    'dispatch911Historical',
    {
      $where: filterClause,
      $limit: 5000,
      $select: SELECT_FIELDS,
    },
    [filterClause]
  )

  // Total count query (lightweight, for truncation indicator)
  const { data: countRows } = useDataset<{ count: string }>(
    'dispatch911Historical',
    { $select: 'count(*) as count', $where: filterClause },
    [filterClause]
  )
  const totalCount = countRows[0] ? parseInt(countRows[0].count, 10) : null

  // Server-side call type aggregation (full dataset for the date range, ignoring call type filter)
  const callTypeWhere = useMemo(() => {
    const conditions: string[] = []
    conditions.push(`received_datetime >= '${dateRange.start}T00:00:00'`)
    conditions.push(`received_datetime <= '${dateRange.end}T23:59:59'`)
    if (sensitiveFilter === 'sensitive') conditions.push('sensitive_call = true')
    else if (sensitiveFilter === 'non-sensitive') conditions.push('sensitive_call = false')
    return conditions.join(' AND ')
  }, [dateRange, sensitiveFilter])

  const { data: callTypeRows } = useDataset<CallTypeAggRow>(
    'dispatch911Historical',
    {
      $select: 'call_type_final_desc, count(*) as call_count, sensitive_call',
      $group: 'call_type_final_desc, sensitive_call',
      $where: callTypeWhere,
      $order: 'call_count DESC',
      $limit: 200,
    },
    [callTypeWhere]
  )

  // Server-side disposition aggregation
  const { data: dispositionRows } = useDataset<DispositionAggRow>(
    'dispatch911Historical',
    {
      $select: 'disposition, count(*) as call_count',
      $group: 'disposition',
      $where: filterClause,
      $order: 'call_count DESC',
      $limit: 50,
    },
    [filterClause]
  )

  // Hourly pattern for heatgrid
  const hourlyExtraClause = useMemo(() => {
    const parts: string[] = []
    if (sensitiveFilter === 'sensitive') parts.push('sensitive_call = true')
    else if (sensitiveFilter === 'non-sensitive') parts.push('sensitive_call = false')
    if (selectedCallTypes.size > 0) {
      const escaped = Array.from(selectedCallTypes).map((t) => `'${t.replace(/'/g, "''")}'`)
      parts.push(`call_type_final_desc IN (${escaped.join(',')})`)
    }
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [sensitiveFilter, selectedCallTypes])

  const hourlyPattern = useDispatchHourlyPattern(dateRange, hourlyExtraClause)

  // Comparison data
  const comparison = useDispatchComparisonData(dateRange, filterClause, comparisonPeriod, rawData)
  const compLabel = comparisonPeriod ? `vs ${comparisonPeriod >= 360 ? '1yr' : `${comparisonPeriod}d`} ago` : ''

  // Compute stats from fetched records
  const stats = useMemo(() => {
    if (rawData.length === 0) return { avg: 0, median: 0, total: 0, sensitiveCount: 0, sensitivePct: 0, peakHour: 0 }
    const times: number[] = []
    let sensitiveCount = 0
    for (const r of rawData) {
      if (r.sensitive_call) sensitiveCount++
      const end = r.onscene_datetime || r.close_datetime
      if (!end) continue
      const t = diffMinutes(r.received_datetime, end)
      if (t !== null && t > 0 && t <= 120) times.push(t)
    }
    if (times.length === 0) return { avg: 0, median: 0, total: rawData.length, sensitiveCount, sensitivePct: (sensitiveCount / rawData.length) * 100, peakHour: hourlyPattern.peakHour }
    times.sort((a, b) => a - b)
    const avg = times.reduce((a, b) => a + b, 0) / times.length
    const median = times[Math.floor(times.length / 2)]
    return {
      avg,
      median,
      total: rawData.length,
      sensitiveCount,
      sensitivePct: (sensitiveCount / rawData.length) * 100,
      peakHour: hourlyPattern.peakHour,
    }
  }, [rawData, hourlyPattern.peakHour])

  // Response time array for histogram
  const histogramData = useMemo(() => {
    const times: number[] = []
    for (const r of rawData) {
      const end = r.onscene_datetime || r.close_datetime
      if (!end) continue
      const t = diffMinutes(r.received_datetime, end)
      if (t !== null && t > 0 && t <= 120) times.push(t)
    }
    return times
  }, [rawData])

  // Call type entries for sidebar filter
  const callTypeEntries: CallTypeEntry[] = useMemo(() => {
    const map = new Map<string, { count: number; isSensitive: boolean }>()
    for (const row of callTypeRows) {
      const ct = row.call_type_final_desc
      if (!ct) continue
      const count = parseInt(row.call_count, 10)
      const existing = map.get(ct)
      if (existing) {
        existing.count += count
        if (String(row.sensitive_call) === 'true') existing.isSensitive = true
      } else {
        map.set(ct, { count, isSensitive: String(row.sensitive_call) === 'true' })
      }
    }
    return Array.from(map.entries())
      .map(([callType, { count, isSensitive }]) => ({ callType, count, isSensitive }))
      .sort((a, b) => b.count - a.count)
  }, [callTypeRows])

  // Disposition data for horizontal bar chart
  const dispositionData: BarDatum[] = useMemo(() => {
    return dispositionRows
      .filter((r) => r.disposition)
      .map((r) => ({
        label: DISPOSITION_LABELS[r.disposition] || r.disposition,
        value: parseInt(r.call_count, 10),
        color: '#a78bfa',
      }))
      .slice(0, 8)
  }, [dispositionRows])

  const accentColor = SENSITIVITY_COLORS[sensitiveFilter]

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                911 Dispatch Analysis
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SFPD · Law Enforcement Dispatch
              </p>
            </div>
            {!isLoading && rawData.length > 0 && (
              <div className="flex items-center gap-1.5">
                <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-signal-emerald/80 bg-signal-emerald/10 px-2 py-1 rounded-full">
                  <span className="w-1 h-1 rounded-full bg-signal-emerald pulse-live" />
                  {formatNumber(rawData.length)} records
                </span>
                {hitLimit && totalCount !== null && (
                  <span className="text-[10px] font-mono text-amber-500/80 bg-amber-500/10 px-2 py-1 rounded-full">
                    of {formatNumber(totalCount)} total
                  </span>
                )}
              </div>
            )}
          </div>

          <div className="flex items-center gap-2">
            <ComparisonToggle />
            <ExportButton targetSelector="#d911-capture" filename="dispatch-911" />

            {/* Sensitivity filter toggle */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {(['all', 'sensitive', 'non-sensitive'] as const).map((filter) => (
                <button
                  key={filter}
                  onClick={() => setSensitiveFilter(filter)}
                  className={`px-3 py-1.5 rounded-md text-[12px] font-medium transition-all duration-200 ${
                    sensitiveFilter === filter
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                  style={sensitiveFilter === filter ? { borderBottom: `2px solid ${SENSITIVITY_COLORS[filter]}` } : undefined}
                >
                  {SENSITIVE_LABELS[filter]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </header>

      {/* Time-of-day filter sub-header */}
      {!hourlyPattern.isLoading && hourlyPattern.hourTotals.some((t) => t > 0) && (
        <div className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-2 bg-white/30 dark:bg-slate-900/30 backdrop-blur-xl z-10">
          <div className="flex items-center gap-3">
            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600 whitespace-nowrap">
              Time of Day
            </p>
            <div className="flex-1">
              <TimeOfDayFilter hourTotals={hourlyPattern.hourTotals} />
            </div>
          </div>
        </div>
      )}

      {/* Content area */}
      <div id="d911-capture" className="flex-1 overflow-hidden flex">
        {/* Scrollable chart area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading skeleton */}
          {isLoading && (
            <div className="max-w-4xl space-y-6">
              <div className="flex gap-2.5 flex-wrap">
                {Array.from({ length: 5 }, (_, i) => (
                  <div key={i} className="glass-card rounded-xl px-4 py-3 min-w-[120px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                    <Skeleton className="h-2.5 w-16 mb-3" />
                    <Skeleton className="h-6 w-20" />
                  </div>
                ))}
              </div>
              <SkeletonChart width={640} height={200} />
            </div>
          )}

          {/* Error state */}
          {error && (
            <div className="flex items-center justify-center py-16">
              <div className="glass-card rounded-xl p-6 max-w-sm">
                <p className="text-sm font-medium text-signal-red mb-1">Data Error</p>
                <p className="text-xs text-slate-400">{error}</p>
              </div>
            </div>
          )}

          {!isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
            <div className="relative h-64">
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#8b5cf6"
              />
            </div>
          )}

          {!isLoading && !error && rawData.length > 0 && (
            <div className="max-w-4xl space-y-6">
              {/* Stat cards */}
              <div className="flex gap-2.5 flex-wrap">
                <StatCard
                  label="Total Calls" info="total-calls"
                  value={formatNumber(stats.total)}
                  color={accentColor}
                  delay={0}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.total)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.total > 0 ? 'up' : comparison.deltas.total < 0 ? 'down' : 'neutral') : undefined}
                  yoyDelta={!comparison.deltas && trend.cityWideYoY ? trend.cityWideYoY.pct : null}
                />
                <StatCard
                  label="Avg Response"
                  value={stats.avg > 0 ? formatDuration(stats.avg) : 'N/A'}
                  color={stats.avg > 10 ? '#ef4444' : stats.avg > 5 ? '#f59e0b' : '#10b981'}
                  delay={80}
                  subtitle={comparison.deltas ? `${formatDelta(comparison.deltas.avg)} ${compLabel}` : undefined}
                  trend={comparison.deltas ? (comparison.deltas.avg > 0 ? 'up' : comparison.deltas.avg < 0 ? 'down' : 'neutral') : undefined}
                />
                <StatCard
                  label="Sensitive %" info="sensitive-pct"
                  value={`${stats.sensitivePct.toFixed(1)}%`}
                  color="#a78bfa"
                  delay={160}
                />
                <StatCard
                  label="Peak Hour" info="peak-hour"
                  value={stats.peakHour >= 12 ? `${stats.peakHour === 12 ? 12 : stats.peakHour - 12}pm` : `${stats.peakHour === 0 ? 12 : stats.peakHour}am`}
                  color="#f59e0b"
                  delay={240}
                />
              </div>

              {/* Hourly heatgrid — hero size */}
              <div className="glass-card rounded-xl p-4">
                <div className="flex items-center gap-2 mb-3">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60">
                    Call Volume by Hour & Day<InfoTip term="heatgrid" size={10} />
                  </p>
                  <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
                </div>
                {hourlyPattern.isLoading ? (
                  <SkeletonChart width={640} height={200} />
                ) : (
                  <>
                    <HourlyHeatgrid grid={hourlyPattern.grid} width={640} height={240} />
                    <p className="text-[10px] text-slate-400 dark:text-slate-500 mt-3 font-mono">
                      Click a cell to filter by that hour. Peak:{' '}
                      <span className="text-signal-amber">{hourlyPattern.peakHour}:00</span>
                      {' · '}Quietest:{' '}
                      <span className="text-signal-blue">{hourlyPattern.quietestHour}:00</span>
                    </p>
                  </>
                )}
              </div>

              {/* Period trend breakdown */}
              {!trend.isLoading && trend.currentPeriods.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                    Volume Trend<InfoTip term="period-trend" size={10} />
                  </p>
                  <PeriodBreakdownChart
                    current={trend.currentPeriods}
                    priorYear={trend.priorYearPeriods}
                    granularity={trend.granularity}
                    accentColor="#8b5cf6"
                    width={640}
                    height={160}
                  />
                </div>
              )}

              {/* Response histogram + Disposition breakdown side by side */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {histogramData.length > 0 && (
                  <div className="glass-card rounded-xl p-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Response Time Distribution
                    </p>
                    <ResponseHistogram data={histogramData} width={340} height={140} />
                  </div>
                )}

                {dispositionData.length > 0 && (
                  <div className="glass-card rounded-xl p-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Disposition Breakdown
                    </p>
                    <HorizontalBarChart
                      data={dispositionData}
                      width={340}
                      height={180}
                      maxBars={8}
                      valueFormatter={(v) => formatNumber(v)}
                    />
                  </div>
                )}
              </div>

              {/* Trend chart (when comparing) */}
              {comparisonPeriod !== null && comparison.currentTrend.length > 0 && (
                <div className="glass-card rounded-xl p-4">
                  <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                    Daily Trend {comparison.isLoading && '(loading\u2026)'}
                  </p>
                  <TrendChart
                    current={comparison.currentTrend}
                    comparison={comparison.comparisonTrend.length > 0 ? comparison.comparisonTrend : undefined}
                    width={640}
                    height={160}
                  />
                </div>
              )}
            </div>
          )}

          {/* Empty state */}
          {!isLoading && !error && rawData.length === 0 && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-slate-400 dark:text-slate-500 text-sm mb-1">No dispatch records found</p>
                <p className="text-slate-400/60 dark:text-slate-600 text-xs">
                  Try adjusting the date range or filters
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar — call type filter */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="p-4">
            <div className="flex items-center gap-2 mb-4">
              <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 dark:text-slate-600">
                Call Types
              </p>
              <div className="flex-1 h-[1px] bg-slate-200/50 dark:bg-white/[0.04]" />
              {selectedCallTypes.size > 0 && (
                <span className="text-[10px] font-mono text-violet-400">
                  {selectedCallTypes.size} selected
                </span>
              )}
            </div>

            {callTypeEntries.length > 0 ? (
              <CallTypeFilter
                callTypes={callTypeEntries}
                selected={selectedCallTypes}
                onChange={setSelectedCallTypes}
              />
            ) : (
              <SkeletonSidebarRows count={10} />
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}
