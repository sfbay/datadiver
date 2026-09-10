import { describe, it, expect } from 'vitest'
import { parsePaceId, PACE_PRESETS, DEFAULT_PACE_ID } from './pace'

describe('parsePaceId', () => {
  it('maps the original ?ambient=1 syntax to the default pace', () => {
    expect(parsePaceId('1')).toBe(DEFAULT_PACE_ID)
  })

  it('accepts each preset id', () => {
    for (const id of Object.keys(PACE_PRESETS)) {
      expect(parsePaceId(id)).toBe(id)
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
