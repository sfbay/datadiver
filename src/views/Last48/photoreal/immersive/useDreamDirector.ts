// src/views/Last48/photoreal/immersive/useDreamDirector.ts
//
// The immersive camera (Spec A2 §3). Unlike useCesiumDirector there is no
// per-frame orbit. A stop is:
//   1. ONE flight (pace.tweenMs, eased) to the arrival pose;
//   2. the settle gate (tiles loaded, or SETTLE_CAP_MS) → onArrived;
//   3. ONE slow LINEAR flight across the whole dwell — a few degrees of
//      heading. To the eye it is a barely-moving camera; to Cesium it is a
//      flight, and a flight is the ONLY time the tileset runs its
//      PRELOAD_FLIGHT pass (Camera.canPreloadFlight, 1.145). That pass reads
//      scene.preloadFlightCamera + scene.preloadFlightCullingVolume, which
//      flyTo sets to ITS destination. Right after the drift starts, this hook
//      overwrites both with the NEXT stop's pose, so the next stop's tiles
//      stream during this dwell. Neither field is in Cesium's d.ts — hence
//      the one cast below. If a Cesium upgrade removes them, the cast finds
//      `undefined` and the preload silently does nothing (the fallback the
//      spec names — a second hidden Viewer — is a separate, disclosed change).
// Every pose comes from the pure cameraPose.ts, as before.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { PaceValues } from '../../ambient/pace'
import { orbitPose, RANGE_M, ORBIT_PITCH_DEG } from '../cameraPose'
import { quality } from '../quality'
import { SSE_FLIGHT, SETTLE_CAP_MS, type PhotorealTarget } from '../useCesiumDirector'

const TARGET_HEIGHT_M = 30
const toC3 = (v: [number, number, number]) => new Cesium.Cartesian3(v[0], v[1], v[2])
type Center = { lng: number; lat: number; height: number }

/** The two undocumented scene fields the preload pass reads. */
interface PreloadScene {
  preloadFlightCamera?: Cesium.Camera
  preloadFlightCullingVolume?: Cesium.CullingVolume
}

/** A running drift: enough to stop it mid-way and resume from that heading. */
interface Drift { from: number; to: number; t0: number; ms: number; center: Center }

