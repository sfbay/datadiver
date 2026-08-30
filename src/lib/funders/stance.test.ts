import { describe, it, expect } from 'vitest'
import { parseStance, stanceChip } from './stance'

describe('parseStance (real SF committee names)', () => {
  it('candidate by filerType', () => {
    expect(parseStance('Manny Yekutiel for Supervisor 2026', 'Candidate or Officeholder').kind).toBe('candidate')
  })
  it('Yes on K / No on G', () => {
    expect(parseStance('Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits', 'Primarily Formed Measure')).toEqual({ kind: 'yes', measure: 'K' })
    expect(parseStance('No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes', 'Primarily Formed Measure')).toEqual({ kind: 'no', measure: 'G' })
  })
  it('"for Yes on Prop D" → yes D', () => {
    expect(parseStance('Mayor Mark Farrell for Yes on Prop D', 'Primarily Formed Measure')).toEqual({ kind: 'yes', measure: 'D' })
  })
  it('Yes on D, No on E → yes D with also no E', () => {
    const s = parseStance("Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future", 'Primarily Formed Measure')
    expect(s).toEqual({ kind: 'yes', measure: 'D', also: { kind: 'no', measure: 'E' } })
    expect(stanceChip(s)).toBe('Yes on D · No on E')
  })
  it('measure-type with no parseable letter → measure; anything else → pac', () => {
    expect(parseStance('Committee to Fix San Francisco Government', 'Primarily Formed Measure').kind).toBe('measure')
    expect(parseStance('Neighbors For A Better San Francisco', 'General Purpose').kind).toBe('pac')
    expect(parseStance('GrowSF Voter Guide', undefined).kind).toBe('pac')
  })
  it('never reads "for Supervisor" as a measure letter and never matches inside a word', () => {
    expect(parseStance('Theo Ellington for Supervisor 2026', 'General Purpose').kind).toBe('pac')
    expect(parseStance('Information for All', 'General Purpose').kind).toBe('pac')
  })
  it('chips', () => {
    expect(stanceChip({ kind: 'candidate' })).toBe('candidate')
    expect(stanceChip({ kind: 'yes', measure: 'K' })).toBe('Yes on K')
    expect(stanceChip({ kind: 'measure' })).toBe('measure')
    expect(stanceChip({ kind: 'pac' })).toBe('PAC')
  })
})
