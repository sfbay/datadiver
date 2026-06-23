import { describe, it, expect } from 'vitest'
import type { LocationDigest, DigestPayload } from './digestRender'
import { mapAltText, renderDigest } from './digestRender'

function loc(p: Partial<LocationDigest> = {}): LocationDigest {
  return {
    label: 'Dolores Park',
    mapUrl: 'https://api.mapbox.com/styles/v1/mapbox/light-v11/static/x/auto/560x280@2x?access_token=pk',
    mapAlt: 'Map — 1 major incident within ½ mi of Dolores Park',
    summary: {
      total: 3,
      byStream: { '911-realtime': 2, 'fire-ems-dispatch': 0, '311-cases': 1 },
      significant: 1,
      busiestLabel: '2–3 p.m.',
    },
    buckets: [0, 0, 0, 0, 1, 0, 0, 2, 0, 0, 0, 0],
    blocks: [
      {
        key: 'afternoon',
        label: 'AFTERNOON',
        rows: [
          { id: '911-realtime:2', clock: '2:35 p.m.', streamLabel: '911 calls', what: 'Assault', neighborhood: 'Mission', significant: true, receivedAt: 2 },
          { id: '311-cases:1', clock: '1:50 p.m.', streamLabel: '311 reports', what: 'Graffiti', neighborhood: 'Mission', significant: false, receivedAt: 1 },
        ],
      },
    ],
    ...p,
  }
}

describe('mapAltText', () => {
  it('describes incidents or calm', () => {
    expect(mapAltText('Dolores Park', '½ mi', 2)).toBe('Map — 2 major incidents within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 1)).toBe('Map — 1 major incident within ½ mi of Dolores Park')
    expect(mapAltText('Dolores Park', '½ mi', 0)).toBe('Map — no major incidents within ½ mi of Dolores Park')
  })
})

describe('renderDigest', () => {
  const payload: DigestPayload = { windowLabel: 'past 24 hours', locations: [loc()] }

  it('subjects on the total event count', () => {
    expect(renderDigest(payload, 'https://x/unsub').subject).toBe('DataDiver: 3 new events near you')
  })

  it('embeds the map image with its alt text', () => {
    const { html } = renderDigest(payload, 'https://x/unsub')
    expect(html).toContain('<img')
    expect(html).toContain('alt="Map — 1 major incident within ½ mi of Dolores Park"')
  })

  it('omits the <img> but keeps the alt sentence when mapUrl is null', () => {
    const { html } = renderDigest({ ...payload, locations: [loc({ mapUrl: null })] }, 'https://x/unsub')
    expect(html).not.toContain('<img')
    expect(html).toContain('Map — 1 major incident within ½ mi of Dolores Park')
  })

  it('renders the summary band, block heads, and rows', () => {
    const { html, text } = renderDigest(payload, 'https://x/unsub')
    expect(html).toContain('AT A GLANCE')
    expect(html).toContain('AFTERNOON')
    expect(html).toContain('Assault')
    expect(html).toContain('2–3 p.m.')        // busiest window
    expect(html).toContain('/live?event=911-realtime%3A2') // event deep link
    // the text part carries the same facts for non-HTML clients
    expect(text).toContain('AFTERNOON')
    expect(text).toContain('2:35 p.m.')
    expect(text).toContain('Assault')
    expect(text).toContain('https://x/unsub')
  })

  it('escapes user-supplied labels', () => {
    const { html } = renderDigest({ ...payload, locations: [loc({ label: '<script>' })] }, 'https://x/unsub')
    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })
})
