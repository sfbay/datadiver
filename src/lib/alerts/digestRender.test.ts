import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import { summarize, busiestBuckets, bucketByDay, sfDayKey, sfDayLine } from './digestSummary'
import type { LocationDigest, DigestPayload } from './digestRender'
import { mapAltText, renderDigest } from './digestRender'

// Fixed assembly instant for every fixture below — pins the date line, the
// day-header logic, and the late-report threshold to known values.
const NOW = Date.UTC(2026, 6, 15, 19, 0, 0) // 2026-07-15 19:00 UTC = SF noon PDT
const H = 3600_000
const FULL_LABEL = 'Dolores Park, San Francisco, California 94114, United States'

function ev(p: Partial<NormalizedEvent> & { receivedAt: number }): NormalizedEvent {
  return {
    id: `911-realtime:${p.receivedAt}`,
    datasetId: '911-realtime',
    timestamp: new Date(p.receivedAt).toISOString(),
    latitude: 37.7599,
    longitude: -122.4148,
    raw: {},
    ...p,
  }
}

function locFrom(events: NormalizedEvent[], overrides: Partial<LocationDigest> = {}): LocationDigest {
  return {
    label: FULL_LABEL,
    mapUrl: 'https://api.mapbox.com/styles/v1/mapbox/light-v11/static/x/auto/560x280@2x?access_token=pk',
    mapAlt: 'Map — 1 major incident within ½ mi of Dolores Park',
    summary: summarize(events),
    buckets: busiestBuckets(events),
    days: bucketByDay(events, NOW),
    ...overrides,
  }
}

// Two events on "today" (SF calendar day of NOW), both well under 24h old.
const todayEvents: NormalizedEvent[] = [
  ev({ receivedAt: NOW - 2 * H, callType: 'Assault', address: '19th St & Dolores St' }),
  ev({ receivedAt: NOW - 5 * H, datasetId: '311-cases', callType: 'Graffiti', neighborhood: 'Mission' }),
]

// Same two events plus one 30h-old event that lands on the SF-calendar day
// before NOW — spans two DayGroups and carries exactly one late row.
const multiDayEvents: NormalizedEvent[] = [
  ...todayEvents,
  ev({ receivedAt: NOW - 30 * H, callType: 'Shots fired', address: 'Church St & Market St' }),
]

const todayPayload: DigestPayload = {
  windowLabel: 'published since your last digest',
  nowMs: NOW,
  locations: [locFrom(todayEvents)],
}

const multiDayPayload: DigestPayload = {
  windowLabel: 'published since your last digest',
  nowMs: NOW,
  locations: [locFrom(multiDayEvents)],
}

describe('mapAltText', () => {
  it('describes incidents or calm', () => {
    expect(mapAltText('Dolores Park', '½ mi', 2)).toBe('Map — 2 major incidents within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 1)).toBe('Map — 1 major incident within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 0)).toBe('Map — no major incidents within ½ mi of Dolores Park')
  })
})

describe('renderDigest', () => {
  it('subjects with the count, short place, and AP-style date — no commas from the full geocoder label', () => {
    const { subject } = renderDigest(multiDayPayload, 'https://x/unsub')
    expect(subject).toMatch(/^\d+ new reports? near .+ · [A-Z][a-z]+day, /)
    expect(subject).toContain('near Dolores Park')
    expect(subject).not.toContain('San Francisco, California')
  })

  it('embeds the map image with its alt text', () => {
    const { html } = renderDigest(todayPayload, 'https://x/unsub')
    expect(html).toContain('<img')
    expect(html).toContain('alt="Map — 1 major incident within ½ mi of Dolores Park"')
  })

  it('omits the <img> but keeps the alt sentence when mapUrl is null', () => {
    const { html } = renderDigest({ ...todayPayload, locations: [locFrom(todayEvents, { mapUrl: null })] }, 'https://x/unsub')
    expect(html).not.toContain('<img')
    expect(html).toContain('Map — 1 major incident within ½ mi of Dolores Park')
  })

  it('renders the espresso masthead with the date line, and the true stat header (not AT A GLANCE)', () => {
    const { html } = renderDigest(todayPayload, 'https://x/unsub')
    expect(html).toContain('The Last 48')
    expect(html).toContain(sfDayLine(NOW))
    expect(html).not.toContain('AT A GLANCE')
    expect(html).toContain('New report') // true stat header label
  })

  it('labels the hour axis and each block with its time range', () => {
    const { html } = renderDigest(todayPayload, 'https://x/unsub')
    expect(html).toContain('6–11 a.m.') // todayEvents both fall in the morning block
    expect(html).toContain('12 a.m.')
    expect(html).toContain('noon')
  })

  it('renders rows and their locations', () => {
    const { html, text } = renderDigest(todayPayload, 'https://x/unsub')
    expect(html).toContain('Assault')
    expect(html).toContain('19th St &amp; Dolores St') // escaped &
    expect(text).toContain('Assault')
    expect(text).toContain('19th St & Dolores St')
  })

  it('renders a "late report" tag on late rows only', () => {
    const { html } = renderDigest(multiDayPayload, 'https://x/unsub')
    expect(html).toContain('late report')
    const lateCount = (html.match(/late report/g) || []).length
    expect(lateCount).toBe(1) // only the 30h-old event is late

    const { html: freshHtml } = renderDigest(todayPayload, 'https://x/unsub')
    expect(freshHtml).not.toContain('late report')
  })

  it('shows a day header for every DayGroup once the digest spans past "today", and none for a today-only digest', () => {
    const days = bucketByDay(multiDayEvents, NOW)
    expect(days).toHaveLength(2)
    const { html: multiHtml } = renderDigest(multiDayPayload, 'https://x/unsub')
    for (const d of days) expect(multiHtml).toContain(d.dayLabel)
    expect(multiHtml).toContain('border-top:3px double')

    const { html: todayHtml } = renderDigest(todayPayload, 'https://x/unsub')
    expect(todayHtml).not.toContain('border-top:3px double')
  })

  it('escapes user-supplied labels', () => {
    const { html } = renderDigest({ ...todayPayload, locations: [locFrom(todayEvents, { label: '<script>' })] }, 'https://x/unsub')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('renders the busiest-hours bar with the peak cell at full terracotta', () => {
    const { html } = renderDigest(todayPayload, 'https://x/unsub')
    expect(html).toContain('bgcolor="#b85a33"')
  })

  it('mirrors every fact in the plain-text part', () => {
    const { text } = renderDigest(multiDayPayload, 'https://x/unsub')
    expect(text).toContain(sfDayLine(NOW))
    expect(text).toContain('6–11 a.m.')
    expect(text).toContain('(late report)')
    expect(text).toContain('https://x/unsub')
  })
})
