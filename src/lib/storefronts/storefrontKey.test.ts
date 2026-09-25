import { describe, expect, it } from 'vitest'
import {
  applySuffixFill,
  buildSuffixFill,
  isStorefrontAddress,
  keyParts,
  storefrontKey,
} from './storefrontKey'

// Every raw string below is a spelling DPH actually published (tvy3-wexg,
// 5tti-66ds or pyih-qa8i, research scratch 2026-09-24) unless marked
// synthetic.

describe('storefrontKey — the spec §3.5 fixtures', () => {
  it('strips zero-padded ordinals: 03RD → 3RD (E T7)', () => {
    expect(storefrontKey('4517 03RD ST')).toBe('4517 3RD ST')
    expect(storefrontKey('1350 04TH ST')).toBe('1350 4TH ST')
    expect(storefrontKey('651 06TH AVE')).toBe('651 6TH AVE')
    expect(storefrontKey('4517 03RD ST')).toBe(storefrontKey('4517 3rd St'))
  })

  it('keeps a house-number letter: 455A ≠ 455B Castro (E T7b, synthetic pair)', () => {
    expect(storefrontKey('455A Castro St')).toBe('455A CASTRO ST')
    expect(storefrontKey('455B CASTRO ST')).toBe('455B CASTRO ST')
    expect(storefrontKey('455A Castro St')).not.toBe(storefrontKey('455B Castro St'))
    expect(storefrontKey('455A Castro St')).not.toBe(storefrontKey('455 Castro St'))
  })

  it('joins a lone house letter to its number, but never a directional', () => {
    expect(storefrontKey('201 A TURK ST')).toBe('201A TURK ST')
    expect(storefrontKey('550 D GENE FRIEND WAY')).toBe('550D GENE FRIEND WAY')
    expect(storefrontKey('900 N POINT ST')).toBe('900 N POINT ST')
    expect(storefrontKey('49 S VAN NESS AVE 7TH FLOOR')).toBe('49 S VAN NESS AVE')
  })

  it('a unit letter after the suffix is a unit, not a house letter', () => {
    expect(storefrontKey('495 Castro St B')).toBe('495 CASTRO ST')
    expect(storefrontKey('495 CASTRO ST #B')).toBe('495 CASTRO ST')
    expect(storefrontKey('495A CASTRO St')).toBe('495A CASTRO ST')
  })

  it("O FARRELL → OFARRELL, with or without the apostrophe", () => {
    expect(storefrontKey("1740 O'FARRELL ST")).toBe('1740 OFARRELL ST')
    expect(storefrontKey('1740 O FARRELL ST')).toBe('1740 OFARRELL ST')
    expect(storefrontKey('284 OFARRELL ST')).toBe('284 OFARRELL ST')
    expect(storefrontKey('170 OFARRELL ST BLDG BAS')).toBe('170 OFARRELL ST')
    expect(storefrontKey('170 O’Farrell St')).toBe('170 OFARRELL ST')
  })

  it('39 PIER ↔ PIER 39, every published spelling', () => {
    for (const raw of [
      '39 PIER', '39   PIER', 'PIER  39', '39 PIER 213', '39   PIER  213', '39 PIER K-01',
      '39 PIER M-211', '39 PIER A201', '207 39 PIER K-106-B',
    ]) {
      expect(storefrontKey(raw), raw).toBe('PIER 39')
    }
  })

  it('guards ST ST — the second ST is unit residue', () => {
    expect(storefrontKey('1401 18TH ST ST A')).toBe('1401 18TH ST')
    expect(storefrontKey('1401   18TH ST ST  A')).toBe('1401 18TH ST')
  })

  it('collapses whitespace (street_address_clean is not clean, A trap 3)', () => {
    expect(storefrontKey('  2077   HAYES   ST ')).toBe('2077 HAYES ST')
    expect(storefrontKey('2077 Hayes St.')).toBe('2077 HAYES ST')
  })
})

