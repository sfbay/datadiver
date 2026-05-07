import { useMemo } from 'react'
import { InvestigationCard } from './InvestigationCard'
import { useAdvertisingData } from '@/hooks/useAdvertisingData'
import { useComplianceData } from '@/hooks/useComplianceData'

function fmtK(n: number): string {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(1)}M`
  if (n >= 1_000) return `$${Math.round(n / 1_000)}K`
  return `$${Math.round(n)}`
}

export default function ComplianceTracker() {
  const ad = useAdvertisingData()
  const compliance = useComplianceData(ad)

  const pct = compliance.compliancePct
  const barFill = Math.min(pct * 2, 100) // 50% compliance = 100% of bar

  // Trend direction
  const trendDir = useMemo(() => {
    const pts = compliance.trend
    if (pts.length < 2) return null
    const first = pts[0].compliancePct
    const last = pts[pts.length - 1].compliancePct
    return last > first ? 'rising' : 'falling'
  }, [compliance.trend])

  // SVG sparkline for trend
  const sparkline = useMemo(() => {
    const pts = compliance.trend
    if (pts.length < 2) return null
    const W = 120
    const H = 24
    const pcts = pts.map((p) => p.compliancePct)
    const minV = Math.min(...pcts)
    const maxV = Math.max(...pcts)
    const range = maxV - minV || 1
    const n = pts.length

    const coords = pcts.map((v, i) => {
      const x = (i / (n - 1)) * W
      const y = H - ((v - minV) / range) * (H - 4) - 2
      return [x, y] as [number, number]
    })

    const linePath = coords.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')

    // Dashed amber line at 50% target level (y position for 50 in same scale)
    const targetY = H - ((50 - minV) / range) * (H - 4) - 2
    const clampedTargetY = Math.max(2, Math.min(H - 2, targetY))

    return { linePath, targetY: clampedTargetY, W, H }
  }, [compliance.trend])

  return (
    <InvestigationCard
      eyebrow="Resolution 240210 · Compliance"
      accentColor="#7a9954"
      headline={`The city spends ${pct.toFixed(1)}% where law requires 50%`}
      subtitle="Discretionary ad spend → Community & ethnic media"
      explorePath="/city-budget"
      sourceName="SF Controller · Vendor Payments"
      isLoading={compliance.isLoading}
    >
      <div className="space-y-3">
        {/* Big pct + target */}
        <div className="flex items-baseline gap-1.5">
          <span
            className="font-mono font-bold text-moss-400 leading-none tabular-nums"
            style={{ fontSize: 28 }}
          >
            {pct.toFixed(1)}%
          </span>
          <span className="font-mono text-slate-500" style={{ fontSize: 12 }}>
            of
          </span>
          <span className="font-mono font-bold text-slate-600" style={{ fontSize: 18 }}>
            50%
          </span>
        </div>

        {/* Progress bar */}
        <div>
          <div
            className="relative w-full rounded-full overflow-hidden bg-white/[0.06]"
            style={{ height: 8 }}
          >
            {/* Fill */}
            <div
              className="absolute left-0 top-0 h-full rounded-full transition-all duration-700"
              style={{
                width: `${barFill}%`,
                background: 'linear-gradient(90deg, #5c7a3d, #7a9954)',
              }}
            />
            {/* Target marker at 50% position */}
            <div
              className="absolute top-0 h-full"
              style={{
                left: '50%',
                width: 2,
                backgroundColor: '#d4a435',
                transform: 'translateX(-50%)',
              }}
            />
          </div>

          {/* Scale labels */}
          <div className="flex justify-between mt-0.5 font-mono" style={{ fontSize: 7, color: '#475569' }}>
            <span>0%</span>
            <span style={{ color: '#d4a435' }}>50% target</span>
            <span>100%</span>
          </div>
        </div>

        {/* Multi-year trend */}
        {sparkline && trendDir && (
          <div className="flex items-center gap-2">
            <svg
              viewBox={`0 0 ${sparkline.W} ${sparkline.H}`}
              width={sparkline.W}
              height={sparkline.H}
              style={{ display: 'block', overflow: 'visible', flexShrink: 0 }}
            >
              {/* Dashed amber target line at 50% */}
              <line
                x1={0}
                y1={sparkline.targetY}
                x2={sparkline.W}
                y2={sparkline.targetY}
                stroke="#d4a435"
                strokeWidth={1}
                strokeDasharray="3 2"
                strokeOpacity={0.6}
              />
              {/* Trend line */}
              <path
                d={sparkline.linePath}
                fill="none"
                stroke="#7a9954"
                strokeWidth={1.5}
                strokeLinejoin="round"
              />
            </svg>
            <div className="font-mono leading-tight" style={{ fontSize: 8 }}>
              <div style={{ color: '#9db87a' }}>
                {trendDir === 'rising' ? '▲ rising' : '▼ falling'}
              </div>
              <div style={{ color: '#475569' }}>but far from 50%</div>
            </div>
          </div>
        )}

        {/* Dollar context */}
        <div className="font-mono" style={{ fontSize: 8, color: '#475569' }}>
          {fmtK(compliance.ethnicMediaSpend)} ethnic media
          {' · '}
          {fmtK(compliance.totalDiscretionary)} discretionary
        </div>
      </div>
    </InvestigationCard>
  )
}
