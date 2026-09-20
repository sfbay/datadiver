//
// The immersive PLAY clock (Spec A2 §1: auto-advance is opt-in; explore is
// the default). Counts the dwell from ARRIVAL — the page flips `arrived`
// when the director's settle gate fires — then calls onAdvance once. Hold
// pauses the clock and keeps the remainder; a new stop (stopKey) discards
// it. Same wall-clock gate as the flat tour (dueWaitMs), so a backgrounded
// tab's coalesced timers cannot fire a burst of advances on refocus.
//
// Round B (§4): this is THE clock. `remainingMs()` is what the band's
// "next in 48 s", the card's stripe and the rail's rule all read — one
// number drawn three times, so a hold freezes all three together (before
// Round B the rail's rule ran off arrival time and jumped after a hold).
import { useCallback, useEffect, useRef } from 'react'
import { dueWaitMs } from '../../ambient/tour'

export function useAutoAdvance(opts: {
  playing: boolean
  arrived: boolean
  hold: boolean
  dwellMs: number
  /** The active stop's id. Changing it resets the clock. */
  stopKey: string | null
  onAdvance: () => void
}): { remainingMs: () => number | null } {
  const cb = useRef(opts.onAdvance)
  // eslint-disable-next-line react-hooks/refs
  cb.current = opts.onAdvance
  /** Milliseconds left when the clock was last paused, for THIS stop. */
  const remainingRef = useRef<number | null>(null)
  /** When the running clock fires; null while it is not running. */
  const dueAtRef = useRef<number | null>(null)

  // A new stop discards any remainder. Declared BEFORE the timer effect so
  // React runs it first on the same commit.
  useEffect(() => { remainingRef.current = null }, [opts.stopKey])

  useEffect(() => {
    if (!opts.playing || !opts.arrived || opts.hold) return
    const delay = remainingRef.current ?? opts.dwellMs
    const dueAt = Date.now() + delay
    dueAtRef.current = dueAt
    let timer: ReturnType<typeof setTimeout>
    const tick = () => {
      const wait = dueWaitMs(dueAt, Date.now())
      if (wait > 0) { timer = setTimeout(tick, wait); return }
      remainingRef.current = null
      dueAtRef.current = null
      cb.current()
    }
    timer = setTimeout(tick, delay)
    return () => {
      clearTimeout(timer)
      dueAtRef.current = null
      remainingRef.current = Math.max(0, dueAt - Date.now())
    }
  }, [opts.playing, opts.arrived, opts.hold, opts.dwellMs, opts.stopKey])

  // Running → what is left; held → the frozen remainder; otherwise null
  // (not arrived yet, or play is off and nothing was ever counted).
  const remainingMs = useCallback((): number | null => {
    if (dueAtRef.current != null) return Math.max(0, dueAtRef.current - Date.now())
    return remainingRef.current
  }, [])

  return { remainingMs }
}
