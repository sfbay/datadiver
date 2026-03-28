/** Neighborhood sidebar — picker list ↔ deep profile with civic fingerprint */

import { useState, useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import CivicFingerprint, { MiniFingerprint } from './CivicFingerprint'
import ComparisonView from './ComparisonView'
import type { NeighborhoodProfile, MetricDomain, SortKey, DatasetMetric } from './types'
import { DOMAINS, SLOT_COLORS, DOMAIN_ROUTES } from './types'

interface Props {
  profiles: NeighborhoodProfile[]
  profileMap: Map<string, NeighborhoodProfile>
  selectedNeighborhood: string | null
  onSelectNeighborhood: (name: string | null) => void
  isLoading: boolean
  compareMode: boolean
  onToggleCompare: () => void
  compareSet: string[]
  onAddToCompare: (name: string) => void
  onRemoveFromCompare: (name: string) => void
  onDiveIn?: () => void
  isDiveInActive?: boolean
  isDiveInLoading?: boolean
  onFocusNeighborhood?: (name: string) => void
  visibleDomains?: Set<import('./types').MetricDomain>
  onToggleDomain?: (domain: import('./types').MetricDomain) => void
}

function fmt(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
}

function YoYBadge({ pct }: { pct: number }) {
  const positive = pct > 0
  return (
    <span className={`text-[10px] font-mono tabular-nums ${positive ? 'text-red-400' : pct < 0 ? 'text-emerald-400' : 'text-slate-500'}`}>
      {positive ? '+' : ''}{pct.toFixed(0)}%
    </span>
  )
}

function ZDot({ z }: { z: number }) {
  if (Math.abs(z) <= 1) return null
  return (
    <span
      className={`inline-block w-1.5 h-1.5 rounded-full ${z > 1 ? 'bg-red-400' : 'bg-blue-400'}`}
      title={`z-score: ${z >= 0 ? '+' : ''}${z.toFixed(1)}`}
    />
  )
}

/** Single metric row in the deep profile */
function MetricRow({
  label,
  metric,
  color,
  maxCount,
  domainKey,
  neighborhood,
  isVisible,
  onToggle,
}: {
  label: string
  metric: DatasetMetric | null
  color: string
  maxCount: number
  domainKey?: MetricDomain
  neighborhood?: string
  isVisible?: boolean
  onToggle?: () => void
}) {
  const navigate = useNavigate()
  if (!metric) return null
  const barWidth = maxCount > 0 ? (metric.count / maxCount) * 100 : 0
  const dimmed = isVisible === false
  return (
    <div className={`relative py-2 px-2.5 rounded-lg group transition-opacity duration-200 ${dimmed ? 'opacity-35' : ''}`}>
      {/* Background bar */}
      <div
        className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
        style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.08 }}
      />
      <div className="relative flex items-center justify-between">
        <button
          onClick={onToggle}
          className="flex items-center gap-2 min-w-0 cursor-pointer hover:brightness-125 transition-all"
          title={dimmed ? `Show ${label} on map` : `Hide ${label} on map`}
        >
          <div
            className={`w-1.5 h-1.5 rounded-full flex-shrink-0 transition-all ${dimmed ? 'ring-1 ring-current' : ''}`}
            style={{ backgroundColor: dimmed ? 'transparent' : color, color }}
          />
          <span className="text-[11px] text-slate-300 truncate">{label}</span>
        </button>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12px] font-mono text-slate-300 tabular-nums">{fmt(metric.count)}</span>
          <YoYBadge pct={metric.yoyPct} />
          <ZDot z={metric.zScore} />
          {domainKey && neighborhood && (
            <button
              onClick={(e) => {
                e.stopPropagation()
                navigate(`${DOMAIN_ROUTES[domainKey]}?neighborhood=${encodeURIComponent(neighborhood)}`)
              }}
              className="opacity-0 group-hover:opacity-100 text-[10px] text-slate-600 hover:text-slate-300 transition-all ml-0.5"
              title={`Open ${label} view`}
            >
              →
            </button>
          )}
        </div>
      </div>
    </div>
  )
}