describe('storefrontKey — suffixes and units', () => {
  it('standardizes suffix spellings', () => {
    expect(storefrontKey('2948 FOLSOM STREET')).toBe('2948 FOLSOM ST')
    expect(storefrontKey('2948 FOLSOM ST.')).toBe('2948 FOLSOM ST')
    expect(storefrontKey('22 PEACE PLAZA #535')).toBe('22 PEACE PLZ')
    expect(storefrontKey('1 FERRY BUILDING #27')).toBe('1 FERRY BLDG')
    expect(storefrontKey('2 Marina Bl')).toBe('2 MARINA BLVD')
  })

  it('drops units after the suffix and before one', () => {
    expect(storefrontKey('3251 20TH AVENUE, SUITE 158, #OP184A')).toBe('3251 20TH AVE')
    expect(storefrontKey('3251 20TH AVE P182')).toBe('3251 20TH AVE')
    expect(storefrontKey('845 MARKET ST SPACE#14')).toBe('845 MARKET ST')
    expect(storefrontKey('2000 VAN NESS AVENUE, STE 706 SAN FRANCISCO, CA, USA')).toBe('2000 VAN NESS AVE')
    expect(storefrontKey('1 WARRIORS WAY LEVEL 300 SOUTH')).toBe('1 WARRIORS WAY')
    expect(storefrontKey('24 WILLIE MAYS  RM 3232')).toBe('24 WILLIE MAYS')
    expect(storefrontKey('255 WINSTON DR UNIT')).toBe('255 WINSTON DR')
  })

  it('keeps a half-number door distinct', () => {
    expect(storefrontKey('1007 1/2 VALENCIA ST')).toBe('1007½ VALENCIA ST')
    expect(storefrontKey('1007 1/2 VALENCIA ST')).not.toBe(storefrontKey('1007 VALENCIA ST'))
  })

  it('reads a trailing lone letter or a BLDG designator on a suffixless street as a unit', () => {
    expect(storefrontKey('1750 CESAR CHAVEZ D')).toBe('1750 CESAR CHAVEZ')
    expect(storefrontKey('1750 CESAR CHAVEZ BLDG H')).toBe('1750 CESAR CHAVEZ')
    expect(storefrontKey('1750 CESAR CHAVEZ ST UNIT E')).toBe('1750 CESAR CHAVEZ ST')
    expect(storefrontKey('1 FERRY BUILDING')).toBe('1 FERRY BLDG')
  })

  it('keeps the first number of a house-number range', () => {
    expect(storefrontKey('1523-1525 IRVING ST')).toBe('1523 IRVING ST')
    expect(storefrontKey('90 -92 CHARTER OAK AVE APT')).toBe('90 CHARTER OAK AVE')
    expect(storefrontKey('1120-30 4TH ST')).toBe('1120 4TH ST')
    expect(storefrontKey('2077-2095 Hayes St Commercials')).toBe('2077 HAYES ST')
  })

  it('reads a range written with a space or slash the same way (real DPH/registry spellings)', () => {
    expect(storefrontKey('1196 1198 FOLSOM ST')).toBe('1196 FOLSOM ST')
    expect(storefrontKey('1196/1198 Folsom St')).toBe('1196 FOLSOM ST')
    expect(storefrontKey('522 522 COLUMBUS AVE')).toBe('522 COLUMBUS AVE')
    // Chase Center's Tony's Pizza — '1 1 WARRIORS WAY' slipped past the venue list.
    expect(storefrontKey('1 1 Warriors Way')).toBe('1 WARRIORS WAY')
    // …but a numbered street is not a range.
    expect(storefrontKey('2300 16 ST')).toBe('2300 16TH ST')
    expect(storefrontKey('10 23 AVE')).toBe('10 23RD AVE')
  })

  it('joins an ordinal split from its number', () => {
    expect(storefrontKey('3348 18 TH ST')).toBe('3348 18TH ST')
    expect(storefrontKey('3265 22 ND ST')).toBe('3265 22ND ST')
    expect(storefrontKey('91 6 TH ST')).toBe('91 6TH ST')
    // Only the number's own ordinal — 'ST' after 16 is the suffix, not an ordinal.
    expect(storefrontKey('1 ST FRANCIS PL')).toBe('1 ST FRANCIS PL')
  })

  it('gives a bare numbered street its ordinal', () => {
    expect(storefrontKey('428 11 ST')).toBe('428 11TH ST')
    expect(storefrontKey('10 1 ST')).toBe('10 1ST ST')
    expect(storefrontKey('10 12 AVE')).toBe('10 12TH AVE')
    expect(storefrontKey('10 23 AVE')).toBe('10 23RD AVE')
  })

  it('moves a stranded directional after the suffix — Mission Bay Blvd North/South are two streets', () => {
    const north = '601 MISSION BAY BLVD N'
    expect(storefrontKey('601 MISSION BAY BLVD NORTH')).toBe(north)
    expect(storefrontKey('601 MISSION BAY N BLVD')).toBe(north)
    expect(storefrontKey('601 MISSION BAY NORTH BLVD')).toBe(north)
    expect(storefrontKey('601 MISSION BAY BLVD N')).toBe(north)
    expect(storefrontKey('600 MISSION BAY BLVD SOUTH')).toBe('600 MISSION BAY BLVD S')
  })

  it('spells out ordinals and directionals the same way every time', () => {
    expect(storefrontKey('900 NORTH POINT ST')).toBe('900 N POINT ST')
    expect(storefrontKey('10 FIRST ST')).toBe('10 1ST ST')
    expect(storefrontKey('399 THE EMBARCADERO')).toBe('399 EMBARCADERO')
  })

  it('leaves intersections and non-addresses recognizable, never numbered', () => {
    expect(storefrontKey('3RD ST & KING ST')).toBe('3RD ST & KING ST')
    expect(storefrontKey('THE EMBARCADERO & MARKET ST')).toBe('THE EMBARCADERO & MARKET ST')
    expect(storefrontKey('Off the Grid')).toBe('OFF THE GRID')
    expect(storefrontKey('')).toBe('')
    expect(storefrontKey(null)).toBe('')
  })

  it('is idempotent', () => {
    for (const raw of [
      '4517 03RD ST', '201 A TURK ST', "1740 O'FARRELL ST", '39 PIER K-01', '1401 18TH ST ST A',
      '601 MISSION BAY N BLVD', '428 11 ST', '3RD ST & KING ST', '24 WILLIE MAYS PL VIEW LVL SECT 331',
    ]) {
      const once = storefrontKey(raw)
      expect(storefrontKey(once), raw).toBe(once)
    }
  })
})

