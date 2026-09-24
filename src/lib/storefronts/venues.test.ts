import { describe, expect, it } from 'vitest'
import { storefrontKey, isStorefrontAddress } from './storefrontKey'
import { isVenue, venueFor, VENUES } from './venues'

describe('VENUES', () => {
  it('every entry is already a normalized key', () => {
    for (const v of VENUES) expect(storefrontKey(v.key), v.key).toBe(v.key)
  })

  it('keys are unique', () => {
    expect(new Set(VENUES.map((v) => v.key)).size).toBe(VENUES.length)
  })
})

describe('the naive "most names at one address" leaders are all excluded (E §2)', () => {
  // The top 11 of the naive ranking (research scratch churn/naive.json), each
  // as a raw spelling DPH published. Rules 1 + 4 together must drop them all.
  const NAIVE_LEADERS = [
    '3RD ST & KING ST',
    '1 WARRIORS WAY LEVEL 300 SOUTH',
    '49 S VAN NESS AVE 7TH FLOOR',
    '3251 20TH AVENUE, SUITE 158, #OP184A',
    '103 HORNE AVE.',
    'THE EMBARCADERO & MARKET ST',
    'OFF THE GRID',
    '1 FERRY BUILDING #27',
    '601 MISSION BAY N BLVD',
    '2948 FOLSOM STREET',
    '428 11 ST',
  ]

  it.each(NAIVE_LEADERS)('%s', (raw) => {
    const key = storefrontKey(raw)
    expect(isVenue(key) || !isStorefrontAddress(key)).toBe(true)
  })
})

describe('venueFor — every published spelling of a listed venue', () => {
  const CASES: [string, string][] = [
    ['24 WILLIE MAYS PLAZA', 'Oracle Park'],
    ['24 WILLIE MAYS PL FIELD LEVEL', 'Oracle Park'],
    ['24 Willie Mays  Rm 3232', 'Oracle Park'],
    ['24 WILLIE MAYS PL VIEW LVL SECT 331', 'Oracle Park'],
    ['1 WARRIORS WAY LEVEL 600 WEST', 'Chase Center'],
    ['3251 20TH AVE #157', 'Stonestown Galleria'],
    ['1 FERRY BUILDING STE 956', 'Ferry Building'],
    ['2948 FOLSOM ST.', 'La Cocina (incubator kitchen)'],
    ['90 CHARTER OAK AVE UNIT K6', 'Shared kitchen complex'],
    ['601 MISSION BAY BLVD NORTH', 'Mission Bay food-truck stop'],
    ['601 MISSION BAY BLVD', 'Mission Bay food-truck stop'],
    ['601 MISSION BLVD', 'Mission Bay food-truck stop'],
    ['865 MARKET ST SPACE#C08', 'Westfield San Francisco Centre'],
    ['845 MARKET ST., STE. FE 10', 'Westfield San Francisco Centre'],
    ['1737 POST ST STE 355', 'Japan Center'],
    ['1581 WEBSTER ST #206', 'Japan Center'],
    ['22 PEACE PLAZA #270', 'Japan Center'],
    ['900 NORTH POINT ST STE. H104', 'Ghirardelli Square'],
    ['1000 VAN NESS AVE 3RD FLOOR', '1000 Van Ness (multi-tenant building)'],
    ['39 PIER M-211', 'Pier 39'],
    ['1 MARKET PLAZA, PL24', 'One Market Plaza'],
    ['1 MARKET PL 23', 'One Market Plaza'],
    ['428 11TH', 'SoMa StrEat Food Park'],
  ]

  it.each(CASES)('%s → %s', (raw, label) => {
    const key = storefrontKey(raw)
    // '428 11TH' has no suffix until the generator's suffix fill runs.
    expect(venueFor(key)?.label ?? venueFor(`${key} ST`)?.label).toBe(label)
  })

  it('does not swallow ordinary neighbors', () => {
    expect(isVenue(storefrontKey('1 MARKET ST'))).toBe(false) // a restaurant, not One Market Plaza
    expect(isVenue(storefrontKey('2950 FOLSOM ST'))).toBe(false)
    expect(isVenue(storefrontKey('240 WILLIE MAYS PL'))).toBe(false)
    expect(isVenue(storefrontKey('PIER 23'))).toBe(false)
  })
})
