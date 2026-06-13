// src/views/Last48/ambient/useAmbientDirector.ts
//
// Hybrid camera for ambient mode: native Mapbox animation for the
// expensive parts, a cheap manual orbit for the rest, never both at once.
//
// WHY HYBRID (feel-test #4, June 12 2026 — phase-correlation of a 240fps
// screen recording): driving flights with a per-frame map.jumpTo that
// changes zoom every frame forced Mapbox into ~15-20fps irregular paint
// at pitch 63 over a heavy scene (thousands of dots + a demographic
// choropleth). The camera position was geometrically correct (<0.5px
// lateral error) but advanced in discrete 8-30px hops — measured 84% of
// frames frozen, motion in bursts. That judder, not a path wiggle, is
// what read as "jittery." Root causes of the hop: (a) two RAF loops —
// ours calling jumpTo, Mapbox's painting — beating out of phase; (b) a
// zoom change every frame forcing tile/work that blew the frame budget.
//
//   FLIGHT (a real pan/zoom between targets) → map.flyTo. One coherent
//   animation inside Mapbox's own render loop; flyTo IS the van Wijk
//   optimal zoom-pan path, GPU-tuned, with symbol/placement work deferred
//   during the move. The bearing target carries the orbit forward through
//   the flight so rotation never stops. Single writer for the duration.
//
//   HOLD (dwell on an event, or the citywide rest) → manual RAF, bearing
//   only, center+zoom+pitch constant. No zoom change = no re-tile, so the
//   per-frame cost stays well inside budget and it paints smoothly. The
//   event is pinned via Mapbox `padding` (the card-avoidance band): the
//   target sits at the padded center and bearing rotates about that point,
//   so a hold needs zero per-frame center math — which also removes the
//   project/unproject roundtrip whose cross-frame staleness caused the
//   earlier sub-pixel wobble (feel-test #3).
//
// Pitch: cruise pitch = max(pitch at arm time, pace.pitchMin). The Last 48
// rests at pitch 63 (LAST48_CAMERA in src/utils/geo.ts) — DRIFT must never
// REDUCE drama (feel-test #2: a fixed 50° read as "un-pitching"). The floor
// only lifts a map a user flattened.
//
// Ramp-out is a single cancellable easeTo back to the seeded resting pitch
// (with a small bearing carry for velocity continuity) and clears the
// padding; a user gesture interrupts it natively — the attract-mode exit.
//
// Caller contract: gate on prefers-reduced-motion BEFORE arming (the
// conductor owns that check); this hook animates unconditionally.

import { useEffect, useRef } from 'react'
import type mapboxgl from 'mapbox-gl'
import { obstructedRightBand } from '../cameraPadding'
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

// Pace-independent constants. The paced values (orbit speed, flight
// duration, pitch floor) arrive via the `pace` prop — see pace.ts — and
// are read live through a ref, so the ?tune=1 panel adjusts them mid-orbit.
const RAMP_IN_MS = 2000
const RAMP_OUT_MS = 1000
const MAX_FRAME_DT_MS = 64       // clamp dt across tab-hidden gaps
const FLIGHT_CURVE = 1.42        // mapbox flyTo van Wijk curvature default
// Below these, a target change is too small to be worth a flight — adopt
// it as a hold pose directly (avoids micro-flights between adjacent events).
const MOVE_PX_EPS = 6
const MOVE_ZOOM_EPS = 0.05

/** Where a hold orbits: geographic position + zoom + card-avoidance band. */
interface HoldPose {
  lng: number
  lat: number
  zoom: number
  band: number
}

const easeOutCubic = (t: number) => 1 - Math.pow(1 - t, 3)
const easeInOutCubic = (t: number) =>
  t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2
const clamp01 = (t: number) => Math.min(1, Math.max(0, t))
const wrap360 = (d: number) => ((d % 360) + 360) % 360

