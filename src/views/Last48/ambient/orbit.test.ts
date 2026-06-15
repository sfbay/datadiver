// src/views/Last48/ambient/orbit.test.ts
import { describe, it, expect } from 'vitest'
import { orbitBearing, seedOrbitPhase, orbitPhaseRate, ORBIT_AMPLITUDE_DEG } from './orbit'

const A = ORBIT_AMPLITUDE_DEG // 90

describe('orbitBearing', () => {
  it('θ=0 → north (0°)', () => {
    expect(orbitBearing(0)).toBeCloseTo(0, 9)
  })
  it('θ=+π/2 → east extreme (+amplitude)', () => {
    expect(orbitBearing(Math.PI / 2)).toBeCloseTo(A, 6)
  })
  it('θ=−π/2 → west extreme (−amplitude)', () => {
    expect(orbitBearing(-Math.PI / 2)).toBeCloseTo(-A, 6)
  })
  it('never exceeds ±amplitude across a full cycle (no south-up)', () => {
    for (let θ = -10; θ <= 10; θ += 0.137) {
      expect(Math.abs(orbitBearing(θ))).toBeLessThanOrEqual(A + 1e-9)
    }
  })
})

describe('seedOrbitPhase', () => {
  it('north heading → phase 0', () => {
    expect(seedOrbitPhase(0)).toBeCloseTo(0, 9)
  })
  it('round-trips a heading within range', () => {
    expect(orbitBearing(seedOrbitPhase(45))).toBeCloseTo(45, 6)
  })
  it('clamps a heading beyond +amplitude to the east extreme', () => {
    expect(seedOrbitPhase(120)).toBeCloseTo(Math.PI / 2, 6)
  })
  it('normalises a 350° heading to −10° (not the clamp)', () => {
    expect(orbitBearing(seedOrbitPhase(350))).toBeCloseTo(-10, 6)
  })
})

describe('orbitPhaseRate', () => {
  it('peak speed (amplitude·rate) is π/2 × the average', () => {
    const avg = 1.4
    const rate = orbitPhaseRate(avg, A)
    expect(A * rate).toBeCloseTo(avg * Math.PI / 2, 9)
  })
})
