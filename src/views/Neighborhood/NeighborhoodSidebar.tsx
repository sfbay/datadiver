/** Neighborhood sidebar — picker list ↔ deep profile with civic fingerprint */

import { useState, useMemo } from 'react'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import CivicFingerprint, { MiniFingerprint } from './CivicFingerprint'
import type { NeighborhoodProfile, MetricDomain, SortKey, DatasetMetric } from './types'
import { DOMAINS } from './types'

interface Props {
  profiles: NeighborhoodProfile[]
  selectedNeighborhood: string | null
  onSelectNeighborhood: (name: string | null) => void
  isLoading: boolean
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
}: {
  label: string
  metric: DatasetMetric | null
  color: string
  maxCount: number
}) {
  if (!metric) return null
  const barWidth = maxCount > 0 ? (metric.count / maxCount) * 100 : 0
  return (
    <div className="relative py-2 px-2.5 rounded-lg group">
      {/* Background bar */}
      <div
        className="absolute inset-y-0 left-0 rounded-lg transition-all duration-500"
        style={{ width: `${barWidth}%`, backgroundColor: color, opacity: 0.08 }}
      />
      <div className="relative flex items-center justify-between">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-1.5 h-1.5 rounded-full flex-shrink-0" style={{ backgroundColor: color }} />
          <span className="text-[11px] text-slate-300 truncate">{label}</span>
        </div>
        <div className="flex items-center gap-2.5 flex-shrink-0">
          <span className="text-[12px] font-mono text-slate-300 tabular-nums">{fmt(metric.count)}</span>
          <YoYBadge pct={metric.yoyPct} />
          <ZDot z={metric.zScore} />
        </div>
      </div>
    </div>
  )
}

/** Deep profile view for a selected neighborhood */
function ProfileView({ profile }: { profile: NeighborhoodProfile }) {
  // Find max count for bar scaling
  const maxCount = Math.max(
    ...DOMAINS.map(({ key }) => profile[key]?.count ?? 0),
    1
  )

  return (
    <div className="space-y-5 animate-in fade-in slide-in-from-bottom-2 duration-300">
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
          <MetricRow label="Emergency Response" metric={profile.emergency} color="#ef4444" maxCount={maxCount} />
          <MetricRow label="Crime Incidents" metric={profile.crime} color="#f97316" maxCount={maxCount} />
          <MetricRow label="Traffic Crashes" metric={profile.crashes} color="#eab308" maxCount={maxCount} />
        </div>
      </div>

      {/* Quality of Life section */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-1.5 px-1">
          Quality of Life
        </p>
        <div className="space-y-0.5">
          <MetricRow label="311 Cases" metric={profile.cases311} color="#3b82f6" maxCount={maxCount} />
          <MetricRow label="Parking Citations" metric={profile.citations} color="#06b6d4" maxCount={maxCount} />
        </div>
      </div>

      {/* Census context — future: wire up when Census integration lands */}
    </div>
  )
}

export default function NeighborhoodSidebar({
  profiles,
  selectedNeighborhood,
  onSelectNeighborhood,
  isLoading,
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
            {selectedNeighborhood ? 'Neighborhood Profile' : '41 Neighborhoods'}
          </p>
          {selectedNeighborhood && (
            <button
              onClick={() => onSelectNeighborhood(null)}
              className="text-[9px] font-mono text-purple-400 hover:text-purple-300 transition-colors"
            >
              All neighborhoods
            </button>
          )}
        </div>

        {selectedNeighborhood ? (
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
          </div>
        )}
      </div>

      {/* Content */}
      <div className="flex-1 overflow-y-auto scrollbar-thin px-2 py-2">
        {isLoading ? (
          <SkeletonSidebarRows count={14} />
        ) : selectedProfile ? (
          <ProfileView profile={selectedProfile} />
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
