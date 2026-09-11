// src/views/Last48/photoreal/PhotorealMarkers.ts
//
// Imperative marker layer for the photoreal renderer. Two marker LANGUAGES,
// keyed by the stream's published precision (markerPrecision.ts):
//   intersection (911, Fire/EMS) — a soft ~40 m ground disc + a short wide
//                                  faded beam: "around this corner".
//   address (311)                — a slim 40 m column: "here".
// The hero (current stop / selected) is the same shape at ~1.6×, grown into a
// 90 m COLUMN OF LIGHT with a rising band core, breathing in COLOUR only — a
// CallbackProperty on the material. Never animate a geometry dimension:
// rebuilding geometry per frame halved the spike's frame rate.
// Only events within DRAW_RADIUS_KM of the focus point are instantiated.
//
// ── Everything sits ON THE GOOGLE SURFACE, not on the ellipsoid ───────────
// Cartesian3.fromDegrees(lng, lat, h) puts h above the WGS84 ELLIPSOID, and
// around the Mission the photoreal surface sits ~15–20 m below it (geoid
// ≈ −32 m at SF, street ≈ +15 m orthometric) — which is why the discs read as
// UFOs hovering two storeys over the roofs and the columns started in mid-air.
// Every entity now carries a 3D-tile height reference, so Cesium offsets it by
// the sampled tile height and re-offsets as tiles refine:
//   cylinders  CLAMP_TO_3D_TILE  — the entity position's height is DISCARDED
//              and the model matrix is rebuilt at (surface + length/2), i.e.
//              the base lands exactly on the surface.
//   ellipses   RELATIVE_TO_3D_TILE + a small `height` — a CLAMPED ellipse
//              would be coplanar with the tiles (and with its own halo), so
//              the disc and the halo are lifted a metre and 0.4 m instead.
// The ellipse MUST carry an explicit `height`: with none, Cesium's
// GroundGeometryUpdater takes the drape-onto-terrain path (GroundPrimitive)
// instead of the tile-offset path, and the globe here is hidden.
// Clamping reads through Scene#getHeight → Cesium3DTileset#getHeight, which
// requires the tileset's `enableCollision` — createGooglePhotorealistic3DTileset
// defaults it to true (verified in 1.145), so the host needs no change.
import * as Cesium from 'cesium'
import type { NormalizedEvent } from '@/types/last48'
import { PRECISION } from './markerPrecision'
import { COLORS, ageColor } from '../ageRamp'

export const DRAW_RADIUS_KM = 1.5

/** Height of the hero's column of light, in metres above the tile surface.
 *  PhotorealBubble anchors its card and its stem to the TOP of this column —
 *  imported from here so the two can never drift. */
export const HERO_COLUMN_M = 90

const DISC_M = 20          // radius → ~40 m across
const BEAM_M = 30
const COLUMN_M = 40
const HERO_SCALE = 1.6
const HERO_BOTTOM_R = 6    // the hero column FLARES toward the card — a funnel
const HERO_TOP_R = 10      // that opens upward, never a point (Jesse, 2026-09-10)
const HALO_SCALE = 1.8     // hero ground halo, as a multiple of the disc radius
const DISC_LIFT_M = 1      // metres above the tile surface (anti-coplanar)
const HALO_LIFT_M = 0.4
/** Breathing/pulse period. One number so rim, fill and halo stay in phase. */
const PULSE_MS = 1200
/** Rising pulse: ONE bright band climbs the whole column every 0.75 s,
 *  starting slow and finishing fast (cubic ease-in on the offset). Jesse
 *  asked for fewer, stronger pulses than the original six-band flow. */
const BAND_MS = 750
const BAND_REPEAT = 1
/** Free-look focus probe: ~4 Hz, and only when the camera's ground target has
 *  actually moved. Without it the layer had no focus at all until the tour (or
 *  a deep link) set one — a fresh mount with AUTO off drew zero markers, and
 *  after a tour exited they stayed clustered at the last stop. The same tick
 *  re-samples the hero's ground height (see probeHeroGround). */
const FOCUS_PROBE_MS = 250
const FOCUS_MOVE_KM = 0.3
/** Once the hero's surface height has resolved, re-sample only this often. */
const HERO_REPROBE_MS = 2000
/** How many points the hero's band core is subdivided into. Polyline texture
 *  coordinate s is vertexIndex / (count − 1), so evenly spaced points give
 *  evenly spaced bands; two points alone band with perspective skew. */
