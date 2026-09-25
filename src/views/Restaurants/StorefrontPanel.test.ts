// Server-render smoke test for the storefront biography (vitest runs in node,
// so no DOM: renderToStaticMarkup exercises every section's render path and
// lets the §11 rulings be checked on the markup a reader would get).
import { readFileSync } from 'node:fs'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { MemoryRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import type { Storefront, StorefrontSnapshot } from '@/lib/storefronts/types'
import StorefrontPanel from './StorefrontPanel'
import PlacardRibbon from './PlacardRibbon'
import type { InspectionRow } from './storefrontBiography'

const snap = JSON.parse(
  readFileSync(new URL('../../../public/data/restaurants/storefronts.json', import.meta.url), 'utf8'),
) as StorefrontSnapshot
const at = (key: string): Storefront => snap.storefronts.find((s) => s.key === key)!

function render(storefront: Storefront, lane: InspectionRow[] | null, laneLoading = false): string {
  return renderToStaticMarkup(
    createElement(
      MemoryRouter,
      null,
      createElement(StorefrontPanel, {
        storefront,
        lane,
        laneLoading,
        asOf: snap.asOf,
        onClose: () => {},
        onFlyTo: () => {},
        snapshot: snap,
      }),
    ),
  )
}

const STOCKTON_LANE: InspectionRow[] = [
  {
    inspection_date: '2025-05-06T00:00:00.000',
    permit_number: '06733436',
    dba: 'PACIFIC STREET FISH MARKET',
    inspection_type: 'Routine',
    facility_rating_status: 'Pass',
    violation_count: '2',
    violation_codes: '114099 - Some item., 114259 - Another item.',
    inspector: 'Abel Simon',
  },
]

describe('StorefrontPanel (§11 rulings on the rendered markup)', () => {
  const html = render(at('1195 STOCKTON ST'), STOCKTON_LANE)

  it('shows a private person’s owner name, unlinked, with the plain mailing city', () => {
    expect(html).toContain('Chen Xiu L')
    expect(html).not.toContain('/business/owner/Chen')
    // The city alone — no label, no state, nothing in front of it but the separator.
    expect(html).toContain('· Daly City')
    // The chrome (everything above the data notes) carries no mailing-city
    // label; what a mailing city means lives in the notes (Jesse, 2026-09-24).
    const chrome = html.slice(0, html.indexOf('Data notes'))
    expect(chrome).not.toMatch(/mailing city|lives in|Daly City, Calif|Daly City, CA/i)
  })

  it('withholds a person’s mailing address, with the reason in the data notes', () => {
    expect(html).toContain('Mailing address withheld')
    expect(html).toContain('Data notes')
    expect(html).toContain('https://data.sf.gov/d/g8m3-pdis')
  })

  it('names the inspector on each inspection', () => {
    expect(html).toContain('inspected by Abel Simon')
  })

  it('links the city’s own inspection lookup, never the retired portal host', () => {
    expect(html).toContain('https://inspections.myhealthdepartment.com/san-francisco')
    expect(html).not.toContain(['data', 'sfgov', 'org'].join('.')) // spelled apart: portalHost.test scans src/
  })

  it('keeps only the header in a PNG export', () => {
    expect(html).toMatch(/<header[^>]*>[\s\S]*1195 Stockton St[\s\S]*<\/header><div data-export-ignore/)
  })

  it('never truncates exportable text', () => {
    expect(html).not.toMatch(/\btruncate\b/)
  })
})

describe('StorefrontPanel — company owners, closures, loading', () => {
  it('links company owners and marks the owner who came back (2077 Hayes St)', () => {
    const html = render(at('2077 HAYES ST'), [])
    expect(html).toContain('href="/business/owner/Red%20Smart%20LLC"')
    expect(html).toContain('owner came back')
    expect(html).toContain('came back in 2024 as The Hungry Spot')
  })

  it('lists every closure with its outcome, single and same-day closures included', () => {
    const html = render(at('1031 OCEAN AVE'), null)
    expect(html).toContain('Closures since March 2020')
    expect(html).toContain('Cleared Oct. 10, 2024 — at most one day.')
    expect(html).toContain('Cleared the same day.')
    expect(html).not.toMatch(/still closed|reopened|closed for good/i)
  })

  it('shows skeletons — not absence — while the live lane loads', () => {
    const html = render(at('1031 OCEAN AVE'), null, true)
    expect(html).toContain('checking the latest records')
    expect(html).not.toContain('No inspections published since January 2024')
  })

  it('says the live lane did not load rather than rendering an empty history', () => {
    const html = render(at('1031 OCEAN AVE'), null, false)
    expect(html).toContain('did not load')
  })

  it('publishes a shared mailing address only as the company-only FACT', () => {
    const html = render(at('517 HAYES ST'), [])
    expect(html).toContain('460 Grove St, San Francisco 94102')
    expect(html).toContain('companies list the same mailing address on their city registrations')
    expect(html).not.toMatch(/same (restaurant )?group|common owner(ship)? /i)
  })
})

describe('PlacardRibbon', () => {
  const html = renderToStaticMarkup(
    createElement(PlacardRibbon, { storefront: at('570 GREEN ST'), lane: [], asOf: snap.asOf }),
  )

  it('draws the hatched gaps, the feed-thins tick and rem-sized text', () => {
    expect(html).toContain('<pattern')
    expect(html).toContain('feed thins')
    expect(html).toContain('Not published')
    expect(html).toMatch(/style="font-size:0\.\d+rem/)
    expect(html).not.toMatch(/ font-size="/)
  })

  it('carries names, owners (persons included) and 2016–19 scores', () => {
    expect(html).toContain('Chubby Noodle')
    expect(html).toContain('Aguilar Marco')
    expect(html).toContain('Pete&#x27;s On Green LLC')
    expect(html).toMatch(/>86</) // Pete's on Green, 2017 routine inspection score
  })
})