export function useAmbientDirector(opts: {
  map: mapboxgl.Map | null
  phase: AmbientPhase
  target: CameraTarget
  /** Paced motion values (orbit speed, flight duration, pitch floor). */
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

  // Hold + flight bookkeeping.
  const holdRef = useRef<HoldPose | null>(null)
  const lastTargetRef = useRef<CameraTarget | null>(null)
  const flyingRef = useRef(false)
  const flightTimerRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

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
        // orbit's angular velocity at the handoff instant. Also clears the
        // card-avoidance padding so the user's post-drift map isn't offset.
        const carry =
          ((paceRef.current.orbitDegPerS * (RAMP_OUT_MS / 1000)) / 3) *
          speedScaleRef.current
        try {
          map.easeTo({
            bearing: bearingRef.current + carry,
            pitch: restingPitchRef.current,
            padding: { top: 0, right: 0, bottom: 0, left: 0 },
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
      restingPitchRef.current = map.getPitch()
      pitchFromRef.current = map.getPitch()
      speedScaleRef.current = 0
      phaseElapsedRef.current = 0
      rampInFiredRef.current = false
      flyingRef.current = false
      if (flightTimerRef.current !== undefined) {
        clearTimeout(flightTimerRef.current)
        flightTimerRef.current = undefined
      }
      const c = map.getCenter()
      holdRef.current = { lng: c.lng, lat: c.lat, zoom: map.getZoom(), band: 0 }
      lastTargetRef.current = null // first 'on' target triggers a flight
    }

    lastTsRef.current = 0

    /** Launch a native flyTo leg; resume the manual orbit when it lands. */
    const launchFlight = (target: CameraTarget, band: number, cruisePitch: number) => {
      const pace = paceRef.current
      const durationMs = pace.tweenMs
      // Carry the orbit forward so rotation never stops across the flight.
      const endBearing = bearingRef.current + pace.orbitDegPerS * (durationMs / 1000)
      flyingRef.current = true
      try {
        map.flyTo({
          center: [target.lng, target.lat],
          zoom: target.zoom,
          bearing: endBearing,
          pitch: cruisePitch,
          padding: { top: 0, right: band, bottom: 0, left: 0 },
          duration: durationMs,
          curve: FLIGHT_CURVE,
          easing: easeInOutCubic,
          essential: true,
        })
      } catch {
        flyingRef.current = false
        return
      }
      // Deterministic resume (not moveend — gestures/ramp-out also fire it).
      flightTimerRef.current = setTimeout(() => {
        flightTimerRef.current = undefined
        flyingRef.current = false
        bearingRef.current = wrap360(map.getBearing())
        holdRef.current = { lng: target.lng, lat: target.lat, zoom: target.zoom, band }
        lastTsRef.current = 0 // avoid a giant dt on the resume frame
      }, durationMs + 50)
    }

    const tick = (now: number) => {
      const dt =
        lastTsRef.current === 0 ? 16 : Math.min(MAX_FRAME_DT_MS, now - lastTsRef.current)
      lastTsRef.current = now
      phaseElapsedRef.current += dt

      const pace = paceRef.current
      // Cruise pitch never reduces drama: max(armed pitch, pace floor).
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

      // ── Native flight on a new target (phase 'on' only) ────────────────
      if (phase === 'on' && !flyingRef.current) {
        const target = targetRef.current
        const finite = Number.isFinite(target.lng) && Number.isFinite(target.lat)
        if (finite && lastTargetRef.current !== target) {
          lastTargetRef.current = target
          const band = target.avoidCard ? obstructedRightBand(map) : 0
          const hold = holdRef.current
          let meaningful = true
          if (hold && Math.abs(target.zoom - hold.zoom) <= MOVE_ZOOM_EPS) {
            const a = map.project([hold.lng, hold.lat])
            const b = map.project([target.lng, target.lat])
            meaningful = Math.hypot(a.x - b.x, a.y - b.y) > MOVE_PX_EPS
          }
          if (meaningful) {
            launchFlight(target, band, cruisePitch)
            rafRef.current = requestAnimationFrame(tick)
            return
          }
          // Negligible move — adopt as a hold pose without a flight.
          holdRef.current = { lng: target.lng, lat: target.lat, zoom: target.zoom, band }
        }
      }

      // While a flyTo owns the camera, keep the loop alive but write nothing.
      if (flyingRef.current) {
        rafRef.current = requestAnimationFrame(tick)
        return
      }

      // ── Hold orbit: bearing only, center+zoom constant → cheap & smooth ─
      bearingRef.current = wrap360(
        bearingRef.current + (pace.orbitDegPerS * speedScale * dt) / 1000,
      )
      const hold = holdRef.current
      try {
        if (hold) {
          map.jumpTo({
            center: [hold.lng, hold.lat],
            zoom: hold.zoom,
            bearing: bearingRef.current,
            pitch,
            padding: { top: 0, right: hold.band, bottom: 0, left: 0 },
          })
        } else {
          map.jumpTo({ bearing: bearingRef.current, pitch })
        }
      } catch {
        // Defensive: never let a transient bad transform tear down the view.
      }

      rafRef.current = requestAnimationFrame(tick)
    }

    rafRef.current = requestAnimationFrame(tick)
    return () => {
      if (rafRef.current !== undefined) {
        cancelAnimationFrame(rafRef.current)
        rafRef.current = undefined
      }
      if (flightTimerRef.current !== undefined) {
        clearTimeout(flightTimerRef.current)
        flightTimerRef.current = undefined
      }
      flyingRef.current = false
    }
  }, [map, phase])
}
