import { describe, it, expect } from 'vitest'
import { QUERY_PURPOSES, PURPOSE_LABEL, isQueryPurpose } from './purposes'

describe('query purposes', () => {
  it('is the closed eleven-member vocabulary from spec §5.1', () => {
    expect([...QUERY_PURPOSES]).toEqual([
      'map-sample', 'scope-count', 'stat-totals', 'ranking', 'breakdown', 'histogram',
      'overlay', 'freshness', 'window-sample', 'window-count', 'civic-metric',
    ])
  })
  it('every purpose has a reader label that avoids jargon', () => {
    for (const p of QUERY_PURPOSES) {
      expect(PURPOSE_LABEL[p].length).toBeGreaterThan(3)
      expect(PURPOSE_LABEL[p]).not.toMatch(/soql|query|purpose/i)
    }
  })
  it('isQueryPurpose guards strings', () => {
    expect(isQueryPurpose('ranking')).toBe(true)
    expect(isQueryPurpose('trend')).toBe(false)
  })
})
