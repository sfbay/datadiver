// src/lib/alerts/match.test.ts
import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import type { MatchableSubscription } from './types'
import { haversineMiles, eventMatchesSubscription, isSubscriptionDue, releasedEventMatches } from './match'
import type { AlertStreamId, AlertEvent } from './streams.js'

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
  it('measures City Hall → Ferry Building at ~1.8 mi', () => {
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
  it('rejects all events when no locations are configured', () => {
    expect(eventMatchesSubscription(ev({ receivedAt: 9 }), sub({ locations: [] }), 0)).toBe(false)
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
  it('is due at exactly interval - slack, not one ms before', () => {
    const now = 10 * DAY
    const SLACK = 60 * 60_000
    const threshold = 24 * 60 * 60_000 - SLACK
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - threshold, active: true }, now)).toBe(true)
    expect(isSubscriptionDue({ cadence: 'daily', lastSentAt: now - threshold + 1, active: true }, now)).toBe(false)
  })
  it('hourly fires after ~60 min, not on the next tick', () => {
    const now = 5 * 60 * 60_000
    expect(isSubscriptionDue({ cadence: 'hourly', lastSentAt: now - 55 * 60_000, active: true }, now)).toBe(false)
    expect(isSubscriptionDue({ cadence: 'hourly', lastSentAt: now - 65 * 60_000, active: true }, now)).toBe(true)
  })
  it('weekly fires after ~7 days', () => {
    const now = 30 * DAY
    expect(isSubscriptionDue({ cadence: 'weekly', lastSentAt: now - 6 * DAY, active: true }, now)).toBe(false)
    expect(isSubscriptionDue({ cadence: 'weekly', lastSentAt: now - 7 * DAY, active: true }, now)).toBe(true)
  })
})

describe('releasedEventMatches', () => {
  const sub = {
    filters: { streams: ['traffic-crashes'] as AlertStreamId[], categories: ['shooting'] },
    radiusMiles: 0.25,
    locations: [{ lat: 37.7654, lng: -122.4197 }],
  }
  const crash = (over: Partial<AlertEvent> = {}): AlertEvent =>
    ({ id: 'traffic-crashes:1', datasetId: 'traffic-crashes', timestamp: '', receivedAt: 0,
       latitude: 37.7654, longitude: -122.4197, raw: {}, ...over }) as AlertEvent

  it('matches in-radius events on a subscribed stream', () => {
    expect(releasedEventMatches(crash(), sub)).toBe(true)
  })
  it('IGNORES the categories filter (911/Fire-only stays true)', () => {
    // sub.categories = ['shooting'] would reject this via the live matcher;
    // released matching must not consult categories at all.
    expect(releasedEventMatches(crash(), sub)).toBe(true)
  })
  it('rejects off-stream, geo-less, and out-of-radius events', () => {
    expect(releasedEventMatches(crash({ datasetId: 'business-openings' }), sub)).toBe(false)
    expect(releasedEventMatches(crash({ latitude: undefined }), sub)).toBe(false)
    expect(releasedEventMatches(crash({ latitude: 37.8, longitude: -122.5 }), sub)).toBe(false)
  })
})
