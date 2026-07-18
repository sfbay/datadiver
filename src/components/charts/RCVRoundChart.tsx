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
import { toSentenceCase } from '@/utils/format'
import { computeRoundTransfers, ribbonPath, EXHAUSTED_SINK } from './rcvFlow'
import { usePrefersReducedMotion } from '@/hooks/usePrefersReducedMotion'

interface RCVRoundChartProps {
  rcvData: RCVContest
  candidateColors: Map<string, string>
  width?: number
  /** Optional: externally controlled round (for map sync) */
  currentRound?: number
  onRoundChange?: (round: number) => void
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
  const [justEliminated, setJustEliminated] = useState<{ names: string[]; isBatch: boolean } | null>(null)
  const playTimer = useRef<ReturnType<typeof setInterval> | null>(null)
  const onRoundChangeRef = useRef(onRoundChange)
  onRoundChangeRef.current = onRoundChange

  const rawRound = controlledRound ?? internalRound
  // Clamp: a controlled round can outlive a race switch (Elections never
  // resets it), and an index past rounds.length crashes on .candidates.
  const activeRound = Math.min(Math.max(rawRound, 0), totalRounds - 1)
  const setActiveRound = useCallback((r: number) => {
    setInternalRound(r)
    onRoundChangeRef.current?.(r)
  }, [])

  const prefersReducedMotion = usePrefersReducedMotion()

  // Backward steps SNAP — no reverse flow animation (votes don't
  // "un-transfer" in RCV; a mirrored animation would teach something
  // false). Track direction so the ribbon layer only renders forward.
  //
  // Synchronous step tracking — direction must be correct on the very render
  // where round-derived values (barW etc.) change; an effect-updated value
  // lags one committed render and silently defeats the delayed width
  // transition below (task review finding). React's "adjust state during
  // render" pattern: the setState triggers an immediate re-render before
  // commit, and the inline derivation keeps this render's value correct too.
  const [lastStep, setLastStep] = useState<{ round: number; dir: 'forward' | 'backward' | 'none' }>({ round: activeRound, dir: 'none' })
  if (activeRound !== lastStep.round) {
    setLastStep({ round: activeRound, dir: activeRound > lastStep.round ? 'forward' : 'backward' })
  }
  const stepDirection = activeRound !== lastStep.round
    ? (activeRound > lastStep.round ? 'forward' : 'backward')
    : lastStep.dir

  // Longer than any realistic ribbon path in this chart's fixed coordinate
  // space (width defaults to 380-400px; chartWidth is width-180, height
  // bounded by candidate count) — used as strokeDasharray for the
  // draw-in effect without a getTotalLength() DOM measurement pass per
  // path. If a future redesign widens the chart substantially, re-check
  // this bound (a path longer than it would render visibly truncated).
  // Duplicated in index.css's @keyframes rcv-ribbon-draw — change one,
  // change both.
  const RIBBON_DASH_LENGTH = 1200

  // Detect whose votes were just redistributed INTO the currently-viewed
  // round. The eliminated flag lives on the PREVIOUS round's entry — a
  // round's own flag describes who's eliminated starting NEXT round, not
  // who was just redistributed to produce this round's totals. See
  // rcvFlow.ts and the implementation plan's "Resolved ambiguities" §3.
  useEffect(() => {
    if (activeRound === 0) { setJustEliminated(null); return }
    const prev = rcvData.rounds[activeRound - 1]
    const eliminated = prev.candidates.filter((c) => c.isEliminated)
    if (eliminated.length > 0) {
      setJustEliminated({ names: eliminated.map((c) => c.name), isBatch: eliminated.length > 1 })
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
    // 1500ms leaves ~500ms margin over the flow-ribbon sequence (800ms
    // draw-in + a 500ms-delayed, 500ms bar-grow = 1000ms total) — re-check
    // this margin if either duration changes.
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

  // Vote transfers for the currently-viewed round, derived from
  // round-over-round deltas (see rcvFlow.ts — SF publishes no
  // source→destination data). Includes an EXHAUSTED_SINK entry for the
  // flow-ribbon layer; candidateTransfers strips it for the text callout
  // and per-bar glow/badge, which only ever named candidates.
  const transferResult = useMemo(
    () => computeRoundTransfers(round, prevRound),
    [round, prevRound],
  )
  const candidateTransfers = useMemo(
    () => transferResult.transfers.filter((t) => t.to !== EXHAUSTED_SINK),
    [transferResult],
  )

  // Everything the width-transition and ribbon layer key off must be
  // derivable synchronously in render — never from effect-lagged state.
  const ribbonSequenceActive = !prefersReducedMotion && stepDirection === 'forward' && transferResult.eliminatedNames.length > 0
  const showRibbons = ribbonSequenceActive && justEliminated !== null

  const activeCandidates = candidates.filter((c) => !eliminatedByRound.has(c.name))
  // A candidate eliminated ENTERING this round has already zeroed out
  // (c.votes === 0) by the time this round is displayed — but the ribbon
  // needs a row to anchor its source point to for the ~1.5s justEliminated
  // window. Keep their (zero-width) row visible for exactly that window;
  // every other historically-eliminated candidate still requires votes > 0
  // to avoid permanently rendering empty rows.
  const eliminatedCandidates = candidates.filter(
    (c) => eliminatedByRound.has(c.name) && (c.votes > 0 || (justEliminated?.names.includes(c.name) ?? false)),
  )

  const barHeight = 18
  const gap = 5
  const labelWidth = 120
  const chartWidth = width - labelWidth - 60

  // Dynamic height — fits all candidates, shrinks as they're eliminated
  const activeCount = activeCandidates.length
  const eliminatedCount = eliminatedCandidates.length
  const dividerSpace = eliminatedCount > 0 ? 20 : 0
  const svgHeight = (activeCount + eliminatedCount) * (barHeight + gap) + dividerSpace + 20

  // Row positions for the ribbon layer, keyed by candidate name (or
  // EXHAUSTED_SINK). Computed independently of the bar-rendering JSX below
  // (which keeps its own inline y/barW math unchanged) so the ribbon block
  // can look up any candidate's current on-screen row without re-deriving
  // sort/index math or coupling to render order.
  const barPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; width: number; midY: number }>()
    activeCandidates.forEach((c, i) => {
      const y = i * (barHeight + gap) + 16
      const w = (c.votes / maxVotes) * chartWidth
      positions.set(c.name, { x: labelWidth, y, width: w, midY: y + barHeight / 2 })
    })
    eliminatedCandidates.forEach((c, i) => {
      const y = activeCount * (barHeight + gap) + dividerSpace + i * (barHeight + gap) + 8
      const w = (c.votes / maxVotes) * chartWidth
      positions.set(c.name, { x: labelWidth, y, width: w, midY: y + barHeight / 2 })
    })
    // Exhausted sink — fixed corner position, doesn't participate in the
    // bar layout at all (there's no "Exhausted" bar, just a small marker).
    positions.set(EXHAUSTED_SINK, { x: width - 14, y: svgHeight - 10, width: 0, midY: svgHeight - 10 })
    return positions
  }, [activeCandidates, eliminatedCandidates, maxVotes, chartWidth, labelWidth, barHeight, gap, activeCount, dividerSpace, width, svgHeight])

