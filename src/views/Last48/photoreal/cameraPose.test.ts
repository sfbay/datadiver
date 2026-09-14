import { describe, it, expect } from 'vitest'
import { geodeticToEcef, orbitPose, ORBIT_RANGE_M, ORBIT_PITCH_DEG, RANGE_M } from './cameraPose'

const A = 6378137 // WGS84 semi-major axis
const close = (a: number[], b: number[], eps = 1e-3) => a.forEach((v, i) => expect(Math.abs(v - b[i])).toBeLessThan(eps))
const norm = (v: number[]) => Math.hypot(...v)

describe('geodeticToEcef', () => {
  it('equator/prime meridian sits on the +x axis; the north pole on +z', () => {
    close(geodeticToEcef(0, 0, 0), [A, 0, 0])
    const [x, y, z] = geodeticToEcef(0, 90, 0)
    expect(Math.abs(x)).toBeLessThan(1e-3); expect(Math.abs(y)).toBeLessThan(1e-3)
    expect(Math.abs(z - 6356752.314245)).toBeLessThan(1e-3)
  })
})

describe('orbitPose at (0°,0°)', () => {
  const c = { lng: 0, lat: 0, height: 0 }
  it('pitch −90 puts the camera straight above the target, looking down', () => {
    const p = orbitPose(c, 0, -90, 1000)
    close(p.position, [A + 1000, 0, 0])
    close(p.direction, [-1, 0, 0])
  })
  it('heading 0, pitch 0 puts the camera south, looking north, up = local up', () => {
    const p = orbitPose(c, 0, 0, 1000)
    close(p.position, [A, 0, -1000])
    close(p.direction, [0, 0, 1])
    close(p.up, [1, 0, 0])
  })
  it('heading 90, pitch 0 puts the camera west, looking east', () => {
    const p = orbitPose(c, 90, 0, 1000)
    close(p.position, [A, -1000, 0])
    close(p.direction, [0, 1, 0])
  })
  it('direction and up are unit and orthogonal; range is honoured', () => {
    const p = orbitPose({ lng: -122.41, lat: 37.78, height: 30 }, 35, ORBIT_PITCH_DEG, ORBIT_RANGE_M)
    expect(Math.abs(norm(p.direction) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(norm(p.up) - 1)).toBeLessThan(1e-9)
    expect(Math.abs(p.direction[0] * p.up[0] + p.direction[1] * p.up[1] + p.direction[2] * p.up[2])).toBeLessThan(1e-9)
    const t = geodeticToEcef(-122.41, 37.78, 30)
    expect(Math.abs(norm([p.position[0] - t[0], p.position[1] - t[1], p.position[2] - t[2]]) - ORBIT_RANGE_M)).toBeLessThan(1e-6)
  })
  it('ranges: 620 m orbit (the spike), 900 m immersive (Spec A2 §3); pitch −30', () => {
    expect(RANGE_M).toEqual({ orbit: 620, immersive: 900 })
    expect(ORBIT_RANGE_M).toBe(RANGE_M.orbit)
    expect(ORBIT_PITCH_DEG).toBe(-30)
  })
})
