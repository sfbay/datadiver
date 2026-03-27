/**
 * CivicFingerprint — a radial chart visualizing a neighborhood's cross-dataset
 * z-scores as a unique geometric shape. Normal neighborhoods are roughly circular.
 * Anomalous ones are spiky — you can SEE the civic character of a place at a glance.
 *
 * 5 axes: Emergency (red), Crime (orange), 311 (blue), Crashes (amber), Citations (cyan)
 */

import { useMemo } from 'react'
import type { NeighborhoodProfile } from './types'
import { DOMAINS } from './types'

interface CivicFingerprintProps {
  profile: NeighborhoodProfile
  size?: number
  showLabels?: boolean
  /** Animate on mount */
  animate?: boolean
  className?: string
}

const TAU = 2 * Math.PI

export default function CivicFingerprint({
  profile,
  size = 120,
  showLabels = true,
  animate = true,
  className = '',
}: CivicFingerprintProps) {
  const cx = size / 2
  const cy = size / 2
  const maxR = size / 2 - (showLabels ? 18 : 6)

  // Normalize z-scores: clamp to [-3, 3], map to [0.15, 1.0] radius fraction
  // A z-score of 0 maps to 0.35 (baseline), positive = larger, negative = smaller
  const normalizedValues = useMemo(() => {
    return DOMAINS.map(({ key }) => {
      const metric = profile[key]
      if (!metric) return 0.15 // no data — minimal dot
      const z = Math.max(-3, Math.min(3, metric.zScore))
      return 0.35 + (z / 3) * 0.55 // maps [-3,3] to [0.15, 0.9] then shifted
    })
  }, [profile])

  // Compute polygon points
  const points = useMemo(() => {
    return normalizedValues.map((v, i) => {
      const angle = (i / DOMAINS.length) * TAU - Math.PI / 2 // start from top
      const r = v * maxR
      return {
        x: cx + Math.cos(angle) * r,
        y: cy + Math.sin(angle) * r,
        labelX: cx + Math.cos(angle) * (maxR + 12),
        labelY: cy + Math.sin(angle) * (maxR + 12),
      }
    })
  }, [normalizedValues, cx, cy, maxR])

  const polygonPath = points.map((p) => `${p.x},${p.y}`).join(' ')

  // Grid rings at 33%, 66%, 100%
  const rings = [0.33, 0.66, 1.0]

  return (
    <svg
      width={size}
      height={size}
      viewBox={`0 0 ${size} ${size}`}
      className={className}
    >
      {/* Background rings */}
      {rings.map((r) => (
        <circle
          key={r}
          cx={cx}
          cy={cy}
          r={maxR * r}
          fill="none"
          stroke="rgba(255,255,255,0.1)"
          strokeWidth={0.5}
        />
      ))}

      {/* Axis lines */}
      {DOMAINS.map((_, i) => {
        const angle = (i / DOMAINS.length) * TAU - Math.PI / 2
        return (
          <line
            key={i}
            x1={cx}
            y1={cy}
            x2={cx + Math.cos(angle) * maxR}
            y2={cy + Math.sin(angle) * maxR}
            stroke="rgba(255,255,255,0.06)"
            strokeWidth={0.5}
          />
        )
      })}

      {/* Baseline ring (z=0) at 35% — the "normal" line */}
      <circle
        cx={cx}
        cy={cy}
        r={maxR * 0.35}
        fill="none"
        stroke="rgba(255,255,255,0.35)"
        strokeWidth={0.75}
        strokeDasharray="3,3"
      />

      {/* Filled polygon */}
      <polygon
        points={polygonPath}
        fill="rgba(168,85,247,0.12)"
        stroke="rgba(168,85,247,0.6)"
        strokeWidth={1.5}
        strokeLinejoin="round"
        className={animate ? 'animate-fingerprint-in' : ''}
      />

      {/* Data points with domain colors */}
      {points.map((p, i) => {
        const isAnomaly = Math.abs(
          profile[DOMAINS[i].key]?.zScore ?? 0
        ) > 1
        return (
          <g key={i}>
            <circle
              cx={p.x}
              cy={p.y}
              r={isAnomaly ? 3.5 : 2.5}
              fill={DOMAINS[i].color}
              stroke="rgba(15,23,42,0.8)"
              strokeWidth={1}
              className={isAnomaly && animate ? 'animate-pulse-subtle' : ''}
            />
          </g>
        )
      })}

      {/* Axis labels */}
      {showLabels && points.map((p, i) => (
        <text
          key={i}
          x={p.labelX}
          y={p.labelY}
          textAnchor="middle"
          dominantBaseline="central"
          fill={DOMAINS[i].color}
          fontSize={7}
          fontFamily="Space Mono, monospace"
          opacity={0.8}
        >
          {DOMAINS[i].short}
        </text>
      ))}
    </svg>
  )
}

/**
 * Tiny inline fingerprint for use in list rows (no labels, small)
 */
export function MiniFingerprint({ profile }: { profile: NeighborhoodProfile }) {
  return (
    <CivicFingerprint
      profile={profile}
      size={32}
      showLabels={false}
      animate={false}
      className="flex-shrink-0"
    />
  )
}
