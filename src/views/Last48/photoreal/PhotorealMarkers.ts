// src/views/Last48/photoreal/PhotorealMarkers.ts
//
// Imperative marker layer for the photoreal renderer. Two marker LANGUAGES,
// keyed by the stream's published precision (markerPrecision.ts):
//   intersection (911, Fire/EMS) — a soft ~40 m ground disc + a short wide
//                                  faded beam: "around this corner".
//   address (311)                — a slim 40 m column: "here".
// The hero (current stop / selected) is the same shape at ~1.6×, breathing in
// COLOUR only — a CallbackProperty on the material. Never animate a geometry
// dimension: rebuilding geometry per frame halved the spike's frame rate.
// Only events within DRAW_RADIUS_KM of the focus point are instantiated.
import * as Cesium from 'cesium'
import type { NormalizedEvent } from '@/types/last48'
import { PRECISION } from './markerPrecision'
import { COLORS, ageColor } from '../ageRamp'

export const DRAW_RADIUS_KM = 1.5

const DISC_M = 20          // radius → ~40 m across
const BEAM_M = 30
const COLUMN_M = 40
const HERO_SCALE = 1.6

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
  onPick?: (id: string) => void
  private handler: Cesium.ScreenSpaceEventHandler
  private viewer: Cesium.Viewer

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
    if (this.visible) for (const e of this.events) if (this.near(e)) want.add(e.id)
    for (const [id, ents] of this.ents) if (!want.has(id)) { ents.forEach((x) => this.viewer.entities.remove(x)); this.ents.delete(id) }
    for (const e of this.events) {
      if (!want.has(e.id) || this.ents.has(e.id)) continue
      this.ents.set(e.id, this.build(e, colorFor(e, now), 1))
    }
  }

  private build(e: NormalizedEvent, col: Cesium.Color, scale: number, material?: Cesium.MaterialProperty): Cesium.Entity[] {
    const props = new Cesium.PropertyBag({ eventId: e.id })
    const lng = e.longitude!, lat = e.latitude!
    const out: Cesium.Entity[] = []
    if (PRECISION[e.datasetId] === 'intersection') {
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, 1),
        ellipse: {
          semiMajorAxis: DISC_M * scale, semiMinorAxis: DISC_M * scale, height: 1,
          material: material ?? col.withAlpha(0.18), outline: true, outlineColor: col.withAlpha(0.8),
        },
      }))
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, (BEAM_M * scale) / 2),
        cylinder: { length: BEAM_M * scale, bottomRadius: 5 * scale, topRadius: 0.6, material: material ?? col.withAlpha(0.25) },
      }))
    } else {
      out.push(this.viewer.entities.add({
        properties: props,
        position: Cesium.Cartesian3.fromDegrees(lng, lat, (COLUMN_M * scale) / 2),
        cylinder: { length: COLUMN_M * scale, bottomRadius: 2.2 * scale, topRadius: 2.2 * scale, material: material ?? col.withAlpha(0.55) },
      }))
    }
    return out
  }

  /** The current stop / selected event: same shape, larger, breathing colour. */
  setHero(e: NormalizedEvent | null) {
    this.hero.forEach((x) => this.viewer.entities.remove(x)); this.hero = []
    if (!e || e.longitude == null || e.latitude == null) return
    const col = Cesium.Color.fromCssColorString(COLORS[e.datasetId])
    this.heroT0 = performance.now()
    const breathing = new Cesium.ColorMaterialProperty(
      new Cesium.CallbackProperty(() => col.withAlpha(0.35 + 0.25 * Math.sin((performance.now() - this.heroT0) / 900)), false),
    )
    this.hero = this.build(e, col, HERO_SCALE, breathing)
  }

  destroy() {
    this.handler.destroy()
    for (const ents of this.ents.values()) ents.forEach((x) => this.viewer.entities.remove(x))
    this.hero.forEach((x) => this.viewer.entities.remove(x))
    this.ents.clear()
  }
}
