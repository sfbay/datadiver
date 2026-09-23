//
// PURE camera-pose math for the orbit (no Cesium import, node-tested).
// One function produces BOTH the flight's destination and every orbit
// frame, so the fly→orbit hand-off is seamless by construction. The 2026-09-09
// spike read Cesium's camera-LOCAL position after lookAt() and flew to the
// centre of the Earth; this leaf exists so that class of bug is impossible.
//
// Conventions match Cesium's HeadingPitchRange: heading is degrees clockwise
// from local north, pitch is degrees above the local horizon (negative looks
// down), range is metres from the target to the camera. Output vectors are
// WGS84 ECEF (what Cesium.Cartesian3 holds).
export type Vec3 = [number, number, number]

/** Camera distance from the stop, metres, per mode. 620 was the 2026-09-09
 *  spike's orbit range; the immersive route sat at 900 (Spec A2 §5, mesh
 *  detail) until Jesse's 2026-09-20 walk asked for a significantly closer
 *  hero sweep — 200 now (his pick after trying ?range=); `?range=` on the page overrides for tuning. */
export const RANGE_M = { orbit: 620, immersive: 200 } as const
export const ORBIT_RANGE_M: number = RANGE_M.orbit
export const ORBIT_PITCH_DEG = -30

const A = 6378137
const F = 1 / 298.257223563
const E2 = F * (2 - F)
const D2R = Math.PI / 180

export function geodeticToEcef(lngDeg: number, latDeg: number, heightM: number): Vec3 {
  const lng = lngDeg * D2R, lat = latDeg * D2R
  const sLat = Math.sin(lat), cLat = Math.cos(lat)
  const N = A / Math.sqrt(1 - E2 * sLat * sLat)
  return [
    (N + heightM) * cLat * Math.cos(lng),
    (N + heightM) * cLat * Math.sin(lng),
    (N * (1 - E2) + heightM) * sLat,
  ]
}

/** Local east/north/up unit vectors at a geodetic point, in ECEF. */
function enuAxes(lngDeg: number, latDeg: number): { e: Vec3; n: Vec3; u: Vec3 } {
  const lng = lngDeg * D2R, lat = latDeg * D2R
  const sLng = Math.sin(lng), cLng = Math.cos(lng), sLat = Math.sin(lat), cLat = Math.cos(lat)
  return {
    e: [-sLng, cLng, 0],
    n: [-sLat * cLng, -sLat * sLng, cLat],
    u: [cLat * cLng, cLat * sLng, sLat],
  }
}

const add = (a: Vec3, b: Vec3): Vec3 => [a[0] + b[0], a[1] + b[1], a[2] + b[2]]
const scale = (a: Vec3, s: number): Vec3 => [a[0] * s, a[1] * s, a[2] * s]
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]
const unit = (a: Vec3): Vec3 => { const n = Math.hypot(a[0], a[1], a[2]); return [a[0] / n, a[1] / n, a[2] / n] }

export interface CameraPose { position: Vec3; direction: Vec3; up: Vec3 }

export function orbitPose(
  center: { lng: number; lat: number; height: number },
  headingDeg: number,
  pitchDeg: number,
  rangeM: number,
): CameraPose {
  const { e, n, u } = enuAxes(center.lng, center.lat)
  const h = headingDeg * D2R, p = pitchDeg * D2R
  // View direction in ENU: forward along heading, tilted by pitch.
  const dE = Math.cos(p) * Math.sin(h), dN = Math.cos(p) * Math.cos(h), dU = Math.sin(p)
  const direction = unit(add(add(scale(e, dE), scale(n, dN)), scale(u, dU)))
  const target = geodeticToEcef(center.lng, center.lat, center.height)
  const position = add(target, scale(direction, -rangeM))
  // Camera up: perpendicular to direction, in the plane of direction and local up.
  const right = unit(cross(direction, u))
  const up = unit(cross(right, direction))
  return { position, direction, up }
}

/** A flight easing (time fraction → progress fraction) whose SPEED is a
 *  trapezoid: it ramps up from rest over the first `ramp` of the time, holds
 *  a constant speed, and ramps back to rest over the last `ramp`. The
 *  immersive drift uses it so a dwell neither starts nor ends with a jolt
 *  (Jesse, 2026-09-23: "one single gentle motion ... at all times"); a bare
 *  LINEAR drift jumped from standstill to full speed on its first frame.
 *  `ramp` is clamped to [0, 0.5]; 0 is plain linear. f(0)=0, f(1)=1. */
export function rampedLinear(ramp: number): (t: number) => number {
  const r = Math.min(0.5, Math.max(0, ramp))
  if (r === 0) return (t) => t
  const k = 1 - r
  return (t) => {
    const x = Math.min(1, Math.max(0, t))
    if (x < r) return (x * x) / (2 * r) / k
    if (x > 1 - r) return (k - ((1 - x) * (1 - x)) / (2 * r)) / k
    return (x - r / 2) / k
  }
}