/** Deep profile view for a selected neighborhood */
function ProfileView({ profile, onDiveIn, isDiveInActive, isDiveInLoading, visibleDomains, onToggleDomain }: {
  profile: NeighborhoodProfile
  onDiveIn?: () => void
  isDiveInActive?: boolean
  isDiveInLoading?: boolean
  visibleDomains?: Set<MetricDomain>
  onToggleDomain?: (domain: MetricDomain) => void
}) {
  // Find max count for bar scaling
  const maxCount = Math.max(
    ...DOMAINS.map(({ key }) => profile[key]?.count ?? 0),
    1
  )

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Dive In button */}
      {onDiveIn && !isDiveInActive && (
        <button
          onClick={onDiveIn}
          disabled={isDiveInLoading}
          className="w-full py-2.5 rounded-xl glass-card text-[11px] font-mono uppercase tracking-wider text-purple-400 hover:text-purple-300 hover:bg-purple-500/10 transition-all duration-200 flex items-center justify-center gap-2"
        >
          <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
            <path d="M6 2v8M3 7l3 3 3-3" />
          </svg>
          {isDiveInLoading ? 'Loading portrait...' : 'Dive In \u2014 explore on map'}
        </button>
      )}
      {isDiveInActive && (
        <div className="text-center py-1">
          <span className="text-[9px] font-mono text-purple-400/60 uppercase tracking-wider">Data portrait active on map</span>
        </div>
      )}

      {/* Civic Fingerprint — the hero */}
      <div className="flex flex-col items-center py-3">
        <CivicFingerprint profile={profile} size={140} showLabels />
        <p className="text-[9px] font-mono text-slate-500 mt-2 tracking-wider uppercase">
          Civic Fingerprint
        </p>
      </div>

      {/* Headline stats — 3 cards */}
      <div className="grid grid-cols-3 gap-2">
        <div className="glass-card rounded-xl px-3 py-2.5 text-center">
          <p className="text-[16px] font-mono font-semibold text-white tabular-nums">{fmt(profile.totalEvents)}</p>
          <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">Events</p>
        </div>
        <div className="glass-card rounded-xl px-3 py-2.5 text-center">
          <p className={`text-[16px] font-mono font-semibold tabular-nums ${profile.compositeZScore > 1 ? 'text-red-400' : profile.compositeZScore < -1 ? 'text-blue-400' : 'text-slate-300'}`}>
            {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}
          </p>
          <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">Z-Score</p>
        </div>
        <div className="glass-card rounded-xl px-3 py-2.5 text-center">
          <p className={`text-[16px] font-mono font-semibold tabular-nums ${profile.anomalyCount > 2 ? 'text-red-400' : profile.anomalyCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
            {profile.anomalyCount}/5
          </p>
          <p className="text-[8px] font-mono text-slate-500 uppercase tracking-wider mt-0.5">Anomalies</p>
        </div>
      </div>

      {/* Safety section */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1.5 px-1">
          Safety
        </p>
        <div className="space-y-0.5">
          <MetricRow label="Emergency Response" metric={profile.emergency} color="#ef4444" maxCount={maxCount} domainKey="emergency" neighborhood={profile.name} isVisible={visibleDomains?.has('emergency')} onToggle={() => onToggleDomain?.('emergency')} />
          <MetricRow label="Crime Incidents" metric={profile.crime} color="#f97316" maxCount={maxCount} domainKey="crime" neighborhood={profile.name} isVisible={visibleDomains?.has('crime')} onToggle={() => onToggleDomain?.('crime')} />
          <MetricRow label="Traffic Crashes" metric={profile.crashes} color="#eab308" maxCount={maxCount} domainKey="crashes" neighborhood={profile.name} isVisible={visibleDomains?.has('crashes')} onToggle={() => onToggleDomain?.('crashes')} />
        </div>
      </div>

      {/* Quality of Life section */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1.5 px-1">
          Quality of Life
        </p>
        <div className="space-y-0.5">
          <MetricRow label="311 Cases" metric={profile.cases311} color="#3b82f6" maxCount={maxCount} domainKey="cases311" neighborhood={profile.name} isVisible={visibleDomains?.has('cases311')} onToggle={() => onToggleDomain?.('cases311')} />
          <MetricRow label="Parking Citations" metric={profile.citations} color="#06b6d4" maxCount={maxCount} domainKey="citations" neighborhood={profile.name} isVisible={visibleDomains?.has('citations')} onToggle={() => onToggleDomain?.('citations')} />
        </div>
      </div>

      {/* Census context — future: wire up when Census integration lands */}
    </div>
  )
}

export default function NeighborhoodSidebar({
  profiles,
  profileMap,
  selectedNeighborhood,
  onSelectNeighborhood,
  isLoading,
  compareMode,
  onToggleCompare,
  compareSet,
  onAddToCompare,
  onRemoveFromCompare,
  onDiveIn,
  isDiveInActive,
  isDiveInLoading,
  onFocusNeighborhood,
  visibleDomains,
  onToggleDomain,
}: Props) {
  const [sortKey, setSortKey] = useState<SortKey>('totalEvents')

  const sorted = useMemo(() => {
    const copy = [...profiles]
    switch (sortKey) {
      case 'name': return copy.sort((a, b) => a.name.localeCompare(b.name))
      case 'totalEvents': return copy.sort((a, b) => b.totalEvents - a.totalEvents)
      case 'compositeZScore': return copy.sort((a, b) => b.compositeZScore - a.compositeZScore)
      case 'anomalyCount': return copy.sort((a, b) => b.anomalyCount - a.anomalyCount || b.compositeZScore - a.compositeZScore)
      default: return copy.sort((a, b) => (b[sortKey as MetricDomain]?.count ?? 0) - (a[sortKey as MetricDomain]?.count ?? 0))
    }
  }, [profiles, sortKey])

  const selectedProfile = selectedNeighborhood
    ? profiles.find((p) => p.name === selectedNeighborhood) ?? null
    : null

  const compareProfiles = useMemo(
    () => compareSet.map((name) => profileMap.get(name)).filter((p): p is NeighborhoodProfile => !!p),
    [compareSet, profileMap]
  )

  const sortButtons: { key: SortKey; label: string }[] = [
    { key: 'totalEvents', label: 'Events' },
    { key: 'compositeZScore', label: 'Z-Score' },
    { key: 'anomalyCount', label: 'Anomalies' },
    { key: 'name', label: 'A-Z' },
  ]

  return (
    <aside className="w-[300px] flex-shrink-0 border-l border-white/[0.06] flex flex-col h-full overflow-hidden bg-black/20">
      {/* Header */}
      <div className="px-4 pt-4 pb-3 border-b border-white/[0.04]">
        <div className="flex items-center justify-between mb-1">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500">
            {compareMode
              ? `Comparing ${compareSet.length} of 3`
              : selectedNeighborhood
                ? 'Neighborhood Profile'
                : '41 Neighborhoods'}
          </p>
          <div className="flex items-center gap-2">
            {compareMode && (
              <button
                onClick={onToggleCompare}
                className="text-[9px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
              >
                Exit compare
              </button>
            )}
            {!compareMode && selectedNeighborhood && (
              <button
                onClick={() => onSelectNeighborhood(null)}
                className="text-[9px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
              >
                All neighborhoods
              </button>
            )}
          </div>
        </div>

        {compareMode ? (
          <p className="text-[12px] text-slate-400 font-mono italic mt-1">
            Click neighborhoods on the map or list
          </p>
        ) : selectedNeighborhood ? (
          <h2 className="text-[18px] font-display italic text-white leading-tight">
            {selectedNeighborhood}
          </h2>
        ) : (
          <div className="flex gap-1 mt-1.5">
            {sortButtons.map(({ key, label }) => (
              <button
                key={key}
                onClick={() => setSortKey(key)}
                className={`text-[9px] font-mono px-2 py-0.5 rounded-full transition-all duration-200 ${
                  sortKey === key
                    ? 'bg-purple-500/20 text-purple-300 ring-1 ring-purple-500/20'
                    : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
                }`}
              >
                {label}
              </button>
            ))}
            {/* Compare toggle */}
            <button
              onClick={onToggleCompare}
              className={`text-[9px] font-mono px-2 py-0.5 rounded-full transition-all duration-200 ml-auto ${
                compareMode
                  ? 'bg-purple-500/30 text-purple-300 ring-1 ring-purple-500/30'
                  : 'text-slate-500 hover:text-slate-300 hover:bg-white/[0.04]'
              }`}
              title="Compare up to 3 neighborhoods"
            >
              Compare
            </button>
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        {isLoading ? (
          <SkeletonSidebarRows count={14} />
        ) : compareMode && compareProfiles.length >= 2 ? (
          <>
            <ComparisonView profiles={compareProfiles} onRemove={onRemoveFromCompare} onFocus={onFocusNeighborhood} />
            {compareSet.length < 3 && (
              <div className="mt-4 pt-3 border-t border-white/[0.04]">
                <p className="text-[9px] font-mono text-slate-500 uppercase tracking-wider mb-2 px-1">Add neighborhood</p>
                <div className="space-y-0.5 max-h-40 overflow-y-auto">
                  {sorted.filter((p) => !compareSet.includes(p.name)).slice(0, 15).map((profile) => (
                    <button
                      key={profile.name}
                      onClick={() => onAddToCompare(profile.name)}
                      className="w-full text-left py-1.5 px-2 rounded-md text-[11px] text-slate-400 hover:text-white hover:bg-white/[0.04] transition-colors truncate"
                    >
                      + {profile.name}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        ) : compareMode ? (
          /* Compare mode list: show numbered circle indicators */
          <div className="space-y-0.5">
            {sorted.map((profile, i) => {
              const slotIndex = compareSet.indexOf(profile.name)
              const isSelected = slotIndex !== -1
              return (
                <button
                  key={profile.name}
                  onClick={() => {
                    if (isSelected) onRemoveFromCompare(profile.name)
                    else if (compareSet.length < 3) onAddToCompare(profile.name)
                  }}
                  className={`w-full text-left py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-150 group ${
                    isSelected ? 'bg-white/[0.06]' : 'hover:bg-white/[0.04]'
                  } ${!isSelected && compareSet.length >= 3 ? 'opacity-40 cursor-not-allowed' : ''}`}
                  style={{ animationDelay: `${i * 15}ms` }}
                  disabled={!isSelected && compareSet.length >= 3}
                >
                  <div className="flex items-center gap-2.5">
                    {/* Numbered circle indicator or empty circle */}
                    <div
                      className={`w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0 text-[9px] font-mono font-bold transition-all ${
                        isSelected ? 'text-white' : 'border border-white/20 text-slate-600'
                      }`}
                      style={isSelected ? { backgroundColor: SLOT_COLORS[slotIndex].hex } : undefined}
                    >
                      {isSelected ? slotIndex + 1 : ''}
                    </div>
                    {/* Text */}
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] font-medium text-slate-200 truncate leading-tight group-hover:text-white transition-colors">
                        {profile.name}
                      </p>
                      <p className="text-[10px] text-slate-500 font-mono italic">
                        {fmt(profile.totalEvents)} events
                        {profile.anomalyCount > 0 && (
                          <span className="text-amber-400/80">
                            {' '}{profile.anomalyCount} anomal{profile.anomalyCount === 1 ? 'y' : 'ies'}
                          </span>
                        )}
                      </p>
                    </div>
                    {/* Z-score */}
                    <div className="flex items-center gap-1.5 flex-shrink-0">
                      <ZDot z={profile.compositeZScore} />
                      <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                        {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}σ
                      </span>
                    </div>
                  </div>
                </button>
              )
            })}
          </div>
        ) : selectedProfile ? (
          <ProfileView
            profile={selectedProfile}
            onDiveIn={onDiveIn}
            isDiveInActive={isDiveInActive}
            isDiveInLoading={isDiveInLoading}
            visibleDomains={visibleDomains}
            onToggleDomain={onToggleDomain}
          />
        ) : (
          <div className="space-y-0.5">
            {sorted.map((profile, i) => (
              <button
                key={profile.name}
                onClick={() => onSelectNeighborhood(profile.name)}
                className="w-full text-left py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-150 hover:bg-white/[0.04] group"
                style={{ animationDelay: `${i * 15}ms` }}
              >
                <div className="flex items-center gap-2.5">
                  {/* Mini fingerprint */}
                  <MiniFingerprint profile={profile} />
                  {/* Text */}
                  <div className="min-w-0 flex-1">
                    <p className="text-[12px] font-medium text-slate-200 truncate leading-tight group-hover:text-white transition-colors">
                      {profile.name}
                    </p>
                    <p className="text-[10px] text-slate-500 font-mono italic">
                      {fmt(profile.totalEvents)} events
                      {profile.anomalyCount > 0 && (
                        <span className="text-amber-400/80">
                          {' '}{profile.anomalyCount} anomal{profile.anomalyCount === 1 ? 'y' : 'ies'}
                        </span>
                      )}
                    </p>
                  </div>
                  {/* Z-score */}
                  <div className="flex items-center gap-1.5 flex-shrink-0">
                    <ZDot z={profile.compositeZScore} />
                    <span className="text-[10px] font-mono text-slate-500 tabular-nums">
                      {profile.compositeZScore >= 0 ? '+' : ''}{profile.compositeZScore.toFixed(1)}σ
                    </span>
                  </div>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>
    </aside>
  )
}
