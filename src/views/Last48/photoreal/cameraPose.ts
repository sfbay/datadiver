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
