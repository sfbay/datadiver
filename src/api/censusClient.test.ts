// src/api/censusClient.test.ts
import { describe, it, expect } from 'vitest'
import { buildGeoClause, SF_FIPS } from './censusClient'

describe('buildGeoClause', () => {
  it('tract in-clause scopes to the county (tract:* is the for-clause, not here)', () => {
    expect(buildGeoClause('tract', { stateFips: '06', countyFips: '001' })).toBe('state:06+county:001')
  })

  it('block-group in-clause wildcards tract:* inside the county', () => {
    expect(buildGeoClause('blockgroup', { stateFips: '06', countyFips: '001' })).toBe(
      'state:06+county:001+tract:*',
    )
  })

  it('SF stays 06/075', () => {
    expect(SF_FIPS).toEqual({ stateFips: '06', countyFips: '075' })
    expect(buildGeoClause('tract', SF_FIPS)).toBe('state:06+county:075')
  })
})
