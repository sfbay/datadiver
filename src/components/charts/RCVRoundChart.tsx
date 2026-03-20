/**
 * RCV Round-by-Round Bar Chart
 *
 * Shows candidates' vote totals per round as grouped horizontal bars.
 * Eliminated candidates fade out. A 50% threshold line marks the winning mark.
 */
import { useMemo } from 'react'
import type { RCVContest } from '@/types/elections'

interface RCVRoundChartProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
  height?: number
}

export default function RCVRoundChart({
  rcvData,
  candidateColors,
  width = 380,
  height = 180,
}: RCVRoundChartProps) {
  // Show a summary: final round bar chart with top candidates
  const finalRound = rcvData.rounds[rcvData.rounds.length - 1]
  const activeCandidates = finalRound.candidates
    .filter((c) => !c.isEliminated && c.votes > 0)
    .sort((a, b) => b.votes - a.votes)

  const maxVotes = Math.max(...activeCandidates.map((c) => c.votes), 1)
  const threshold = finalRound.continuingTotal * 0.5

  // Build round progression for top 4 candidates (sparkline style)
  const topNames = activeCandidates.slice(0, 4).map((c) => c.name)
  const roundProgression = useMemo(() => {
    return topNames.map((name) => ({
      name,
      rounds: rcvData.rounds.map((r) => {
        const c = r.candidates.find((c) => c.name === name)
        return c ? c.votes : 0
      }),
    }))
  }, [rcvData.rounds, topNames])

  const barHeight = 18
  const gap = 6
  const labelWidth = 90
  const chartWidth = width - labelWidth - 50
  const totalHeight = activeCandidates.length * (barHeight + gap) + 30

  return (
    <div style={{ width }}>
      {/* Final round bars */}
      <svg width={width} height={Math.min(totalHeight, height)} viewBox={`0 0 ${width} ${Math.min(totalHeight, height)}`}>
        {/* 50% threshold line */}
        {threshold > 0 && (
          <>
            <line
              x1={labelWidth + (threshold / maxVotes) * chartWidth}
              y1={0}
              x2={labelWidth + (threshold / maxVotes) * chartWidth}
              y2={Math.min(totalHeight, height)}
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.6}
            />
            <text
              x={labelWidth + (threshold / maxVotes) * chartWidth + 3}
              y={10}
              fill="#f59e0b"
              fontSize={8}
              fontFamily="JetBrains Mono, monospace"
              opacity={0.7}
            >
              50%
            </text>
          </>
        )}

        {activeCandidates.map((c, i) => {
          const y = i * (barHeight + gap) + 16
          const barW = (c.votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || '#64748b'
          const isWinner = c.name === rcvData.winner

          return (
            <g key={c.name}>
              {/* Candidate name */}
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isWinner ? '#e2e8f0' : '#94a3b8'}
                fontSize={10}
                fontWeight={isWinner ? 700 : 400}
                fontFamily="Inter, system-ui, sans-serif"
              >
                {c.name.length > 14 ? c.name.split(' ').pop() : c.name}
              </text>

              {/* Bar */}
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={isWinner ? 0.9 : 0.5}
              />

              {/* Vote count */}
              <text
                x={labelWidth + barW + 4}
                y={y + barHeight / 2 + 1}
                fill="#94a3b8"
                fontSize={9}
                fontFamily="JetBrains Mono, monospace"
                dominantBaseline="middle"
              >
                {c.votes.toLocaleString()} ({(c.percentage * 100).toFixed(1)}%)
              </text>
            </g>
          )
        })}
      </svg>

      {/* Round progression sparklines */}
      <div className="flex gap-3 mt-2 overflow-x-auto">
        {roundProgression.map(({ name, rounds }) => {
          const color = candidateColors.get(name) || '#64748b'
          const max = Math.max(...rounds, 1)
          const sparkW = 60
          const sparkH = 16
          const points = rounds
            .map((v, i) => `${(i / Math.max(rounds.length - 1, 1)) * sparkW},${sparkH - (v / max) * sparkH}`)
            .join(' ')

          return (
            <div key={name} className="flex items-center gap-1.5 flex-shrink-0">
              <svg width={sparkW} height={sparkH}>
                <polyline
                  points={points}
                  fill="none"
                  stroke={color}
                  strokeWidth={1.5}
                  strokeLinejoin="round"
                />
              </svg>
              <span className="text-[8px] font-mono text-slate-500 whitespace-nowrap">
                {name.split(' ').pop()}
              </span>
            </div>
          )
        })}
      </div>

      {/* Exhausted ballots info */}
      {finalRound.exhausted > 0 && (
        <p className="text-[9px] font-mono text-slate-500 mt-2">
          Exhausted: {finalRound.exhausted.toLocaleString()} ballots
          {' · '}Round {rcvData.totalRounds} of {rcvData.totalRounds}
        </p>
      )}
    </div>
  )
}