const CORE_SEGMENTS = 12

const CLAMP_TILE = Cesium.HeightReference.CLAMP_TO_3D_TILE
const ABOVE_TILE = Cesium.HeightReference.RELATIVE_TO_3D_TILE

/** The four animated paints that make the hero read as ACTIVE. Colour and
 *  material only — never a radius, a length or a width. */
interface HeroPaint {
  /** Disc fill + column body. */
  body: Cesium.MaterialProperty
  /** Disc outline. */
  rim: Cesium.CallbackProperty
  /** The larger ground ring: a fixed-size alpha pulse reads as an outward
   *  swell without any size change. */
  halo: Cesium.MaterialProperty
  /** Rising bands up the column core. */
  bands: Cesium.MaterialProperty
}

function colorFor(e: NormalizedEvent, now: number): Cesium.Color {
  const isPriorityA = e.datasetId === '911-realtime' && e.priority === 'A'
  const hex = isPriorityA ? COLORS[e.datasetId] : ageColor(e.datasetId, now - e.receivedAt)
  return Cesium.Color.fromCssColorString(hex)
}

export class PhotorealMarkers {
  private ents = new Map<string, Cesium.Entity[]>()
  private events: NormalizedEvent[] = []
  private focus: { lng: number; lat: number } | null = null
  private visible = true
  private hero: Cesium.Entity[] = []
  private heroT0 = 0
  /** The hero's band core, and the surface height its positions were built
   *  at. Polylines carry no heightReference, so this one entity is clamped by
   *  hand off the same tileset sampler Cesium's own clamping uses. */
  private heroCore: Cesium.Entity | null = null
  private heroEvent: NormalizedEvent | null = null
  private heroGroundM: number | null = null
  private heroProbeAt = 0
  private tileset: Cesium.Cesium3DTileset | null = null
  onPick?: (id: string) => void
  private handler: Cesium.ScreenSpaceEventHandler
  private viewer: Cesium.Viewer
  private probeAt = 0
  private probe: () => void

  constructor(viewer: Cesium.Viewer) {
    // Explicit field assignment, not a constructor parameter property —
    // this project's tsconfig sets erasableSyntaxOnly, which forbids the
    // shorthand (it emits runtime code beyond a type-only erasure).
    this.viewer = viewer
    this.handler = new Cesium.ScreenSpaceEventHandler(viewer.scene.canvas)
    this.handler.setInputAction((m: { position: Cesium.Cartesian2 }) => {
      // Scene.pick() is typed `any` in Cesium's d.ts, so this optional chain
      // compiles as-is — no cast needed to reach into `.id.properties`.
      const picked = viewer.scene.pick(m.position)
      const id = picked?.id?.properties?.eventId?.getValue?.()
      if (typeof id === 'string') this.onPick?.(id)
    }, Cesium.ScreenSpaceEventType.LEFT_CLICK)

    this.probe = () => {
      const now = performance.now()
      if (now - this.probeAt < FOCUS_PROBE_MS) return
      this.probeAt = now
      if (this.viewer.isDestroyed()) return
      this.probeHeroGround()
      this.probeFocus()
    }
    viewer.scene.postRender.addEventListener(this.probe)
  }

  /** In FREE LOOK the draw radius is measured from wherever the camera is
   *  looking (spec §4). The conductor's explicit setFocus() still wins the
   *  instant it fires at each stop — this only takes over once the ground
   *  target has drifted FOCUS_MOVE_KM away from it. */
  private probeFocus() {
    const scene = this.viewer.scene
    const canvas = scene.canvas
    if (!canvas.clientWidth || !canvas.clientHeight) return
    const center = new Cesium.Cartesian2(canvas.clientWidth / 2, canvas.clientHeight / 2)
    // The globe is hidden but its ellipsoid still picks; pickPosition (which
    // reads the depth buffer, i.e. the tiles themselves) is the fallback and
    // throws on hardware with no depth texture.
    let hit = this.viewer.camera.pickEllipsoid(center, scene.globe.ellipsoid)
    if (!hit) { try { hit = scene.pickPosition(center) } catch { return } }
    if (!hit) return
    const c = Cesium.Cartographic.fromCartesian(hit)
    if (!c) return
    const lng = Cesium.Math.toDegrees(c.longitude)
    const lat = Cesium.Math.toDegrees(c.latitude)
    if (this.focus) {
      const dx = (lng - this.focus.lng) * 88, dy = (lat - this.focus.lat) * 111
      if (Math.hypot(dx, dy) < FOCUS_MOVE_KM) return
    }
    this.setFocus(lng, lat)
  }

