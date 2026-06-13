// src/views/Last48/ambient/useAmbientDirector.ts
//
// Single-writer camera for ambient mode. While phase is 'ramp-in' or 'on',
// ONE RAF loop owns the camera — nothing else (including Mapbox's own
// flyTo/easeTo animations) may write to it. This is the fix for the
// orbit-vs-recenter fight: bearing increments every frame, and the center
// eases toward the published target THROUGH the rotation instead of via a
// rival animation.
//
// Motion model (two layers, both needed for smoothness):
//   1. FLIGHT LEG — when the published CameraTarget changes, the
//      effective target flies a van Wijk & Nuij optimal zoom-pan path
//      (see flightPath.ts — the math inside Mapbox's flyTo) from the
//      previous leg's endpoint to the new one over pace.tweenMs, time-
//      shaped by easeInOutCubic. Velocity starts at zero, peaks mid-
//      flight, lands at zero — no hunting tail — and the path's zoom-out
//      arc keeps peak SCREEN velocity low, which is what makes flights
//      survive irregular frame pacing without reading as wiggle
//      (feel-test findings #1 and #3, June 12 2026).
//   2. EXACT SCREEN-SPACE SOLVE — each frame, project the effective
//      target, measure its pixel offset from the desired landing point
//      (the visible-map center, left of the detail card's band — see
//      cameraPadding.ts), and apply the FULL correction. No filter:
//      tweens and filters are competing smoothing strategies, and a
//      fractional tracker's gain depends on dt, which converts frame-time
//      jitter into position jitter (the "fighting something" feel-test
//      regression). project/unproject fold in bearing/pitch/zoom
//      implicitly, so the dot stays pinned no matter how the orbit has
//      the map rotated. The band is part of the tween, so visit↔breath
//      transitions slide the landing point rather than jumping it.
//
// Pitch: cruise pitch = max(pitch at arm time, pace.pitchMin). The
// Last 48 rests at pitch 63 (LAST48_CAMERA in src/utils/geo.ts) — DRIFT
// must never REDUCE drama (feel-test: the original fixed 50° read as
// "un-pitching" on deploy). The floor only lifts a map a user flattened.
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
import { buildFlightPath, mercatorPx, mercatorPxToLngLat, type FlightPose } from './flightPath'
import type { PaceValues } from './pace'

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

// Pace-independent constants. The paced values (orbit speed, tween
// duration, pitch floor) arrive via the `pace` prop — see pace.ts — and
// are read live through a ref, so the ?tune=1 panel adjusts them mid-orbit.
const RAMP_IN_MS = 2000
const RAMP_OUT_MS = 1000
const MAX_FRAME_DT_MS = 64       // clamp dt across tab-hidden gaps

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))

/** A tween leg endpoint: geographic position + zoom + landing-band px. */
interface EffectiveTarget {
  lng: number
  lat: number
  zoom: number
  band: number
}

