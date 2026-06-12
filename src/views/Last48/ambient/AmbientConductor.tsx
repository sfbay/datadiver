// src/views/Last48/ambient/AmbientConductor.tsx
//
// Null-rendering orchestrator for ambient mode — the same "side-effect
// component inside mapOverlay" pattern as Last48UnifiedView's
// DeepLinkLander. Owns the phase state machine and the exit-on-input
// listener. PR A: orbits citywide only. PR B adds the tour (per-event
// visits) on top.
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

interface Props {
  map: mapboxgl.Map | null
  /** Armed state from ?ambient=1 (URL is the source of truth). */
  ambientOn: boolean
  /** Streams booted and at least one event available — gate for ramp-in. */
  ready: boolean
  /** Flip ?ambient= off (called when ramp-out completes). */
  onExit: () => void
}

export default function AmbientConductor({ map, ambientOn, ready, onExit }: Props) {
  const [phase, setPhase] = useState<AmbientPhase>('off')
  const [target] = useState<CameraTarget>(CITYWIDE_TARGET) // PR B: setTarget from the tour

  // Arm / disarm. Reduced-motion users never see the toggle, but guard
  // anyway in case ?ambient=1 arrives by URL.
  useEffect(() => {
    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches
    if (ambientOn && ready && !reduced && phase === 'off') setPhase('ramp-in')
    if (!ambientOn && (phase === 'ramp-in' || phase === 'on')) setPhase('ramp-out')
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

  useAmbientDirector({
    map,
    phase,
    target,
    onRampInDone: () => setPhase('on'),
    onRampOutDone: () => {
      setPhase('off')
      // Unconditional onExit is what prevents restart oscillation through
      // 'off'. Known trade: re-toggling DRIFT on during the 1s ramp-out is
      // swallowed (the param the user just set gets cleared) — acceptable
      // for the narrow window; revisit if re-arm-during-ramp-out matters.
      onExitRef.current() // clears ?ambient=1; toggle reads as off
    },
  })

  return null
}
