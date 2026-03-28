// src/views/Neighborhood/ComparisonView.tsx

/** Comparison sidebar: overlaid fingerprint + legend + proportional domain bars + cross-links */

import { useMemo } from 'react'
import { useNavigate } from 'react-router-dom'
import CivicFingerprint from './CivicFingerprint'
import type { NeighborhoodProfile, MetricDomain } from './types'
import { DOMAINS, SLOT_COLORS, DOMAIN_ROUTES } from './types'

interface ComparisonViewProps {
  /** Profiles in slot order (index 0 = primary/purple, 1 = cyan, 2 = green) */
  profiles: NeighborhoodProfile[]
  onRemove: (name: string) => void
  /** Click a neighborhood name → zoom map + load portrait */
  onFocus?: (name: string) => void
}

function fmt(n: number): string {
  return n >= 10_000 ? `${(n / 1000).toFixed(1)}K` : n.toLocaleString()
}

/** Proportional bars for one domain across all compared neighborhoods */
function DomainBars({
  domain,
  profiles,
}: {
  domain: { key: MetricDomain; label: string; color: string }
  profiles: NeighborhoodProfile[]
}) {
  const navigate = useNavigate()
  const maxCount = Math.max(...profiles.map((p) => p[domain.key]?.count ?? 0), 1)

  return (
    <div className="mb-3">
      <div className="flex items-center justify-between mb-1.5 px-0.5">
        <span className="text-[10px] font-mono" style={{ color: domain.color }}>
          {domain.label}
        </span>
        <button
          onClick={() => {
            const primary = profiles[0]
            if (primary) navigate(`${DOMAIN_ROUTES[domain.key]}?neighborhood=${encodeURIComponent(primary.name)}`)
          }}
          className="text-[9px] font-mono text-slate-600 hover:text-slate-400 transition-colors"
          title={`Open ${domain.label} view`}
        >
          →
        </button>
      </div>
      <div className="space-y-[3px]">
        {profiles.map((profile, i) => {
          const metric = profile[domain.key]
          if (!metric) return null
          const widthPct = (metric.count / maxCount) * 100
          const slot = SLOT_COLORS[i]
          return (
            <div key={profile.name} className="flex items-center gap-2">
              <div className="flex-1 h-[6px] rounded-full bg-white/[0.04] overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{ width: `${widthPct}%`, backgroundColor: slot.hex }}
                />
              </div>
              <span className="text-[9px] font-mono tabular-nums w-10 text-right" style={{ color: slot.hex }}>
                {fmt(metric.count)}
              </span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default function ComparisonView({ profiles, onRemove, onFocus }: ComparisonViewProps) {
  const primary = profiles[0]
  const ghosts = useMemo(
    () =>
      profiles.slice(1).map((p, i) => ({
        profile: p,
        color: SLOT_COLORS[i + 1].hex,
        dashArray: SLOT_COLORS[i + 1].dashArray,
      })),
    [profiles]
  )

  return (
    <div className="space-y-4 animate-in fade-in slide-in-from-bottom-2 duration-300">
      {/* Selected neighborhoods with remove buttons */}
      <div className="space-y-1">
        {profiles.map((p, i) => (
          <div key={p.name} className="flex items-center justify-between px-1">
            <div className="flex items-center gap-2 min-w-0">
              <div
                className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: SLOT_COLORS[i].hex }}
              />
              <button
                onClick={() => onFocus?.(p.name)}
                className="text-[11px] text-slate-300 truncate hover:text-white transition-colors text-left"
                title={`Zoom to ${p.name}`}
              >
                {p.name}
              </button>
            </div>
            <button
              onClick={() => onRemove(p.name)}
              className="text-[9px] text-slate-600 hover:text-slate-400 transition-colors flex-shrink-0 ml-2"
            >
              ✕
            </button>
          </div>
        ))}
        {profiles.length < 3 && (
          <p className="text-[9px] font-mono text-slate-600 italic px-1 mt-1">
            Click a neighborhood to add ({3 - profiles.length} remaining)
          </p>
        )}
      </div>

      {/* Overlaid fingerprint */}
      {primary && (
        <div className="flex flex-col items-center py-2">
          <CivicFingerprint
            profile={primary}
            size={160}
            showLabels
            animate
            ghostProfiles={ghosts}
          />
          {/* Legend */}
          <div className="flex items-center gap-3 mt-2">
            {profiles.map((p, i) => (
              <span key={p.name} className="flex items-center gap-1">
                <span
                  className="inline-block w-3 h-[2px]"
                  style={{ backgroundColor: SLOT_COLORS[i].hex }}
                />
                <span className="text-[8px] font-mono" style={{ color: SLOT_COLORS[i].hex }}>
                  {p.name.length > 14 ? p.name.slice(0, 12) + '...' : p.name}
                </span>
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Domain comparison bars */}
      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2 px-0.5">
          Safety
        </p>
        <DomainBars domain={DOMAINS[0]} profiles={profiles} />
        <DomainBars domain={DOMAINS[1]} profiles={profiles} />
        <DomainBars domain={DOMAINS[3]} profiles={profiles} />
      </div>

      <div>
        <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-slate-500 mb-2 px-0.5">
          Quality of Life
        </p>
        <DomainBars domain={DOMAINS[2]} profiles={profiles} />
        <DomainBars domain={DOMAINS[4]} profiles={profiles} />
      </div>

      {/* Summary z-scores */}
      <div className="flex items-center justify-center gap-4 pt-2 border-t border-white/[0.04]">
        {profiles.map((p, i) => (
          <span key={p.name} className="text-[10px] font-mono tabular-nums" style={{ color: SLOT_COLORS[i].hex }}>
            {p.compositeZScore >= 0 ? '+' : ''}{p.compositeZScore.toFixed(1)}σ
          </span>
        ))}
      </div>
    </div>
  )
}
