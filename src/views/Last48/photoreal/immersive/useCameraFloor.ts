// src/views/Last48/photoreal/immersive/useCameraFloor.ts
//
// The reader's camera floor. `viewerHost.ts` turns Cesium's own collision
// detection OFF on purpose (read the long comment there): with the globe
// hidden, `adjustHeightForTerrain` samples the GOOGLE TILES, and when a
// ctrl-drag tilt dropped the camera under a roof the controller converted the
// resulting nudge into a ROTATION — the "my pitch adjusts, then jumps to a
// much more upright pitch" jump Jesse hit on 2026-09-20.
//
// Off, though, the reader can drag straight THROUGH the tiles and end up
// inside a building, under the pavement, looking at the inside of a texture.
// So this hook puts the floor back as the two clamps Cesium's own does not
// separate, and it never touches the camera's ORIENTATION to do the lifting:
//
//   (a) FLOOR — sample the tile surface under the camera and, if the camera
//       is below `surface + FLOOR_M`, move it straight up to that height.
//       POSITION ONLY. Direction and up are left exactly as the reader left
//       them, which is the whole difference from the stock behaviour: the
//       jump was the rotation, not the lift.
//   (b) PITCH — if the camera is looking less than 8° down, put it back to
//       8° down. This is the clamp that keeps the reader from flattening out
//       into the horizon (where the tile budget explodes and the photography
//       is all edge-on) and, together with (a), from swinging under the city.
//
// Both stand down while a DIRECTOR FLIGHT is running. The scripted legs are
// authored poses from cameraPose.ts and are allowed to be whatever they are;
// clamping mid-flight would fight the tween frame by frame. Cesium parks the
// running tween on the undocumented `camera._currentFlight`, which is the
// only handle on "a flight is in progress" — the same cast the director
// already makes for the preload fields.
import { useEffect } from 'react'
import * as Cesium from 'cesium'
import { tileGroundM } from '../groundHeight'

/** Metres of clearance kept above whatever the tiles say is under us. 25 m is
 *  a little over a Victorian's ridge line: low enough that a reader can still
 *  fly a street, high enough to stay out of the geometry. */
const FLOOR_M = 25
/** Looking less than this far DOWN gets pushed back to it. Negative = down. */
const MAX_PITCH = Cesium.Math.toRadians(-8)
/** `tileset.getHeight` is a CPU ray pick; once every 100 ms is plenty for a
 *  floor (a camera cannot cross a building in 100 ms at these ranges) and
 *  keeps it off the per-frame budget. The PITCH clamp is free, so it runs
 *  every frame. */
const SAMPLE_MS = 100

export function useCameraFloor(opts: {
  viewer: Cesium.Viewer | null
  tileset: Cesium.Cesium3DTileset | null
}) {
  const { viewer, tileset } = opts

  useEffect(() => {
    if (!viewer || viewer.isDestroyed() || !tileset) return
    const scene = viewer.scene
    const camera = scene.camera
    /** The last height the tiles reported under the camera, and when. */
    let surface: number | undefined
    let sampledAt = 0
    const carto = new Cesium.Cartographic()

    const onPreRender = () => {
      if (viewer.isDestroyed()) return
      // A scripted leg owns the camera outright.
      if ((camera as unknown as { _currentFlight?: unknown })._currentFlight !== undefined) return
      // Both clamps write world-space values. `camera.position` is expressed
      // in `camera.transform`, which is the identity here (every pose this
      // page sets comes from setView/flyTo with a world destination) — but
      // check rather than assume: a non-identity transform would turn the
      // lift into a teleport.
      if (!Cesium.Matrix4.equals(camera.transform, Cesium.Matrix4.IDENTITY)) return

      let clamped = false

      // (a) The floor.
      const c = Cesium.Cartographic.fromCartesian(camera.positionWC, Cesium.Ellipsoid.WGS84, carto)
      if (c) {
        const now = performance.now()
        if (now - sampledAt > SAMPLE_MS) {
          sampledAt = now
          // Picking is the one path Cesium can throw on; keep the frame alive.
          // Guarded (groundHeight.ts): a nonsense reading must never lift the camera.
          surface = tileGroundM(tileset, c, scene)
        }
        // undefined = no tile loaded under us yet. No reading, no clamp.
        if (surface != null && c.height < surface + FLOOR_M) {
          camera.position = Cesium.Cartesian3.fromRadians(c.longitude, c.latitude, surface + FLOOR_M)
          clamped = true
        }
      }

      // (b) The pitch. `camera.pitch` is negative looking down, so "less than
      // 8° down" is `> MAX_PITCH`. setView with orientation only keeps the
      // position this frame's floor may just have corrected.
      if (camera.pitch > MAX_PITCH) {
        camera.setView({ orientation: { heading: camera.heading, pitch: MAX_PITCH, roll: 0 } })
        clamped = true
      }

      // Render-on-demand: the correction happened inside the frame that is
      // about to be drawn, but ask for one more so the settled pose is what
      // the reader is left looking at. Both clamps are idempotent — the next
      // frame finds the camera already at the floor / at MAX_PITCH and does
      // nothing — so this cannot become a render loop.
      if (clamped) scene.requestRender()
    }

    scene.preRender.addEventListener(onPreRender)
    // Parent-first cleanup: the host may already have destroyed the viewer,
    // and `viewer.scene` is undefined after that. isDestroyed() is the one
    // call that stays safe post-destroy.
    return () => { if (!viewer.isDestroyed()) viewer.scene.preRender.removeEventListener(onPreRender) }
  }, [viewer, tileset])
}
