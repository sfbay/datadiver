import { describe, it, expect } from 'vitest'
import {
  SUBCATEGORY_WATCH, pairKey, splitPairKey, kindOf, isWatched,
  subcategoryLabel, subcategoryChipLabel, isEcho, watchEntry, parseSubParam, formatSubParam,
} from './subcategoryWatch'

describe('pair keys', () => {
  it('joins and splits on the first pipe only', () => {
    const k = pairKey('Larceny Theft', 'Larceny Theft - Shoplifting')
    expect(k).toBe('Larceny Theft|Larceny Theft - Shoplifting')
    expect(splitPairKey(k)).toEqual({
      category: 'Larceny Theft', subcategory: 'Larceny Theft - Shoplifting',
    })
  })

  it('keeps the two Vandalism parents apart', () => {
    expect(pairKey('Malicious Mischief', 'Vandalism'))
      .not.toBe(pairKey('Vandalism', 'Vandalism'))
  })
})

describe('kinds', () => {
  it('defaults an unlisted pair to crime', () => {
    expect(kindOf('Nothing|Listed')).toBe('crime')
    expect(isWatched('Nothing|Listed')).toBe(false)
  })

  it('files drug violations as enforcement, not crime', () => {
    // Arrest-generated: the number moves when policing changes.
    expect(kindOf('Drug Offense|Drug Violation')).toBe('enforcement')
  })

  it('files loitering as enforcement', () => {
    expect(kindOf('Other Miscellaneous|Loitering')).toBe('enforcement')
  })

  it('files record-keeping as admin', () => {
    expect(kindOf('Case Closure|Case Closure')).toBe('admin')
    expect(kindOf('Other|Other')).toBe('admin')
  })
})

describe('table integrity', () => {
  const keys = Object.keys(SUBCATEGORY_WATCH)

  it('every key is a well-formed pair', () => {
    for (const k of keys) {
      const parts = k.split('|')
      expect(parts).toHaveLength(2)
      expect(parts[0].length).toBeGreaterThan(0)
      expect(parts[1].length).toBeGreaterThan(0)
    }
  })

  it('never marks an admin bucket as watched — it could never be shown', () => {
    for (const [k, e] of Object.entries(SUBCATEGORY_WATCH)) {
      if (e.kind === 'admin') expect(e.watch, k).toBeUndefined()
    }
  })

  it('has at least one watched crime beat, or the strip is silently empty', () => {
    const watchedCrime = Object.entries(SUBCATEGORY_WATCH)
      .filter(([, e]) => e.watch && (e.kind ?? 'crime') === 'crime')
    expect(watchedCrime.length).toBeGreaterThan(0)
  })

  it('every merge target is well-formed and is not itself a table key', () => {
    // A merge target that is also a top-level key would double-count.
    for (const [k, e] of Object.entries(SUBCATEGORY_WATCH)) {
      for (const m of e.merge ?? []) {
        expect(m.split('|'), `${k} -> ${m}`).toHaveLength(2)
        expect(SUBCATEGORY_WATCH[m], `${m} is merged into ${k} AND a key`).toBeUndefined()
      }
    }
  })

  it('merges vehicle break-ins, which SFPD publishes under two strings', () => {
    const e = watchEntry('Larceny Theft|Larceny - From Vehicle')!
    expect(e.merge).toContain('Larceny Theft|Theft From Vehicle')
  })
})

describe('the ?sub= param codec', () => {
  it('parses an absent or empty param as an empty set', () => {
    expect(parseSubParam(null)).toEqual(new Set())
    expect(parseSubParam('')).toEqual(new Set())
  })

  it('round-trips a pair key containing | through format then parse', () => {
    const key = pairKey('Malicious Mischief', 'Vandalism')
    expect(parseSubParam(formatSubParam([key]))).toEqual(new Set([key]))
  })

  it('round-trips a two-key list in order', () => {
    const a = pairKey('Larceny Theft', 'Larceny - From Vehicle')
    const b = pairKey('Burglary', 'Burglary - Residential')
    const formatted = formatSubParam([a, b])
    expect(formatted).toBe(`${encodeURIComponent(a)},${encodeURIComponent(b)}`)
    expect(Array.from(parseSubParam(formatted))).toEqual([a, b])
  })
})