describe('keyParts / isStorefrontAddress (rule 1)', () => {
  it('splits a key', () => {
    expect(keyParts('455A CASTRO ST')).toEqual({ number: '455A', street: 'CASTRO', suffix: 'ST', direction: null })
    expect(keyParts('601 MISSION BAY BLVD N')).toEqual({ number: '601', street: 'MISSION BAY', suffix: 'BLVD', direction: 'N' })
    expect(keyParts('2077 HAYES')).toEqual({ number: '2077', street: 'HAYES', suffix: null, direction: null })
    expect(keyParts('PIER 39')).toBeNull()
  })

  it('accepts number + street + street suffix, and suffixless SF streets', () => {
    expect(isStorefrontAddress('2704 24TH ST')).toBe(true)
    expect(isStorefrontAddress('570 GREEN ST')).toBe(true)
    expect(isStorefrontAddress('601 MISSION BAY BLVD N')).toBe(true)
    expect(isStorefrontAddress('501 BROADWAY')).toBe(true)
    expect(isStorefrontAddress('399 EMBARCADERO')).toBe(true)
  })

  it('rejects intersections, piers, buildings, complexes and bare numbers', () => {
    expect(isStorefrontAddress('3RD ST & KING ST')).toBe(false)
    expect(isStorefrontAddress('OFF THE GRID')).toBe(false)
    expect(isStorefrontAddress('PIER 39')).toBe(false)
    expect(isStorefrontAddress('1 FERRY BLDG')).toBe(false)
    expect(isStorefrontAddress('4 EMBARCADERO CTR')).toBe(false)
    expect(isStorefrontAddress('24 WILLIE MAYS')).toBe(false)
    expect(isStorefrontAddress('1')).toBe(false)
  })
})

describe('suffix fill — only where exactly one suffix is known', () => {
  const fill = buildSuffixFill([
    '4517 3RD ST', '100 3RD ST', '100 3RD AVE', '2077 HAYES ST', '10 HAYES ST', '5 19TH ST', '9 19TH AVE',
  ])

  it('fills at the door first', () => {
    expect(applySuffixFill(storefrontKey('4517 03RD'), fill)).toBe('4517 3RD ST')
  })

  it('a lettered door learns from its bare number', () => {
    const f = buildSuffixFill(['2475 MISSION ST', '601 MISSION BLVD'])
    expect(applySuffixFill('2475A MISSION', f)).toBe('2475A MISSION ST') // MISSION alone is ambiguous
  })

  it('then by street name citywide', () => {
    expect(applySuffixFill('300 HAYES', fill)).toBe('300 HAYES ST')
  })

  it('never guesses an ambiguous street', () => {
    expect(applySuffixFill('100 3RD', fill)).toBe('100 3RD') // the door itself is ST and AVE
    expect(applySuffixFill('7 19TH', fill)).toBe('7 19TH') // 19th St and 19th Ave both exist
  })

  it('leaves suffixed, non-numbered and suffixless-street keys alone', () => {
    expect(applySuffixFill('2077 HAYES ST', fill)).toBe('2077 HAYES ST')
    expect(applySuffixFill('PIER 39', fill)).toBe('PIER 39')
    expect(applySuffixFill('501 BROADWAY', fill)).toBe('501 BROADWAY')
  })
})
