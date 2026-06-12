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
