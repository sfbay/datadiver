import { describe, it, expect } from 'vitest'
import {
  SUBCATEGORY_WATCH, pairKey, splitPairKey, kindOf, isWatched,
  subcategoryLabel, isEcho, watchEntry,
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
