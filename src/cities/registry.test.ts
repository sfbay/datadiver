import { describe, it, expect } from 'vitest'
import { CITIES, getDatasetConfig } from './registry'
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