  /** Re-seat the hero's band core on the tile surface. Returns undefined until
   *  a tile covering the point has loaded, and keeps refining as better tiles
   *  arrive — exactly like the height reference on the other hero entities,
   *  because it is the same sampler underneath. */
  private probeHeroGround() {
    const e = this.heroEvent
    if (!e || !this.tileset || !this.heroCore?.polyline) return
    // Eager until it resolves, then slow: getHeight is a CPU ray pick against
    // the loaded tiles, not a lookup.
    const now = performance.now()
    if (now - this.heroProbeAt < (this.heroGroundM == null ? FOCUS_PROBE_MS : HERO_REPROBE_MS)) return
    this.heroProbeAt = now
    const carto = Cesium.Cartographic.fromDegrees(e.longitude!, e.latitude!)
    let h: number | undefined
    try { h = this.tileset.getHeight(carto, this.viewer.scene) } catch { return }
    if (h == null) return
    if (this.heroGroundM != null && Math.abs(h - this.heroGroundM) < 0.5) return
    this.heroGroundM = h
    this.heroCore.polyline.positions = new Cesium.ConstantProperty(this.corePositions(e))
  }

  private corePositions(e: NormalizedEvent): Cesium.Cartesian3[] {
    const base = this.heroGroundM ?? 0
    const out: Cesium.Cartesian3[] = []
    for (let i = 0; i <= CORE_SEGMENTS; i++) {
      out.push(Cesium.Cartesian3.fromDegrees(e.longitude!, e.latitude!, base + (HERO_COLUMN_M * i) / CORE_SEGMENTS))
    }
    return out
  }

  setEvents(events: NormalizedEvent[]) { this.events = events; this.sync() }
  setVisible(on: boolean) { this.visible = on; this.sync() }
  setFocus(lng: number, lat: number) { this.focus = { lng, lat }; this.sync() }
  /** The tileset arrives a beat after the viewer; the hero core clamps itself
   *  as soon as it does. */
  setTileset(ts: Cesium.Cesium3DTileset | null) { this.tileset = ts; this.heroGroundM = null; this.heroProbeAt = 0 }

  private near(e: NormalizedEvent): boolean {
    if (!this.focus) return false
    const dx = (e.longitude! - this.focus.lng) * 88, dy = (e.latitude! - this.focus.lat) * 111
    return Math.hypot(dx, dy) < DRAW_RADIUS_KM
  }

  private sync() {
    const now = Date.now()
    const want = new Set<string>()
    if (this.visible) for (const e of this.events) if (this.near(e)) want.add(e.id)
    for (const [id, ents] of this.ents) if (!want.has(id)) { ents.forEach((x) => this.viewer.entities.remove(x)); this.ents.delete(id) }
    for (const e of this.events) {
      if (!want.has(e.id) || this.ents.has(e.id)) continue
      this.ents.set(e.id, this.build(e, colorFor(e, now), 1))
    }
  }

  private build(e: NormalizedEvent, col: Cesium.Color, scale: number, hero?: HeroPaint): Cesium.Entity[] {
    const props = new Cesium.PropertyBag({ eventId: e.id })
    const lng = e.longitude!, lat = e.latitude!
    // Height 0 everywhere: the tile height reference supplies the real one.
    const ground = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
    const out: Cesium.Entity[] = []
    const isIntersection = PRECISION[e.datasetId] === 'intersection'

    // The halo goes down first and lowest — a wide, soft ground ring that
    // pulses in phase with the rim.
    if (hero) {
      const r = DISC_M * scale * HALO_SCALE
      out.push(this.viewer.entities.add({
        properties: props,
        position: ground,
        ellipse: {
          semiMajorAxis: r, semiMinorAxis: r,
          height: HALO_LIFT_M, heightReference: ABOVE_TILE,
          material: hero.halo, outline: false,
        },
      }))
    }

    if (isIntersection) {
      out.push(this.viewer.entities.add({
        properties: props,
        position: ground,
        ellipse: {
          semiMajorAxis: DISC_M * scale, semiMinorAxis: DISC_M * scale,
          height: DISC_LIFT_M, heightReference: ABOVE_TILE,
          material: hero?.body ?? col.withAlpha(0.18),
          outline: true, outlineColor: hero?.rim ?? col.withAlpha(0.8),
        },
      }))
    }

    // Non-hero: the short wide faded beam / the slim column, unchanged.
    // Hero: both become the same 90 m column of light.
    const length = hero ? HERO_COLUMN_M : isIntersection ? BEAM_M * scale : COLUMN_M * scale
    out.push(this.viewer.entities.add({
      properties: props,
      position: ground,
      cylinder: {
        length,
        bottomRadius: hero ? HERO_BOTTOM_R : isIntersection ? 5 * scale : 2.2 * scale,
        topRadius: hero ? HERO_TOP_R : isIntersection ? 0.6 : 2.2 * scale,
        heightReference: CLAMP_TILE,
        material: hero?.body ?? col.withAlpha(isIntersection ? 0.25 : 0.55),
      },
    }))

    if (hero) {
      const core = this.viewer.entities.add({
        properties: props,
        polyline: {
          positions: this.corePositions(e),
          width: 10,
          // NONE: the points share one lng/lat and differ only in height, so
          // geodesic subdivision would be degenerate.
          arcType: Cesium.ArcType.NONE,
          material: hero.bands,
        },
      })
      this.heroCore = core
      out.push(core)
    }
    return out
  }

