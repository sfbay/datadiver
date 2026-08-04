import { describe, it, expect } from 'vitest'
import { VIEW_IDS } from './manifest'
import { sfCity } from './sf'
import { CITIES } from './registry'

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

describe('SF manifest completeness', () => {
  it('registers every ViewId exactly once, in nav order', () => {
    const ids = sfCity.manifest.map((e) => e.viewId)
    expect(new Set(ids).size).toBe(ids.length)
    expect([...ids].sort()).toEqual([...VIEW_IDS].sort())
    // Nav order is the array order — pin the documented sequence's head + tail.
    expect(ids.slice(0, 4)).toEqual(['home', 'alerts', 'live', 'pulse'])
    expect(ids.slice(-2)).toEqual(['neighborhood', 'about'])
  })
  it('homeCard.order values are unique and cover 1..14', () => {
    const orders = sfCity.manifest
      .filter((e) => e.homeCard)
      .map((e) => e.homeCard!.order)
      .sort((a, b) => a - b)
    expect(orders).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14])
  })
  it('live is dateless, era-free, and carries the nav pulse dot', () => {
    const live = sfCity.manifest.find((e) => e.viewId === 'live')!
    expect(live.dateless).toBe(true)
    expect(live.eraSource).toBeUndefined()
    expect(live.navPulse).toBe(true)
  })
  it('SF redirects the legacy live-feeds path', () => {
    expect(sfCity.redirects).toContainEqual({ from: 'live-feeds', to: 'live' })
  })
  it('every omniDatasetKey names a real dataset in its own city registry', () => {
    for (const city of Object.values(CITIES)) {
      for (const entry of city.manifest) {
        for (const key of entry.omniDatasetKeys ?? []) {
          expect(city.datasets[key], `${city.id}/${entry.viewId} → ${key}`).toBeDefined()
        }
      }
    }
  })
})
