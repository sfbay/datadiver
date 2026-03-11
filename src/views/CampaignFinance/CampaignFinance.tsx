import { useState, useMemo, useCallback } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useDataFreshness } from '@/hooks/useDataFreshness'
import { useCampaignFinance } from '@/hooks/useCampaignFinance'
import { useCampaignDetail, type SelectedEntity } from '@/hooks/useCampaignDetail'
import { SF_ELECTIONS, getDefaultCycle, findCycleForRange } from '@/utils/electionCycles'
import StatCard from '@/components/ui/StatCard'
import DataFreshnessAlert from '@/components/ui/DataFreshnessAlert'
import ExportButton from '@/components/export/ExportButton'
import { Skeleton, SkeletonChart, SkeletonSidebarRows } from '@/components/ui/Skeleton'
import TopRecipientsChart, { type RecipientDatum, formatCurrency } from '@/components/charts/TopRecipientsChart'
import ContributionTimeline from '@/components/charts/ContributionTimeline'
import FundingSourcesChart, { buildSourceData } from '@/components/charts/FundingSourcesChart'
import ForAgainstSplit from '@/components/charts/ForAgainstSplit'
import type { CampaignFilerAggRow } from '@/types/datasets'

export default function CampaignFinance() {
  const { dateRange, setDateRange } = useAppStore()
  const [selectedEntity, setSelectedEntity] = useState<SelectedEntity | null>(null)
  const [searchFilter, setSearchFilter] = useState('')

  // Use global dateRange but default to most recent election if it doesn't match any cycle
  const effectiveRange = useMemo(() => {
    const cycle = findCycleForRange(dateRange.start, dateRange.end)
    if (cycle) return dateRange
    const defaultCycle = getDefaultCycle()
    return { start: defaultCycle.start, end: defaultCycle.end }
  }, [dateRange])

  const currentCycle = findCycleForRange(effectiveRange.start, effectiveRange.end)

  const freshness = useDataFreshness('campaignFinance', 'calculated_date', effectiveRange)
  const cfData = useCampaignFinance(effectiveRange)
  const detail = useCampaignDetail(selectedEntity, effectiveRange)

  // Transform top recipients for chart
  const recipientData: RecipientDatum[] = useMemo(() =>
    cfData.topRecipients.slice(0, 20).map(r => ({
      filerName: r.filer_name,
      filerNid: r.filer_nid,
      filerType: r.filer_type,
      total: parseFloat(r.total) || 0,
    })),
    [cfData.topRecipients]
  )

  // Timeline data
  const timelineData = useMemo(() =>
    (selectedEntity ? detail.entityTimeline : cfData.timeline).map(r => ({
      period: r.period,
      total: parseFloat(r.total) || 0,
    })),
    [selectedEntity, detail.entityTimeline, cfData.timeline]
  )

  // Funding sources
  const sourceData = useMemo(() =>
    buildSourceData(
      selectedEntity ? detail.sourceBreakdown : cfData.fundingSources,
      selectedEntity ? 0 : (cfData.stats?.selfFundingTotal || 0)
    ),
    [selectedEntity, detail.sourceBreakdown, cfData.fundingSources, cfData.stats]
  )

  // Sidebar filer list (split into candidates and measures)
  const { candidates, measures, committees } = useMemo(() => {
    const all = cfData.topRecipients
    const filter = searchFilter.toLowerCase()
    const filtered = filter
      ? all.filter(r => r.filer_name.toLowerCase().includes(filter))
      : all
    return {
      candidates: filtered.filter(r =>
        r.filer_type === 'Candidate or Officeholder' ||
        r.filer_type === 'Primarily Formed Candidate'
      ),
      measures: filtered.filter(r =>
        r.filer_type === 'Primarily Formed Measure'
      ),
      committees: filtered.filter(r =>
        r.filer_type === 'General Purpose' ||
        r.filer_type === 'Major Donor' ||
        r.filer_type === 'Independent Expenditure'
      ),
    }
  }, [cfData.topRecipients, searchFilter])

  const maxFilerTotal = useMemo(() =>
    Math.max(...cfData.topRecipients.map(r => parseFloat(r.total) || 0), 1),
    [cfData.topRecipients]
  )

  const handleSelectRecipient = useCallback((d: RecipientDatum) => {
    const parts = d.filerName.split(/\s+/)
    const lastName = parts[parts.length - 1]
    setSelectedEntity({
      filerName: d.filerName,
      filerNid: d.filerNid,
      filerType: d.filerType,
      total: d.total,
      candidateLastName: d.filerType.includes('Candidate') ? lastName : undefined,
    })
  }, [])

  const handleSelectFiler = useCallback((r: CampaignFilerAggRow) => {
    const parts = r.filer_name.split(/\s+/)
    const lastName = parts[parts.length - 1]
    setSelectedEntity({
      filerName: r.filer_name,
      filerNid: r.filer_nid,
      filerType: r.filer_type,
      total: parseFloat(r.total) || 0,
      candidateLastName: r.filer_type.includes('Candidate') ? lastName : undefined,
    })
  }, [])

  const handleBack = useCallback(() => setSelectedEntity(null), [])

  const cycleName = currentCycle?.label || 'Custom Range'

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <header className="flex-shrink-0 border-b border-slate-200/50 dark:border-white/[0.04] px-6 py-3 bg-white/50 dark:bg-slate-900/50 backdrop-blur-xl z-10">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <div>
              <h1 className="font-display text-2xl italic text-ink dark:text-white leading-none">
                Campaign Finance
              </h1>
              <p className="text-[10px] font-mono uppercase tracking-widest text-slate-400 dark:text-slate-500 mt-0.5">
                SF Ethics Commission · {cycleName}
              </p>
            </div>
            {!cfData.isLoading && cfData.stats && (
              <span className="inline-flex items-center gap-1.5 text-[10px] font-mono text-teal-500/80 bg-teal-500/10 px-2 py-1 rounded-full">
                <span className="w-1 h-1 rounded-full bg-teal-500 pulse-live" />
                {cfData.topRecipients.length} filers
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {/* Election cycle quick-select */}
            <div className="flex items-center gap-1 bg-slate-100/80 dark:bg-white/[0.04] rounded-lg p-0.5">
              {SF_ELECTIONS.slice(0, 4).map((e) => (
                <button
                  key={e.date}
                  onClick={() => setDateRange(e.start, e.end)}
                  className={`px-2.5 py-1 rounded-md text-[10px] font-mono transition-all duration-200 ${
                    effectiveRange.start === e.start && effectiveRange.end === e.end
                      ? 'bg-white dark:bg-white/[0.08] text-ink dark:text-white shadow-sm'
                      : 'text-slate-400 dark:text-slate-500 hover:text-slate-600 dark:hover:text-slate-300'
                  }`}
                >
                  {e.label}
                </button>
              ))}
            </div>
            <ExportButton targetSelector="#cf-capture" filename="campaign-finance" />
          </div>
        </div>
      </header>

      {/* Content */}
      <div id="cf-capture" className="flex-1 overflow-hidden flex">
        {/* Main chart area */}
        <div className="flex-1 overflow-y-auto p-6">
          {/* Loading */}
          {cfData.isLoading && (
            <div className="max-w-4xl space-y-6">
              <div className="flex gap-2.5 flex-wrap">
                {Array.from({ length: 4 }, (_, i) => (
                  <div key={i} className="glass-card rounded-xl px-4 py-3 min-w-[140px] animate-pulse" style={{ animationDelay: `${i * 60}ms` }}>
                    <Skeleton className="h-2.5 w-16 mb-3" />
                    <Skeleton className="h-6 w-24" />
                  </div>
                ))}
              </div>
              <SkeletonChart width={640} height={300} />
            </div>
          )}

          {/* Freshness alert */}
          {!cfData.isLoading && !freshness.isLoading && !freshness.hasDataInRange && (
            <div className="relative h-64">
              <DataFreshnessAlert
                latestDate={freshness.latestDate}
                suggestedRange={freshness.suggestedRange}
                accentColor="#14b8a6"
              />
            </div>
          )}

          {/* Error */}
          {cfData.error && (
            <div className="flex items-center justify-center py-16">
              <div className="glass-card rounded-xl p-6 max-w-sm">
                <p className="text-sm font-medium text-red-400 mb-1">Data Error</p>
                <p className="text-xs text-slate-400">{cfData.error}</p>
              </div>
            </div>
          )}

          {/* Main content */}
          {!cfData.isLoading && !cfData.error && cfData.stats && (
            <div className="max-w-4xl space-y-6">
              {/* Stat cards */}
              <div className="flex gap-2.5 flex-wrap">
                <StatCard
                  label="Total Raised" info="cf-total-raised"
                  value={formatCurrency(cfData.stats.totalRaised)}
                  color="#10b981" delay={0}
                  yoyDelta={cfData.yoy.totalRaisedDelta}
                />
                <StatCard
                  label="Avg Contribution" info="cf-avg-contribution"
                  value={formatCurrency(cfData.stats.avgContribution)}
                  color="#60a5fa" delay={80}
                />
                <StatCard
                  label="Unique Donors" info="cf-unique-donors"
                  value={cfData.stats.uniqueDonors.toLocaleString()}
                  color="#a78bfa" delay={160}
                />
                <StatCard
                  label="Small Donor %" info="cf-small-donor-pct"
                  value={`${cfData.stats.smallDonorPct.toFixed(1)}%`}
                  color="#f59e0b" delay={240}
                  yoyDelta={cfData.yoy.smallDonorDelta}
                />
              </div>

              {/* Level 2: Entity Detail */}
              {selectedEntity && (
                <>
                  {/* Back + entity header */}
                  <div className="flex items-center gap-3">
                    <button
                      onClick={handleBack}
                      className="text-slate-400 hover:text-ink dark:hover:text-white transition-colors text-sm"
                    >
                      ← Back
                    </button>
                    <div>
                      <h2 className="text-lg font-semibold text-ink dark:text-white">{selectedEntity.filerName}</h2>
                      <p className="text-[10px] font-mono text-slate-400">
                        {selectedEntity.filerType} · {formatCurrency(selectedEntity.total)} raised
                      </p>
                    </div>
                  </div>

                  {detail.isLoading ? (
                    <SkeletonChart width={640} height={200} />
                  ) : (
                    <>
                      {/* For/Against split */}
                      <ForAgainstSplit
                        supportTotal={detail.ieSupportTotal}
                        opposeTotal={detail.ieOpposeTotal}
                        directContribTotal={selectedEntity.total}
                        topDonors={detail.topDonors}
                        ieSupport={detail.ieSupport}
                        ieOppose={detail.ieOppose}
                      />

                      {/* Entity charts */}
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        {timelineData.length > 0 && (
                          <div className="glass-card rounded-xl p-4">
                            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                              Contribution Timeline
                            </p>
                            <ContributionTimeline data={timelineData} width={340} height={140} />
                          </div>
                        )}
                        {sourceData.length > 0 && (
                          <div className="glass-card rounded-xl p-4">
                            <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                              Funding Sources
                            </p>
                            <FundingSourcesChart data={sourceData} width={300} />
                          </div>
                        )}
                      </div>

                      {/* Spending categories */}
                      {detail.spendingCategories.length > 0 && (
                        <div className="glass-card rounded-xl p-4">
                          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                            Spending Categories
                          </p>
                          <div className="space-y-1.5">
                            {detail.spendingCategories.map((cat, i) => (
                              <div key={i} className="flex items-center gap-2">
                                <span className="text-[10px] text-slate-600 dark:text-slate-300 w-28 truncate">{cat.category}</span>
                                <div className="flex-1 h-3 bg-slate-200/50 dark:bg-slate-800/50 rounded-sm overflow-hidden">
                                  <div
                                    className="h-full rounded-sm bg-amber-500/60"
                                    style={{
                                      width: `${(cat.total / (detail.spendingCategories[0]?.total || 1)) * 100}%`,
                                    }}
                                  />
                                </div>
                                <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400 w-16 text-right">
                                  {formatCurrency(cat.total)}
                                </span>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}
                    </>
                  )}
                </>
              )}

              {/* Level 1: Election Overview */}
              {!selectedEntity && (
                <>
                  {/* Top Recipients hero chart */}
                  <div className="glass-card rounded-xl p-4">
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Top Recipients
                    </p>
                    <TopRecipientsChart
                      data={recipientData}
                      width={640}
                      onSelect={handleSelectRecipient}
                    />
                  </div>

                  {/* Timeline + Funding Sources side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {timelineData.length > 0 && (
                      <div className="glass-card rounded-xl p-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                          Contribution Timeline
                        </p>
                        <ContributionTimeline data={timelineData} width={340} height={140} />
                      </div>
                    )}
                    {sourceData.length > 0 && (
                      <div className="glass-card rounded-xl p-4">
                        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                          Funding Sources
                        </p>
                        <FundingSourcesChart data={sourceData} width={300} />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
          )}

          {/* Empty state */}
          {!cfData.isLoading && !cfData.error && !cfData.stats && (
            <div className="flex items-center justify-center py-16">
              <div className="text-center">
                <p className="text-slate-400 dark:text-slate-500 text-sm mb-1">No campaign finance data in this period</p>
                <p className="text-slate-400/60 dark:text-slate-600 text-xs">
                  Try selecting a different election cycle
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Right sidebar */}
        <aside className="w-80 flex-shrink-0 border-l border-slate-200/50 dark:border-white/[0.04] overflow-y-auto bg-white/50 dark:bg-slate-900/30 backdrop-blur-xl flex flex-col">
          <div className="p-4">
            {/* Search filter */}
            <input
              type="text"
              placeholder="Search filers…"
              value={searchFilter}
              onChange={(e) => setSearchFilter(e.target.value)}
              className="w-full mb-4 px-3 py-1.5 rounded-lg bg-slate-100/80 dark:bg-white/[0.04] border border-slate-200/50 dark:border-white/[0.04] text-sm text-ink dark:text-white placeholder-slate-400 dark:placeholder-slate-600 focus:outline-none focus:ring-1 focus:ring-teal-500/50"
            />

            {cfData.isLoading ? (
              <SkeletonSidebarRows count={8} />
            ) : (
              <>
                {/* Candidates section */}
                {candidates.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Candidates ({candidates.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {candidates.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Measures section */}
                {measures.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Ballot Measures ({measures.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {measures.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}

                {/* Committees section */}
                {committees.length > 0 && (
                  <>
                    <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Committees ({committees.length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {committees.map((r) => (
                        <FilerRow
                          key={r.filer_nid}
                          filer={r}
                          maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)}
                        />
                      ))}
                    </div>
                  </>
                )}
              </>
            )}

            {/* Donor Geography placeholder */}
            {!cfData.isLoading && cfData.donorGeo.length > 0 && (
              <div className="mt-4">
                <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                  Donor Geography
                </p>
                <div className="glass-card rounded-xl overflow-hidden" style={{ height: 200 }}>
                  <div className="h-full flex items-center justify-center text-[10px] text-slate-500">
                    Donor map — requires sf-zipcodes.geojson
                  </div>
                </div>
              </div>
            )}
          </div>
        </aside>
      </div>
    </div>
  )
}

/** Sidebar filer row with mini bar */
function FilerRow({
  filer, maxTotal, isSelected, onSelect,
}: {
  filer: CampaignFilerAggRow
  maxTotal: number
  isSelected: boolean
  onSelect: () => void
}) {
  const total = parseFloat(filer.total) || 0
  const pct = (total / maxTotal) * 100

  return (
    <button
      onClick={onSelect}
      className={`w-full text-left px-3 py-2 rounded-lg transition-all duration-150 ${
        isSelected
          ? 'bg-teal-500/10 border border-teal-500/20'
          : 'hover:bg-slate-100/50 dark:hover:bg-white/[0.02]'
      }`}
    >
      <div className="flex justify-between items-baseline mb-1">
        <span className="text-[11px] text-slate-700 dark:text-slate-200 font-medium truncate max-w-[65%]">
          {filer.filer_name}
        </span>
        <span className="text-[10px] font-mono text-slate-400">
          {formatCurrency(total)}
        </span>
      </div>
      <div className="w-full h-1.5 bg-slate-200/50 dark:bg-slate-800/50 rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{
            width: `${pct}%`,
            backgroundColor: isSelected ? '#14b8a6' : '#64748b',
            opacity: isSelected ? 0.8 : 0.4,
          }}
        />
      </div>
    </button>
  )
}
