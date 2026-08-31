import { describe, it, expect } from 'vitest'
import { rankMovers, foldMerges, moverScore, formatMoverDelta, MIN_COUNT, type MoverInput } from './subcategoryMovers'

function row(category: string, subcategory: string, current: number, prior: number): MoverInput {
  return { key: `${category}|${subcategory}`, category, subcategory, current, prior }
}

describe('the pair is the identity', () => {
  it('keeps Vandalism under two parents as two rows with their own scores', () => {
    const out = rankMovers([
      row('Malicious Mischief', 'Vandalism', 4867, 6186),
      row('Vandalism', 'Vandalism', 152, 218),
      row('Traffic Collision', 'Traffic Collision - Hit & Run', 349, 155),
    ], 'crime', 3)
    const keys = out.map((m) => m.key)
    expect(keys).toContain('Malicious Mischief|Vandalism')
    // Vandalism|Vandalism has prior 218 >= 150 and current 152 >= 150, so it
    // is eligible and must NOT have been merged into the other parent.
    expect(new Set(keys).size).toBe(keys.length)
  })
})

describe('eligibility', () => {
  it('rejects a bucket below the floor on the CURRENT side', () => {
    const out = rankMovers([row('A', 'a', MIN_COUNT - 1, 1000)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects a bucket below the floor on the PRIOR side', () => {
    // A percent off a tiny prior window is noise in both directions.
    const out = rankMovers([row('A', 'a', 1000, MIN_COUNT - 1)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects prior 0 rather than rendering +Infinity%', () => {
    const out = rankMovers([row('A', 'a', 1000, 0)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('rejects an empty subcategory — it carries nothing the category does not', () => {
    const out = rankMovers([row('A', '', 1000, 500)], 'crime', 3)
    expect(out).toHaveLength(0)
  })

  it('never lets an admin bucket win a slot, however high it scores', () => {
    const out = rankMovers([
      row('Case Closure', 'Case Closure', 5000, 500),   // +900%, admin
      row('Burglary', 'Burglary - Commercial', 320, 697),
    ], 'crime', 3)
    expect(out.map((m) => m.key)).not.toContain('Case Closure|Case Closure')
    expect(out).toHaveLength(1)
  })

  it('keeps each lens to its own kind', () => {
    const rows = [
      row('Drug Offense', 'Drug Violation', 6019, 3701),          // enforcement
      row('Burglary', 'Burglary - Commercial', 320, 697),          // crime
    ]
    expect(rankMovers(rows, 'crime', 3).map((m) => m.key))
      .toEqual(['Burglary|Burglary - Commercial'])
    expect(rankMovers(rows, 'enforcement', 3).map((m) => m.key))
      .toEqual(['Drug Offense|Drug Violation'])
  })

  it('returns [] for empty input rather than throwing', () => {
    expect(rankMovers([], 'crime', 3)).toEqual([])
  })
})

describe('authored merges', () => {
  it('I2: survives a merged-away row with no canonical target in the window', () => {
    // When the canonical target is absent, the merged-away row must not
    // vanish — it survives on its own. This prevents manufacturing absence.
    const out = foldMerges([row('Larceny Theft', 'Theft From Vehicle', 894, 1577)])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(894)
    expect(out[0].prior).toBe(1577)
    expect(out[0].key).toBe('Larceny Theft|Theft From Vehicle')
  })

  it('sums the two vehicle break-in strings and drops the merged row', () => {
    const out = foldMerges([
      row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586),
      row('Larceny Theft', 'Theft From Vehicle', 894, 1577),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(4166 + 894)
    expect(out[0].prior).toBe(6586 + 1577)
    expect(out[0].key).toBe('Larceny Theft|Larceny - From Vehicle')
  })

  it('carries both keys so the chip filters on both', () => {
    const out = rankMovers([
      row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586),
      row('Larceny Theft', 'Theft From Vehicle', 894, 1577),
    ], 'crime', 3)
    expect(out[0].keys).toEqual([
      'Larceny Theft|Larceny - From Vehicle',
      'Larceny Theft|Theft From Vehicle',
    ])
  })

  it('survives a merge target that never arrived in the data', () => {
    const out = foldMerges([row('Larceny Theft', 'Larceny - From Vehicle', 4166, 6586)])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(4166)
  })

  it('sums a duplicate input key instead of overwriting it', () => {
    // Socrata GROUP BY output cannot contain a duplicate group, but a bucket's
    // count must never silently depend on which of two identical-key rows
    // happened to arrive last.
    const out = foldMerges([
      row('Burglary', 'Burglary - Commercial', 200, 400),
      row('Burglary', 'Burglary - Commercial', 120, 300),
    ])
    expect(out).toHaveLength(1)
    expect(out[0].current).toBe(320)
    expect(out[0].prior).toBe(700)
  })
})

describe('formatMoverDelta — never a signed zero', () => {
  it('renders whole percents normally', () => {
    expect(formatMoverDelta(-38.4)).toBe('-38%')
    expect(formatMoverDelta(108.2)).toBe('+108%')
  })

  it('keeps the sign and a decimal when rounding would erase it', () => {
    // Math.round(-0.4) is -0: a bare "0%" (or worse, a headline that pairs
    // it with "down") asserts no change when the bucket genuinely moved.
    expect(formatMoverDelta(-0.4)).toBe('-0.4%')
    expect(formatMoverDelta(0.4)).toBe('+0.4%')
  })

  it('renders an ACTUAL zero delta unsigned', () => {
    expect(formatMoverDelta(0)).toBe('0%')
  })
})

describe('scoring — movement damped by volume', () => {
  it('prefers a smaller move on a much bigger bucket', () => {
    // 40% of 8,786 is a story; 60% of 200 is noise with a big percentage.
    expect(moverScore(40, 8786)).toBeGreaterThan(moverScore(60, 200))
  })

  it('is sign-blind: a fall ranks like a rise of the same size', () => {
    expect(moverScore(-37, 4000)).toBeCloseTo(moverScore(37, 4000), 6)
  })
})

describe('slot allocation', () => {
  const watched = row('Burglary', 'Burglary - Commercial', 320, 697)      // watch, crime
  const watched2 = row('Motor Vehicle Theft', 'Motor Vehicle Theft', 3211, 4747)
  const watched3 = row('Malicious Mischief', 'Vandalism', 4867, 6186)
  const wild = row('Traffic Collision', 'Traffic Collision - Hit & Run', 349, 155)

  it('reserves two slots for watched beats and one for an unlisted mover', () => {
    const out = rankMovers([watched, watched2, watched3, wild], 'crime', 3)
    expect(out).toHaveLength(3)
    expect(out.filter((m) => m.watched)).toHaveLength(2)
    expect(out.filter((m) => !m.watched).map((m) => m.key))
      .toEqual(['Traffic Collision|Traffic Collision - Hit & Run'])
  })

  it('does not let the highest-scoring unlisted mover displace a followed beat', () => {
    // Hit & Run outscores both watched beats here; the reserved slots are
    // exactly what stop it taking all three.
    const out = rankMovers([watched, watched2, wild], 'crime', 3)
    expect(out.filter((m) => m.watched)).toHaveLength(2)
  })

  it('falls back to a third watched beat when nothing unlisted qualifies', () => {
    const out = rankMovers([watched, watched2, watched3], 'crime', 3)
    expect(out).toHaveLength(3)
    expect(out.every((m) => m.watched)).toBe(true)
  })

  it('returns fewer than the slot count rather than padding', () => {
    expect(rankMovers([watched], 'crime', 3)).toHaveLength(1)
  })

  it('I1: respects the caller\'s slot count even for watched beats', () => {
    // When slots = 1, only 1 row must be returned, even if 2 eligible watched
    // beats are available. The watch loop must cap at Math.min(WATCH_SLOTS, slots).
    const out = rankMovers([watched, watched2], 'crime', 1)
    expect(out).toHaveLength(1)
    expect(out[0].watched).toBe(true)
  })

  it('breaks ties deterministically — bigger bucket, then key', () => {
    // Same delta and same score shape; the larger current must come first.
    const a = row('Zed', 'Zed - One', 1000, 2000)
    const b = row('Alpha', 'Alpha - One', 1000, 2000)
    const out = rankMovers([a, b], 'crime', 3)
    expect(out.map((m) => m.key)).toEqual(['Alpha|Alpha - One', 'Zed|Zed - One'])
  })
})

describe('the rendered row', () => {
  it('carries an authored label, a signed delta, and the note', () => {
    const [m] = rankMovers([row('Drug Offense', 'Drug Violation', 6019, 3701)], 'enforcement', 3)
    expect(m.label).toBe('Drug enforcement')
    expect(Math.round(m.delta)).toBe(63)
    expect(m.note).toMatch(/arrest-generated/)
    expect(m.kind).toBe('enforcement')
  })

  it('signs a fall negative', () => {
    const [m] = rankMovers([row('Burglary', 'Burglary - Commercial', 320, 697)], 'crime', 3)
    expect(m.delta).toBeLessThan(0)
  })
})
