// src/views/Last48/ambient/useAmbientDirector.ts
//
// Single-writer camera for ambient mode. While phase is 'ramp-in' or 'on',
// ONE RAF loop owns the camera — nothing else (including Mapbox's own
// flyTo/easeTo animations) may write to it. This is the fix for the
// orbit-vs-recenter fight: bearing increments every frame, and the center
// eases toward the published target THROUGH the rotation instead of via a
// rival animation.
//
// Centering is a screen-space feedback controller: each frame, project the
// target, measure its pixel error from the desired on-screen landing point
// (the visible-map center, left of the detail card's band — see
// cameraPadding.ts), and move the camera center by a smoothed fraction of
// that error. project/unproject account for bearing/pitch/zoom implicitly,
// so the dot homes to its landing point no matter how the orbit has the
// map rotated.
//
// Ramp-in seeds EVERY register (bearing, zoom, pitch) from the live camera
// — Last 48 rests at pitch 63 (LAST48_CAMERA in src/utils/geo.ts), not
// flat — and lerps pitch from there to AMBIENT_PITCH while orbit speed
// scales 0 → 1.
//
// Ramp-out is NOT the RAF loop: jumpTo's internal stop() resets gesture
// handlers every frame, which would kill the very drag that interrupted
// the tour. Instead, ramp-out entry issues a single cancellable easeTo
// back to the seeded resting pitch (with a small bearing carry for
// velocity continuity); a user gesture interrupts it natively, which is
// exactly the attract-mode semantic. easeTo also starts from the live
// camera, so an interrupt mid-ramp-in decelerates from wherever the ramp
// actually was — no snap.
//
// Caller contract: gate on prefers-reduced-motion BEFORE arming (the
// conductor owns that check); this hook animates unconditionally.

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'
import { obstructedRightBand } from '../cameraPadding'

export type AmbientPhase = 'off' | 'ramp-in' | 'on' | 'ramp-out'

export interface CameraTarget {
  lng: number
  lat: number
  zoom: number
  /** Visit register: land the point clear of the detail card's band. */
  avoidCard: boolean
}

// Geographic center of SF — the resting/citywide register.
export const CITYWIDE_TARGET: CameraTarget = {
  lng: -122.4376,
  lat: 37.7577,
  zoom: 11.5,
  avoidCard: false,
}

// Tuning constants — adjust by feel on the dev server; these are the
// spec's starting points, not contracts.
const ORBIT_DEG_PER_S = 1.2     // full rotation ≈ 5 min
const AMBIENT_PITCH = 50        // degrees
const RAMP_IN_MS = 2000
const RAMP_OUT_MS = 1000
const CENTER_TAU_MS = 900       // center smoothing time-constant
const ZOOM_TAU_MS = 1200        // zoom smoothing time-constant
const MAX_FRAME_DT_MS = 64      // clamp dt across tab-hidden gaps

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