  /** The current stop / selected event: a 90 m column of light with rising
   *  bands, a breathing rim and a pulsing ground halo. */
  setHero(e: NormalizedEvent | null) {
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.hero = []
    this.heroCore = null
    this.heroEvent = null
    this.heroGroundM = null
    this.heroProbeAt = 0
    if (!e || e.longitude == null || e.latitude == null) return
    const col = Cesium.Color.fromCssColorString(COLORS[e.datasetId])
    this.heroT0 = performance.now()
    const phase = () => Math.sin(((performance.now() - this.heroT0) / PULSE_MS) * 2 * Math.PI)
    const paint: HeroPaint = {
      body: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => col.withAlpha(0.35 + 0.25 * phase()), false),
      ),
      // Bold: 0.25 → 0.95 over 1.2 s. outlineWidth is NOT animated (geometry).
      rim: new Cesium.CallbackProperty(() => col.withAlpha(0.6 + 0.35 * phase()), false),
      halo: new Cesium.ColorMaterialProperty(
        new Cesium.CallbackProperty(() => col.withAlpha(0.11 + 0.11 * phase()), false),
      ),
      bands: new Cesium.StripeMaterialProperty({
        // VERTICAL, not HORIZONTAL: the stripe shader reads st.s under
        // VERTICAL, and a polyline's s runs ALONG the line (vertexIndex /
        // (count − 1)), so the bands sit ACROSS the column. HORIZONTAL would
        // read st.t, which on a polyline runs across the ribbon's WIDTH.
        orientation: Cesium.StripeOrientation.VERTICAL,
        evenColor: col.brighten(0.35, new Cesium.Color()).withAlpha(0.8),
        oddColor: col.withAlpha(0.1),
        repeat: BAND_REPEAT,
        // A band sits where (s − offset) is fixed, so s = offset + k: offset
        // must RISE for the bands to rise.
        // Cubic ease-in: the pulse leaves the ground slowly and arrives at
        // the card fast (Jesse: "start slow, then fast finish").
        offset: new Cesium.CallbackProperty(() => {
          const t = ((performance.now() - this.heroT0) / BAND_MS) % 1
          return t * t * t
        }, false),
      }),
    }
    this.heroEvent = e
    this.hero = this.build(e, col, HERO_SCALE, paint)
    this.probeHeroGround()
  }

  destroy() {
    // React runs passive-effect cleanups PARENT-first on a deleted subtree, so
    // this can be reached after the host effect already called viewer.destroy()
    // (Cesium nulls scene/entities there and every touch throws). isDestroyed()
    // is explicitly safe to call on a destroyed object — it is the only method
    // that is. Belt two lives in Last48Photoreal's cleanup (queueMicrotask).
    if (this.viewer.isDestroyed()) {
      this.ents.clear(); this.hero = []
      this.heroCore = null; this.heroEvent = null; this.tileset = null
      return
    }
    this.viewer.scene.postRender.removeEventListener(this.probe)
    this.handler.destroy()
    for (const ents of this.ents.values()) ents.forEach((x) => this.viewer.entities.remove(x))
    // `hero` holds the halo and the band core as well as the disc and column.
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.ents.clear()
    this.hero = []
    this.heroCore = null
    this.heroEvent = null
    this.tileset = null
  }
}
