import { describe, it, expect } from 'vitest'
import type { NormalizedEvent } from '@/types/last48'
import { summarize, busiestBuckets, bucketByDay, sfDayKey, sfDayLine } from './digestSummary'
import type { LocationDigest, DigestPayload } from './digestRender'
import { mapAltText, renderDigest } from './digestRender'
import type { ReleasedGroup, Summary } from './digestSummary.js'

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
    released: [],
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
    expect(html).toContain('>New</div>') // true stat header lead label
    expect(html).toContain('>Significant</div>') // significant elevated to the top line
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

describe('placeShort edge (coordinate-fallback labels)', () => {
  it('keeps the full coordinate pair for label-less pins', () => {
    const events = [ev({ id: 'x1', datasetId: '911-realtime', receivedAt: NOW - 3600_000, callType: 'Suspicious person', address: '16th St & Church St', latitude: 37.76, longitude: -122.42 })]
    const payload = {
      windowLabel: 'published since your last digest',
      nowMs: NOW,
      locations: [{
        label: '37.764, -122.429',
        mapUrl: null,
        mapAlt: 'Map — no major incidents',
        summary: summarize(events),
        buckets: busiestBuckets(events),
        days: bucketByDay(events, NOW),
        released: [],
      }],
    }
    const { subject } = renderDigest(payload, 'https://x.test/u')
    expect(subject).toContain('near 37.764, -122.429')
  })
})

function releasedPayload(released: ReleasedGroup[], byStream: Record<string, number>) {
  const summary: Summary = {
    total: Object.values(byStream).reduce((a, b) => a + b, 0),
    byStream,
    significant: 1,
    busiestLabel: null,
  }
  return {
    windowLabel: 'published since your last digest',
    nowMs: Date.parse('2026-07-16T19:00:00Z'),
    locations: [{
      label: '77 Chula Lane',
      mapUrl: null,
      mapAlt: 'Map — 1 major incident within ¼ mi of 77 Chula Lane',
      summary,
      buckets: new Array(12).fill(0),
      days: [],
      released,
    }],
  }
}

const releasedFixture: ReleasedGroup[] = [
  {
    streamId: 'traffic-crashes',
    heading: 'crash reports',
    note: 'The city releases crash data in batches, roughly 4–6 weeks behind — these reports appeared in the latest release.',
    rows: [
      { id: 'traffic-crashes:1', dateLabel: 'May 14', datasetId: 'traffic-crashes',
        what: 'Vehicle-pedestrian crash — one person killed', location: 'Mission St & 16th St',
        significant: true, eventMs: 0 },
    ],
  },
  {
    streamId: 'business-openings',
    heading: 'business openings',
    note: 'Newly registered business locations near you, from city data — refreshed nightly.',
    rows: [
      { id: 'business-openings:2', dateLabel: 'Jul 13', datasetId: 'business-openings',
        what: 'New business — Blue Ramen (food services)', location: '455 Valencia St',
        significant: false, eventMs: 0 },
    ],
  },
]

describe('released section', () => {
  const byStream = { 'traffic-crashes': 1, 'business-openings': 1 }
  it('renders a Times-rule head, the framing note, and date-labeled rows in stream pigment', () => {
    const { html, text } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).toMatch(/CRASH REPORTS <span[^>]*>&#183; NEWLY RELEASED<\/span>/)
    expect(html).toContain('appeared in the latest release')
    expect(html).toContain('May 14')
    expect(html).toContain('#963e30') // crash tag pigment
    expect(html).toContain('#5c9693') // business tag pigment
    expect(html).toContain('Vehicle-pedestrian crash')
    expect(text).toContain('CRASH REPORTS · NEWLY RELEASED')
    expect(text).toContain('[BUSINESS] New business — Blue Ramen')
  })
  it('reader-facing output never says "periodic"', () => {
    const { html, text } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).not.toMatch(/periodic/i)
    expect(text).not.toMatch(/periodic/i)
  })
  it('released streams join the stat-header cells via byStream counts', () => {
    const { html } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).toContain('>CRASH</div>')
    expect(html).toContain('>BUSINESS</div>')
  })
  it('four+ active streams wrap the pigment plates onto their own row', () => {
    const five = {
      '911-realtime': 2, 'fire-ems-dispatch': 2, '311-cases': 3,
      'traffic-crashes': 2, 'business-openings': 2,
    }
    const { html } = renderDigest(releasedPayload(releasedFixture, five), 'https://u')
    // The hairline divider cell exists only in the single-row form; its
    // absence + all five tags present = the wrapped layout rendered.
    expect(html).not.toContain('<td width="1"')
    for (const tag of ['911', 'FIRE/EMS', '311', 'CRASH', 'BUSINESS'])
      expect(html).toContain(`>${tag}</div>`)
    // Wrapped form drops the "Reports" row-head; the first legend field
    // carries the definition instead.
    expect(html).toContain('>New reports</div>')
    expect(html).not.toContain('>Reports</div>')
  })
  it('three or fewer streams keep the locked single-row header', () => {
    const { html } = renderDigest(releasedPayload(releasedFixture, byStream), 'https://u')
    expect(html).toContain('<td width="1"')
  })
})
