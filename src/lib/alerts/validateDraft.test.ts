import { describe, it, expect } from 'vitest'
import { validateDraft } from './validateDraft'
import { SIGNIFICANCE_KEYS } from './significance'

const good = () => ({
  email: 'reader@example.com',
  cadence: 'daily',
  filters: { streams: ['911-realtime'], categories: ['shooting'] },
  radiusMiles: 0.5,
  locations: [{ label: '24th & Mission', lat: 37.752, lng: -122.418 }],
})

describe('validateDraft', () => {
  it('accepts a well-formed draft', () => {
    const d = validateDraft(good())
    expect(typeof d).not.toBe('string')
    if (typeof d === 'string') return
    expect(d.email).toBe('reader@example.com')
    expect(d.filters.streams).toEqual(['911-realtime'])
  })

  it('pins the server category vocabulary', () => {
    expect(SIGNIFICANCE_KEYS).toEqual([
      'shooting', 'stabbing', 'homicide', 'robbery', 'weapon', 'assault', 'fire',
    ])
  })

  it('returns an error string (does NOT throw) for a null location element', () => {
    const b = { ...good(), locations: [null] }
    expect(() => validateDraft(b)).not.toThrow()
    expect(validateDraft(b)).toBe('invalid location')
  })

  it('rejects non-object and array bodies', () => {
    expect(validateDraft(null)).toBe('invalid body')
    expect(validateDraft('x')).toBe('invalid body')
    expect(validateDraft([good()])).toBe('invalid body')
  })

  it('dedupes duplicate streams and categories', () => {
    const b = {
      ...good(),
      filters: {
        streams: ['911-realtime', '911-realtime', 'fire-ems-dispatch'],
        categories: ['fire', 'fire'],
      },
    }
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.filters.streams).toEqual(['911-realtime', 'fire-ems-dispatch'])
    expect(d.filters.categories).toEqual(['fire'])
  })

  it('rejects unknown streams and categories', () => {
    expect(validateDraft({ ...good(), filters: { streams: ['crime-reports'], categories: [] } }))
      .toBe('pick at least one valid stream')
    expect(validateDraft({ ...good(), filters: { streams: ['311-cases'], categories: ['loud'] } }))
      .toBe('invalid category')
  })

  it('rejects empty streams, bad email, bad radius, bad cadence', () => {
    expect(validateDraft({ ...good(), filters: { streams: [], categories: [] } }))
      .toBe('pick at least one valid stream')
    expect(validateDraft({ ...good(), email: 'nope' })).toBe('invalid email')
    expect(validateDraft({ ...good(), radiusMiles: 3.3 })).toBe('invalid radius')
    expect(validateDraft({ ...good(), cadence: 'weekly' }))
      .toBe('cadence must be "daily" in this release')
  })

  it('rejects out-of-SF and non-finite coordinates, 0 and 11 locations', () => {
    expect(validateDraft({ ...good(), locations: [{ lat: 40.7, lng: -74.0 }] }))
      .toBe('locations must be within San Francisco')
    expect(validateDraft({ ...good(), locations: [{ lat: 'x', lng: -122.4 }] }))
      .toBe('invalid coordinates')
    expect(validateDraft({ ...good(), locations: [] })).toBe('pick 1–10 locations')
    const eleven = Array.from({ length: 11 }, () => ({ lat: 37.75, lng: -122.42 }))
    expect(validateDraft({ ...good(), locations: eleven })).toBe('pick 1–10 locations')
  })

  it('truncates labels and names to 80 chars and lowercases email', () => {
    const b = { ...good(), email: 'Reader@Example.COM', name: 'n'.repeat(120) }
    b.locations = [{ label: 'l'.repeat(120), lat: 37.75, lng: -122.42 }]
    const d = validateDraft(b)
    if (typeof d === 'string') throw new Error(d)
    expect(d.email).toBe('reader@example.com')
    expect(d.name).toHaveLength(80)
    expect(d.locations[0].label).toHaveLength(80)
  })
})
