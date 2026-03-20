/**
 * RCV Round-by-Round Bar Chart with step-through controls
 *
 * Shows candidates' vote totals per round as animated horizontal bars.
 * Play/pause through rounds, with eliminated candidates fading out.
 * 50% threshold line marks the winning mark.
 * Vote transfer indicators show where eliminated candidates' votes went.
 */
import { useMemo, useState, useEffect, useCallback, useRef } from 'react'
import type { RCVContest } from '@/types/elections'

interface RCVRoundChartProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
  /** Optional: externally controlled round (for map sync) */
  currentRound?: number
  onRoundChange?: (round: number) => void
}

/** Convert ALL CAPS name to Sentence Case */
function toSentenceCase(name: string): string {
  if (!name) return name
  return name.replace(/\b([A-Z])([A-Z]+)\b/g, (_, first, rest) =>
    first + rest.toLowerCase()
  )
}

export default function RCVRoundChart({
  rcvData,
  candidateColors,
  width = 380,
  currentRound: controlledRound,
  onRoundChange,
}: RCVRoundChartProps) {
  const totalRounds = rcvData.rounds.length
  const [internalRound, setInternalRound] = useState(totalRounds - 1)
  const [isPlaying, setIsPlaying] = useState(false)
  const [justEliminated, setJustEliminated] = useState<string | null>(null)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onRoundChangeRef = useRef(onRoundChange)
  onRoundChangeRef.current = onRoundChange

  const activeRound = controlledRound ?? internalRound
  const setActiveRound = useCallback((r: number) => {
    setInternalRound(r)
    onRoundChangeRef.current?.(r)
  }, [])

  // Detect which candidate was just eliminated this round
  useEffect(() => {
    if (activeRound === 0) { setJustEliminated(null); return }
    const round = rcvData.rounds[activeRound]
    const eliminated = round.candidates.find((c) => c.isEliminated)
    if (eliminated) {
      setJustEliminated(eliminated.name)
      const timer = setTimeout(() => setJustEliminated(null), 1500)
      return () => clearTimeout(timer)
    } else {
      setJustEliminated(null)
    }
  }, [activeRound, rcvData.rounds])

  // Auto-play
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
    }, 1500)
    return () => { if (playTimer.current) clearInterval(playTimer.current) }
  }, [isPlaying, totalRounds])

  const round = rcvData.rounds[activeRound]
  const prevRound = activeRound > 0 ? rcvData.rounds[activeRound - 1] : null

  const candidates = useMemo(() => {
    return [...round.candidates]
      .filter((c) => c.votes > 0 || c.isEliminated)
      .sort((a, b) => b.votes - a.votes)
  }, [round])

  const maxVotes = Math.max(...candidates.map((c) => c.votes), 1)
  const threshold = round.continuingTotal * 0.5

  // Track cumulative eliminations
  const eliminatedByRound = useMemo(() => {
    const eliminated = new Set<string>()
    for (let i = 0; i <= activeRound; i++) {
      for (const c of rcvData.rounds[i].candidates) {
        if (c.isEliminated) eliminated.add(c.name)
      }
    }
    return eliminated
  }, [rcvData.rounds, activeRound])

  // Compute vote transfers: who gained votes this round from the eliminated candidate?
  const voteTransfers = useMemo(() => {
    if (!prevRound || activeRound === 0) return []
    const transfers: { from: string; to: string; amount: number }[] = []
    const eliminatedThisRound = round.candidates.find((c) => c.isEliminated)
    if (!eliminatedThisRound) return transfers

    for (const curr of round.candidates) {
      if (curr.isEliminated) continue
      const prev = prevRound.candidates.find((p) => p.name === curr.name)
      if (prev && curr.votes > prev.votes) {
        transfers.push({
          from: eliminatedThisRound.name,
          to: curr.name,
          amount: curr.votes - prev.votes,
        })
      }
    }
    return transfers.sort((a, b) => b.amount - a.amount)
  }, [round, prevRound, activeRound])

  const activeCandidates = candidates.filter((c) => !eliminatedByRound.has(c.name))
  const eliminatedCandidates = candidates.filter((c) => eliminatedByRound.has(c.name) && c.votes > 0)

  const barHeight = 18
  const gap = 5
  const labelWidth = 120
  const chartWidth = width - labelWidth - 60

  // Dynamic height — fits all candidates, shrinks as they're eliminated
  const activeCount = activeCandidates.length
  const eliminatedCount = eliminatedCandidates.length
  const dividerSpace = eliminatedCount > 0 ? 20 : 0
  const svgHeight = (activeCount + eliminatedCount) * (barHeight + gap) + dividerSpace + 20

  return (
    <div style={{ width }}>
      {/* Controls: [prev][play][next] [round bubbles] [R3/14] */}
      <div className="flex items-center gap-1.5 mb-3">
        {/* Transport controls */}
        <div className="flex items-center gap-0.5 flex-shrink-0">
          <button
            onClick={() => { setIsPlaying(false); setActiveRound(Math.max(0, activeRound - 1)) }}
            disabled={activeRound === 0}
            className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center hover:bg-indigo-500/20 disabled:opacity-20 transition-colors"
            title="Previous round"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="#6366f1">
              <path d="M5.5 1L2 4L5.5 7Z" />
            </svg>
          </button>
          <button
            onClick={() => {
              if (isPlaying) {
                setIsPlaying(false)
              } else {
                if (activeRound >= totalRounds - 1) setActiveRound(0)
                setIsPlaying(true)
              }
            }}
            className="w-7 h-7 rounded-full bg-indigo-500/20 flex items-center justify-center hover:bg-indigo-500/30 transition-colors"
            title={isPlaying ? 'Pause' : 'Play all rounds'}
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
            onClick={() => { setIsPlaying(false); setActiveRound(Math.min(totalRounds - 1, activeRound + 1)) }}
            disabled={activeRound === totalRounds - 1}
            className="w-6 h-6 rounded-md bg-indigo-500/10 flex items-center justify-center hover:bg-indigo-500/20 disabled:opacity-20 transition-colors"
            title="Next round"
          >
            <svg width="8" height="8" viewBox="0 0 8 8" fill="#6366f1">
              <path d="M2.5 1L6 4L2.5 7Z" />
            </svg>
          </button>
        </div>

        {/* Round bubbles */}
        <div className="flex-1 flex items-center gap-0.5">
          {Array.from({ length: totalRounds }).map((_, i) => (
            <button
              key={i}
              onClick={() => { setIsPlaying(false); setActiveRound(i) }}
              className={`h-1.5 rounded-full transition-all duration-200 ${
                i === activeRound ? 'bg-indigo-500 flex-[2]' : i < activeRound ? 'bg-indigo-500/40 flex-1' : 'bg-slate-700 flex-1'
              }`}
              title={`Round ${i + 1}`}
            />
          ))}
        </div>

        <span className="text-[10px] font-mono text-slate-500 tabular-nums flex-shrink-0">
          R{activeRound + 1}/{totalRounds}
        </span>
      </div>

      {/* Elimination callout */}
      {justEliminated && (
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-red-500/10 border border-red-500/20 animate-pulse">
          <p className="text-[10px] font-mono text-red-400">
            <span className="font-bold">{toSentenceCase(justEliminated)}</span> eliminated
            {voteTransfers.length > 0 && (
              <span className="text-red-400/70">
                {' — votes transfer to '}
                {voteTransfers.slice(0, 3).map((t, i) => (
                  <span key={t.to}>
                    {i > 0 && ', '}
                    <span style={{ color: candidateColors.get(t.to) || '#94a3b8' }}>
                      {toSentenceCase(t.to.split(' ').pop() || t.to)}
                    </span>
                    <span className="text-red-400/50"> (+{t.amount.toLocaleString()})</span>
                  </span>
                ))}
                {voteTransfers.length > 3 && <span className="text-red-400/50"> + {voteTransfers.length - 3} more</span>}
              </span>
            )}
          </p>
        </div>
      )}

      {/* Bar chart */}
      <svg
        width={width}
        height={svgHeight}
        viewBox={`0 0 ${width} ${svgHeight}`}
        style={{ transition: 'height 0.4s ease-out' }}
      >
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
          const displayName = toSentenceCase(c.name)
          // Check if this candidate gained votes from a transfer
          const transfer = voteTransfers.find((t) => t.to === c.name)
          const hasTransferGlow = transfer && justEliminated

          return (
            <g key={c.name}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isWinner ? '#e2e8f0' : '#94a3b8'}
                fontSize={9}
                fontWeight={isWinner ? 700 : 400}
                fontFamily="Inter, system-ui, sans-serif"
              >
                {displayName.length > 18 ? displayName.slice(0, 17) + '…' : displayName}
              </text>
              {/* Transfer glow behind bar */}
              {hasTransferGlow && (
                <rect
                  x={labelWidth - 2}
                  y={y - 2}
                  width={barW + 4}
                  height={barHeight + 4}
                  rx={4}
                  fill={color}
                  opacity={0.15}
                  className="animate-pulse"
                />
              )}
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={color}
                opacity={isWinner ? 0.95 : 0.75}
                style={{ transition: 'width 0.5s ease-out, opacity 0.3s' }}
              />
              {/* Transfer amount badge */}
              {hasTransferGlow && transfer && (
                <text
                  x={labelWidth + barW + 30}
                  y={y + barHeight / 2 + 1}
                  fill={color}
                  fontSize={8}
                  fontWeight={600}
                  fontFamily="JetBrains Mono, monospace"
                  dominantBaseline="middle"
                  opacity={0.9}
                >
                  +{transfer.amount.toLocaleString()}
                </text>
              )}
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
          <>
            <line
              x1={labelWidth}
              y1={activeCount * (barHeight + gap) + 14}
              x2={width - 10}
              y2={activeCount * (barHeight + gap) + 14}
              stroke="#334155"
              strokeWidth={0.5}
            />
            <text
              x={labelWidth}
              y={activeCount * (barHeight + gap) + 12}
              fill="#475569"
              fontSize={7}
              fontFamily="JetBrains Mono, monospace"
            >
              ELIMINATED ({eliminatedCount})
            </text>
          </>
        )}

        {/* Eliminated candidates (faded, with strikethrough) */}
        {eliminatedCandidates.map((c, i) => {
          const y = (activeCount) * (barHeight + gap) + dividerSpace + i * (barHeight + gap) + 8
          const barW = (c.votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || '#64748b'
          const isJust = c.name === justEliminated
          const displayName = toSentenceCase(c.name)

          return (
            <g key={c.name} opacity={isJust ? 0.6 : 0.25} style={{ transition: 'opacity 0.5s' }}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isJust ? '#ef4444' : '#64748b'}
                fontSize={9}
                fontFamily="Inter, system-ui, sans-serif"
                textDecoration="line-through"
              >
                {displayName.length > 18 ? displayName.slice(0, 17) + '…' : displayName}
              </text>
              <rect
                x={labelWidth}
                y={y}
                width={barW}
                height={barHeight}
                rx={3}
                fill={isJust ? '#ef4444' : color}
                opacity={0.4}
                style={{ transition: 'width 0.4s, fill 0.3s' }}
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
