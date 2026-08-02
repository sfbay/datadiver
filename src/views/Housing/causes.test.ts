import { describe, it, expect } from 'vitest'
import { ALL_CAUSES, CAUSE_GROUPS, buildCauseClause, causeBreakdownSelect, noFaultClause } from './causes'

describe('causes', () => {
  it('has 19 causes across 3 groups with no overlap', () => {
    expect(ALL_CAUSES).toHaveLength(19)
    const grouped = Object.values(CAUSE_GROUPS).flat()
    expect(new Set(grouped).size).toBe(19)
    expect([...grouped].sort()).toEqual([...ALL_CAUSES].sort())
  })
  it('empty or full selection → empty clause (means "all")', () => {
    expect(buildCauseClause(new Set())).toBe('')
    expect(buildCauseClause(new Set(ALL_CAUSES))).toBe('')
  })
  it('builds OR clause for a subset, ignoring unknown values', () => {
    expect(buildCauseClause(new Set(['non_payment', 'bogus']))).toBe('(non_payment = true)')
    expect(buildCauseClause(new Set(['owner_move_in', 'ellis_act_withdrawal'])))
      .toBe('(owner_move_in = true OR ellis_act_withdrawal = true)')
  })
  it('breakdown select uses verified pairs-case syntax for every cause', () => {
    const sel = causeBreakdownSelect()
    expect(sel).toContain('sum(case(non_payment = true, 1, true, 0)) as non_payment')
    expect(sel.match(/sum\(case\(/g)).toHaveLength(19)  // NOT split(',') — case() bodies contain commas
  })
  it('noFaultClause covers exactly the no-fault group', () => {
    expect(noFaultClause()).toContain('owner_move_in = true')
    expect(noFaultClause()).not.toContain('non_payment')
  })
})
