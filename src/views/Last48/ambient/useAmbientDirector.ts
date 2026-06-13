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
//   1. TARGET TWEEN — when the published CameraTarget changes, the
//      effective target S-curves (easeInOutCubic) from the previous leg's
//      endpoint to the new one over TARGET_TWEEN_MS. Velocity starts at
//      zero, peaks mid-flight, lands at zero — no hunting tail. (A bare
//      exponential controller starts fast and ends in an asymptotic crawl,
//      which under a rotating bearing reads as the camera "figuring out"
//      the last few pixels — feel-test finding, June 12 2026.)
//   2. SCREEN-SPACE TRACKER — each frame, project the effective target,
//      measure its pixel error from the desired landing point (the
//      visible-map center, left of the detail card's band — see
//      cameraPadding.ts), and close a smoothed fraction of that error.
//      project/unproject fold in bearing/pitch/zoom implicitly, so the dot
//      homes correctly no matter how the orbit has the map rotated. The
//      band is part of the tween, so visit↔breath transitions slide the
//      landing point rather than jumping it.
//
// Pitch: ambient pitch = max(pitch at arm time, AMBIENT_PITCH_MIN). The
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
const ORBIT_DEG_PER_S = 1.2      // full rotation ≈ 5 min
const AMBIENT_PITCH_MIN = 50     // floor only — never reduces the live pitch
const RAMP_IN_MS = 2000
const RAMP_OUT_MS = 1000
const TARGET_TWEEN_MS = 2600     // S-curve leg duration between targets
const TRACK_TAU_MS = 300         // tracker smoothing (tight — the tween carries the shape)
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
  /** Pitch at ramp-in entry — the lerp origin toward the ambient pitch. */
  const pitchFromRef = useRef(0)
  /** Ambient cruising pitch: max(armed pitch, AMBIENT_PITCH_MIN). */
  const ambientPitchRef = useRef(AMBIENT_PITCH_MIN)
  /** Last applied orbit speed scale — scales the ramp-out bearing carry. */
  const speedScaleRef = useRef(0)
  /** dt-accumulated phase clock — immune to tab-hidden wall-clock gaps. */
  const phaseElapsedRef = useRef(0)
  const rampInFiredRef = useRef(false)
  const prevPhaseRef = useRef<AmbientPhase>('off')
  const rafRef = useRef<number | undefined>(undefined)
  const lastTsRef = useRef(0)

  // Tween bookkeeping: the leg eases from `tweenFrom` to the published
  // target; `effective` is where the tween currently is (and becomes the
  // next leg's origin when the target changes).
  const tweenFromRef = useRef<EffectiveTarget | null>(null)
  const tweenElapsedRef = useRef(0)
  const lastTargetRef = useRef<CameraTarget | null>(null)
  const effectiveRef = useRef<EffectiveTarget | null>(null)

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
      ambientPitchRef.current = Math.max(map.getPitch(), AMBIENT_PITCH_MIN)
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

      let speedScale = 1
      let pitch = ambientPitchRef.current

      if (phase === 'ramp-in') {
        const p = clamp01(phaseElapsedRef.current / RAMP_IN_MS)
        speedScale = p
        pitch =
          pitchFromRef.current +
          (ambientPitchRef.current - pitchFromRef.current) * easeOutCubic(p)
        if (p >= 1 && !rampInFiredRef.current) {
          rampInFiredRef.current = true
          onRampInDoneRef.current()
        }
      }
      speedScaleRef.current = speedScale

      bearingRef.current =
        (bearingRef.current + (ORBIT_DEG_PER_S * speedScale * dt) / 1000) % 360

      // ── Target tween: start a new S-curve leg when the target changes ──
      const target = targetRef.current
      const targetFinite = Number.isFinite(target.lng) && Number.isFinite(target.lat)
      if (lastTargetRef.current !== target && targetFinite) {
        lastTargetRef.current = target
        tweenFromRef.current = effectiveRef.current ?? {
          lng: map.getCenter().lng,
          lat: map.getCenter().lat,
          zoom: map.getZoom(),
          band: 0,
        }
        tweenElapsedRef.current = 0
      }
      tweenElapsedRef.current += dt

      const from = tweenFromRef.current
      let eff = effectiveRef.current
      if (from && targetFinite) {
        const bandTarget = target.avoidCard ? obstructedRightBand(map) : 0
        const s = easeInOutCubic(clamp01(tweenElapsedRef.current / TARGET_TWEEN_MS))
        eff = {
          lng: from.lng + (target.lng - from.lng) * s,
          lat: from.lat + (target.lat - from.lat) * s,
          zoom: from.zoom + (target.zoom - from.zoom) * s,
          band: from.band + (bandTarget - from.band) * s,
        }
        effectiveRef.current = eff
      }
      // A malformed target never advances the tween — `eff` stays at the
      // last good position and the orbit continues over it.

      if (eff) {
        const k = 1 - Math.exp(-dt / TRACK_TAU_MS)
        zoomRef.current += (eff.zoom - zoomRef.current) * k

        const container = map.getContainer()
        const desiredX = (container.clientWidth - eff.band) / 2
        const desiredY = container.clientHeight / 2
        const projected = map.project([eff.lng, eff.lat])
        const centerPx = map.project(map.getCenter())
        const nextCenter = map.unproject([
          centerPx.x + (projected.x - desiredX) * k,
          centerPx.y + (projected.y - desiredY) * k,
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
