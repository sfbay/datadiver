import { describe, it, expect } from 'vitest'
import { parsePortalMeta } from './portalMeta'

describe('parsePortalMeta', () => {
  it('reads title, attribution, license and rowsUpdatedAt (epoch seconds → ms)', () => {
    const m = parsePortalMeta({ name: 'Fire Incidents', attribution: null, licenseId: 'PDDL', license: { name: 'Open Data Commons PDDL', termsLink: 'http://opendatacommons.org/licenses/pddl/1.0/' }, rowsUpdatedAt: 1788342327 })
    expect(m).toEqual({ title: 'Fire Incidents', attribution: null, licenseId: 'PDDL', licenseName: 'Open Data Commons PDDL', licenseUrl: 'http://opendatacommons.org/licenses/pddl/1.0/', rowsUpdatedAt: 1788342327000 })
  })
  it('absent keys become null, never invented', () => {
    const m = parsePortalMeta({ name: 'CrimeWatch Data' })
    expect(m.licenseId).toBeNull(); expect(m.rowsUpdatedAt).toBeNull(); expect(m.attribution).toBeNull()
  })
  it('never keeps the description (it carries HTML)', () => {
    expect(Object.keys(parsePortalMeta({ name: 'x', description: '<p>y</p>' }))).not.toContain('description')
  })
})