/** The easing for ONE segment of a motion split into a chain of flights:
 *  the slice [a, b] of `ease`, renormalised to run 0 → 1. Chained segments
 *  reproduce `ease` exactly, speed included, across every join — how the
 *  immersive orbit stays one continuous motion while flown as short legs.
 *  A slice where `ease` does not move falls back to linear. */
export function sliceEase(ease: (t: number) => number, a: number, b: number): (t: number) => number {
  const fa = ease(a), fb = ease(b)
  if (fb === fa) return (t) => t
  return (t) => (ease(a + t * (b - a)) - fa) / (fb - fa)
}

/** The dwell's orbit, signed degrees (+ = clockwise heading increase), from
 *  the camera's heading to the heading that faces the NEXT stop (Jesse,
 *  2026-09-23: "the rotation in the direction of our takeoff ... a full
 *  rotation to time each stop"). Between a half and a full turn, always:
 *  a next stop straight ahead costs a whole circle, one directly behind a
 *  half; the direction is whichever reaches the facing inside that band.
 *  Facing the next stop at the end means the camera sits on the line from
 *  the next stop through this one, so the take-off needs no turn. With no
 *  next stop (null) it is one full clockwise circle. At a constant speed the
 *  sweep IS the dwell's length. */
export function orbitSweepDeg(fromDeg: number, toDeg: number | null): number {
  if (toDeg == null) return 360
  const theta = (((toDeg - fromDeg) % 360) + 360) % 360
  return theta >= 180 ? theta : -(360 - theta)
}

/** The height (m, above the ellipsoid) of the camera at horizontal distance
 *  `x` along a leg of horizontal length `d` (Jesse, 2026-09-23: arrivals
 *  "tilting down and dropping all at the end of flight"). Three limits, the
 *  lowest wins, joined by a smooth minimum:
 *   - the CLIMB out of the start at `climbTan` (rise per metre);
 *   - the CRUISE ceiling `cruise`;
 *   - the GLIDE into the end along the arrival's own line of sight
 *     (`glideTan` = tan of the arrival pitch), so the last stretch slides
 *     straight down the gaze — closer without tilting — and meets `he`
 *     exactly at x = d.
 *  The smoothing width shrinks to zero at both ends so the endpoints are
 *  exact: h(0) = hs, h(d) = he. */
export function glideHeight(p: { hs: number; he: number; cruise: number; d: number; x: number; climbTan: number; glideTan: number }): number {
  const x = Math.min(p.d, Math.max(0, p.x))
  const r = p.d - x
  const climb = p.hs + x * p.climbTan
  const glide = p.he + r * p.glideTan
  const k = Math.min(80, x * 0.5, r * 0.5)
  const smin = (a: number, b: number) => {
    if (k <= 0) return Math.min(a, b)
    const h = Math.max(k - Math.abs(a - b), 0) / k
    return Math.min(a, b) - (h * h * k) / 4
  }
  // The ceiling never sits below either end: an end above it is still reached
  // exactly, and a start above it is not clipped down to it.
  const low = smin(smin(climb, Math.max(p.cruise, p.hs, p.he)), glide)
  // A start ABOVE the glide line (the first leg, from Cesium's far default
  // camera) comes DOWN from where it is — at least 45°, steeper only when the
  // drop would not fit in 60% of the leg — until it meets the glide line.
  // Without this floor it would jump straight onto the line. On an ordinary
  // leg the floor sits far below and changes nothing.
  const dropTan = Math.max(1, (p.hs - p.he) / (0.6 * Math.max(p.d, 1)))
  const floor = p.hs - x * dropTan
  if (k <= 0) return Math.max(low, floor)
  const h = Math.max(k - Math.abs(low - floor), 0) / k
  return Math.max(low, floor) + (h * h * k) / 4
}

/** Initial compass bearing from one geodetic point to another, degrees
 *  clockwise from north in [0, 360). The heading the camera should ARRIVE
 *  with so a leg reads as flying forward (Round B walk, 2026-09-20: a stop
 *  behind the camera used to be flown backward — position moved, heading
 *  did not). Great-circle formula; at city scale it is the rhumb line too. */
export function bearingDeg(fromLng: number, fromLat: number, toLng: number, toLat: number): number {
  const f1 = fromLat * D2R, f2 = toLat * D2R, dl = (toLng - fromLng) * D2R
  const y = Math.sin(dl) * Math.cos(f2)
  const x = Math.cos(f1) * Math.sin(f2) - Math.sin(f1) * Math.cos(f2) * Math.cos(dl)
  return ((Math.atan2(y, x) / D2R) + 360) % 360
}
