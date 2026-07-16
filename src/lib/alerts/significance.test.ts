import { describe, it, expect } from 'vitest'
import { classifyCallType, classifySignificant, recencyBoost, timeAgo, spellNumber, SIGNIFICANCE_KEYS } from './significance'
import type { NormalizedEvent } from '@/types/last48'
import type { AlertEvent } from './streams'

function ev(partial: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: 'x', datasetId: '911-realtime', timestamp: '', receivedAt: 0,
    raw: {}, ...partial,
  } as NormalizedEvent
}

describe('classifySignificant', () => {
  it('classifies a shooting (911)', () => {
    expect(classifySignificant(ev({ callType: 'Shooting' }))?.plural).toBe('shootings')
  })
  it('classifies a structure fire (fire/ems)', () => {
    expect(classifySignificant(ev({ datasetId: 'fire-ems-dispatch', callType: 'Structure Fire' }))?.plural).toBe('fires')
  })
  it('returns null for routine calls', () => {
    expect(classifySignificant(ev({ callType: 'Traffic Stop' }))).toBeNull()
  })
  it('never classifies 311', () => {
    expect(classifySignificant(ev({ datasetId: '311-cases', callType: 'Encampment' }))).toBeNull()
  })
})

describe('classifyCallType (string-level, for the ticker tally)', () => {
  it('classifies a raw call-type label without an event', () => {
    expect(classifyCallType('Robbery, Armed')?.plural).toBe('robberies')
    expect(classifyCallType('Working Fire')?.plural).toBe('fires')
  })
  it('returns null for routine labels', () => {
    expect(classifyCallType('Traffic Stop')).toBeNull()
    expect(classifyCallType('')).toBeNull()
  })
})

describe('recencyBoost', () => {
  it('is highest for brand-new events and ~0 at the window edge', () => {
    const now = 48 * 3600_000
    expect(recencyBoost(now, now)).toBeGreaterThan(28)
    expect(recencyBoost(0, now)).toBeLessThan(2)
  })
})

describe('spellNumber', () => {
  it('spells 3-9, digits otherwise', () => {
    expect(spellNumber(3)).toBe('Three')
    expect(spellNumber(12)).toBe('12')
  })
})

describe('timeAgo', () => {
  it('formats minutes and hours', () => {
    const now = 10 * 3600_000
    expect(timeAgo(now - 8 * 60_000, now)).toBe('8 minutes ago')
    expect(timeAgo(now - 2 * 3600_000, now)).toBe('2 hours ago')
  })
})

describe('classifySignificant — released streams', () => {
  const crash = (raw: Record<string, unknown>): AlertEvent =>
    ({ id: 'traffic-crashes:1', datasetId: 'traffic-crashes', timestamp: '', receivedAt: 0, raw }) as AlertEvent

  it('fatal + severe-injury crashes are significant', () => {
    expect(classifySignificant(crash({ collision_severity: 'Fatal', number_killed: '1' }))?.key).toBe('crash-severe')
    expect(classifySignificant(crash({ collision_severity: 'Injury (Severe)', number_killed: '0' }))?.key).toBe('crash-severe')
  })
  it('lesser-injury crashes are not', () => {
    expect(classifySignificant(crash({ collision_severity: 'Injury (Complaint of Pain)', number_killed: '0' }))).toBeNull()
  })
  it('business openings are never significant', () => {
    const biz = { id: 'business-openings:1', datasetId: 'business-openings', timestamp: '', receivedAt: 0, headline: 'New business — Gun Range LLC', raw: {} } as AlertEvent
    expect(classifySignificant(biz)).toBeNull()
  })
  it('crash-severe is NOT in the subscriber category vocabulary', () => {
    expect(SIGNIFICANCE_KEYS).not.toContain('crash-severe')
  })
})
