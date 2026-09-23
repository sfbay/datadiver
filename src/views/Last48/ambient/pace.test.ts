import { describe, it, expect } from 'vitest'
import { parsePaceId, PACE_PRESETS, DEFAULT_PACE_ID } from './pace'

describe('parsePaceId', () => {
  it('maps the original ?ambient=1 syntax to the default pace', () => {
    expect(parsePaceId('1')).toBe(DEFAULT_PACE_ID)
  })

  it('accepts each OFFERED preset id (hidden presets are not URL-armable)', () => {
    for (const p of Object.values(PACE_PRESETS)) {
      expect(parsePaceId(p.id)).toBe(p.hidden ? null : p.id)
    }
  })

  it('returns null for absent or unknown values', () => {
    expect(parsePaceId(null)).toBeNull()
    expect(parsePaceId('')).toBeNull()
    expect(parsePaceId('warp')).toBeNull()
    expect(parsePaceId('0')).toBeNull()
  })
})

describe('cinema pace (photoreal only)', () => {
  it('has the approved values and is flagged photorealOnly', () => {
    expect(PACE_PRESETS.cinema).toMatchObject({
      id: 'cinema', orbitDegPerS: 1, tweenMs: 9000, dwellMs: 30000, breathMs: 14000, pitchMin: 30, photorealOnly: true,
    })
    expect(parsePaceId('cinema')).toBe('cinema')
  })
  it('the flat-map presets are not flagged', () => {
    for (const id of ['stroll', 'drift', 'sweep'] as const) expect(PACE_PRESETS[id].photorealOnly).toBeUndefined()
  })
})

describe('dream pace (immersive only)', () => {
  it('has the Spec A2 §3 values, is photorealOnly and hidden from the AUTO pill', () => {
    expect(PACE_PRESETS.dream).toMatchObject({
      id: 'dream', label: 'Dream', hint: 'immersive',
      orbitDegPerS: 1.3, dwellMs: 75000, breathMs: 0, tweenMs: 18000, pitchMin: 30,
      photorealOnly: true, hidden: true,
    })
    expect(parsePaceId('dream')).toBeNull()
  })
  it('the orbit times the stop: a half to a full circle is ~138–277 s at 1.3°/s (2026-09-23)', () => {
    const d = PACE_PRESETS.dream
    expect(180 / d.orbitDegPerS).toBeCloseTo(138.46, 1)
    expect(360 / d.orbitDegPerS).toBeCloseTo(276.92, 1)
  })
})
