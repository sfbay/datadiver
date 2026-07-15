import { describe, expect, it } from 'vitest'
import {
  cleanCandidateName,
  displayNhood,
  leaderDisplayName,
  nhoodKey,
  sharePhrase,
  yesShareOf,
} from './electionData'

describe('nhoodKey', () => {
  it('joins dsov uppercase to geojson title case', () => {
    expect(nhoodKey('Castro/Upper Market')).toBe('CASTRO/UPPER MARKET')
    expect(nhoodKey(' BAYVIEW HUNTERS POINT ')).toBe('BAYVIEW HUNTERS POINT')
  })
})

describe('cleanCandidateName', () => {
  it('strips the embedded party suffix', () => {
    expect(cleanCandidateName('KAMALA D. HARRIS / TIM WALZ\n(DEM)')).toBe('KAMALA D. HARRIS / TIM WALZ')
    expect(cleanCandidateName('PETER SONSKI / LAUREN ONAK\nQualified Write In')).toBe('PETER SONSKI / LAUREN ONAK')
  })
  it('passes clean names through', () => {
    expect(cleanCandidateName('DANIEL LURIE')).toBe('DANIEL LURIE')
  })
})

describe('yesShareOf', () => {
  it('handles all observed key shapes', () => {
    expect(yesShareOf({ YES: 3, NO: 1 })).toBeCloseTo(0.75)
    expect(yesShareOf({ Yes: 1, No: 3 })).toBeCloseTo(0.25)
    expect(yesShareOf({ 'BONDS - YES': 390, 'BONDS - NO': 221 })).toBeCloseTo(390 / 611)
  })
  it('returns null with no yes/no votes', () => {
    expect(yesShareOf({})).toBeNull()
    expect(yesShareOf({ YES: 0, NO: 0 })).toBeNull()
  })
})

describe('sharePhrase', () => {
  it('speaks in tenths, never fractions', () => {
    expect(sharePhrase(0.71)).toBe('7 in 10 votes')
    expect(sharePhrase(0.04)).toBe('fewer than 1 in 10 votes')
    expect(sharePhrase(0.97)).toBe('nearly every vote')
  })
})

describe('leaderDisplayName', () => {
  it('shortens a presidential ticket to the top-of-ticket surname', () => {
    expect(leaderDisplayName('KAMALA D. HARRIS / TIM WALZ')).toBe('Harris')
  })
  it('maps yes/no keys to Yes/No', () => {
    expect(leaderDisplayName('BONDS - YES')).toBe('Yes')
    expect(leaderDisplayName('No')).toBe('No')
  })
  it('single-name candidates keep the surname', () => {
    expect(leaderDisplayName('DANIEL LURIE')).toBe('Lurie')
  })
  it('handles summary.json AND-joined tickets (the Winner-card regression)', () => {
    expect(leaderDisplayName('JOSEPH R. BIDEN AND KAMALA D. HARRIS')).toBe('Biden')
    expect(leaderDisplayName('DONALD J. TRUMP AND MICHAEL R. PENCE')).toBe('Trump')
  })
  it('does not split surnames containing AND as a substring', () => {
    expect(leaderDisplayName('MARIA ANDERSON')).toBe('Anderson')
  })
})

describe('displayNhood', () => {
  it('title-cases modern names, keeps legacy abbreviations verbatim', () => {
    expect(displayNhood('BAYVIEW HUNTERS POINT', 'analysis41')).toBe('Bayview Hunters Point')
    expect(displayNhood('CVC CTR/DWTN', 'legacy26')).toBe('CVC CTR/DWTN')
  })
})