export function useAmbientDirector(opts: {
  map: mapboxgl.Map | null
  phase: AmbientPhase
  target: CameraTarget
  /** Paced motion values (orbit speed, tween duration, pitch floor). */
  pace: PaceValues
  onRampInDone: () => void
  onRampOutDone: () => void
}): void {
  const { map, phase } = opts

  // Latest-value refs — the RAF closure reads these so prop identity
  // changes never restart the loop.
  const paceRef = useRef(opts.pace)
  // eslint-disable-next-line react-hooks/refs
  paceRef.current = opts.pace
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
  /** Pitch at ramp-in entry — the lerp origin toward the cruise pitch. */
  const pitchFromRef = useRef(0)
  /** Last applied orbit speed scale — scales the ramp-out bearing carry. */
  const speedScaleRef = useRef(0)
  /** dt-accumulated phase clock — immune to tab-hidden wall-clock gaps. */
  const phaseElapsedRef = useRef(0)
  const rampInFiredRef = useRef(false)
  const prevPhaseRef = useRef<AmbientPhase>('off')
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef(0)

  // Tween bookkeeping: the leg flies from `tweenFrom` to the published
  // target along a van Wijk path (built once per leg); `effective` is
  // where the flight currently is (and becomes the next leg's origin
  // when the target changes).
  const tweenFromRef = useRef<EffectiveTarget | null>(null)
  const tweenElapsedRef = useRef(0)
  const lastTargetRef = useRef<CameraTarget | null>(null)
  const effectiveRef = useRef<EffectiveTarget | null>(null)
  const flightRef = useRef<((t: number) => FlightPose) | null>(null)

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
          ((paceRef.current.orbitDegPerS * (RAMP_OUT_MS / 1000)) / 3) *
          speedScaleRef.current
        try {
          map.easeTo({
            bearing: bearingRef.current + carry,
            pitch: restingPitchRef.current,
            duration: RAMP_OUT_MS,
            easing: easeOutCubic,
          })
        } catch {
          // easeTo throws inside a React effect flush if the camera was ever
          // poisoned (Invalid LngLat) — on an unattended display that would
          // tear down the whole view via the error boundary. Skipping the
          // deceleration animation is strictly better than crashing.
        }
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
      // First tween leg starts from the live camera, no band.
      const c = map.getCenter()
      tweenFromRef.current = { lng: c.lng, lat: c.lat, zoom: map.getZoom(), band: 0 }
      effectiveRef.current = tweenFromRef.current
      tweenElapsedRef.current = 0
      lastTargetRef.current = null
    }

    lastTsRef.current = 0

    const tick = (now: number) => {
      const dt =
        lastTsRef.current === 0 ? 16 : Math.min(MAX_FRAME_DT_MS, now - lastTsRef.current)
      lastTsRef.current = now
      phaseElapsedRef.current += dt

      const pace = paceRef.current
      // Cruise pitch never reduces drama: max(armed pitch, pace floor).
      // Computed per frame so the tune panel's pitch slider applies live.
      const cruisePitch = Math.max(restingPitchRef.current, pace.pitchMin)

      let speedScale = 1
      let pitch = cruisePitch

      if (phase === 'ramp-in') {
        const p = clamp01(phaseElapsedRef.current / RAMP_IN_MS)
        speedScale = p
        pitch =
          pitchFromRef.current + (cruisePitch - pitchFromRef.current) * easeOutCubic(p)
        if (p >= 1 && !rampInFiredRef.current) {
          rampInFiredRef.current = true
          onRampInDoneRef.current()
        }
      }
      speedScaleRef.current = speedScale

      bearingRef.current =
        (bearingRef.current + (pace.orbitDegPerS * speedScale * dt) / 1000) % 360

      // ── Flight legs: build a van Wijk path when the target changes ────
      // The path (not a lerp) is what keeps peak screen velocity low —
      // see flightPath.ts for the measurement that motivated it.
      const target = targetRef.current
      const targetFinite = Number.isFinite(target.lng) && Number.isFinite(target.lat)
      if (lastTargetRef.current !== target && targetFinite) {
        lastTargetRef.current = target
        const from = effectiveRef.current ?? {
          lng: map.getCenter().lng,
          lat: map.getCenter().lat,
          zoom: map.getZoom(),
          band: 0,
        }
        tweenFromRef.current = from
        const container = map.getContainer()
        flightRef.current = buildFlightPath(
          { ...mercatorPx(from.lng, from.lat), zoom: from.zoom },
          { ...mercatorPx(target.lng, target.lat), zoom: target.zoom },
          Math.max(container.clientWidth, container.clientHeight),
        )
        tweenElapsedRef.current = 0
      }
      tweenElapsedRef.current += dt

      const from = tweenFromRef.current
      const flight = flightRef.current
      let eff = effectiveRef.current
      if (from && flight && targetFinite) {
        const bandTarget = target.avoidCard ? obstructedRightBand(map) : 0
        const s = easeInOutCubic(clamp01(tweenElapsedRef.current / pace.tweenMs))
        const pose = flight(s)
        const lngLat = mercatorPxToLngLat(pose.x, pose.y)
        eff = {
          lng: lngLat.lng,
          lat: lngLat.lat,
          zoom: pose.zoom,
          band: from.band + (bandTarget - from.band) * s,
        }
        effectiveRef.current = eff
      }
      // A malformed target never advances the flight — `eff` stays at the
      // last good position and the orbit continues over it.

      if (eff) {
        // EXACT solve — no filter. The tween is the only motion dynamics;
        // each frame the camera pose is computed to put the tweened target
        // exactly at its landing point. A fractional tracker here (the
        // previous design) converts frame-time jitter into position jitter:
        // its per-frame gain depends on dt, so GPU-bound frame pacing at
        // pitch 63 read as the camera "fighting something" (feel-test,
        // June 12 2026). Position must be a pure function of time.
        zoomRef.current = eff.zoom

        const container = map.getContainer()
        const desiredX = (container.clientWidth - eff.band) / 2
        const desiredY = container.clientHeight / 2
        const projected = map.project([eff.lng, eff.lat])
        const centerPx = map.project(map.getCenter())
        const nextCenter = map.unproject([
          centerPx.x + (projected.x - desiredX),
          centerPx.y + (projected.y - desiredY),
        ])
        // unproject can yield NaN on a degenerate transform (zero-size
        // container, mid-resize frame). One NaN center write poisons the
        // camera permanently and later crashes easeTo — never write it.
        if (Number.isFinite(nextCenter.lng) && Number.isFinite(nextCenter.lat)) {
          map.jumpTo({
            center: nextCenter,
            zoom: zoomRef.current,
            bearing: bearingRef.current,
            pitch,
          })
        } else {
          map.jumpTo({ zoom: zoomRef.current, bearing: bearingRef.current, pitch })
        }
      } else {
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
