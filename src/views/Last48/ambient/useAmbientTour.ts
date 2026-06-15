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
// Robust against backgrounding: a single wall-clock-gated timer (dueWaitMs)
// caps advance to once per interval even when Chrome releases a coalesced
// throttle burst on refocus, and a generation guard stops a stale loop (HMR
// remount, overlap) from driving selection. Tab hide also pauses the timer;
// OS focus-loss that throttles without firing visibilitychange is covered by
// the gate alone.

import { useEffect, useRef } from 'react'
import type { NormalizedEvent } from '@/types/last48'
import { buildPass, nextTourId, dueWaitMs } from './tour'

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

  // Single-flight generation counter. Lives in a ref so it persists ACROSS
  // effect runs: each run captures its own generation, and any timer that
  // fires after a newer run started (HMR remount mid-drift, an overlapping
  // effect, or a setTimeout already queued before teardown) sees its gen is
  // stale and bails. This is what kept two tour loops from running at once
  // and flickering the card.
  const genRef = useRef(0)

  useEffect(() => {
    if (!active) return

    const myGen = ++genRef.current
    const isCurrent = () => myGen === genRef.current

    let pass: string[] = []
    let currentId: string | null = null
    let timer: ReturnType<typeof setTimeout> | undefined
    let dueAt = 0
    let pending: (() => void) | null = null

    const liveIds = () => new Set(eventsRef.current.map((e) => e.id))

    // One timer / dueAt / pending triplet — never more than one in flight. On
    // every wake we re-check the wall clock (dueWaitMs): a timer released early
    // as part of a coalesced background-throttle burst is told to wait the
    // remainder instead of firing, so the tour advances at most once per
    // interval no matter how many stray timers land at once.
    const scheduleTick = (delay: number) => {
      if (timer) clearTimeout(timer)
      timer = setTimeout(onTick, delay)
    }
    const onTick = () => {
      if (!isCurrent()) return
      const wait = dueWaitMs(dueAt, Date.now())
      if (wait > 0) {
        scheduleTick(wait) // woke early → wait out the remainder, don't advance
        return
      }
      const fn = pending
      pending = null
      fn?.()
    }
    const arm = (delay: number, fn: () => void) => {
      dueAt = Date.now() + delay
      pending = fn
      scheduleTick(delay)
    }

    const step = () => {
      if (!isCurrent()) return
      const nextId = nextTourId(pass, currentId, liveIds())
      if (nextId === null) {
        // Pass exhausted → breath, then a fresh snapshot.
        currentId = null
        onBreathRef.current()
        arm(breathMsRef.current, () => {
          pass = buildPass(eventsRef.current)
          step()
        })
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
      arm(dwellMsRef.current, step)
    }

    // Pause the rhythm while the tab is hidden so selection doesn't walk
    // invisibly and the camera doesn't lag a pass behind on return. Re-arm to
    // the SAME dueAt on return — if it's already past, the wall-clock gate
    // fires exactly one transition, never a backlog. (OS focus-loss that
    // throttles timers WITHOUT firing visibilitychange — e.g. starting a
    // screen recording — is caught by the gate alone.)
    const onVisibility = () => {
      if (!isCurrent()) return
      if (document.hidden) {
        if (timer) clearTimeout(timer)
      } else if (pending) {
        scheduleTick(Math.max(0, dueAt - Date.now()))
      }
    }
    document.addEventListener('visibilitychange', onVisibility)

    pass = buildPass(eventsRef.current)
    step()

    return () => {
      genRef.current++ // retire this run — any lingering timer now bails
      if (timer) clearTimeout(timer)
      document.removeEventListener('visibilitychange', onVisibility)
    }
  }, [active])
}
