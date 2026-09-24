import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import type { Storefront, StorefrontSnapshot } from '@/lib/storefronts/types'
import { namesLede, ownerReturnedLede } from './restaurantPhrase'
import {
  businessOwnerHref,
  currentOwner,
  dedupeLane,
  displayBusinessName,
  DPH_LOOKUP_URL,
  groupsHere,
  latestReading,
  mailingLine,
  namesLedeInput,
  operatorSpan,
  ownerChips,
  ownerReturnedInput,
  ownersHere,
  ownerYears,
  panelEpisodes,
  REGISTRY_URL,
  sharedAddressesHere,
  statusLine,
  storefrontLabel,
  violationsRecorded,
  type InspectionRow,
} from './storefrontBiography'

const snap = JSON.parse(
  readFileSync(new URL('../../../public/data/restaurants/storefronts.json', import.meta.url), 'utf8'),
) as StorefrontSnapshot
const byKey = new Map(snap.storefronts.map((s) => [s.key, s] as const))
const at = (key: string): Storefront => {
  const s = byKey.get(key)
  if (!s) throw new Error(`fixture storefront missing from snapshot: ${key}`)
  return s
}

// The real 2024+ lane for permit 94600 (Orchids Cafe, 1031 Ocean Ave), fetched
// from data.sf.gov 2026-09-24 with Q4; long violation text trimmed to the
// items that matter. The inspector is public and shown (§11).
const NOTICE =
  '- IMMEDIATE HEALTH PERMIT SUSPENSION AND CLOSURE The permit to operate the above named food facility is hereby ' +
  'temporarily suspended. The Closure placard shall only be removed by an inspector from this Department.'
const VERMIN =
  '114259, 114259.1, 114259.4, 114259.5 - Eliminate the infestation/activity of cockroaches/rodents/flies/vermin ' +
  'from the food facility by using only approved methods.'
const ORCHIDS: InspectionRow[] = [
  {
    inspection_date: '2024-10-09T00:00:00.000',
    permit_number: '94600',
    dba: 'ORCHIDS CAFE',
    inspection_type: 'Routine',
    facility_rating_status: 'Closure',
    violation_count: '2',
    violation_codes: `${NOTICE}., ${VERMIN}`,
    inspector: 'Cristina Fung-Autry',
  },
  {
    inspection_date: '2024-10-10T00:00:00.000',
    permit_number: '94600',
    dba: 'ORCHIDS CAFE',
    inspection_type: 'Reinspection',
    facility_rating_status: 'Pass',
    violation_count: '19',
    violation_codes: '114149-114149.3 - Provide exhaust hoods to remove toxic gases.',
    inspector: 'Cristina Fung-Autry',
  },
  {
    inspection_date: '2025-01-08T00:00:00.000',
    permit_number: '94600',
    dba: 'ORCHIDS CAFE',
    inspection_type: 'Reinspection',
    facility_rating_status: 'Pass',
    violation_count: '8',
    violation_codes: '114099 - Some item.',
    inspector: 'Cristina Fung-Autry',
  },
]

describe('links', () => {
  it('links the city’s own lookup and the registry on the current host only', () => {
    expect(DPH_LOOKUP_URL).toBe('https://inspections.myhealthdepartment.com/san-francisco')
    expect(REGISTRY_URL.startsWith('https://data.sf.gov/')).toBe(true)
  })

  it('links /business/owner/ for COMPANY owners only (§11 — never a person)', () => {
    expect(businessOwnerHref({ name: 'Red Smart LLC', kind: 'company' })).toBe('/business/owner/Red%20Smart%20LLC')
    expect(businessOwnerHref({ name: 'Aguilar Marco', kind: 'individual' })).toBeNull()
    expect(businessOwnerHref({ name: 'Kungfu Noodle Express', kind: 'unknown' })).toBeNull()
    expect(businessOwnerHref(null)).toBeNull()
  })
})

describe('names + dates', () => {
  it('title-cases ALL-CAPS business names and leaves mixed case alone', () => {
    expect(displayBusinessName('THE HUNGRY SPOT')).toBe('The Hungry Spot')
    expect(displayBusinessName("DON PISTO'S")).toBe("Don Pisto's")
    expect(displayBusinessName('Almanac San Francisco')).toBe('Almanac San Francisco')
    expect(displayBusinessName('  ')).toBe('')
  })

  it('spans operators by month and registrations by year', () => {
    expect(operatorSpan({ firstDate: '2016-11-09', lastDate: '2018-08-21' })).toBe('Nov. 2016 – Aug. 2018')
    expect(operatorSpan({ firstDate: '2024-01-10', lastDate: '2024-01-10' })).toBe('Jan. 2024')
    expect(ownerYears({ registeredFrom: '2016-08-04', registeredTo: '2019-08-31' })).toBe('2016–2019')
    expect(ownerYears({ registeredFrom: '2024-02-06', registeredTo: null })).toBe('since 2024')
    expect(ownerYears({ registeredFrom: null, registeredTo: null })).toBe('')
  })

  it('reads violations recorded as a number, never inventing a zero', () => {
    expect(violationsRecorded({ violation_count: '19' })).toBe(19)
    expect(violationsRecorded({ violation_count: '0' })).toBe(0)
    expect(violationsRecorded({ violation_count: undefined })).toBeNull()
    expect(violationsRecorded({ violation_count: '' })).toBeNull()
  })
})