export function useAmbientDirector(opts: {
  map: mapboxgl.Map | null
  phase: AmbientPhase
  target: CameraTarget
  onRampInDone: () => void
  onRampOutDone: () => void
}): void {
  const { map, phase } = opts

  // Latest-value refs — the RAF closure reads these so prop identity
  // changes never restart the loop.
  const targetRef = useRef(opts.target)
  // eslint-disable-next-line react-hooks/refs
  targetRef.current = opts.target
  const onRampInDoneRef = useRef(opts.onRampInDone)
  // eslint-disable-next-line react-hooks/refs
  onRampInDoneRef.current = opts.onRampInDone
  const onRampOutDoneRef = useRef(opts.onRampOutDone)
  // eslint-disable-next-line react-hooks/refs
  onRampOutDoneRef.current = opts.onRampOutDone

  // Camera scalars owned by the loop, seeded at ramp-in.
  const bearingRef = useRef(0)
  const zoomRef = useRef(CITYWIDE_TARGET.zoom)
  /** The pitch DRIFT was armed at — what ramp-out returns the map to. */
  const restingPitchRef = useRef(0)
  /** Pitch at ramp-in entry — the lerp origin toward AMBIENT_PITCH. */
  const pitchFromRef = useRef(0)
  /** Last applied orbit speed scale — scales the ramp-out bearing carry. */
  const speedScaleRef = useRef(0)
  /** dt-accumulated phase clock — immune to tab-hidden wall-clock gaps. */
  const phaseElapsedRef = useRef(0)
  const rampInFiredRef = useRef(false)
  const prevPhaseRef = useRef<AmbientPhase>('off')
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef(0)

  useEffect(() => {
    if (!map || phase === 'off') {
      // Treat "can't run" as off: if the phase advanced while the map was
      // still null, the next run with a live map must re-seed.
      prevPhaseRef.current = 'off'
      return
    }

    const entering = prevPhaseRef.current !== phase
    prevPhaseRef.current = phase

    if (phase === 'ramp-out') {
      if (entering) {
        // Velocity-continuous deceleration: easeOutCubic's initial slope is
        // 3·D/T, so a carry of ω·T/3 (scaled by the live speed) matches the
        // orbit's angular velocity at the handoff instant.
        const carry =
          ((ORBIT_DEG_PER_S * (RAMP_OUT_MS / 1000)) / 3) * speedScaleRef.current
        map.easeTo({
          bearing: bearingRef.current + carry,
          pitch: restingPitchRef.current,
          duration: RAMP_OUT_MS,
          easing: easeOutCubic,
        })
      }
      const t = setTimeout(() => onRampOutDoneRef.current(), RAMP_OUT_MS)
      return () => clearTimeout(t)
    }

    if (entering && phase === 'ramp-in') {
      // Seed every register from the live camera so the orbit picks up
      // exactly where the user left the map.
      bearingRef.current = map.getBearing()
      zoomRef.current = map.getZoom()
      restingPitchRef.current = map.getPitch()
      pitchFromRef.current = map.getPitch()
      speedScaleRef.current = 0
      phaseElapsedRef.current = 0
      rampInFiredRef.current = false
    }

    lastTsRef.current = 0

    const tick = (now: number) => {
      const dt =
        lastTsRef.current === 0 ? 16 : Math.min(MAX_FRAME_DT_MS, now - lastTsRef.current)
      lastTsRef.current = now
      phaseElapsedRef.current += dt

      let speedScale = 1
      let pitch = AMBIENT_PITCH

      if (phase === 'ramp-in') {
        const p = clamp01(phaseElapsedRef.current / RAMP_IN_MS)
        speedScale = p
        pitch =
          pitchFromRef.current + (AMBIENT_PITCH - pitchFromRef.current) * easeOutCubic(p)
        if (p >= 1 && !rampInFiredRef.current) {
          rampInFiredRef.current = true
          onRampInDoneRef.current()
        }
      }
      speedScaleRef.current = speedScale

      bearingRef.current =
        (bearingRef.current + (ORBIT_DEG_PER_S * speedScale * dt) / 1000) % 360

      const target = targetRef.current
      const kz = 1 - Math.exp(-dt / ZOOM_TAU_MS)
      zoomRef.current += (target.zoom - zoomRef.current) * kz

      if (Number.isFinite(target.lng) && Number.isFinite(target.lat)) {
        // Screen-space feedback: nudge the camera center so the target's
        // projection homes toward the desired landing point.
        const container = map.getContainer()
        const band = target.avoidCard ? obstructedRightBand(map) : 0
        const desiredX = (container.clientWidth - band) / 2
        const desiredY = container.clientHeight / 2
        const projected = map.project([target.lng, target.lat])
        const kc = 1 - Math.exp(-dt / CENTER_TAU_MS)
        const centerPx = map.project(map.getCenter())
        const nextCenter = map.unproject([
          centerPx.x + (projected.x - desiredX) * kc,
          centerPx.y + (projected.y - desiredY) * kc,
        ])
        map.jumpTo({
          center: nextCenter,
          zoom: zoomRef.current,
          bearing: bearingRef.current,
          pitch,
        })
      } else {
        // Defensive: a malformed target must not poison the transform.
        map.jumpTo({ zoom: zoomRef.current, bearing: bearingRef.current, pitch })
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
    }
  }, [map, phase])
}
