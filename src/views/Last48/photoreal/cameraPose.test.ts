import { describe, it, expect } from 'vitest'
import { geodeticToEcef, orbitPose, rampedLinear, sliceEase, orbitSweepDeg, glideHeight, ORBIT_RANGE_M, ORBIT_PITCH_DEG, RANGE_M } from './cameraPose'

describe('orbitSweepDeg (the orbit ends facing the next stop)', () => {
  it('always ends on the target heading', () => {
    for (let from = 0; from < 360; from += 17) for (let to = 0; to < 360; to += 23) {
      const end = (((from + orbitSweepDeg(from, to)) % 360) + 360) % 360
      expect(Math.abs(end - to) % 360).toBeLessThan(1e-9)
    }
  })
  it('turns between a half and a full circle', () => {
    for (let from = 0; from < 360; from += 13) for (let to = 0; to < 360; to += 7) {
      const s = Math.abs(orbitSweepDeg(from, to))
      expect(s).toBeGreaterThanOrEqual(180)
      expect(s).toBeLessThanOrEqual(360)
    }
  })
  it('straight ahead is a full circle; directly behind is a half', () => {
    expect(Math.abs(orbitSweepDeg(40, 40))).toBe(360)
    expect(Math.abs(orbitSweepDeg(40, 220))).toBe(180)
  })
  it('no next stop: one full clockwise circle', () => {
    expect(orbitSweepDeg(40, null)).toBe(360)
  })
})

describe('glideHeight (arrive down the line of sight)', () => {
  const base = { hs: 130, he: 150, cruise: 600, d: 2000, climbTan: Math.tan(20 * Math.PI / 180), glideTan: Math.tan(30 * Math.PI / 180) }
  it('meets both ends exactly', () => {
    expect(glideHeight({ ...base, x: 0 })).toBeCloseTo(130, 9)
    expect(glideHeight({ ...base, x: 2000 })).toBeCloseTo(150, 9)
  })
  it('never exceeds the cruise ceiling or the climb, and is continuous', () => {
    let prev = glideHeight({ ...base, x: 0 })
    for (let x = 1; x <= 2000; x += 1) {
      const h = glideHeight({ ...base, x })
      expect(h).toBeLessThanOrEqual(600 + 1e-9)
      expect(Math.abs(h - prev)).toBeLessThan(1)
      prev = h
    }
  })
  it('the last stretch lies on the arrival line of sight', () => {
    const r = 150
    expect(glideHeight({ ...base, x: 2000 - r })).toBeCloseTo(150 + r * base.glideTan, 6)
  })
  it('a start above the cruise ceiling descends from where it is (no jump)', () => {
    expect(glideHeight({ ...base, hs: 5000, x: 0 })).toBeCloseTo(5000, 9)
    expect(glideHeight({ ...base, hs: 5000, x: 2000 })).toBeCloseTo(150, 9)
    let prev = 5000
    for (let x = 1; x <= 2000; x += 1) {
      const h = glideHeight({ ...base, hs: 5000, x })
      expect(h).toBeLessThanOrEqual(prev + 1e-9) // only ever comes down
      expect(prev - h).toBeLessThan(5) // ≤ ~4 m per metre: steep, never a jump
      prev = h
    }
  })
})

describe('sliceEase (the orbit flown as a chain of short flights)', () => {
  const ease = rampedLinear(4 / 75)
  const n = 30
  it('each slice runs 0 → 1', () => {
    for (let i = 0; i < n; i++) {
      const s = sliceEase(ease, i / n, (i + 1) / n)
      expect(s(0)).toBeCloseTo(0, 12)
      expect(s(1)).toBeCloseTo(1, 12)
    }
  })
  it('chained slices reproduce the whole ease at every sampled time', () => {
    for (let t = 0; t <= 1; t += 0.0137) {
      const i = Math.min(n - 1, Math.floor(t * n))
      const a = i / n, b = (i + 1) / n
      const chained = ease(a) + (ease(b) - ease(a)) * sliceEase(ease, a, b)((t - a) / (b - a))
      expect(chained).toBeCloseTo(ease(t), 10)
    }
  })
  it('a slice where the ease does not move is linear', () => {
    expect(sliceEase(() => 0.5, 0.2, 0.4)(0.3)).toBe(0.3)
  })
})

describe('rampedLinear (the drift easing: no jolt at either end)', () => {
  const f = rampedLinear(0.1)
  const speed = (t: number, h = 1e-4) => (f(t + h) - f(t - h)) / (2 * h)
  it('runs 0 → 1 and never goes backward', () => {
    expect(f(0)).toBe(0)
    expect(f(1)).toBeCloseTo(1, 12)
    for (let t = 0; t < 1; t += 0.01) expect(f(t + 0.01)).toBeGreaterThanOrEqual(f(t))
  })
  it('starts and ends at rest, with a constant speed in between', () => {
    expect(speed(1e-3)).toBeLessThan(0.02)
    expect(speed(1 - 1e-3)).toBeLessThan(0.02)
    expect(speed(0.3)).toBeCloseTo(speed(0.7), 6)
  })
  it('speed is continuous at the ramp joins (no step)', () => {
    expect(speed(0.1 - 1e-3)).toBeCloseTo(speed(0.1 + 1e-3), 1)
    expect(speed(0.9 - 1e-3)).toBeCloseTo(speed(0.9 + 1e-3), 1)
  })
  it('ramp 0 is plain linear; ramp is clamped to 0.5', () => {
    expect(rampedLinear(0)(0.37)).toBe(0.37)
    expect(rampedLinear(0.9)(0.5)).toBeCloseTo(rampedLinear(0.5)(0.5), 12)
  })
})

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
  it('ranges: 620 m orbit (the spike), 200 m immersive (Spec A2 §3); pitch −30', () => {
    expect(RANGE_M).toEqual({ orbit: 620, immersive: 200 })
    expect(ORBIT_RANGE_M).toBe(RANGE_M.orbit)
    expect(ORBIT_PITCH_DEG).toBe(-30)
  })
})

import { bearingDeg } from './cameraPose'

describe('bearingDeg', () => {
  it('due north / east / south / west', () => {
    expect(bearingDeg(-122.42, 37.76, -122.42, 37.77)).toBeCloseTo(0, 3)
    expect(bearingDeg(-122.42, 37.76, -122.41, 37.76)).toBeCloseTo(90, 0)
    expect(bearingDeg(-122.42, 37.76, -122.42, 37.75)).toBeCloseTo(180, 3)
    expect(bearingDeg(-122.42, 37.76, -122.43, 37.76)).toBeCloseTo(270, 0)
  })
  it('always in [0, 360)', () => {
    const b = bearingDeg(-122.42, 37.76, -122.43, 37.75)
    expect(b).toBeGreaterThanOrEqual(0); expect(b).toBeLessThan(360)
  })
})
