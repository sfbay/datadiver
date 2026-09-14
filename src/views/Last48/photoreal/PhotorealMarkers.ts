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
const PULSE_MS = 1800   // Jesse (2026-09-10): "slow the pulsing just a bit"
/** Free-look focus probe: ~4 Hz, and only when the camera's ground target has
 *  actually moved. Without it the layer had no focus at all until the tour (or
 *  a deep link) set one — a fresh mount with AUTO off drew zero markers, and
 *  after a tour exited they stayed clustered at the last stop. */
const FOCUS_PROBE_MS = 250
const FOCUS_MOVE_KM = 0.3

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
  private heroEvent: NormalizedEvent | null = null
  /** Spec A2 §4: the next stops as plain dim discs (no tube, no ring). */
  private queue: Cesium.Entity[] = []
  private queueIds = new Set<string>()
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

  setEvents(events: NormalizedEvent[]) { this.events = events; this.sync() }
  setVisible(on: boolean) { this.visible = on; this.sync() }
  setFocus(lng: number, lat: number) { this.focus = { lng, lat }; this.sync() }

  private near(e: NormalizedEvent): boolean {
    if (!this.focus) return false
    const dx = (e.longitude! - this.focus.lng) * 88, dy = (e.latitude! - this.focus.lat) * 111
    return Math.hypot(dx, dy) < DRAW_RADIUS_KM
  }

  private sync() {
    const now = Date.now()
    const want = new Set<string>()
    // The hero's ORDINARY marker is not drawn while it is the hero — its short
    // cone showed through the column's base (Jesse, 2026-09-10).
    if (this.visible) for (const e of this.events) if (this.near(e) && e.id !== this.heroEvent?.id && !this.queueIds.has(e.id)) want.add(e.id)
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

    return out
  }

  /** The current stop / selected event: a wide ground disc, a pulsing outer
   *  ring, and a 90 m flared column of light that breathes — all colour-only. */
  setHero(e: NormalizedEvent | null) {
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.hero = []
    this.heroEvent = null
    if (!e || e.longitude == null || e.latitude == null) { this.sync(); return }
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
    }
    this.heroEvent = e
    this.hero = this.build(e, col, HERO_SCALE, paint)
    this.sync() // drops the ordinary marker underneath
  }

  /** The next stops as plain dim discs in their stream pigment — the same
   *  ground disc idiom as the hero, no tube, no ring, 0.35 alpha. Clamped
   *  like everything else; click = jump (the pick handler reads eventId).
   *  Precision-honesty holds: an intersection stream gets the ~40 m disc,
   *  an address stream a 10 m one. */
  setQueue(events: NormalizedEvent[]) {
    this.queue.forEach((x) => this.viewer.entities.remove(x))
    this.queue = []
    this.queueIds = new Set()
    for (const e of events) {
      if (e.longitude == null || e.latitude == null) continue
      const col = Cesium.Color.fromCssColorString(COLORS[e.datasetId])
      const r = PRECISION[e.datasetId] === 'intersection' ? DISC_M : DISC_M * 0.5
      this.queue.push(this.viewer.entities.add({
        properties: new Cesium.PropertyBag({ eventId: e.id }),
        position: Cesium.Cartesian3.fromDegrees(e.longitude, e.latitude, 0),
        ellipse: {
          semiMajorAxis: r, semiMinorAxis: r,
          height: DISC_LIFT_M, heightReference: ABOVE_TILE,
          material: col.withAlpha(0.35),
          outline: true, outlineColor: col.withAlpha(0.5),
        },
      }))
      this.queueIds.add(e.id)
    }
    this.sync()
  }

  destroy() {
    // React runs passive-effect cleanups PARENT-first on a deleted subtree, so
    // this can be reached after the host effect already called viewer.destroy()
    // (Cesium nulls scene/entities there and every touch throws). isDestroyed()
    // is explicitly safe to call on a destroyed object — it is the only method
    // that is. Belt two lives in Last48Photoreal's cleanup (queueMicrotask).
    if (this.viewer.isDestroyed()) {
      this.ents.clear(); this.hero = []
      this.heroEvent = null
      this.queue = []; this.queueIds = new Set()
      return
    }
    this.viewer.scene.postRender.removeEventListener(this.probe)
    this.handler.destroy()
    for (const ents of this.ents.values()) ents.forEach((x) => this.viewer.entities.remove(x))
    // `hero` holds the halo as well as the disc and column.
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.ents.clear()
    this.hero = []
    this.heroEvent = null
    this.queue.forEach((x) => this.viewer.entities.remove(x))
    this.queue = []
    this.queueIds = new Set()
  }
}
