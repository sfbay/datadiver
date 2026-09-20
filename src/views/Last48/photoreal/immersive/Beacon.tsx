// src/views/Last48/photoreal/immersive/Beacon.tsx
//
// The hero BEACON — a screen-pinned HTML mark over the current stop.
//
// The Cesium ground disc + halo still anchor the stop IN THE WORLD (they sit
// on the roof or the pavement and move with the geometry), but Jesse's walk
// of 2026-09-20 found them "way, way too hard to see" against a sunlit
// rooftop: a translucent disc graded by the same daylight photography it
// lies on has nowhere to get contrast from. So the discs keep the ANCHORING
// job and this beacon takes the VISIBILITY one — screen-space, full opacity,
// its own light.
//
// Pinning copies PhotorealBubble's pattern: project the stop through
// scene.cartesianToCanvasCoordinates on every postRender, clamped to the
// Google surface by the same tileset height sampler Cesium's own entity
// clamping uses (re-probed slowly once it resolves, because tiles refine).
// The pin therefore only updates on Cesium FRAMES — which is exactly when it
// needs to, since nothing but a camera move changes where the point lands.
// The swirl and the breath are CSS, so they animate on their own under
// render-on-demand without costing a single requested frame.
import { useEffect, useRef } from 'react'
import * as Cesium from 'cesium'
import type { NormalizedEvent } from '@/types/last48'

/** Height-sample cadence: eager until the tiles resolve, then slow enough to
 *  follow tile refinement without a CPU ray pick every frame. */
const PROBE_MS = 500
const REPROBE_MS = 2000

/** The beacon's box. Every ring below is centred in it, and every inset is
 *  derived from the ring's own diameter — one formula, no hand-kept offsets.
 *
 *  Jesse's walk of 2026-09-20 found the single pigment ring "beautiful and
 *  active… still not enough pop and contrast" and asked for "a case or
 *  keyline or black/white outer rings". So the mark is now CASED: an espresso
 *  keyline outside the pigment and a paper keyline inside it. The case is
 *  what buys the contrast — a pigment ring alone has to beat whatever the
 *  photograph happens to put behind it, while a dark/light sandwich carries
 *  its own edge over a sunlit roof AND over a shadowed street. */
const SIZE = 56
const PIGMENT = 52
const SWIRL = 44
const INNER = 44
const CORE = 10
/** Centre a ring of diameter `d` in the SIZE box. */
const ring = (d: number) => (SIZE - d) / 2
/** The two keyline tones, straight off the palette: espresso-900 and
 *  paper-50. Authored here rather than as tokens because this mark sits over
 *  photography, not over either theme's ground — it must not follow the
 *  theme. */
const CASE_DARK = 'rgba(30,20,13,0.9)'
const CASE_LIGHT = 'rgba(245,236,217,0.95)'
/** The core's fill — the same paper, opaque. */
const CORE_FILL = '#f5ecd9'

interface Props {
  viewer: Cesium.Viewer
  tileset: Cesium.Cesium3DTileset | null
  /** The active stop, or null before the first event lands. */
  event: NormalizedEvent | null
  /** The stream pigment — DATASET_META[datasetId].color. */
  color: string
}

export default function Beacon({ viewer, tileset, event, color }: Props) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!event || event.longitude == null || event.latitude == null) return
    const lng = event.longitude, lat = event.latitude
    const carto = Cesium.Cartographic.fromDegrees(lng, lat)
    // Until a tile covering the stop has loaded the sampler returns undefined
    // and the un-clamped ellipsoid point stands in — the same fallback the
    // bubble uses, and the same reason the probe keeps running.
    let anchor = Cesium.Cartesian3.fromDegrees(lng, lat, 0)
    let clamped = false
    let probedAt = 0

    const tick = () => {
      const el = ref.current
      if (!el) return
      const now = performance.now()
      if (tileset && now - probedAt > (clamped ? REPROBE_MS : PROBE_MS)) {
        probedAt = now
        let h: number | undefined
        // Picking is the one path Cesium can throw on; keep the frame alive.
        try { h = tileset.getHeight(carto, viewer.scene) } catch { h = undefined }
        if (h != null) {
          anchor = Cesium.Cartesian3.fromDegrees(lng, lat, h)
          clamped = true
        }
      }
      const p = viewer.scene.cartesianToCanvasCoordinates(anchor)
      if (!p) { // behind the camera / off-canvas — never leave a stale pin
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      el.style.transform = `translate(${p.x - SIZE / 2}px, ${p.y - SIZE / 2}px)`
    }

    viewer.scene.postRender.addEventListener(tick)
    // Parent-first cleanup: the host's viewer.destroy() may already have run,
    // and viewer.scene is undefined after it. isDestroyed() is the one call
    // that stays safe post-destroy.
    return () => { if (!viewer.isDestroyed()) viewer.scene.postRender.removeEventListener(tick) }
  }, [viewer, tileset, event])

  if (!event || event.longitude == null || event.latitude == null) return null

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-20"
      style={{ width: SIZE, height: SIZE, visibility: 'hidden' }}
    >
      {/* OUTER KEYLINE — the dark half of the case. */}
      <div
        className="absolute"
        style={{ inset: ring(SIZE), borderRadius: '9999px', border: `1.5px solid ${CASE_DARK}` }}
      />
      {/* PIGMENT RING — the identity, breathing slowly. Its bloom is the only
          light the mark throws; the keylines hold the edge, so the bloom is
          free to be generous. */}
      <div
        className="beacon-ring absolute"
        style={{
          inset: ring(PIGMENT), borderRadius: '9999px',
          border: `3px solid ${color}`, boxShadow: `0 0 14px 3px ${color}`,
        }}
      />
      {/* The arc, BETWEEN the two keylines. Placed by `inset`, never by a
          transform — the swirl keyframe owns `transform` and would otherwise
          erase its own centring. The conic sweep is masked to an annulus so
          it reads as one arc travelling round the ring, not a filled pie. */}
      <div
        className="beacon-swirl absolute"
        style={{
          inset: ring(SWIRL), borderRadius: '9999px',
          background: `conic-gradient(from 0deg, transparent 0 70%, ${color}ee 85%, transparent 100%)`,
          WebkitMaskImage: 'radial-gradient(closest-side, transparent 0 66%, #000 68%, #000 100%)',
          maskImage: 'radial-gradient(closest-side, transparent 0 66%, #000 68%, #000 100%)',
        }}
      />
      {/* INNER KEYLINE — the light half of the case, drawn over the arc so the
          arc reads as travelling BEHIND it. */}
      <div
        className="absolute"
        style={{ inset: ring(INNER), borderRadius: '9999px', border: `1.5px solid ${CASE_LIGHT}` }}
      />
      {/* The core: the actual point. Paper, not pigment — against the cased
          ring a light centre is the higher-contrast reading, and the pigment
          comes back as the 2px collar so the stream is still named at the
          centre of the mark. */}
      <div
        className="absolute"
        style={{
          inset: ring(CORE), borderRadius: '9999px', background: CORE_FILL,
          boxShadow: `0 0 0 2px ${color}, 0 0 10px 2px ${color}`,
        }}
      />
    </div>
  )
}
