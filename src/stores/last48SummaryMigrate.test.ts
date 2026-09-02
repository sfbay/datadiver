import { describe, it, expect } from 'vitest'
import { migrateLast48Summary, LAST48_SUMMARY_VERSION } from './last48SummaryMigrate'
import { LAST48_ROW_CAP } from '@/hooks/last48Truncation'

describe('migrateLast48Summary', () => {
  it('is at version 2 (v2 = the window’s true size, not the drawn sample’s length)', () => {
    expect(LAST48_SUMMARY_VERSION).toBe(2)
  })

  it('keeps v1 seeds below the row cap — an uncapped draw WAS the whole window', () => {
    const out = migrateLast48Summary(
      { last48: { counts: { '911-realtime': 3100, 'fire-ems-dispatch': 870, '311-cases': 2600 }, updatedAt: 1_700_000_000_000 } },
      1,
    )
    expect(out).toEqual({
      last48: { counts: { '911-realtime': 3100, 'fire-ems-dispatch': 870, '311-cases': 2600 }, updatedAt: 1_700_000_000_000 },
    })
  })

  it('drops a v1 seed at or above the cap — it was the cap, or a hold that stopped short', () => {
    const out = migrateLast48Summary(
      { last48: { counts: { '911-realtime': 3100, '311-cases': LAST48_ROW_CAP }, updatedAt: 5 } },
      1,
    )
    expect(out.last48.counts).toEqual({ '911-realtime': 3100 })
    // An accumulated hold above the cap is just as ambiguous.
    expect(migrateLast48Summary({ last48: { counts: { '311-cases': 5400 }, updatedAt: 5 } }, 1).last48.counts).toEqual({})
  })

  it('nulls updatedAt when nothing survives, keeps it when something does', () => {
    expect(migrateLast48Summary({ last48: { counts: { '311-cases': 5000 }, updatedAt: 5 } }, 1).last48.updatedAt).toBeNull()
    expect(migrateLast48Summary({ last48: { counts: { '311-cases': 4999 }, updatedAt: 5 } }, 1).last48.updatedAt).toBe(5)
  })

  it('ignores unknown stream keys and non-numeric or negative values', () => {
    const out = migrateLast48Summary(
      { last48: { counts: { 'police-incidents': 12, '911-realtime': '3100', 'fire-ems-dispatch': -1, '311-cases': Number.NaN }, updatedAt: 5 } },
      1,
    )
    expect(out).toEqual({ last48: { counts: {}, updatedAt: null } })
  })

  it('turns garbage into an empty seed rather than throwing', () => {
    expect(migrateLast48Summary(undefined, 0)).toEqual({ last48: { counts: {}, updatedAt: null } })
    expect(migrateLast48Summary(null, 1)).toEqual({ last48: { counts: {}, updatedAt: null } })
    expect(migrateLast48Summary({ last48: { counts: 'nope' } }, 1)).toEqual({ last48: { counts: {}, updatedAt: null } })
  })

  it('passes a current-version state through untouched', () => {
    const v2 = { last48: { counts: { '311-cases': 5516 }, updatedAt: 9 } }
    expect(migrateLast48Summary(v2, 2)).toEqual(v2)
  })
})
