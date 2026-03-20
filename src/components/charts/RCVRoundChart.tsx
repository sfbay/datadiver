/**
 * RCV Round-by-Round Bar Chart with step-through controls
 *
 * Shows candidates' vote totals per round as animated horizontal bars.
 * Play/pause through rounds, with eliminated candidates fading out.
 * 50% threshold line marks the winning mark.
 */
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import type { RCVContest } from '@/types/elections'

interface RCVRoundChartProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
  height?: number
  /** Optional: externally controlled round (for map sync) */
  currentRound?: number
  onRoundChange?: (round: number) => void
}

export default function RCVRoundChart({
  rcvData,
  candidateColors,
  width = 380,
  height = 200,
  currentRound: controlledRound,
  onRoundChange,
}: RCVRoundChartProps) {
  const totalRounds = rcvData.rounds.length
  const [internalRound, setInternalRound] = useState(totalRounds - 1)
  const [isPlaying, setIsPlaying] = useState(false)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onRoundChangeRef = useRef(onRoundChange)
  onRoundChangeRef.current = onRoundChange

  const activeRound = controlledRound ?? internalRound
  const setActiveRound = useCallback((r: number) => {
    setInternalRound(r)
    onRoundChangeRef.current?.(r)
  }, [])

  // Auto-play — uses ref to avoid stale closure on onRoundChange
  useEffect(() => {
    if (!isPlaying) {
      if (playTimer.current) clearInterval(playTimer.current)
      return
    }
    playTimer.current = setInterval(() => {
      setInternalRound((prev) => {
        const next = prev + 1
        if (next >= totalRounds) {
          setIsPlaying(false)
          return totalRounds - 1
        }
        onRoundChangeRef.current?.(next)
        return next
      })
    }, 1200)
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [isPlaying, totalRounds])

  const round = rcvData.rounds[activeRound]
  const candidates = useMemo(() => {
    return [...round.candidates]
      .filter((c) => c.votes > 0 || c.isEliminated)
      .sort((a, b) => b.votes - a.votes)
  }, [round])

  const maxVotes = Math.max(...candidates.map((c) => c.votes), 1)
  const threshold = round.continuingTotal * 0.5

  // Track which candidates have been eliminated by this round
  const eliminatedByRound = useMemo(() => {
    const eliminated = new Set<string>()
    for (let i = 0; i <= activeRound; i++) {
      for (const c of rcvData.rounds[i].candidates) {
        if (c.isEliminated) eliminated.add(c.name)
      }
    }
    return eliminated
  }, [rcvData.rounds, activeRound])

  const activeCandidates = candidates.filter((c) => !eliminatedByRound.has(c.name))
  const eliminatedCandidates = candidates.filter((c) => eliminatedByRound.has(c.name) && c.votes > 0)

  const barHeight = 16
  const gap = 4
  const labelWidth = 85
  const chartWidth = width - labelWidth - 60
  const barsCount = activeCandidates.length + (eliminatedCandidates.length > 0 ? 1 : 0) + eliminatedCandidates.length
  const svgHeight = Math.min(barsCount * (barHeight + gap) + 24, height - 40)

  return (
    <div style={{ width }}>
      {/* Controls */}
      <div className="flex items-center gap-2 mb-2">
        <button
          onClick={() => {
            if (isPlaying) {
              setIsPlaying(false)
            } else {
              if (activeRound >= totalRounds - 1) setActiveRound(0)
              setIsPlaying(true)
            }
          }}
          className="w-6 h-6 rounded-full bg-indigo-500/20 flex items-center justify-center hover:bg-indigo-500/30 transition-colors"
        >
          {isPlaying ? (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="#6366f1">
              <rect x="2" y="1" width="2" height="8" rx="0.5" />
              <rect x="6" y="1" width="2" height="8" rx="0.5" />
            </svg>
          ) : (
            <svg width="10" height="10" viewBox="0 0 10 10" fill="#6366f1">
              <path d="M2.5 1L8.5 5L2.5 9Z" />
            </svg>
          )}
        </button>

        <button
          onClick={() => setActiveRound(Math.max(0, activeRound - 1))}
          disabled={activeRound === 0}
          className="text-[10px] font-mono text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          ← Prev
        </button>

        <div className="flex-1 flex items-center gap-1">
          {Array.from({ length: totalRounds }).map((_, i) => (
            <button
              key={i}
              onClick={() => setActiveRound(i)}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeRound ? 'bg-indigo-500 flex-[2]' : i < activeRound ? 'bg-indigo-500/40 flex-1' : 'bg-slate-700 flex-1'
              }`}
              title={`Round ${i + 1}`}
            />
          ))}
        </div>

        <button
          onClick={() => setActiveRound(Math.min(totalRounds - 1, activeRound + 1))}
          disabled={activeRound === totalRounds - 1}
          className="text-[10px] font-mono text-slate-400 hover:text-white disabled:opacity-30 transition-colors"
        >
          Next →
        </button>

        <span className="text-[10px] font-mono text-slate-500 tabular-nums">
          R{activeRound + 1}/{totalRounds}
        </span>
      </div>

      {/* Bar chart */}
      <svg width={width} height={svgHeight} viewBox={`0 0 ${width} ${svgHeight}`}>
        {/* 50% threshold */}
        {threshold > 0 && threshold <= maxVotes && (
          <>
            <line
              x1={labelWidth + (threshold / maxVotes) * chartWidth}
              y1={0}
              x2={labelWidth + (threshold / maxVotes) * chartWidth}
              y2={svgHeight}
              stroke="#f59e0b"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
            <text
              x={labelWidth + (threshold / maxVotes) * chartWidth + 3}
              y={10}
              fill="#f59e0b"
              fontSize={8}
              fontFamily="JetBrains Mono, monospace"
              opacity={0.6}
            >
              50%
            </text>
          </>
        )}

        {/* Active candidates */}
        {activeCandidates.map((c, i) => {
          const y = i * (barHeight + gap) + 16
          const barW = (c.votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || '#64748b'
          const isWinner = c.name === rcvData.winner && activeRound === totalRounds - 1

          return (
            <g key={c.name} style={{ transition: 'transform 0.3s' }}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isWinner ? '#e2e8f0' : '#94a3b8'}
                fontSize={9}
                fontWeight={isWinner ? 700 : 400}
                fontFamily="Inter, system-ui, sans-serif"
              >
                {c.name.length > 14 ? c.name.split(' ').pop() : c.name}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={isWinner ? 0.95 : 0.7}
                style={{ transition: 'width 0.4s ease-out, opacity 0.3s' }}
              />
              <text
                x={labelWidth + barW + 4}
                y={y + barHeight / 2 + 1}
                fill="#94a3b8"
                fontSize={8}
                fontFamily="JetBrains Mono, monospace"
                dominantBaseline="middle"
              >
                {c.votes.toLocaleString()}
              </text>
            </g>
          )
        })}

        {/* Eliminated divider */}
        {eliminatedCandidates.length > 0 && (
          <line
            x1={labelWidth}
            y1={activeCandidates.length * (barHeight + gap) + 14}
            x2={width - 10}
            y2={activeCandidates.length * (barHeight + gap) + 14}
            stroke="#334155"
            strokeWidth={0.5}
          />
        )}

        {/* Eliminated candidates (faded) */}
        {eliminatedCandidates.map((c, i) => {
          const y = (activeCandidates.length + 1 + i) * (barHeight + gap) + 8
          if (y > svgHeight) return null
          const barW = (c.votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || '#64748b'

          return (
            <g key={c.name} opacity={0.3}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill="#64748b"
                fontSize={9}
                fontFamily="Inter, system-ui, sans-serif"
                textDecoration="line-through"
              >
                {c.name.length > 14 ? c.name.split(' ').pop() : c.name}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={0.4}
              />
            </g>
          )
        })}
      </svg>

      {/* Exhausted + overvotes */}
      <div className="flex gap-4 mt-1">
        {round.exhausted > 0 && (
          <p className="text-[9px] font-mono text-slate-500">
            Exhausted: {round.exhausted.toLocaleString()}
          </p>
        )}
        {round.overvotes > 0 && (
          <p className="text-[9px] font-mono text-slate-500">
            Overvotes: {round.overvotes.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
