// src/views/Last48/photoreal/viewerHost.ts
//
// The Cesium viewer / Google tileset / theme-grade lifecycle, shared by the
// two photoreal scenes (Last48Photoreal — Spec A's in-page mode — and the
// immersive route's ImmersiveScene). Lifted verbatim from Last48Photoreal so
// the two cannot drift on widget flags, fog, the quota fallback or the grade.
// Every function here imports Cesium, so this file stays inside the lazy
// photoreal chunk (scripts/check-entry-bundle.mjs).
import * as Cesium from 'cesium'
import { GRADES, GRADE_CLOCK_ISO, GRADE_FRAGMENT_GLSL, gradeForTheme } from './grade'
import type { Quality } from './quality'

;(window as unknown as { CESIUM_BASE_URL: string }).CESIUM_BASE_URL = '/cesium/'

/** Whether Photoreal can be offered at all — read by the picker via the
 *  page, never by importing this chunk (that would defeat the lazy split). */
export const GOOGLE_TILES_KEY: string = import.meta.env.VITE_GOOGLE_TILES_KEY || ''

const CITY = { lng: -122.42, lat: 37.70, height: 7000 }

export interface ViewerOptions {
  /** Spec A: false (the orbit moves every frame). Spec A2: true — Cesium
   *  draws only on camera change, tile arrival, or an explicit requestRender. */
  requestRenderMode: boolean
  /** 4 = Cesium's default; set explicitly so the two scenes state it. */
  msaaSamples: number
}

export function createViewer(host: HTMLDivElement, o: ViewerOptions): Cesium.Viewer {
  const v = new Cesium.Viewer(host, {
    animation: false, timeline: false, geocoder: false, homeButton: false, sceneModePicker: false,
    baseLayerPicker: false, navigationHelpButton: false, infoBox: false, selectionIndicator: false,
    baseLayer: false, requestRenderMode: o.requestRenderMode, msaaSamples: o.msaaSamples,
  })
  // In render-on-demand mode the simulation clock must never force a frame
  // (we never animate the clock; the grade pins it to one instant).
  if (o.requestRenderMode) v.scene.maximumRenderTimeChange = Infinity
  v.scene.globe.show = false
  if (v.scene.skyAtmosphere) v.scene.skyAtmosphere.show = true
  v.scene.fog.enabled = true
  v.scene.fog.density = 0.00025
  v.scene.postProcessStages.fxaa.enabled = true
  // ── The ctrl-drag tilt JUMP (Jesse, 2026-09-20: "my pitch adjusts, then
  // jumps to a much more upright pitch") ───────────────────────────────────
  // Read out of cesium 1.145's ScreenSpaceCameraController. `tilt3D` ends
  // with `if (controller.enableCollisionDetection) adjustHeightForTerrain(…)`
  // and then, if that MOVED the camera, converts the move into a ROTATION
  // about the tilt centre (angleBetween the pre- and post-adjust positions,
  // applied to direction/up/right). So a collision nudge does not just lift
  // the camera — it re-pitches it, in one frame, mid-drag. That is the jump.
  // What triggers the nudge here: adjustHeightForTerrain compares the
  // camera's height against `scene.globeHeight`, and `Scene.getHeight` skips
  // the globe branch when `globe.show` is false — so with the globe hidden
  // the collision floor is sampled off the GOOGLE TILES, i.e. whatever
  // rooftop happens to be under the camera. Tilting down over a tall
  // building drops the camera under that roof, the floor fires, and the
  // pitch snaps upright. Turning collision detection off removes the call
  // from both `tilt3D` and the controller's per-frame `update`.
  // minimumZoomDistance then no longer hard-clamps (handleZoom's clamp block
  // is gated on the same flag), but it still damps the zoom rate as the
  // camera nears the surface, which is the soft floor we want here.
  v.scene.screenSpaceCameraController.enableCollisionDetection = false
  v.scene.screenSpaceCameraController.minimumZoomDistance = 60
  v.clock.shouldAnimate = false
  v.camera.setView({
    destination: Cesium.Cartesian3.fromDegrees(CITY.lng, CITY.lat, CITY.height),
    orientation: { heading: 0, pitch: Cesium.Math.toRadians(-40), roll: 0 },
  })
  return v
}

export interface TilesetHandlers {
  /** A quota/auth refusal (403/429 on a tile, or the root request failing). */
  onRest: () => void
  onTileLoad: () => void
}

/** Create the Google tileset and add it to the scene. Resolves null when
 *  `isCancelled()` turned true while the root request was in flight (the
 *  tileset is destroyed) or on failure (after onRest). */
export async function loadGoogleTileset(
  v: Cesium.Viewer,
  isCancelled: () => boolean,
  h: TilesetHandlers,
): Promise<Cesium.Cesium3DTileset | null> {
  try {
    const ts = await Cesium.createGooglePhotorealistic3DTileset(
      { key: GOOGLE_TILES_KEY },
      { maximumScreenSpaceError: 40, preloadFlightDestinations: true, skipLevelOfDetail: true },
    )
    if (isCancelled() || v.isDestroyed()) { ts.destroy(); return null }
    // Quota/auth refusals surface here per tile; one is enough to rest.
    // tileFailed's payload is { url, message }; a quota/auth refusal carries
    // the HTTP status in the message text.
    ts.tileFailed.addEventListener((e: { url?: string; message?: string }) => {
      if (/\b(403|429)\b/.test(e?.message ?? '')) h.onRest()
    })
    ts.tileLoad.addEventListener(() => h.onTileLoad())
    v.scene.primitives.add(ts)
    return ts
  } catch (err) {
    console.error('[photoreal] tileset failed', err)
    if (!isCancelled()) h.onRest()
    return null
  }
}

/** Theme grade + sun: light = day, dark = dusk (Google tiles are daylight
 *  photos; night is a shader grade). `todOverride` is the hidden ?tod= knob. */
export function applyGrade(viewer: Cesium.Viewer, tileset: Cesium.Cesium3DTileset, isDark: boolean, todOverride: string | null): void {
  if (viewer.isDestroyed() || tileset.isDestroyed()) return
  const grade = gradeForTheme(isDark, todOverride)
  const g = GRADES[grade]
  tileset.customShader = new Cesium.CustomShader({
    uniforms: {
      u_tint: { type: Cesium.UniformType.VEC3, value: new Cesium.Cartesian3(...g.tint) },
      u_mul: { type: Cesium.UniformType.FLOAT, value: g.mul },
      u_win: { type: Cesium.UniformType.FLOAT, value: g.win },
    },
    fragmentShaderText: GRADE_FRAGMENT_GLSL,
  })
  viewer.clock.currentTime = Cesium.JulianDate.fromIso8601(GRADE_CLOCK_ISO[grade])
  viewer.scene.requestRender()
}

/** Push the live quality knobs onto the viewer and (once it exists) the
 *  tileset. Called at mount, when the tileset lands, and from the ?tune=1
 *  sliders. Rest tile detail is applied by the directors at each phase
 *  change (they read quality.sseOrbit), not here. */
export function applyQuality(v: Cesium.Viewer, ts: Cesium.Cesium3DTileset | null, q: Quality): void {
  if (v.isDestroyed()) return
  v.targetFrameRate = q.fpsCap
  v.resolutionScale = q.resolution
  if (ts && !ts.isDestroyed()) {
    ts.foveatedScreenSpaceError = q.foveation > 0
    ts.foveatedMinimumScreenSpaceErrorRelaxation = q.foveation
    ts.dynamicScreenSpaceError = q.dynamicSse
  }
  v.scene.requestRender()
}