describe('owner continuity (spec §3.7 rule 8)', () => {
  it('2077 Hayes St: the owner came back — never "same owner"', () => {
    expect(ownerChips(at('2077 HAYES ST').operators)).toEqual([null, null, 'owner-returned'])
    const input = ownerReturnedInput(at('2077 HAYES ST'))!
    expect(input).toMatchObject({
      ownerKind: 'company',
      firstName: 'Katani Pizza',
      fromYear: 2016,
      toYear: 2019,
      returnYear: 2024,
      returnName: 'The Hungry Spot',
      ownersBetween: 1,
    })
    expect(ownerReturnedLede(input)).toBe(
      'The company that ran Katani Pizza at 2077 Hayes St from 2016 to 2019 came back in 2024 as The Hungry Spot. ' +
        'One other owner came and went in between.',
    )
  })

  it('570 Green St: one company across a change of names reads "same owner"', () => {
    // Pete's on Green → Chubby Noodle (no registry match) → Don Pisto's (Pete's On Green LLC again).
    expect(ownerChips(at('570 GREEN ST').operators)).toEqual([null, null, 'same-owner', null, null])
    expect(ownerReturnedInput(at('570 GREEN ST'))).toBeNull()
  })

  it('an unresolved operator never gets a chip and never breaks the chain', () => {
    const op = (name: string | null) => ({ owner: name ? { name, kind: 'company' as const, mailCity: null } : null })
    expect(ownerChips([op('A LLC'), op(null), op('A, L.L.C.'), op('B Inc'), op('A LLC')])).toEqual([
      null,
      null,
      'same-owner',
      null,
      'owner-returned',
    ])
  })
})

describe('names lede input', () => {
  it('2704 24th St: five names, all counted by rule 6 — no "so we count" discount', () => {
    const input = namesLedeInput(at('2704 24TH ST'))!
    expect(input.counted).toBe(5)
    expect(input.seenOnce).toBe(0)
    const lede = namesLede(input)
    expect(lede).toMatch(/^Five names have hung over 2704 24th St since 2016: Almanac San Francisco, Seven Stills, Brewvino SF/)
    expect(lede).not.toMatch(/so we count/)
  })

  it('counts only non-strict operators as the discounted ones', () => {
    const sf = at('2704 24TH ST')
    const ghost = { ...sf, operators: sf.operators.map((o, i) => (i === 1 ? { ...o, strict: false } : o)) }
    const input = namesLedeInput(ghost)!
    expect(input).toMatchObject({ seenOnce: 1, counted: 4 })
    expect(namesLede(input)).toMatch(/One of them turns up at a single inspection, so we count four operators\.$/)
  })

  it('stays silent under three names', () => {
    expect(namesLedeInput(at('1195 STOCKTON ST'))).toBeNull()
  })
})

describe('lane rows', () => {
  it('collapses exact duplicates only; a same-day second visit stays', () => {
    const dup = { ...ORCHIDS[0] }
    const secondVisit = { ...ORCHIDS[0], inspection_type: 'Complaint' }
    const out = dedupeLane([ORCHIDS[2], ORCHIDS[0], dup, secondVisit])
    expect(out).toHaveLength(3)
    expect(out.map((r) => r.inspection_date?.slice(0, 10))).toEqual(['2024-10-09', '2024-10-09', '2025-01-08'])
  })
})

describe('latest reading + status line', () => {
  it('a 2024+ reading is "Now:" with the placard word', () => {
    const r = latestReading(at('1031 OCEAN AVE'), ORCHIDS)!
    expect(r).toEqual({ era: 2024, date: '2025-01-08', name: 'Orchids Cafe', placard: 'pass' })
    expect(statusLine(r, 2026)).toBe('Now: Orchids Cafe · latest inspection Jan. 8, 2025: green placard')
  })

  it('a same-date Closure + Pass resolves to Pass (cleared the same day)', () => {
    const lane: InspectionRow[] = [
      { inspection_date: '2025-02-03', permit_number: '1', dba: 'X', facility_rating_status: 'Closure' },
      { inspection_date: '2025-02-03', permit_number: '1', dba: 'X', facility_rating_status: 'Pass' },
    ]
    expect(latestReading(at('1031 OCEAN AVE'), lane)!.placard).toBe('pass')
  })

  it('claims nothing while a permitted storefront’s live lane is unavailable', () => {
    expect(latestReading(at('1031 OCEAN AVE'), null)).toBeNull()
    expect(statusLine(null, 2026)).toBeNull()
  })

  it('an older last record is dated, never "Now"', () => {
    const r = latestReading(at('570 GREEN ST'), []) // pretend the live lane is empty
    // 570 Green's 2020–23 lane ends with Chubby Noodle's yellow placard.
    expect(r).toEqual({ era: 2020, date: '2023-04-26', name: 'Chubby Noodle', placard: 'conditional' })
    expect(statusLine(r, 2026)).toBe('Last inspected April 26, 2023, as Chubby Noodle: yellow placard')
    const s16 = statusLine({ era: 2016, date: '2019-07-11', name: "Pete's on Green", placard: null }, 2026)
    expect(s16).toBe("Last inspected July 11, 2019, as Pete's on Green")
    expect(s16).not.toMatch(/^Now/)
  })

  it('a storefront with no 2024+ permit reads its older records even with no lane', () => {
    const noPermit = snap.storefronts.find((s) => s.permits.length === 0 && s.lanes.placards2020.length > 0)!
    expect(latestReading(noPermit, null)?.era).toBe(2020)
  })
})

