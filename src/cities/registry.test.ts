import { describe, it, expect } from 'vitest'
import { CITIES, getDatasetConfig } from './registry'
import { DATASETS } from '@/api/datasets'

describe('city registry', () => {
  it('derives SF endpoints from host + id, identical to the pre-refactor URLs', () => {
    expect(getDatasetConfig('sf', 'policeIncidents').endpoint)
      .toBe('https://data.sfgov.org/resource/wg3w-h783.json')
    for (const cfg of Object.values(CITIES.sf.datasets)) {
      expect(cfg.endpoint).toBe(`https://data.sfgov.org/resource/${cfg.id}.json`)
    }
  })
  it('keeps the back-compat DATASETS export pointing at the SF registry', () => {
    expect(DATASETS).toBe(CITIES.sf.datasets)
    expect(Object.keys(DATASETS)).toContain('cases311')
  })
  it('throws the same unknown-dataset message as the old client path', () => {
    expect(() => getDatasetConfig('sf', 'nope')).toThrow('Unknown dataset: nope')
  })
  it('oakland shell: census null, no datasets yet, beat vocabulary', () => {
    expect(CITIES.oakland.census).toBeNull()
    expect(Object.keys(CITIES.oakland.datasets)).toHaveLength(0)
    expect(CITIES.oakland.areas.noun).toBe('police beat')
  })
})
