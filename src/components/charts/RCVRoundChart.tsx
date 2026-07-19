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

  // STABLE ROSTER (Jesse's feedback: re-sorting by vote count and moving
  // candidates between "active" and "eliminated" sections every round made
  // the panel resize and click targets shift underneath the user). Derived
  // ONCE from round 1 and never touched again — every candidate gets
  // exactly one permanent row for the life of the contest; only their bar
  // width and elimination styling change round to round. Because the row
  // always exists, the old justRedistributed keep-alive clause (which kept
  // a just-eliminated candidate's row alive for exactly the 1.5s ribbon
  // window) is no longer needed — the ribbon layer's anchor is
  // structurally always present, eliminated or not.
  const roster = useMemo(() => {
    const round1 = rcvData.rounds[0]
    return [...round1.candidates]
      .filter((c) => c.votes > 0 || c.isEliminated)
      .sort((a, b) => b.votes - a.votes)
  }, [rcvData])

  // Current-round votes, keyed by name — the roster's ORDER is fixed, but
  // each row's bar width still reflects the round being viewed.
  const votesByName = useMemo(
    () => new Map(round.candidates.map((c) => [c.name, c.votes])),
    [round],
  )

  const maxVotes = Math.max(...roster.map((c) => votesByName.get(c.name) ?? 0), 1)
  const threshold = round.continuingTotal * 0.5

  // Track cumulative eliminations — candidates whose votes are GONE in the
  // viewed round. STRICT bound (i < activeRound): a round's own isEliminated
  // flag describes who's removed entering the NEXT round (the same
  // off-by-one shape as the transfer-attribution fix in rcvFlow.ts), so a
  // candidate flagged in the viewed round still holds live votes here and
  // must NOT be struck/dimmed yet — Jesse caught the strikethrough running
  // one step ahead of the actual removal.
  const eliminatedByRound = useMemo(() => {
    const eliminated = new Set<string>()
    for (let i = 0; i < activeRound; i++) {
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

  const barHeight = 18
  const gap = 5
  const labelWidth = 120
  // Right gutter holds the count label ("14,056") and the "+N" transfer
  // badge past the longest bar — 60 crowded them against the panel edge
  // (Jesse's screenshot); 76 gives the right side room to breathe.
  const chartWidth = width - labelWidth - 76

  // CONSTANT height — derives from the roster length alone, never from how
  // many candidates are currently active vs. eliminated. This is the whole
  // point of the stable-roster rework: the panel never resizes and the
  // transport bar/round bubbles above it never move as rounds advance.
  const svgHeight = roster.length * (barHeight + gap) + 20

  // Row positions for the ribbon layer, keyed by candidate name (or
  // EXHAUSTED_SINK). One map over the fixed roster — no more separate
  // active/eliminated position math, since every candidate has exactly one
  // permanent row regardless of elimination state.
  const barPositions = useMemo(() => {
    const positions = new Map<string, { x: number; y: number; width: number; midY: number }>()
    roster.forEach((c, i) => {
      const y = i * (barHeight + gap) + 16
      const w = ((votesByName.get(c.name) ?? 0) / maxVotes) * chartWidth
      positions.set(c.name, { x: labelWidth, y, width: w, midY: y + barHeight / 2 })
    })
    // Exhausted sink — fixed corner position, doesn't participate in the
    // bar layout at all (there's no "Exhausted" bar, just a small marker).
    positions.set(EXHAUSTED_SINK, { x: width - 14, y: svgHeight - 10, width: 0, midY: svgHeight - 10 })
    return positions
  }, [roster, votesByName, maxVotes, chartWidth, labelWidth, barHeight, gap, width, svgHeight])

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

        <span className="text-micro font-mono text-slate-500 tabular-nums flex-shrink-0">
          R{activeRound + 1}/{totalRounds}
        </span>
      </div>

      {/* Elimination callout — a permanently-reserved, fixed-height slot so
          the panel NEVER changes size (Jesse: click zones must not move; the
          old 1.5s-flash banner grew the panel by ~52px each round). Content
          is persistent for the whole viewed round (derived from the
          synchronous transferResult, not the 1.5s justEliminated window,
          which now gates only the ribbons/glow) — it's context worth
          reading at leisure, not a flash. */}
      <div className="mb-2 min-h-[52px] px-2 py-1.5 rounded-lg flex items-center border border-brick-500/20 bg-brick-500/10" style={{ opacity: transferResult.eliminatedNames.length > 0 ? 1 : 0, transition: 'opacity 0.3s' }}>
        {transferResult.eliminatedNames.length > 0 && (
          <p className="text-micro font-mono text-brick-400">
            <span className="font-bold">
              {transferResult.isBatch
                ? `${transferResult.eliminatedNames.length} candidates eliminated together`
                : `${toSentenceCase(transferResult.eliminatedNames[0])} eliminated`}
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
        )}
      </div>

      {/* Bar chart — svgHeight is constant (roster-length derived), so no
          height transition is needed anymore; the panel never resizes. */}
      <svg
        width={width}
        height={svgHeight}
        viewBox={`0 0 ${width} ${svgHeight}`}
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

        {/* Roster — one permanent row per candidate for the whole contest.
            Elimination is a STYLING state (dimmed + line-through label,
            zero-width bar once votes hit 0), never a change of row or
            position — that's the whole fix for the "elements moving" complaint. */}
        {roster.map((c, i) => {
          const y = i * (barHeight + gap) + 16
          const votes = votesByName.get(c.name) ?? 0
          const barW = (votes / maxVotes) * chartWidth
          const color = candidateColors.get(c.name) || 'var(--color-slate-500)'
          const isWinner = c.name === rcvData.winner && activeRound === totalRounds - 1
          const isEliminatedNow = eliminatedByRound.has(c.name)
          const isJust = justEliminated?.names.includes(c.name) ?? false
          const displayName = toSentenceCase(c.name)
          // Check if this candidate gained votes from a transfer (never
          // true for an eliminated row — eliminated candidates only lose).
          const transfer = !isEliminatedNow ? candidateTransfers.find((t) => t.to === c.name) : undefined
          const hasTransferGlow = transfer && justEliminated

          return (
            <g key={c.name} opacity={isEliminatedNow ? (isJust ? 0.6 : 0.25) : 1} style={{ transition: 'opacity 0.5s' }}>
              <text
                x={labelWidth - 4}
                y={y + barHeight / 2 + 1}
                textAnchor="end"
                fill={
                  isEliminatedNow
                    ? isJust ? '#b85545' : 'var(--color-slate-500)'
                    : isWinner ? 'var(--color-slate-700)' : 'var(--color-slate-400)'
                }
                fontSize={9}
                fontWeight={isWinner && !isEliminatedNow ? 700 : 400}
                fontFamily="Inter, system-ui, sans-serif"
                textDecoration={isEliminatedNow ? 'line-through' : undefined}
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
                fill={isEliminatedNow && isJust ? '#b85545' : color}
                opacity={isEliminatedNow ? 0.4 : isWinner ? 0.95 : 0.75}
                style={{
                  transition: transfer && ribbonSequenceActive
                    ? 'width 0.5s ease-out 0.5s, opacity 0.3s, fill 0.3s'
                    : 'width 0.4s ease-out, opacity 0.3s, fill 0.3s',
                }}
              />
              {/* Transfer segment — the growth region arrives wearing the
                  DONOR's color, then fades to reveal the recipient's own
                  color on the (already grown) bar beneath: the crossfade IS
                  the adoption moment (Jesse: "the growth should at first
                  appear as the donated color then change to the adopted
                  color"). Keyed per round so consecutive steps restart the
                  animation; gated on showRibbons so reduced-motion and
                  backward steps skip it entirely. */}
              {showRibbons && transfer && (() => {
                const prevVotes = prevRound?.candidates.find((p) => p.name === c.name)?.votes ?? votes
                const prevW = (prevVotes / maxVotes) * chartWidth
                const deltaW = barW - prevW
                if (deltaW < 0.5) return null
                const donorColor = transferResult.isBatch
                  ? 'var(--color-slate-500)'
                  : candidateColors.get(transferResult.eliminatedNames[0]) || 'var(--color-slate-500)'
                return (
                  <rect
                    key={`seg-${activeRound}`}
                    x={labelWidth + prevW}
                    y={y}
                    width={deltaW}
                    height={barHeight}
                    rx={3}
                    fill={donorColor}
                    style={{ animation: 'rcv-transfer-adopt 1.1s ease-in-out 0.35s both' }}
                  />
                )
              })()}
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
              {!isEliminatedNow && (
                <text
                  x={labelWidth + barW + 4}
                  y={y + barHeight / 2 + 1}
                  fill="var(--color-slate-400)"
                  fontSize={8}
                  fontFamily="var(--font-mono)"
                  dominantBaseline="middle"
                >
                  {votes.toLocaleString()}
                </text>
              )}
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
          <p className="text-nano font-mono text-slate-500">
            Exhausted: {round.exhausted.toLocaleString()}
          </p>
        )}
        {round.overvotes > 0 && (
          <p className="text-nano font-mono text-slate-500">
            Overvotes: {round.overvotes.toLocaleString()}
          </p>
        )}
      </div>
    </div>
  )
}
