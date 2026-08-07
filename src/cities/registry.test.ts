import { describe, it, expect } from 'vitest'
import { CITIES, getDatasetConfig, crossCityPath, isViewLive } from './registry'
import { liveManifest } from './manifest'
import { DATASETS } from '@/api/datasets'

describe('city registry', () => {
  it('derives SF endpoints from host + id, identical to the pre-refactor URLs', () => {
    expect(getDatasetConfig('sf', 'policeIncidents').endpoint)
      .toBe('https://data.sfgov.org/resource/wg3w-h783.json')
    for (const cfg of Object.values(CITIES.sf.datasets)) {
      expect(cfg.endpoint).toBe(`https://data.sfgov.org/resource/${cfg.id}.${cfg.ext ?? 'json'}`)
    }
  })
  it('preserves the non-default .geojson extension for highInjuryNetwork, byte-identical to the pre-refactor URL', () => {
    expect(getDatasetConfig('sf', 'highInjuryNetwork').endpoint)
      .toBe('https://data.sfgov.org/resource/enwt-3u8m.geojson')
  })
  it('keeps the back-compat DATASETS export pointing at the SF registry', () => {
    expect(DATASETS).toBe(CITIES.sf.datasets)
    expect(Object.keys(DATASETS)).toContain('cases311')
  })
  it('throws the same unknown-dataset message as the old client path', () => {
    expect(() => getDatasetConfig('sf', 'nope')).toThrow('Unknown dataset: nope')
  })
  it('oakland registry: census null, 19 datasets, beat vocabulary', () => {
    expect(CITIES.oakland.census).toBeNull()
    expect(Object.keys(CITIES.oakland.datasets)).toHaveLength(19)
    expect(CITIES.oakland.areas.noun).toBe('police beat')
  })
  it('derives Oakland endpoints from host + id', () => {
    expect(getDatasetConfig('oakland', 'policeIncidents').endpoint)
      .toBe('https://data.oaklandca.gov/resource/ppgh-7dqv.json')
    for (const cfg of Object.values(CITIES.oakland.datasets)) {
      expect(cfg.endpoint).toBe(`https://data.oaklandca.gov/resource/${cfg.id}.${cfg.ext ?? 'json'}`)
    }
  })
  it('stable logical keys resolve in both cities', () => {
    for (const key of ['policeIncidents', 'cases311', 'parkingCitations']) {
      expect(getDatasetConfig('sf', key).id).not.toBe(getDatasetConfig('oakland', key).id)
    }
  })
  it('every Oakland entry has a 4×4 id and reader-facing copy', () => {
    for (const [key, cfg] of Object.entries(CITIES.oakland.datasets)) {
      expect(cfg.id, key).toMatch(/^[a-z0-9]{4}-[a-z0-9]{4}$/)
      expect(cfg.name.length, key).toBeGreaterThan(0)
      expect(cfg.description.length, key).toBeGreaterThan(0)
    }
  })
  it('sf has a census pipeline', () => {
    expect(CITIES.sf.census).not.toBeNull()
  })
})

describe('manifest liveness (stage 3)', () => {
  it('oakland: all five manifest entries live (stage 4b adds home — parking-citations + campaign-finance no longer dormant)', () => {
    const live = liveManifest(CITIES.oakland.manifest).map((e) => e.viewId)
    expect(live).toEqual(['home', 'crime-incidents', '311-cases', 'parking-citations', 'campaign-finance'])
    const dormant = CITIES.oakland.manifest.filter((e) => e.dormant).map((e) => e.viewId)
    expect(dormant).toEqual([])
  })
  it('sf: zero dormant entries — liveManifest is the identity', () => {
    expect(liveManifest(CITIES.sf.manifest)).toEqual([...CITIES.sf.manifest])
  })
})

describe('crossCityPath (switch semantics)', () => {
  it('same view when live in the target city', () => {
    expect(crossCityPath('oakland', 'crime-incidents')).toBe('/oakland/crime-incidents')
    expect(crossCityPath('sf', 'parking-citations')).toBe('/parking-citations')
  })
  it('falls back to the target home when the view is not live there', () => {
    expect(crossCityPath('oakland', 'housing')).toBe('/oakland')
    expect(crossCityPath('oakland', 'elections')).toBe('/oakland')
    expect(crossCityPath('sf', 'home')).toBe('/')
  })
})

describe('the /oakland/* catch-all target stays alive', () => {
  it("isViewLive('oakland','home') — if home ever went dormant the App.tsx splat would self-target a blank", () => {
    expect(isViewLive('oakland', 'home')).toBe(true)
  })
})
