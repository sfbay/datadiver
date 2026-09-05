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
  it('oakland registry: Alameda census on 10 regions, 19 datasets, beat vocabulary', () => {
    expect(CITIES.oakland.census).not.toBeNull()
    expect(CITIES.oakland.census!.countyFips).toBe('001')
    expect(Object.keys(CITIES.oakland.census!.regions!.names)).toHaveLength(10)
    expect(CITIES.oakland.census!.regions!.geojsonPath).toBe('/data/geo/oakland-regions.geojson')
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
  it('sf census has no regions block — its neighborhoods are both spines', () => {
    expect(CITIES.sf.census!.regions).toBeUndefined()
  })
  it('every entry in BOTH cities names its publisher (short + full)', () => {
    for (const city of Object.values(CITIES)) {
      for (const [key, cfg] of Object.entries(city.datasets)) {
        expect(cfg.publisher?.short.length, `${city.id}/${key}`).toBeGreaterThan(0)
        expect(cfg.publisher?.full.length, `${city.id}/${key}`).toBeGreaterThan(0)
        expect(cfg.publisher?.full, `${city.id}/${key}`).not.toMatch(/TransBASE/)
      }
    }
  })
  it('completeness edges exist on exactly the three measured Oakland streams', () => {
    const withEdge = Object.entries(CITIES.oakland.datasets).filter(([, c]) => c.completeness).map(([k, c]) => `${k}:${c.completeness!.edgeDays}`)
    expect(withEdge.sort()).toEqual(['cases311:1', 'parkingCitations:1', 'policeIncidents:8'])
    expect(Object.values(CITIES.sf.datasets).some((c) => c.completeness)).toBe(false)
  })
})

describe('manifest liveness (stage 3)', () => {
  it('oakland: all six manifest entries live (stage 5a adds demographics — the region-based explorer)', () => {
    const live = liveManifest(CITIES.oakland.manifest).map((e) => e.viewId)
    expect(live).toEqual(['home', 'crime-incidents', '311-cases', 'parking-citations', 'campaign-finance', 'demographics'])
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
  // Registering Oakland's demographics entry silently MOVES this destination:
  // before stage 5a a reader on SF's /demographics who switched city landed on
  // /oakland (the fallback). Pin the new truth in both directions so the switch
  // can never quietly regress to the landing page.
  it('demographics now switches view-to-view in BOTH directions (stage 5a)', () => {
    expect(crossCityPath('oakland', 'demographics')).toBe('/oakland/demographics')
    expect(crossCityPath('sf', 'demographics')).toBe('/demographics')
  })
})

describe('the /oakland/* catch-all target stays alive', () => {
  it("isViewLive('oakland','home') — if home ever went dormant the App.tsx splat would self-target a blank", () => {
    expect(isViewLive('oakland', 'home')).toBe(true)
  })
})
