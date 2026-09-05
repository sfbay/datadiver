import { describe, it, expect } from 'vitest'
import { csvUrl, fullCsvUrl, geojsonUrl, portalPageUrl } from './downloads'

describe('download URLs', () => {
  it('builds the CSV export from host + id + the same query string', () => {
    expect(csvUrl('data.sfgov.org', 'wg3w-h783', '%24limit=5')).toBe('https://data.sfgov.org/resource/wg3w-h783.csv?%24limit=5')
  })
  it('builds the whole-dataset export', () => {
    expect(fullCsvUrl('data.oaklandca.gov', 'ppgh-7dqv')).toBe('https://data.oaklandca.gov/api/views/ppgh-7dqv/rows.csv?accessType=DOWNLOAD')
  })
  it('builds a resource geojson, never the dead geospatial export', () => {
    expect(geojsonUrl('data.sfgov.org', 'j2bu-swwd', 100)).toBe('https://data.sfgov.org/resource/j2bu-swwd.geojson?%24limit=100')
  })
  it('portal page uses the /d/ form', () => {
    expect(portalPageUrl('data.sfgov.org', 'wg3w-h783')).toBe('https://data.sfgov.org/d/wg3w-h783')
  })
})
