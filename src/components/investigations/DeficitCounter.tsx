import { useEffect, useRef, useState } from 'react'
import { InvestigationCard } from './InvestigationCard'
import { useDeficitData } from '@/hooks/useDeficitData'

// Earth-tone palette for top 3 dept bars + "other": brick → terracotta →
// ochre → espresso. Same warm-to-deep gradient as the previous red→amber
// → slate; just substituted into the project's pigment scale.
const DEPT_COLORS = ['#963e30', '#d47149', '#d4a435', '#3a2a1e']

export default function DeficitCounter() {
  const { data, isLoading } = useDeficitData()

  // Ticking display amount
  const [displayAmount, setDisplayAmount] = useState(0)
  const startTimeRef = useRef<number | null>(null)
  const baseDeficitRef = useRef<number>(0)
  const rafRef = useRef<number | null>(null)

  useEffect(() => {
    if (!data) return

    baseDeficitRef.current = data.deficit
    startTimeRef.current = performance.now()
    setDisplayAmount(data.deficit)

    function tick(now: number) {
      const elapsed = (now - startTimeRef.current!) / 1000 // seconds
      setDisplayAmount(baseDeficitRef.current + elapsed * data!.perSecond)
      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = null
      }
    }
  }, [data])

  // Capture the original deficit when data first loads (for "since you opened")
  const originalDeficitRef = useRef<number | null>(null)
  useEffect(() => {
    if (data && originalDeficitRef.current === null) {
      originalDeficitRef.current = data.deficit
    }
  }, [data])

  // Format helpers
  const fmtDollars = (n: number) => `$${Math.round(n).toLocaleString()}`
  const fmtMillions = (n: number) => `$${(n / 1_000_000).toFixed(1)}M`

  // Sparkline geometry
  const sparkW = 160
  const sparkH = 32
  const buildSparkline = () => {
    if (!data || data.trend.length < 2) return null
    const gaps = data.trend.map((t) => t.gap)
    const minGap = Math.min(...gaps)
    const maxGap = Math.max(...gaps)
    const range = maxGap - minGap || 1
    const n = gaps.length

    const pts = gaps.map((g, i) => {
      const x = (i / (n - 1)) * sparkW
      const y = sparkH - ((g - minGap) / range) * (sparkH - 4) - 2
      return [x, y] as [number, number]
    })

    const linePath = pts.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x},${y}`).join(' ')
    const areaPath =
      `M${pts[0][0]},${sparkH} ` +
      pts.map(([x, y]) => `L${x},${y}`).join(' ') +
      ` L${pts[pts.length - 1][0]},${sparkH} Z`

    const firstFY = data.trend[0].fiscalYear
    const lastFY = data.trend[data.trend.length - 1].fiscalYear

    return { linePath, areaPath, firstFY, lastFY }
  }

  // Department bar segments
  const buildDeptBar = () => {
    if (!data || data.topDepartments.length === 0) return null
    const topPcts = data.topDepartments.map((d) => d.pctOfTotal)
    const sumTop = topPcts.reduce((a, b) => a + b, 0)
    const otherPct = Math.max(0, 100 - sumTop)
    const segments = [
      ...data.topDepartments.map((d, i) => ({
        label: abbreviateDept(d.department),
        pct: d.pctOfTotal,
        color: DEPT_COLORS[i],
      })),
      { label: 'Other', pct: otherPct, color: DEPT_COLORS[3] },
    ]
    return segments
  }

  function abbreviateDept(name: string): string {
    // Keep first ~12 chars to fit 7px mono
    return name.length > 14 ? name.slice(0, 13) + '…' : name
  }

  const sparkline = data ? buildSparkline() : null
  const deptSegments = data ? buildDeptBar() : null
  const sinceOpened =
    originalDeficitRef.current !== null
      ? displayAmount - originalDeficitRef.current
      : 0

  return (
    <InvestigationCard
      eyebrow="Budget Gap · This Fiscal Year"
      accentColor="#963e30"
      headline="The deficit is growing faster than revenue"
      subtitle="SF Controller · Spending & Revenue"
      explorePath="/city-budget"
      sourceName="Spending & Revenue Data"
      isLoading={isLoading}
    >
      {data && (
        <div className="space-y-3">
          {/* Big ticking counter */}
          <div>
            <div
              className="font-mono font-bold leading-none tabular-nums"
              style={{ fontSize: 28, color: '#d17566' }}
            >
              {fmtDollars(displayAmount)}
            </div>

            {/* Rate line */}
            <div className="font-mono mt-1" style={{ fontSize: 10, color: '#a8926a' }}>
              {'▲ '}
              <span style={{ color: '#d17566' }}>
                ${data.perSecond.toFixed(2)}/sec
              </span>
              {' · ▲ '}
              <span style={{ color: '#d17566' }}>
                {fmtMillions(data.perDay)}/day
              </span>
            </div>

            {/* Editorial explainer — defines deficit + disclaims the
                animation so a first-time viewer doesn't mistake the ticking
                counter for a real-time meter. */}
            <p
              className="mt-2 italic leading-snug"
              style={{ fontSize: 11, color: '#a8926a' }}
            >
              Projected FY shortfall — the gap between expected spending and
              revenue. Animated at projected rate.
            </p>
          </div>

          {/* Trend sparkline */}
          {sparkline && (
            <div>
              <svg
                viewBox={`0 0 ${sparkW} ${sparkH}`}
                width={sparkW}
                height={sparkH}
                style={{ display: 'block', overflow: 'visible' }}
              >
                {/* Area fill */}
                <path
                  d={sparkline.areaPath}
                  fill="#963e30"
                  fillOpacity={0.14}
                />
                {/* Line */}
                <path
                  d={sparkline.linePath}
                  fill="none"
                  stroke="#963e30"
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </svg>
              {/* FY labels */}
              <div
                className="flex justify-between font-mono mt-0.5"
                style={{ fontSize: 8, color: '#7a5f42' }}
              >
                <span>FY{sparkline.firstFY}</span>
                <span>FY{sparkline.lastFY}</span>
              </div>
            </div>
          )}

          {/* Department breakdown bar */}
          {deptSegments && (
            <div>
              {/* Stacked bar */}
              <div
                className="flex w-full rounded-full overflow-hidden"
                style={{ height: 5 }}
              >
                {deptSegments.map((seg, i) => (
                  <div
                    key={i}
                    style={{
                      width: `${seg.pct}%`,
                      backgroundColor: seg.color,
                      flexShrink: 0,
                    }}
                  />
                ))}
              </div>

              {/* Legend */}
              <div className="flex flex-wrap gap-x-3 gap-y-0.5 mt-1.5">
                {deptSegments.map((seg, i) => (
                  <div
                    key={i}
                    className="flex items-center gap-1 font-mono"
                    style={{ fontSize: 7, color: '#a8926a' }}
                  >
                    <span
                      className="inline-block rounded-full flex-shrink-0"
                      style={{
                        width: 5,
                        height: 5,
                        backgroundColor: seg.color,
                      }}
                    />
                    {seg.label}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Since you opened */}
          <div className="font-mono" style={{ fontSize: 9, color: '#7a5f42' }}>
            Since you opened:{' '}
            <span style={{ color: '#d17566' }}>
              +{fmtDollars(sinceOpened)}
            </span>
          </div>
        </div>
      )}
    </InvestigationCard>
  )
}
