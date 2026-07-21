// src/hooks/useRcvTransport.ts
//
// View-level RCV round transport clock — promoted out of RCVRoundChart
// (which used to own play/pause/step state privately) so a precinct map
// can subscribe to the SAME round state the chart is stepping through,
// rather than each owning its own clock and drifting apart. The math
// (dwell timing, clamp, who-just-got-eliminated) lives in the pure,
// node-tested rcvTransportCore — this hook is just the React state
// machine wired to timers + usePrefersReducedMotion.
//
// Task 9 refactors RCVRoundChart to consume this hook instead of its own
// internal state; until then this file has no importers.
import { useCallback, useEffect, useRef, useState } from 'react'
import type { RCVContest } from '@/types/elections'
import { usePrefersReducedMotion } from './usePrefersReducedMotion'
import { TRANSFER_WINDOW_MS, clampRound, dwellFor, eliminatedIntoRound } from './rcvTransportCore'

export interface RcvTransport {
  activeRound: number
  totalRounds: number
  isPlaying: boolean
  stepDirection: 'forward' | 'backward' | 'none'
  justEliminatedNames: string[]
  isBatch: boolean
  inTransferWindow: boolean
  reducedMotion: boolean
  play(): void
  pause(): void
  stepForward(): void
  stepBackward(): void
  seek(round: number): void
}

export function useRcvTransport(
  rcvData: RCVContest | null,
  opts?: { initialRound?: number },
): RcvTransport {
  const totalRounds = rcvData?.rounds.length ?? 0
  const reducedMotion = usePrefersReducedMotion()

  const [activeRound, setActiveRoundState] = useState(() =>
    clampRound(opts?.initialRound ?? 0, totalRounds),
  )
  const [isPlaying, setIsPlaying] = useState(false)
  const [justEliminatedNames, setJustEliminatedNames] = useState<string[]>([])

  // Read at reset time only — a fresh `opts` object literal every render
  // must NOT re-fire the reset effect below (that effect keys on rcvData
  // identity alone).
  const optsRef = useRef(opts)
  optsRef.current = opts

  // Reset the clock on a NEW rcvData identity (a race switch) — mirrors
  // RCVRoundChart opening on round 1, never the final result (the chart's
  // story is the redistribution; starting at the end spoils it).
  useEffect(() => {
    const total = rcvData?.rounds.length ?? 0
    setActiveRoundState(clampRound(optsRef.current?.initialRound ?? 0, total))
    setIsPlaying(false)
  }, [rcvData])

  // Clamped setter every mutation path funnels through — autoplay ticks
  // included, so a race switch mid-flight can never park the clock past
  // the new contest's last round.
  const goToRound = useCallback(
    (r: number) => setActiveRoundState(clampRound(r, totalRounds)),
    [totalRounds],
  )

  // Backward steps SNAP — no reverse flow animation (votes don't
  // "un-transfer" in RCV; a mirrored animation would teach something
  // false). Track direction so callers (the ribbon layer) only animate
  // forward.
  //
  // Synchronous step tracking — direction must be correct on the very
  // render where round-derived values change; an effect-updated value
  // lags one committed render and would silently defeat a delayed-
  // transition consumer. React's "adjust state during render" pattern: the
  // setState triggers an immediate re-render before commit, and the inline
  // derivation keeps THIS render's value correct too.
  const [lastStep, setLastStep] = useState<{ round: number; dir: 'forward' | 'backward' | 'none' }>({
    round: activeRound,
    dir: 'none',
  })
  if (activeRound !== lastStep.round) {
    setLastStep({ round: activeRound, dir: activeRound > lastStep.round ? 'forward' : 'backward' })
  }
  const stepDirection =
    activeRound !== lastStep.round
      ? activeRound > lastStep.round
        ? 'forward'
        : 'backward'
      : lastStep.dir

  // Detect whose votes were just redistributed INTO the currently-viewed
  // round. Populated even under reduced motion — the callout is text, not
  // motion, and reads it regardless; only inTransferWindow (below) gates
  // the animated ribbon layer on reducedMotion.
  useEffect(() => {
    if (!rcvData || activeRound === 0) {
      setJustEliminatedNames([])
      return
    }
    const names = eliminatedIntoRound(rcvData.rounds, activeRound)
    if (names.length > 0) {
      setJustEliminatedNames(names)
      const timer = setTimeout(() => setJustEliminatedNames([]), TRANSFER_WINDOW_MS)
      return () => clearTimeout(timer)
    }
    setJustEliminatedNames([])
  }, [activeRound, rcvData])

  // Auto-play — a per-round setTimeout chain, NOT a fixed interval: each
  // displayed round chooses its own dwell via the core's dwellFor (transfer
  // rounds linger). Ticks go through goToRound directly (not the
  // pause-then-clamp public steppers below) since autoplay must not pause
  // itself.
  useEffect(() => {
    if (!isPlaying || !rcvData) return
    if (activeRound >= totalRounds - 1) {
      setIsPlaying(false)
      return
    }
    const dwell = dwellFor(rcvData.rounds, activeRound, reducedMotion)
    const timer = setTimeout(() => goToRound(activeRound + 1), dwell)
    return () => clearTimeout(timer)
  }, [isPlaying, activeRound, totalRounds, rcvData, reducedMotion, goToRound])

  const play = useCallback(() => {
    // Restart from 0 when play is pressed at the final round — otherwise
    // the button would be a no-op at the end of the contest.
    if (activeRound >= totalRounds - 1) goToRound(0)
    setIsPlaying(true)
  }, [activeRound, totalRounds, goToRound])

  const pause = useCallback(() => setIsPlaying(false), [])

  const stepForward = useCallback(() => {
    setIsPlaying(false)
    goToRound(activeRound + 1)
  }, [activeRound, goToRound])

  const stepBackward = useCallback(() => {
    setIsPlaying(false)
    goToRound(activeRound - 1)
  }, [activeRound, goToRound])

  const seek = useCallback(
    (round: number) => {
      setIsPlaying(false)
      goToRound(round)
    },
    [goToRound],
  )

  const isBatch = justEliminatedNames.length > 1
  const inTransferWindow =
    justEliminatedNames.length > 0 && stepDirection === 'forward' && !reducedMotion

  return {
    activeRound,
    totalRounds,
    isPlaying,
    stepDirection,
    justEliminatedNames,
    isBatch,
    inTransferWindow,
    reducedMotion,
    play,
    pause,
    stepForward,
    stepBackward,
    seek,
  }
}
