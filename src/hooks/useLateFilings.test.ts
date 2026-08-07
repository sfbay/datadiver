import { describe, it, expect } from 'vitest'
import { foldLateIE } from './useLateFilings'

describe('foldLateIE', () => {
  it('folds case-variant candidate names into one target, keeping the first-seen spelling', () => {
    // Rows arrive $order: 'total DESC' in production, so the $300 row is
    // first-seen — matches foldLateIE's "biggest filer's spelling wins" contract.
    const targets = foldLateIE([
      { cand_naml: 'Carroll Fife', sup_opp_cd: 'S', total: '300' },
      { cand_naml: 'CARROLL FIFE', sup_opp_cd: 'O', total: '100' },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0].target).toBe('Carroll Fife')
    expect(targets[0].kind).toBe('candidate')
    expect(targets[0].support).toBe(300)
    expect(targets[0].oppose).toBe(100)
  })

  it('buckets rows with neither cand_naml nor bal_name as Unattributed', () => {
    const targets = foldLateIE([
      { sup_opp_cd: 'S', total: '50' },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0].target).toBe('Unattributed')
    expect(targets[0].kind).toBe('unattributed')
    expect(targets[0].support).toBe(50)
    expect(targets[0].oppose).toBe(0)
  })

  it('folds a measure row as kind "measure"', () => {
    const targets = foldLateIE([
      { bal_name: 'Measure X', sup_opp_cd: 'O', total: '75' },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0].target).toBe('Measure X')
    expect(targets[0].kind).toBe('measure')
    expect(targets[0].support).toBe(0)
    expect(targets[0].oppose).toBe(75)
  })

  it('merges a full-caps full name (cand_naml only) with a split surname/first-name pair for the same candidate', () => {
    // Oakland's 496 dataset files 'Barbara Lee' both ways: bare surname with
    // the first name in cand_namf, AND the full name jammed into cand_naml
    // alone. Both must fold to one target.
    const targets = foldLateIE([
      { cand_naml: 'BARBARA LEE', sup_opp_cd: 'S', total: '240700' },
      { cand_naml: 'Lee', cand_namf: 'Barbara', sup_opp_cd: 'S', total: '44766' },
    ])
    expect(targets).toHaveLength(1)
    expect(targets[0].kind).toBe('candidate')
    expect(targets[0].support).toBe(285466)
    expect(targets[0].oppose).toBe(0)
  })
})
