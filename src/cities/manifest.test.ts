import { describe, it, expect } from 'vitest'
import { VIEW_IDS } from './manifest'

describe('view vocabulary', () => {
  it('VIEW_IDS are unique and exactly the canonical 20', () => {
    expect(new Set(VIEW_IDS).size).toBe(VIEW_IDS.length)
    expect([...VIEW_IDS].sort()).toEqual([
      '311-cases', 'about', 'alerts', 'business', 'business-activity',
      'campaign-finance', 'city-budget', 'crime-incidents', 'demographics',
      'dispatch-911', 'elections', 'emergency-response', 'home', 'housing',
      'live', 'neighborhood', 'parking-citations', 'parking-revenue',
      'pulse', 'traffic-safety',
    ])
  })
})
