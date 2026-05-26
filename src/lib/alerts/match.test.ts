// src/lib/alerts/match.test.ts
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import type { MatchableSubscription } from './types'
import { haversineMiles, eventMatchesSubscription, isSubscriptionDue } from './match'

const SF_CITY_HALL = { lat: 37.7793, lng: -122.4193 }
const FERRY_BLDG = { lat: 37.7955, lng: -122.3937 }

function ev(p: Partial<NormalizedEvent>): NormalizedEvent {
  return {
    id: '911-realtime:1',
    datasetId: '911-realtime',
    timestamp: '2026-05-24T12:00:00',
    receivedAt: 1_000,
    latitude: SF_CITY_HALL.lat,
    longitude: SF_CITY_HALL.lng,
    raw: {},
    ...p,
  }
}

function sub(p: Partial<MatchableSubscription>): MatchableSubscription {
  return {
    filters: { streams: ['911-realtime'], categories: [] },
    radiusMiles: 0.5,
    locations: [{ ...SF_CITY_HALL }],
    ...p,
  }
}

describe('haversineMiles', () => {
  it('is ~0 for identical points', () => {
    expect(haversineMiles(SF_CITY_HALL, SF_CITY_HALL)).toBeCloseTo(0, 5)
  })
  it('measures City Hall → Ferry Building at ~1.5 mi', () => {
    const d = haversineMiles(SF_CITY_HALL, FERRY_BLDG)
    expect(d).toBeGreaterThan(1.3)
    expect(d).toBeLessThan(2.0)
  })
})

describe('eventMatchesSubscription', () => {
  it('matches an in-radius event on a subscribed stream', () => {
    expect(eventMatchesSubscription(ev({ receivedAt: 5_000 }), sub({}), 0)).toBe(true)
  })
  it('rejects events at/below the watermark', () => {
    expect(eventMatchesSubscription(ev({ receivedAt: 5_000 }), sub({}), 5_000)).toBe(false)
  })
  it('rejects a stream the subscription did not pick', () => {
    expect(
      eventMatchesSubscription(ev({ datasetId: '311-cases', receivedAt: 9 }), sub({}), 0),
    ).toBe(false)
  })
  it('applies the significance-category filter', () => {
    const shooting = ev({ callType: 'Shooting', receivedAt: 9 })
    const noise = ev({ callType: 'Noise complaint', receivedAt: 9 })
    const s = sub({ filters: { streams: ['911-realtime'], categories: ['shooting'] } })
    expect(eventMatchesSubscription(shooting, s, 0)).toBe(true)
    expect(eventMatchesSubscription(noise, s, 0)).toBe(false)
  })
  it('rejects out-of-radius events', () => {
    expect(
      eventMatchesSubscription(
        ev({ latitude: FERRY_BLDG.lat, longitude: FERRY_BLDG.lng, receivedAt: 9 }),
        sub({ radiusMiles: 0.5 }),
        0,
      ),
    ).toBe(false)
  })
  it('matches if within radius of ANY location', () => {
    const s = sub({ locations: [{ ...SF_CITY_HALL }, { ...FERRY_BLDG }], radiusMiles: 0.25 })
    expect(
      eventMatchesSubscription(
        ev({ latitude: FERRY_BLDG.lat, longitude: FERRY_BLDG.lng, receivedAt: 9 }),
        s,
        0,
      ),
    ).toBe(true)
  })
  it('rejects events with no coordinates', () => {
    expect(
      eventMatchesSubscription(ev({ latitude: undefined, longitude: undefined, receivedAt: 9 }), sub({}), 0),
    ).toBe(false)
  })
})

describe('isSubscriptionDue', () => {
  const DAY = 24 * 60 * 60_000
  it('is due when never sent', () => {
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: null, active: true }, 1_000)).toBe(true)
  })
  it('is not due an hour after a daily send', () => {
    const now = 10 * DAY
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - 60 * 60_000, active: true }, now)).toBe(false)
  })
  it('is due ~24h after a daily send', () => {
    const now = 10 * DAY
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - DAY, active: true }, now)).toBe(true)
  })
  it('is never due when inactive', () => {
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: null, active: false }, 1_000)).toBe(false)
  })
})
