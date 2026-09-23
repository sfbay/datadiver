// src/views/Last48/photoreal/immersive/addressSearch.test.ts
import { describe, it, expect } from 'vitest'
import { addressSearchUrl, addressHits } from './addressSearch'

describe('addressSearchUrl (Mapbox Product Terms §2.7)', () => {
  const url = addressSearchUrl('  1 Dr Carlton B Goodlett ', 'pk.test')
  it('asks for addresses and streets only — never POI (§2.7.5)', () => {
    expect(url.searchParams.get('types')).toBe('address,street')
  })
  it('asks for TEMPORARY geocodes (no permanent flag, §2.7.2)', () => {
    expect(url.searchParams.has('permanent')).toBe(false)
  })
  it('is bounded to the city and trims the query', () => {
    expect(url.searchParams.get('bbox')).toMatch(/^-122\.\d+,37\.\d+,-122\.\d+,37\.\d+$/)
    expect(url.searchParams.get('q')).toBe('1 Dr Carlton B Goodlett')
  })
})

describe('addressHits', () => {
  const feature = (name: string, lng: number, lat: number, id = name) => ({
    geometry: { coordinates: [lng, lat] },
    properties: { mapbox_id: id, name, place_formatted: 'San Francisco, California 94102' },
  })
  it('reads name, place line and position', () => {
    expect(addressHits({ features: [feature('1 Dr Carlton B Goodlett Place', -122.4193, 37.7793)] })).toEqual([
      { id: '1 Dr Carlton B Goodlett Place', label: '1 Dr Carlton B Goodlett Place', sublabel: 'San Francisco, California 94102', lng: -122.4193, lat: 37.7793 },
    ])
  })
  it('trims the country off the place line', () => {
    const [h] = addressHits({ features: [{ geometry: { coordinates: [-122.4215, 37.7599] }, properties: { name: 'Valencia Street', place_formatted: 'San Francisco, California 94110, United States' } }] })
    expect(h.sublabel).toBe('San Francisco, California 94110')
  })
  it('drops anything outside the city and anything malformed', () => {
    expect(addressHits({ features: [
      feature('Oakland spot', -122.27, 37.80),
      { properties: { name: 'no geometry' } },
      { geometry: { coordinates: [-122.42, 37.77] }, properties: {} },
    ] })).toEqual([])
    expect(addressHits(null)).toEqual([])
    expect(addressHits({ features: 'nope' })).toEqual([])
  })
})
