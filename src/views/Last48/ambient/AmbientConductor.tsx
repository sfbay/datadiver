// src/views/Last48/ambient/AmbientConductor.tsx
//
// Null-rendering orchestrator for ambient mode — the same "side-effect
// component inside mapOverlay" pattern as Last48UnifiedView's
// DeepLinkLander. Owns the phase state machine, the exit-on-input
// listener, and the tour↔director wiring (shipped in two stages: the
// citywide orbit first, the per-event tour on top).
//
// Exit semantics: ANY user input (pointerdown / wheel / keydown /
// touchstart) ramps out — EXCEPT input inside [data-ambient-toggle], which
// must reach the toggle untranslated so it can disarm cleanly. Ramp-out
// completes → onExit() flips ?ambient= off → phase returns to 'off'.

import { useEffect, useRef, useState } from 'react'
import type mapboxgl from 'mapbox-gl'
import {
  useAmbientDirector,
  CITYWIDE_TARGET,
  type AmbientPhase,
  type CameraTarget,
} from './useAmbientDirector'
import { useAmbientTour } from './useAmbientTour'
import type { PaceValues } from './pace'
import type { NormalizedEvent } from '@/types/last48'

interface Props {
  map: mapboxgl.Map | null
  /** Armed state from ?ambient=1 (URL is the source of truth). */
  ambientOn: boolean
  /** Resolved pace values (preset + any ?tune=1 overrides). */
  pace: PaceValues
  /** Streams booted and at least one event available — gate for ramp-in. */
  ready: boolean
  /** Flip ?ambient= off (called when ramp-out completes). */
  onExit: () => void
  /** Geo-bearing visible events (the tour's source). */
  events: NormalizedEvent[]
  /** FLOW dots visible. With points off (e.g. HOTSPOTS via a heartbeat
   *  surge link sets ?points=off) the dots, radar, and event card are all
   *  unmounted — touring would select invisible events and lurch the
   *  camera to empty streets. Gate the tour; keep the citywide orbit. */
  pointsOn: boolean
  /** Select an event exactly as a rail click would. */
  onVisit: (ev: NormalizedEvent) => void
  /** Clear the selection (breath — card closes for the citywide shot). */
  onClearSelection: () => void
}

export default function AmbientConductor({ map, ambientOn, pace, ready, onExit, events, pointsOn, onVisit, onClearSelection }: Props) {
  const [phase, setPhase] = useState<AmbientPhase>('off')
  const [target, setTarget] = useState<CameraTarget>(CITYWIDE_TARGET)

  // Arm / disarm. Reduced-motion users never see the toggle, but guard
  // anyway in case ?ambient=1 arrives by URL.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ambientOn && ready && !reduced && phase === 'off') setPhase('ramp-in')
    if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) {
      setPhase('ramp-out')
      setTarget(CITYWIDE_TARGET)
    }
  }, [ambientOn, ready, phase])

  const onExitRef = useRef(onExit)
  // eslint-disable-next-line react-hooks/refs
  onExitRef.current = onExit

  // Exit on any user input while running.
  useEffect(() => {
    if (phase !== 'ramp-in' && phase !== 'on') return
    const exit = (e: Event) => {
      const t = e.target as HTMLElement | null
      if (t?.closest('[data-ambient-toggle]')) return
      onExitRef.current()
    }
    const opts = { capture: true } as const
    window.addEventListener('pointerdown', exit, opts)
    window.addEventListener('wheel', exit, opts)
    window.addEventListener('keydown', exit, opts)
    window.addEventListener('touchstart', exit, opts)
    return () => {
      window.removeEventListener('pointerdown', exit, opts)
      window.removeEventListener('wheel', exit, opts)
      window.removeEventListener('keydown', exit, opts)
      window.removeEventListener('touchstart', exit, opts)
    }
  }, [phase])

  useAmbientTour({
    active: phase === 'on' && pointsOn,
    events,
    dwellMs: pace.dwellMs,
    breathMs: pace.breathMs,
    onVisit: (ev) => {
      onVisit(ev)
      setTarget({ lng: ev.longitude!, lat: ev.latitude!, zoom: 14, avoidCard: true })
    },
    onBreath: () => {
      onClearSelection()
      setTarget(CITYWIDE_TARGET)
    },
  })

  useAmbientDirector({
    map,
    phase,
    target,
    pace,
    onRampInDone: () => setPhase('on'),
    onRampOutDone: () => {
      setPhase('off')
      // Unconditional onExit is what prevents restart oscillation through
      // 'off'. Known trade: re-toggling DRIFT on during the ~1s ramp-out is
      // swallowed (the param the user just set gets cleared) — and the
      // window stretches under hidden-tab timer throttling. Acceptable;
      // revisit if re-arm-during-ramp-out matters.
      onExitRef.current() // clears ?ambient=1; toggle reads as off
    },
  })

  return null
}