  const handleKeyDown = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return
    const target = e.target as HTMLElement
    if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) return
    e.preventDefault()
    setIsPlaying(false)
    if (e.key === 'ArrowLeft') setActiveRound(Math.max(0, activeRound - 1))
    else setActiveRound(Math.min(totalRounds - 1, activeRound + 1))
  }, [activeRound, totalRounds, setActiveRound])

  return (
    <div
      style={{ width }}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="outline-none focus-visible:ring-2 focus-visible:ring-indigo-500/40 rounded-xl"
      role="group"
      aria-label="Ranked-choice rounds. Use Left and Right arrow keys to step through rounds"
    >
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
            <svg width="8" height="8" viewBox="0 0 8 8" fill="#616a96">
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
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#616a96">
                <rect x="2" y="1" width="2" height="8" rx="0.5" />
                <rect x="6" y="1" width="2" height="8" rx="0.5" />
              </svg>
            ) : (
              <svg width="10" height="10" viewBox="0 0 10 10" fill="#616a96">
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
            <svg width="8" height="8" viewBox="0 0 8 8" fill="#616a96">
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
        <div className="mb-2 px-2 py-1.5 rounded-lg bg-brick-500/10 border border-brick-500/20 animate-pulse">
          <p className="text-[10px] font-mono text-brick-400">
            <span className="font-bold">
              {justEliminated.isBatch
                ? `${justEliminated.names.length} candidates eliminated together`
                : `${toSentenceCase(justEliminated.names[0])} eliminated`}
            </span>
            {candidateTransfers.length > 0 && (
              <span className="text-brick-400/70">
                {' — votes transfer to '}
                {candidateTransfers.slice(0, 3).map((t, i) => (
                  <span key={t.to}>
                    {i > 0 && ', '}
                    <span style={{ color: candidateColors.get(t.to) || 'var(--color-slate-400)' }}>
                      {toSentenceCase(t.to.split(' ').pop() || t.to)}
                    </span>
                    <span className="text-brick-400/50"> (+{t.amount.toLocaleString()})</span>
                  </span>
                ))}
                {candidateTransfers.length > 3 && <span className="text-brick-400/50"> + {candidateTransfers.length - 3} more</span>}
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
              stroke="#d4a435"
              strokeWidth={1}
              strokeDasharray="3,3"
              opacity={0.5}
            />
            <text
              x={labelWidth + (threshold / maxVotes) * chartWidth + 3}
              y={10}
              fill="#d4a435"
              fontSize={8}
              fontFamily="var(--font-mono)"
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
          const color = candidateColors.get(c.name) || 'var(--color-slate-500)'
          const isWinner = c.name === rcvData.winner && activeRound === totalRounds - 1
          const displayName = toSentenceCase(c.name)
          // Check if this candidate gained votes from a transfer
          const transfer = candidateTransfers.find((t) => t.to === c.name)
          const hasTransferGlow = transfer && justEliminated

          return (
            <g key={c.name}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isWinner ? 'var(--color-slate-700)' : 'var(--color-slate-400)'}
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
                style={{
                  transition: transfer && ribbonSequenceActive
                    ? 'width 0.5s ease-out 0.5s, opacity 0.3s'
                    : 'width 0.5s ease-out, opacity 0.3s',
                }}
              />
              {/* Transfer amount badge */}
              {hasTransferGlow && transfer && (
                <text
                  x={labelWidth + barW + 30}
                  y={y + barHeight / 2 + 1}
                  fill={color}
                  fontSize={8}
                  fontWeight={600}
                  fontFamily="var(--font-mono)"
                  dominantBaseline="middle"
                  opacity={0.9}
                >
                  +{transfer.amount.toLocaleString()}
                </text>
              )}
              <text
                x={labelWidth + barW + 4}
                y={y + barHeight / 2 + 1}
                fill="var(--color-slate-400)"
                fontSize={8}
                fontFamily="var(--font-mono)"
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
              stroke="var(--color-slate-700)"
              strokeWidth={0.5}
            />
            <text
              x={labelWidth}
              y={activeCount * (barHeight + gap) + 12}
              fill="var(--color-slate-600)"
              fontSize={7}
              fontFamily="var(--font-mono)"
            >
              ELIMINATED ({eliminatedCount})
            </text>
          </>
        )}

        {/* Eliminated candidates (faded, with strikethrough) */}
        {eliminatedCandidates.map((c, i) => {
          const y = (activeCount) * (barHeight + gap) + dividerSpace + i * (barHeight + gap) + 8
          const barW = (c.votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || 'var(--color-slate-500)'
          const isJust = justEliminated?.names.includes(c.name) ?? false
          const displayName = toSentenceCase(c.name)

          return (
            <g key={c.name} opacity={isJust ? 0.6 : 0.25} style={{ transition: 'opacity 0.5s' }}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={isJust ? '#b85545' : 'var(--color-slate-500)'}
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
                fill={isJust ? '#b85545' : color}
                opacity={0.4}
                style={{ transition: 'width 0.4s, fill 0.3s' }}
              />
            </g>
          )
        })}

        {/* Flow ribbons — vote redistribution motion. Forward-only (backward
            steps snap to the target round's static state); reduced motion
            skips this entirely, falling back to the existing text callout
            above, which is unconditional. */}
        {showRibbons && transferResult.transfers.length > 0 && (() => {
          const sourcePoints = transferResult.eliminatedNames
            .map((name) => barPositions.get(name))
            .filter((p): p is NonNullable<typeof p> => p != null)
          if (sourcePoints.length === 0) return null
          // Merged-bundle source: a single anchor averaging every
          // eliminated-this-round candidate's row. Degenerates to exactly
          // that one candidate's edge in the (today, universal)
          // single-elimination case — no isBatch branch needed here, only
          // in the label (below).
          const bundleSource = {
            x: sourcePoints[0].x + sourcePoints[0].width,
            y: sourcePoints.reduce((s, p) => s + p.midY, 0) / sourcePoints.length,
          }
          const maxAmount = Math.max(...transferResult.transfers.map((t) => t.amount), 1)
          const sourceColor = candidateColors.get(transferResult.eliminatedNames[0]) || 'var(--color-slate-500)'
          return (
            <g key={activeRound} opacity={0.55}>
              {transferResult.transfers.map((t) => {
                const target = barPositions.get(t.to)
                if (!target) return null
                const isExhausted = t.to === EXHAUSTED_SINK
                return (
                  <path
                    key={t.to}
                    d={ribbonPath(bundleSource, { x: target.x, y: target.midY })}
                    fill="none"
                    stroke={isExhausted ? 'var(--color-paper-500)' : sourceColor}
                    strokeWidth={Math.max((t.amount / maxAmount) * 10, 1)}
                    strokeOpacity={isExhausted ? 0.4 : 0.5}
                    strokeDasharray={RIBBON_DASH_LENGTH}
                    strokeDashoffset={RIBBON_DASH_LENGTH}
                    style={{ animation: 'rcv-ribbon-draw var(--dur-lingering) var(--ease-settle) forwards' }}
                  />
                )
              })}
              {transferResult.transfers.some((t) => t.to === EXHAUSTED_SINK) && (
                <g opacity={0} style={{ animation: 'rcv-fade-in 0.3s ease-out 0.3s forwards' }}>
                  <circle cx={width - 14} cy={svgHeight - 10} r={3} fill="var(--color-paper-500)" />
                  <text
                    x={width - 20}
                    y={svgHeight - 16}
                    textAnchor="end"
                    fontSize={7}
                    fill="var(--color-paper-500)"
                    fontFamily="var(--font-mono)"
                  >
                    Exhausted
                  </text>
                </g>
              )}
              {justEliminated?.isBatch && (
                <text
                  x={bundleSource.x + 6}
                  y={bundleSource.y - 6}
                  fontSize={7}
                  fill="var(--color-brick-400)"
                  fontFamily="var(--font-mono)"
                >
                  {justEliminated.names.length} candidates eliminated together
                </text>
              )}
            </g>
          )
        })()}
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