export function useDreamDirector(opts: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  /** The active stop. null = nothing selected; the camera stays where it is. */
  target: PhotorealTarget
  /** The stop after it — its tiles are preloaded during this dwell. */
  next: PhotorealTarget
  pace: PaceValues
  /** `H` hold: freeze the drift; release resumes it from where it stopped. */
  hold: boolean
  /** prefers-reduced-motion: instant legs, no drift. */
  reducedMotion: boolean
  /** Flight done + tiles settled (or the cap). The page starts the dwell on it. */
  onArrived: () => void
  /** Camera distance from the stop, metres. Default RANGE_M.immersive; the
   *  page passes ?range= as a dev knob (Jesse 2026-09-20: closer). */
  rangeM?: number
}): { cancel: () => void } {
  const { viewer, tileset, target, hold } = opts
  const headingRef = useRef(35)
  const cbRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = opts
  const driftRef = useRef<Drift | null>(null)
  const arrivedRef = useRef(false)
  const centerRef = useRef<Center | null>(null)
  /** Set by cancel() (user camera input). cancelFlight() fires a running
   *  flight's `cancel` callback, not `complete` — the one path where
   *  `complete` fires synchronously (in the same tick cancel() could run)
   *  is a duration<=0 flight, i.e. the reducedMotion arrival leg. Without
   *  this flag that synchronous completion would start the settle gate and
   *  then the drift on top of the reader's own camera. Cleared when a new
   *  target starts a new leg. */
  const cancelledRef = useRef(false)

  // Stable helpers in a ref so the effects below never re-run for them.
  const api = useRef({
    alive: () => !viewer.isDestroyed(),
    pitch: () => Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin),
    /** `headingDeg` is where the camera will actually BE for this dwell —
     *  callers must pass the drift's end heading, not its start. */
    preloadNext(headingDeg: number) {
      const nxt = cbRef.current.next
      if (!nxt || viewer.isDestroyed()) return
      const s = viewer.scene as unknown as PreloadScene
      const cam = s.preloadFlightCamera
      if (!cam) return
      const p = orbitPose({ lng: nxt.lng, lat: nxt.lat, height: TARGET_HEIGHT_M }, headingDeg, this.pitch(), (cbRef.current.rangeM ?? RANGE_M.immersive))
      cam.setView({ destination: toC3(p.position), orientation: { direction: toC3(p.direction), up: toC3(p.up) } })
      // Camera.frustum is a union in the d.ts; every member has computeCullingVolume.
      s.preloadFlightCullingVolume = (cam.frustum as Cesium.PerspectiveFrustum)
        .computeCullingVolume(cam.positionWC, cam.directionWC, cam.upWC)
    },
    startDrift(center: Center) {
      if (viewer.isDestroyed()) return
      const { pace, reducedMotion } = cbRef.current
      if (reducedMotion) return
      const from = headingRef.current
      const to = from + pace.orbitDegPerS * (pace.dwellMs / 1000)
      const end = orbitPose(center, to, this.pitch(), (cbRef.current.rangeM ?? RANGE_M.immersive))
      const me: Drift = { from, to, t0: performance.now(), ms: pace.dwellMs, center }
      driftRef.current = me
      viewer.camera.flyTo({
        destination: toC3(end.position),
        orientation: { direction: toC3(end.direction), up: toC3(end.up) },
        duration: pace.dwellMs / 1000,
        easingFunction: Cesium.EasingFunction.LINEAR_NONE,
        // cancelFlight() (stopDrift/cancel) fires this flight's `cancel`
        // callback, not `complete` — `complete` only fires on a genuine
        // full-duration finish. Guard by identity anyway: a stale `me`
        // (a callback from a drift already superseded by a newer leg) must
        // not commit a heading or null out the current drift.
        complete: () => { if (driftRef.current === me) { headingRef.current = to % 360; driftRef.current = null } },
        cancel: () => { if (driftRef.current === me) driftRef.current = null },
      })
      // flyTo just pointed the preload camera at the drift's own end —
      // overwrite it with the NEXT stop for the whole dwell. Use the
      // heading the camera will actually reach (`to`), not the one it's
      // leaving (`from`/headingRef.current).
      this.preloadNext(to)
    },
    /** Stop the drift where it is and record the heading reached. */
    stopDrift() {
      const d = driftRef.current
      if (!d) return
      const f = Math.min(1, (performance.now() - d.t0) / d.ms)
      headingRef.current = (d.from + (d.to - d.from) * f) % 360
      driftRef.current = null
      if (!viewer.isDestroyed()) viewer.camera.cancelFlight()
    },
  })

  // One leg per target.
  useEffect(() => {
    const a = api.current
    if (!target) {
      // Nothing selected: don't leave a stale center/drift/arrival state
      // that a later hold-release could resume around.
      a.stopDrift()
      arrivedRef.current = false
      centerRef.current = null
      return
    }
    let disposed = false
    let settle: ReturnType<typeof setInterval> | undefined
    arrivedRef.current = false
    cancelledRef.current = false
    a.stopDrift()
    const center: Center = { lng: target.lng, lat: target.lat, height: TARGET_HEIGHT_M }
    centerRef.current = center
    const arrival = orbitPose(center, headingRef.current, a.pitch(), (cbRef.current.rangeM ?? RANGE_M.immersive))
    const { pace, reducedMotion } = cbRef.current
    tileset.maximumScreenSpaceError = SSE_FLIGHT
    viewer.camera.flyTo({
      destination: toC3(arrival.position),
      orientation: { direction: toC3(arrival.direction), up: toC3(arrival.up) },
      duration: reducedMotion ? 0 : pace.tweenMs / 1000,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        if (disposed || cancelledRef.current || !a.alive()) return
        tileset.maximumScreenSpaceError = quality.sseOrbit
        const t0 = Date.now()
        settle = setInterval(() => {
          if (disposed || cancelledRef.current || !a.alive()) { clearInterval(settle); return }
          if (tileset.tilesLoaded || Date.now() - t0 > SETTLE_CAP_MS) {
            clearInterval(settle)
            if (cancelledRef.current) return
            arrivedRef.current = true
            cbRef.current.onArrived()
            if (!cbRef.current.hold) a.startDrift(center)
          }
        }, 150)
      },
    })
    return () => {
      disposed = true
      if (settle) clearInterval(settle)
      a.stopDrift()
      if (a.alive()) viewer.camera.cancelFlight()
    }
  }, [target, viewer, tileset])

  // Hold / release. Release resumes the drift only once the stop has arrived
  // (a hold pressed mid-flight lets the flight finish; the settle gate then
  // sees `hold` and does not start the drift).
  useEffect(() => {
    const a = api.current
    if (hold) { a.stopDrift(); return }
    const c = centerRef.current
    if (arrivedRef.current && c && !driftRef.current && !cancelledRef.current) a.startDrift(c)
  }, [hold])

  return {
    cancel: () => {
      const a = api.current
      cancelledRef.current = true
      a.stopDrift()
      if (a.alive()) { viewer.camera.cancelFlight(); tileset.maximumScreenSpaceError = quality.sseOrbit }
    },
  }
}
