// src/views/Last48/photoreal/useCesiumDirector.ts
//
// Cesium twin of ambient/useAmbientDirector.ts. Same phase machine, same
// hybrid camera model: a LEG is one native camera.flyTo to the exact pose
// the orbit starts from; a HOLD is a per-frame setView along orbitPose()
// with the heading advancing at pace.orbitDegPerS. Both come from the same
// pure function (cameraPose.ts), so the hand-off is seamless by
// construction. Tile detail is coarse in flight and fine in orbit. The
// settle GATE (tilesLoaded, 12s cap) lives in PhotorealBubble — the
// director used to poll it too, but that poll was dead (nothing read it)
// and was the one timer this hook didn't clear in its effect return.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { AmbientPhase } from '../ambient/useAmbientDirector'
import type { PaceValues } from '../ambient/pace'
import { orbitPose, ORBIT_RANGE_M, ORBIT_PITCH_DEG } from './cameraPose'

export type PhotorealTarget = { lng: number; lat: number } | null

export const SSE_FLIGHT = 40
export const SSE_ORBIT = 10
export const SETTLE_CAP_MS = 12_000
const TARGET_HEIGHT_M = 30
const CITY_VIEW = { lng: -122.42, lat: 37.70, height: 7000 }

const toC3 = (v: [number, number, number]) => new Cesium.Cartesian3(v[0], v[1], v[2])

export function useCesiumDirector(opts: {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset
  phase: AmbientPhase
  target: PhotorealTarget
  pace: PaceValues
  onRampInDone: () => void
  onRampOutDone: () => void
}) {
  const { viewer, tileset, phase, target } = opts
  const headingRef = useRef(35)
  const cbRef = useRef(opts)
  // eslint-disable-next-line react-hooks/refs
  cbRef.current = opts

  // Ramp-in: nothing to animate — the first leg IS the ramp. Ramp-out: hand
  // the camera back where it is (the default controller resumes) after a beat.
  useEffect(() => {
    if (phase === 'ramp-in') cbRef.current.onRampInDone()
    if (phase === 'ramp-out') {
      viewer.camera.cancelFlight()
      tileset.maximumScreenSpaceError = SSE_ORBIT
      const t = setTimeout(() => cbRef.current.onRampOutDone(), 300)
      return () => clearTimeout(t)
    }
  }, [phase, viewer, tileset])

  // Leg + hold per target.
  useEffect(() => {
    if (phase !== 'on') return
    let disposed = false
    let holdTick: (() => void) | null = null

    // Every Cesium touch in a CLEANUP goes through this gate. React runs
    // passive-effect cleanups PARENT-first on a deleted subtree, so the host's
    // viewer.destroy() has already run by the time this hook's cleanups fire on
    // a photoreal → classic switch; after destroy, viewer.scene and
    // viewer.camera are undefined and every access throws. isDestroyed() is
    // the only method Cesium keeps callable on a destroyed object.
    const alive = () => !viewer.isDestroyed()
    const stopHold = () => {
      if (holdTick) {
        if (alive()) viewer.scene.preRender.removeEventListener(holdTick)
        holdTick = null
      }
    }

    if (!target) {
      // Breath: pull back to the city.
      tileset.maximumScreenSpaceError = SSE_FLIGHT
      viewer.camera.flyTo({
        destination: Cesium.Cartesian3.fromDegrees(CITY_VIEW.lng, CITY_VIEW.lat, CITY_VIEW.height),
        orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
        duration: cbRef.current.pace.tweenMs / 1000,
      })
      return () => { if (alive()) viewer.camera.cancelFlight() }
    }

    const center = { lng: target.lng, lat: target.lat, height: TARGET_HEIGHT_M }
    const pitch = Math.min(ORBIT_PITCH_DEG, -cbRef.current.pace.pitchMin)
    const start = orbitPose(center, headingRef.current, pitch, ORBIT_RANGE_M)
    tileset.maximumScreenSpaceError = SSE_FLIGHT
    viewer.camera.flyTo({
      destination: toC3(start.position),
      orientation: { direction: toC3(start.direction), up: toC3(start.up) },
      duration: cbRef.current.pace.tweenMs / 1000,
      easingFunction: Cesium.EasingFunction.QUADRATIC_IN_OUT,
      complete: () => {
        if (disposed || !alive()) return
        tileset.maximumScreenSpaceError = SSE_ORBIT
        // Hold: advance heading every frame from the SAME pose function.
        let last = performance.now()
        holdTick = () => {
          const now = performance.now()
          const dt = Math.min(64, now - last) / 1000
          last = now
          headingRef.current = (headingRef.current + cbRef.current.pace.orbitDegPerS * dt) % 360
          const p = orbitPose(center, headingRef.current, pitch, ORBIT_RANGE_M)
          viewer.camera.setView({ destination: toC3(p.position), orientation: { direction: toC3(p.direction), up: toC3(p.up) } })
        }
        viewer.scene.preRender.addEventListener(holdTick)
      },
    })
    return () => { disposed = true; if (alive()) viewer.camera.cancelFlight(); stopHold() }
  }, [phase, target, viewer, tileset])
}
