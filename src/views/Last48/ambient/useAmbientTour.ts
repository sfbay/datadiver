// src/views/Last48/ambient/useAmbientTour.ts
//
// Owns WHAT is selected during ambient mode; the director owns WHERE the
// camera is. Communicates outward only through callbacks: onVisit(event)
// (select + publish visit target) and onBreath() (clear selection +
// publish citywide target). Timer-driven; reads live events via a ref so
// poll-driven re-renders never reset the dwell clock.
//
// Rhythm: visit … (dwellMs) … visit … pass exhausted → breath
// (breathMs, card closed, citywide) → fresh snapshot → next pass.
// Dwell/breath come from the active pace preset (see pace.ts), read at
// schedule time via refs so a pace switch or ?tune=1 change applies on
// the next beat without resetting the in-flight one.
// Tab hidden → timers pause (visibilitychange); resumes where it stopped.

import { useEffect, useRef } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { buildPass, nextTourId } from './tour'

export function useAmbientTour(opts: {
  /** True only while the conductor's phase is 'on'. */
  active: boolean
  events: NormalizedEvent[]
  /** Per-event dwell, ms — from the active pace preset. */
  dwellMs: number
  /** Citywide breath between passes, ms — from the active pace preset. */
  breathMs: number
  onVisit: (ev: NormalizedEvent) => void
  onBreath: () => void
}): void {
  const { active } = opts

  const dwellMsRef = useRef(opts.dwellMs)
  // eslint-disable-next-line react-hooks/refs
  dwellMsRef.current = opts.dwellMs
  const breathMsRef = useRef(opts.breathMs)
  // eslint-disable-next-line react-hooks/refs
  breathMsRef.current = opts.breathMs
  const eventsRef = useRef(opts.events)
  // eslint-disable-next-line react-hooks/refs
  eventsRef.current = opts.events
  const onVisitRef = useRef(opts.onVisit)
  // eslint-disable-next-line react-hooks/refs
  onVisitRef.current = opts.onVisit
  const onBreathRef = useRef(opts.onBreath)
  // eslint-disable-next-line react-hooks/refs
  onBreathRef.current = opts.onBreath

  useEffect(() => {
    if (!active) return

    let timer: ReturnType<typeof setTimeout> | undefined
    let pass: string[] = []
    let currentId: string | null = null
    let disposed = false

    const liveIds = () => new Set(eventsRef.current.map((e) => e.id))

    const step = () => {
      if (disposed) return
      const nextId = nextTourId(pass, currentId, liveIds())
      if (nextId === null) {
        // Pass exhausted → breath, then a fresh snapshot.
        currentId = null
        onBreathRef.current()
        timer = setTimeout(() => {
          pass = buildPass(eventsRef.current)
          step()
        }, breathMsRef.current)
        return
      }
      const ev = eventsRef.current.find((e) => e.id === nextId)
      if (!ev) {
        // Evicted between cursor math and lookup — advance immediately.
        currentId = nextId
        step()
        return
      }
      currentId = nextId
      onVisitRef.current(ev)
      timer = setTimeout(step, dwellMsRef.current)
    }

    // Pause the rhythm while the tab is hidden (RAF already stops; without
    // this the selection would advance invisibly and the camera would lag
    // a whole pass behind on return).
    let hiddenAt: number | null = null
    const onVisibility = () => {
      if (document.hidden) {
        hiddenAt = Date.now()
        if (timer) clearTimeout(timer)
      } else if (hiddenAt !== null) {
        hiddenAt = null
        timer = setTimeout(() => {
          // If the tab hid during the breath (pass exhausted, cursor reset),
          // re-snapshot so the resumed tour starts from the now-newest
          // events instead of replaying the stale pre-breath pass.
          if (currentId === null) pass = buildPass(eventsRef.current)
          step()
        }, 1000) // gentle resume beat
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    pass = buildPass(eventsRef.current)
    step()

    return () => {
      disposed = true
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])
}
