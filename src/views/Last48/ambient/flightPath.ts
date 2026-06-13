// src/views/Last48/ambient/flightPath.ts
//
// Van Wijk & Nuij (2003) optimal zoom-pan path — the math inside Mapbox's
// own flyTo, evaluated as a pure function so the ambient director can fly
// it while keeping single-writer control of the camera.
//
// Why not a linear lng/lat + zoom tween: zoom is exponential, so a linear
// path crosses long distances while still zoomed in — peak screen-space
// velocity is huge, and under irregular frame pacing (Mapbox re-tiles
// mid-zoom) the oversized per-frame steps along a curving trajectory read
// as a back-and-forth "wiggle" (measured at ±2–6px/frame lateral whip at
// peak speed via phase correlation of a screen recording; smooth phases
// measured < 0.2px — feel-test #3, June 12 2026). The van Wijk path rises
// through zoom-out space and descends, keeping perceived velocity low and
// near-constant the whole flight.
//
// Reference: "Smooth and efficient zooming and panning", J.J. van Wijk &
// W.A.A. Nuij, InfoVis 2003 — and mapbox-gl-js's Camera#flyTo.

export interface FlightEndpoint {
  /** World position in Web Mercator "world pixels" at a fixed reference
   *  zoom (callers use mercatorPx below — any consistent frame works). */
  x: number
  y: number
  zoom: number
}

export interface FlightPose {
  x: number
  y: number
  zoom: number
}

/** Web Mercator world-pixel coordinates at the reference zoom 0 world
 *  (512px world). Latitude-independent x; y via the Mercator projection. */
export function mercatorPx(lng: number, lat: number): { x: number; y: number } {
  const x = ((lng + 180) / 360) * 512
  const s = Math.sin((lat * Math.PI) / 180)
  const y = (0.5 - Math.log((1 + s) / (1 - s)) / (4 * Math.PI)) * 512
  return { x, y }
}

export function mercatorPxToLngLat(x: number, y: number): { lng: number; lat: number } {
  const lng = (x / 512) * 360 - 180
  const n = Math.PI - (2 * Math.PI * y) / 512
  const lat = (180 / Math.PI) * Math.atan(0.5 * (Math.exp(n) - Math.exp(-n)))
  return { lng, lat }
}

/** Curvature parameter — mapbox-gl's flyTo default. Higher = deeper
 *  zoom-out arc. */
const RHO = 1.42

/**
 * Build the van Wijk path between two endpoints. Returns an evaluator:
 * pose(t) for t ∈ [0,1] (callers apply their own easing to t first).
 *
 * `viewportPx` is the larger viewport dimension — the path's notion of
 * "how much is visible" (w0). Distances are measured in world pixels
 * SCALED TO the start zoom, matching the paper's setup.
 */
export function buildFlightPath(
  from: FlightEndpoint,
  to: FlightEndpoint,
  viewportPx: number,
): (t: number) => FlightPose {
  const scale0 = Math.pow(2, from.zoom)
  // Distance in screen pixels at the START zoom.
  const dx = (to.x - from.x) * scale0
  const dy = (to.y - from.y) * scale0
  const u1 = Math.hypot(dx, dy)

  const w0 = Math.max(1, viewportPx)
  // Visible span shrinks as zoom grows: w1 relative to w0.
  const w1 = w0 / Math.pow(2, to.zoom - from.zoom)

  // Degenerate: no pan worth speaking of — pure exponential zoom.
  if (u1 < 1e-6) {
    const dz = to.zoom - from.zoom
    return (t: number) => ({ x: to.x, y: to.y, zoom: from.zoom + dz * t })
  }

  const rho2 = RHO * RHO
  const b = (i: 0 | 1): number => {
    const wi = i === 0 ? w0 : w1
    const sgn = i === 0 ? 1 : -1
    return (w1 * w1 - w0 * w0 + sgn * rho2 * rho2 * u1 * u1) / (2 * wi * rho2 * u1)
  }
  const r = (i: 0 | 1): number => {
    const bi = b(i)
    return Math.log(Math.sqrt(bi * bi + 1) - bi)
  }

  const r0 = r(0)
  const r1 = r(1)
  // Total path length in the paper's parameterization.
  const S = (r1 - r0) / RHO

  // Numerically fragile when endpoints are extremely close in both pan
  // and zoom — fall back to a plain lerp there.
  if (!Number.isFinite(S) || Math.abs(S) < 1e-9) {
    return (t: number) => ({
      x: from.x + (to.x - from.x) * t,
      y: from.y + (to.y - from.y) * t,
      zoom: from.zoom + (to.zoom - from.zoom) * t,
    })
  }

  const coshR0 = Math.cosh(r0)
  const sinhR0 = Math.sinh(r0)

  return (t: number) => {
    const s = t * S
    const u = (w0 / rho2) * (coshR0 * Math.tanh(RHO * s + r0) - sinhR0)
    const w = (w0 * coshR0) / Math.cosh(RHO * s + r0)
    const frac = u / u1
    // Position interpolates along the straight world-space chord; zoom
    // follows the visible-span curve. Endpoints are exact at t=0 / t=1
    // up to floating point — clamp the tails so arrival is precise.
    const tc = t >= 1 ? 1 : t <= 0 ? 0 : frac
    return {
      x: from.x + (to.x - from.x) * (t >= 1 ? 1 : tc),
      y: from.y + (to.y - from.y) * (t >= 1 ? 1 : tc),
      zoom: t >= 1 ? to.zoom : from.zoom + Math.log2(w0 / w),
    }
  }
}