describe('labels', () => {
  it('strips the redundant parent prefix', () => {
    expect(subcategoryLabel('Larceny Theft', 'Larceny Theft - Shoplifting')).toBe('Shoplifting')
  })

  it('prefers an authored label over the strip', () => {
    expect(subcategoryLabel('Larceny Theft', 'Larceny - From Vehicle')).toBe('Car break-ins')
  })

  it('falls back to the raw string when no prefix matches', () => {
    expect(subcategoryLabel('Traffic Collision', 'Weird New Thing')).toBe('Weird New Thing')
  })

  it('never returns an empty label when subcategory echoes the category', () => {
    expect(subcategoryLabel('Motor Vehicle Theft', 'Motor Vehicle Theft')).toBe('Car theft')
    expect(subcategoryLabel('Suspicious Occ', 'Suspicious Occ')).toBe('Suspicious Occ')
  })

  it('flags echo rows so the sidebar can skip a pointless chevron', () => {
    expect(isEcho('Suspicious Occ', 'Suspicious Occ')).toBe(true)
    expect(isEcho('Larceny Theft', 'Larceny Theft - Shoplifting')).toBe(false)
  })
})

const GENERIC_CHECK = (s: string) =>
  ['other', 'other offenses', 'misc', 'miscellaneous', 'unknown'].includes(s.trim().toLowerCase())

describe('chip labels — a mover travels without its parent row', () => {
  it('keeps SFPD\'s full string when shortening would leave a bare "Other"', () => {
    // Seen on the built page: the crime strip rendered this pair as a headline
    // reading "Other -14%", which tells a reader nothing.
    expect(subcategoryLabel('Larceny Theft', 'Larceny Theft - Other')).toBe('Other')
    expect(subcategoryChipLabel('Larceny Theft', 'Larceny Theft - Other'))
      .toBe('Larceny Theft - Other')
  })

  it('generalises to the other parents that publish an "Other" bucket', () => {
    expect(subcategoryChipLabel('Burglary', 'Burglary - Other')).toBe('Burglary - Other')
    expect(subcategoryChipLabel('Robbery', 'Robbery - Other')).toBe('Robbery - Other')
  })

  it('still shortens a name that survives the strip with meaning', () => {
    expect(subcategoryChipLabel('Larceny Theft', 'Larceny Theft - Shoplifting')).toBe('Shoplifting')
  })

  it('an authored label always wins, generic or not', () => {
    expect(subcategoryChipLabel('Larceny Theft', 'Larceny - From Vehicle')).toBe('Car break-ins')
  })

  it('an authored label wins even over a generic published name', () => {
    expect(subcategoryChipLabel('Warrant', 'Other')).toBe('Warrant arrests')
  })

  it('qualifies a bare generic name that never carried its parent', () => {
    // SFPD publishes this one as literally "Other" with no prefix to restore,
    // so the parent is prepended rather than left off.
    expect(subcategoryChipLabel('Offences Against The Family And Children', 'Other'))
      .toBe('Offences Against The Family And Children - Other')
  })

  it('never renders a chip whose whole name is a generic word', () => {
    for (const [cat, sub] of [
      ['Larceny Theft', 'Larceny Theft - Other'],
      ['Burglary', 'Burglary - Other'],
      ['Offences Against The Family And Children', 'Other'],
      ['Non-Criminal', 'Other'],
    ] as const) {
      expect(GENERIC_CHECK(subcategoryChipLabel(cat, sub))).toBe(false)
    }
  })
})