describe('closure episodes in the panel', () => {
  const sf = at('1031 OCEAN AVE')

  it('recomputes the 2024+ episodes from the live lane, newest first, both eras listed', () => {
    const out = panelEpisodes(sf, ORCHIDS)
    expect(out.live).toBe(true)
    expect(out.updatedSinceAsOf).toBe(false)
    expect(out.episodes.map((e) => [e.era, e.episode.start, e.episode.clearedOn])).toEqual([
      [2024, '2024-10-09', '2024-10-10'],
      [2020, '2022-06-15', '2022-06-15'],
    ])
    const recent = out.episodes[0]
    expect(recent.name).toBe('Orchids Cafe')
    expect(recent.episode.days).toBe(1)
    expect(recent.familyIds).toContain('vermin')
    expect(recent.familyIds).not.toContain('closure-notice')
    // The suspension notice folds on its own; the items never carry it.
    expect(recent.notices).toHaveLength(1)
    expect(recent.items.some((i) => /IMMEDIATE HEALTH PERMIT SUSPENSION/.test(i.raw))).toBe(false)
    expect(out.episodes[1].episode.sameDay).toBe(true)
  })

  it('says "updated since" when the live lane disagrees with the snapshot', () => {
    const out = panelEpisodes(sf, ORCHIDS.slice(0, 1)) // the clearing pass not (yet) published
    expect(out.updatedSinceAsOf).toBe(true)
    expect(out.episodes[0].episode.clearedOn).toBeNull()
  })

  it('falls back to the snapshot’s episodes without a lane', () => {
    const out = panelEpisodes(sf, null)
    expect(out.live).toBe(false)
    expect(out.updatedSinceAsOf).toBe(false)
    expect(out.episodes.map((e) => e.permit)).toEqual(['94600', '94600'])
    expect(out.episodes[0].familyIds).toEqual(['vermin'])
  })

  it('a storefront never inherits a closure: episodes key on this door’s own permits', () => {
    const out = panelEpisodes(sf, [
      ...ORCHIDS,
      // A row for some other permit is not part of this lane's closures unless
      // the hook fetched it for this door — and when it does, it lists under
      // its own permit, never merged into another's.
      { inspection_date: '2025-03-01', permit_number: '99999', dba: 'OTHER', facility_rating_status: 'Closure' },
    ])
    const keys = out.episodes.filter((e) => e.era === 2024).map((e) => e.permit)
    expect(keys).toEqual(['99999', '94600'])
  })
})

describe('ownership + mailing address from the snapshot', () => {
  it('same owner elsewhere lists visible company owners only', () => {
    const owners = ownersHere(snap, '100 W PORTAL AVE')
    expect(owners.map((o) => o.name)).toContain('Starbucks Corporation')
    for (const o of snap.owners) expect(o.kind).toBe('company')
  })

  it('a shared mailing address is the published FACT, company-only', () => {
    const shared = sharedAddressesHere(snap, '517 HAYES ST')
    const souvla = shared.find((a) => a.address === '460 Grove St')!
    expect(souvla).toBeDefined()
    expect(mailingLine(souvla)).toBe('460 Grove St, San Francisco 94102')
    for (const a of snap.sharedAddresses) for (const c of a.companies) expect(c.length).toBeGreaterThan(0)
  })

  it('curated groups: none shipped yet, and the lookup is empty rather than invented', () => {
    expect(groupsHere(snap, '517 HAYES ST')).toEqual(snap.groups.filter((g) => g.storefronts.includes('517 HAYES ST')))
  })

  it('the current owner is the latest operator’s owner of record', () => {
    expect(currentOwner(at('1195 STOCKTON ST'))).toMatchObject({ name: 'Chen Xiu L', kind: 'individual', mailCity: 'Daly City' })
    expect(currentOwner(at('2077 HAYES ST'))?.name).toBe('Red Smart LLC')
  })

  it('labels a storefront another list points at, even when the snapshot lacks it', () => {
    const idx = new Map(snap.storefronts.map((s) => [s.key, s] as const))
    expect(storefrontLabel(idx, '2077 HAYES ST')).toEqual({ address: '2077 Hayes St', name: 'The Hungry Spot', known: true })
    expect(storefrontLabel(idx, 'NOT A REAL KEY ST')).toMatchObject({ known: false, name: null })
  })
})
