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
import { tileGroundM } from '../groundHeight'

/** Height-sample cadence: eager until the tiles resolve, then slow enough to
 *  follow tile refinement without a CPU ray pick every frame. */
const PROBE_MS = 500
const REPROBE_MS = 2000

/** The beacon's geometry, per variant. Every ring is centred in its SIZE box
 *  and every inset is derived from the ring's own diameter — one formula, no
 *  hand-kept offsets.
 *
 *  Jesse's walk of 2026-09-20 found the single pigment ring "beautiful and
 *  active… still not enough pop and contrast" and asked for "a case or
 *  keyline or black/white outer rings". So the hero mark is CASED: an
 *  espresso keyline outside the pigment and a paper keyline inside it. The
 *  case is what buys the contrast — a pigment ring alone has to beat
 *  whatever the photograph happens to put behind it, while a dark/light
 *  sandwich carries its own edge over a sunlit roof AND over a shadowed
 *  street. The probe variant (Round B §3, a clicked point rather than the
 *  active stop) is smaller and stiller — no swirl, no breath — "this is what
 *  the here card is about", not a second hero. */
const GEOM = {
  hero:  { SIZE: 56, PIGMENT: 52, SWIRL: 44, INNER: 44, CORE: 10, ringPx: 3 },
  probe: { SIZE: 36, PIGMENT: 32, SWIRL: 0,  INNER: 26, CORE: 6,  ringPx: 2 },
} as const
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
  lng: number
  lat: number
  /** The stream pigment — DATASET_META[datasetId].color — or, for a probe,
   *  the paper tone. */
  color: string
  /** `hero` (default): the cased pigment ring with swirl and breath over the
   *  active stop. `probe` (Round B §3): a smaller, stiller paper ring over a
   *  clicked point — "this is what the here card is about". */
  variant?: 'hero' | 'probe'
}

export default function Beacon({ viewer, tileset, lng, lat, color, variant: variantProp }: Props) {
  const ref = useRef<HTMLDivElement>(null)
  const variant = variantProp ?? 'hero'
  const g = GEOM[variant]
  const ring = (d: number) => (g.SIZE - d) / 2

  useEffect(() => {
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
        // Guarded (groundHeight.ts): an unloaded tile once answered
        // −25,289 m here and hid the pin for seconds of every flight.
        const h = tileGroundM(tileset, carto, viewer.scene)
        if (h != null) {
          anchor = Cesium.Cartesian3.fromDegrees(lng, lat, h)
          clamped = true
        }
      }
      const p = viewer.scene.cartesianToCanvasCoordinates(anchor)
      // Behind the camera (no projection) OR projected outside the canvas:
      // cartesianToCanvasCoordinates happily returns a point below the map,
      // and the pin then sat on the lower third's cards (Jesse, 2026-09-23).
      const cv = viewer.scene.canvas
      if (!p || p.x < 0 || p.y < 0 || p.x > cv.clientWidth || p.y > cv.clientHeight) {
        el.style.visibility = 'hidden'
        return
      }
      el.style.visibility = 'visible'
      el.style.transform = `translate(${p.x - g.SIZE / 2}px, ${p.y - g.SIZE / 2}px)`
    }

    viewer.scene.postRender.addEventListener(tick)
    // Parent-first cleanup: the host's viewer.destroy() may already have run,
    // and viewer.scene is undefined after it. isDestroyed() is the one call
    // that stays safe post-destroy.
    return () => { if (!viewer.isDestroyed()) viewer.scene.postRender.removeEventListener(tick) }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewer, tileset, lng, lat])

  return (
    <div
      ref={ref}
      aria-hidden
      className="pointer-events-none absolute left-0 top-0 z-20"
      style={{ width: g.SIZE, height: g.SIZE, visibility: 'hidden', opacity: variant === 'probe' ? 0.85 : undefined }}
    >
      {/* OUTER KEYLINE — the dark half of the case. */}
      <div
        className="absolute"
        style={{ inset: ring(g.SIZE), borderRadius: '9999px', border: `1.5px solid ${CASE_DARK}` }}
      />
      {/* PIGMENT RING — the identity. The hero breathes slowly (its bloom is
          the only light the mark throws, and the keylines hold the edge so
          the bloom is free to be generous); the probe stays still, with half
          the bloom — a marker, not a second hero. */}
      <div
        className={variant === 'hero' ? 'beacon-ring absolute' : 'absolute'}
        style={{
          inset: ring(g.PIGMENT), borderRadius: '9999px',
          border: `${g.ringPx}px solid ${color}`,
          boxShadow: variant === 'hero' ? `0 0 14px 3px ${color}` : `0 0 8px 2px ${color}`,
        }}
      />
      {/* The arc, BETWEEN the two keylines. Placed by `inset`, never by a
          transform — the swirl keyframe owns `transform` and would otherwise
          erase its own centring. The conic sweep is masked to an annulus so
          it reads as one arc travelling round the ring, not a filled pie.
          Probe has no swirl (g.SWIRL === 0) — it does not spin. */}
      {g.SWIRL > 0 && (
        <div
          className="beacon-swirl absolute"
          style={{
            inset: ring(g.SWIRL), borderRadius: '9999px',
            background: `conic-gradient(from 0deg, transparent 0 70%, ${color}ee 85%, transparent 100%)`,
            WebkitMaskImage: 'radial-gradient(closest-side, transparent 0 66%, #000 68%, #000 100%)',
            maskImage: 'radial-gradient(closest-side, transparent 0 66%, #000 68%, #000 100%)',
          }}
        />
      )}
      {/* INNER KEYLINE — the light half of the case, drawn over the arc so the
          arc reads as travelling BEHIND it. */}
      <div
        className="absolute"
        style={{ inset: ring(g.INNER), borderRadius: '9999px', border: `1.5px solid ${CASE_LIGHT}` }}
      />
      {/* The core: the actual point. Paper, not pigment — against the cased
          ring a light centre is the higher-contrast reading, and the pigment
          comes back as the 2px collar so the stream is still named at the
          centre of the mark. */}
      <div
        className="absolute"
        style={{
          inset: ring(g.CORE), borderRadius: '9999px', background: CORE_FILL,
          boxShadow: `0 0 0 2px ${color}, 0 0 10px 2px ${color}`,
        }}
      />
    </div>
  )
}
