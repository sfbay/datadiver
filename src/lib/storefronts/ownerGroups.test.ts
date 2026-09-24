import { describe, expect, it } from 'vitest'
import {
  AGENT_MAILING_KEYS,
  brandKey,
  contractOperatorOf,
  CONTRACT_OPERATORS,
  franchiseBrands,
  mailingKey,
  ownerGroupKey,
  sharedMailingAddresses,
  visibleOwners,
} from './ownerGroups'
import type { RegistryRow } from './registryRows'

// Owner names, trade names, business and mailing addresses below are real
// open g8m3-pdis registrations (probed live on data.sf.gov 2026-09-24) unless
// the name says Example/Person/Agent.

let n = 0
const reg = (r: Partial<RegistryRow>): RegistryRow => ({
  uniqueid: `u${++n}`,
  self_reported_naics_code: '722511',
  mail_zipcode: '94123',
  mail_city: 'San Francisco',
  ...r,
})

const SUPER_DUPER: RegistryRow[] = [
  ['Eburger LLC', '2201 Chestnut St'],
  ['Metburger LLC', '783 Mission St'],
  ['3401 California Street LLC', '3401 California St'],
  ['Super Irving Street, LLC', '737 Irving St'],
  ['J Burger LLC', '721 Market St'],
  ['1701 Fillmore Street, LLC', '1701 Fillmore St'],
].map(([owner, addr]) => reg({ ownership_name: owner, dba_name: 'Super Duper', full_business_address: addr, mailing_address_1: '2020 Union St' }))

const SUBWAY: RegistryRow[] = [
  reg({ ownership_name: 'Abhisri Inc', dba_name: 'Subway', full_business_address: '350 Bay St Ste 1', mailing_address_1: '350 Bay St Ste 14' }),
  reg({ ownership_name: 'Abhisri Inc', dba_name: 'Subway', full_business_address: '750 Font Blvd', mailing_address_1: '350 Bay St Ste 14' }),
  reg({ ownership_name: 'Sriabhi Foods Inc', dba_name: 'Subway', full_business_address: '397 Golden Gate Ave', mailing_address_1: '9916 Brunswick Way', mail_city: 'San Ramon' }),
  reg({ ownership_name: 'Rukshana & Muntaz & Sons LLC', dba_name: 'Subway #50281', full_business_address: '147 Mason St', mailing_address_1: '151 Francisco Dr', mail_city: 'South San Francisco' }),
  reg({ ownership_name: 'Arash Shahvali', dba_name: 'Subway #51109', full_business_address: '177 Townsend St', mailing_address_1: '177 Townsend St Unit 200' }),
  reg({ ownership_name: 'Yan May', dba_name: 'Subway Sandwiches #24254', full_business_address: '200 Pine St', mailing_address_1: '2434 24th Ave' }),
  reg({ ownership_name: 'Bayshore Associates LLC', dba_name: 'Subway Real Estate Corp', full_business_address: '940 Market St C-111', self_reported_naics_code: '531' }),
]

const ARAMARK: RegistryRow[] = ['24 Willie Mays Plz # Promen', '1 Warriors Way', '55 Music Concourse Dr', '900 Beach St'].map((addr) =>
  reg({ ownership_name: 'Aramark Services, Inc.', dba_name: 'Aramark', full_business_address: addr, mailing_address_1: '2400 Market St 6 Fl', mail_city: 'Philadelphia', mail_zipcode: '19103' }),
)

describe('ownerGroupKey / contract operators', () => {
  it('folds punctuation and legal forms for grouping only', () => {
    expect(ownerGroupKey('Guckenheimer Services LLC')).toBe(ownerGroupKey('Guckenheimer Services, LLC'))
    expect(ownerGroupKey("Pete's On Green LLC")).toBe('PETES ON GREEN')
    expect(ownerGroupKey('Rukshana & Muntaz & Sons LLC')).toBe('RUKSHANA AND MUNTAZ AND SONS')
  })

  it('each contract operator matches its real registered names', () => {
    const REAL: Record<string, string[]> = {
      aramark: ['Aramark Services, Inc.'],
      compass: ['Compass Group Usa Inc', 'Compass California II Inc', 'Compass Group, Nad'],
      levy: ['Levy Restaurants'],
      'bon-appetit': ['Bon Appetit Management Co'],
      sodexo: ['Sodexo America LLC', 'Sodexo Operations, LLC', 'Sodexo Magic LLC'],
      smg: ['Smg'],
      guckenheimer: ['Guckenheimer Services LLC', 'Guckenheimer Enterprises Inc'],
      avatar: ['Avatar Foods International Inc'],
      'events-management': ['Events Management Inc'],
      'service-systems': ['Service Systems Associates Inc'],
    }
    for (const c of CONTRACT_OPERATORS) {
      expect(REAL[c.id], c.id).toBeDefined()
      for (const name of REAL[c.id]) expect(contractOperatorOf(name), name).toBe(c.id)
    }
  })

  it('does not catch look-alike names', () => {
    for (const name of [
      'Horvitz & Levy Llp', 'Compassionate Tides Licensed Clinical Social Worker, Inc', 'Smg Communications In',
      'Levy Family Trust', 'Encompass Group LLC', 'Lifeworks-Aramark', 'Avatarrx', 'Compass Capital Corporation',
    ]) {
      expect(contractOperatorOf(name), name).toBeNull()
    }
  })
})

describe('visibleOwners — "registered to one company at 3+ storefronts"', () => {
  const rows = [
    ...ARAMARK,
    ...SUBWAY,
    // a PERSON at three storefronts: never listed (§11 — no holdings-by-person tool)
    ...['1 Main St', '2 Main St', '3 Main St'].map((a) => reg({ ownership_name: 'Person Example', dba_name: 'Example Tacos', full_business_address: a })),
    // a company at three storefronts, one registration closed
    ...['10 Oak St', '20 Oak St'].map((a) => reg({ ownership_name: 'Example Foods LLC', dba_name: 'Example Deli', full_business_address: a })),
    reg({ ownership_name: 'Example Foods, LLC', dba_name: 'Example Deli #3', full_business_address: '30 Oak St', location_end_date: '2020-01-01T00:00:00.000' }),
  ]
  const owners = visibleOwners(rows)

  it('lists companies with 3+ open food storefronts, contract operators flagged', () => {
    expect(owners.map((o) => [o.name, o.storefronts.length, o.contract])).toEqual([['Aramark Services, Inc.', 4, 'aramark']])
    expect(owners[0]).toMatchObject({ kind: 'company', mailCity: 'Philadelphia', brands: ['Aramark'] })
  })

  it('never lists a natural person, and counts only open registrations', () => {
    expect(owners.find((o) => o.name === 'Person Example')).toBeUndefined()
    expect(owners.find((o) => o.name.startsWith('Example Foods'))).toBeUndefined()
    expect(visibleOwners(rows, { minStorefronts: 2 }).map((o) => o.name)).toContain('Example Foods LLC')
  })

  it('an undeliverable owner carries no mail city', () => {
    const vanburen = ['1500 Fillmore St', '5650 Geary Blvd', '376 Larkin St'].map((a) =>
      reg({ ownership_name: 'Vanburen Enterprises Inc', dba_name: 'Subway', full_business_address: a, mailing_address_1: '0000 Undeliverable Mail', mail_zipcode: '99999' }))
    expect(visibleOwners(vanburen)[0]).toMatchObject({ name: 'Vanburen Enterprises Inc', mailCity: null })
  })
})

describe('franchiseBrands — one sign, many owners', () => {
  it('brandKey drops store numbers and legal forms', () => {
    expect(brandKey('Subway #50281')).toBe('SUBWAY')
    expect(brandKey('Subway 30303')).toBe('SUBWAY')
    expect(brandKey('Subway Sandwiches #24254')).toBe('SUBWAY SANDWICHES')
    expect(brandKey('Super Duper Burgers')).toBe('SUPER DUPER BURGERS')
    expect(brandKey('Club 21')).toBe('CLUB 21') // a short number is part of a name
    expect(brandKey('500 Club')).toBe('500 CLUB') // …and so is a leading one
  })

  it('folds Subway spellings onto one brand, owners of every kind listed with their kind', () => {
    const [subway] = franchiseBrands(SUBWAY)
    expect(subway.brand).toBe('Subway')
    expect(subway.owners.map((o) => o.name)).toEqual([
      'Abhisri Inc', 'Arash Shahvali', 'Rukshana & Muntaz & Sons LLC', 'Sriabhi Foods Inc', 'Yan May',
    ])
    expect(subway.owners.find((o) => o.name === 'Yan May')?.kind).toBe('individual')
    expect(subway.locations).toBe(6) // the real-estate company is not a food row
  })

  it('Super Duper: six locations, six companies', () => {
    const brands = franchiseBrands(SUPER_DUPER)
    expect(brands.map((b) => [b.brand, b.locations, b.owners.length])).toEqual([['Super Duper', 6, 6]])
  })

  it('one owner at many locations is a chain, not a franchise', () => {
    expect(franchiseBrands(ARAMARK)).toEqual([])
  })

  it('never roots a brand on a generic word', () => {
    const cafes = ['Cafe Alpha', 'Cafe Bravo', 'Cafe Charlie', 'Cafe'].map((d, i) =>
      reg({ ownership_name: `Owner ${i} LLC`, dba_name: d, full_business_address: `${i + 1} Pine St` }))
    expect(franchiseBrands(cafes)).toEqual([])
  })

  it('never folds unrelated trade names that merely share a first word', () => {
    // The old word-prefix fold published 'Dumpling 101' at 16 owners and
    // '500 Club' at 13 from rows like these.
    const dumplings = ['Dumpling 101', 'Dumpling Home', 'Dumpling Time', 'Dumpling Kitchen'].map((d, i) =>
      reg({ ownership_name: `Owner ${i} LLC`, dba_name: d, full_business_address: `${i + 1} Pine St` }))
    expect(franchiseBrands(dumplings)).toEqual([])
    const clubs = ['500 Club', 'Club 181', 'The Club', 'Club Deluxe'].map((d, i) =>
      reg({ ownership_name: `Owner ${i} LLC`, dba_name: d, full_business_address: `${i + 1} Bush St` }))
    expect(franchiseBrands(clubs)).toEqual([])
  })

  it('a numbered generic name is not a brand', () => {
    const phos = ['Pho #1', 'Pho 808', 'Pho 2000', 'Cafe 101'].map((d, i) =>
      reg({ ownership_name: `Owner ${i} LLC`, dba_name: d, full_business_address: `${i + 1} Clement St` }))
    expect(franchiseBrands(phos)).toEqual([])
  })
})

describe('mailingKey', () => {
  it('normalizes spelling and keeps the suite', () => {
    expect(mailingKey({ mailing_address_1: '2020 Union Street', mail_zipcode: '94123' })).toBe('2020 UNION ST | 94123')
    expect(mailingKey({ mailing_address_1: '2020 Union St.', mail_zipcode: '94123-1234' })).toBe('2020 UNION ST | 94123')
    expect(mailingKey({ mailing_address_1: '2261 Market St # 22513', mail_zipcode: '94114' })).toBe('2261 MARKET ST 22513 | 94114')
    expect(mailingKey({ mailing_address_1: '', mail_zipcode: '94114' })).toBeNull()
  })
})

describe('sharedMailingAddresses — the FACT, after F1–F5', () => {
  const agentRows = Array.from({ length: 16 }, (_, i) =>
    reg({
      ownership_name: `Agent Client ${i} LLC`,
      dba_name: `Client ${i}`,
      full_business_address: `${100 + i} Folsom St`,
      mailing_address_1: '1 Agent Plaza',
      mail_zipcode: '94105',
      self_reported_naics_code: i < 3 ? '722511' : '541211',
    }))
  const undeliverable = ['Brew Vino, LLC', 'Vanburen Enterprises Inc'].map((o, i) =>
    reg({ ownership_name: o, dba_name: `Bar ${i}`, full_business_address: `${i + 1} 24th St`, mailing_address_1: '0000 Undeliverable Mail', mail_zipcode: '99999' }))
  const listedAgent = ['Mailbox One LLC', 'Mailbox Two LLC'].map((o, i) =>
    reg({ ownership_name: o, dba_name: `Box ${i}`, full_business_address: `${i + 1} Castro St`, mailing_address_1: '548 Market St', mail_zipcode: '94104' }))
  const incubator = ['Cocina One LLC', 'Cocina Two LLC'].map((o, i) =>
    reg({ ownership_name: o, dba_name: `Stall ${i}`, full_business_address: `${i + 1} Valencia St`, mailing_address_1: '2948 Folsom St', mail_zipcode: '94110' }))
  const homeWithPerson = [
    reg({ ownership_name: 'Example Tacos LLC', dba_name: 'Example Tacos', full_business_address: '1 Irving St', mailing_address_1: '99 Home Ave', mail_zipcode: '94122' }),
    reg({ ownership_name: 'Example Pho LLC', dba_name: 'Example Pho', full_business_address: '2 Irving St', mailing_address_1: '99 Home Ave', mail_zipcode: '94122' }),
    // a person's own registration (any sector) at the same mailing address → possibly a home
    reg({ ownership_name: 'Person Example', dba_name: 'Consulting', full_business_address: '99 Home Ave', mailing_address_1: '99 Home Ave', mail_zipcode: '94122', self_reported_naics_code: '541611' }),
  ]
  const foodBuilding = [
    reg({ ownership_name: 'Example Quince LLC', dba_name: 'Example Quince', full_business_address: '470 Pacific Ave', mailing_address_1: '470 Pacific Ave', mail_zipcode: '94133' }),
    reg({ ownership_name: 'Example Cotogna LLC', dba_name: 'Example Cotogna', full_business_address: '490 Pacific Ave', mailing_address_1: '470 Pacific Ave', mail_zipcode: '94133' }),
    reg({ ownership_name: 'Other Tenant One Inc', dba_name: 'Tenant One', full_business_address: '470 Pacific Ave', mailing_address_1: '1 Elsewhere St', mail_zipcode: '94133' }),
    reg({ ownership_name: 'Other Tenant Two Inc', dba_name: 'Tenant Two', full_business_address: '470 Pacific Ave', mailing_address_1: '2 Elsewhere St', mail_zipcode: '94133' }),
  ]
  const result = sharedMailingAddresses([
    ...SUPER_DUPER, ...agentRows, ...undeliverable, ...listedAgent, ...incubator, ...homeWithPerson, ...foodBuilding,
  ])

  it('publishes 2020 Union St as a company-only shared address', () => {
    const union = result.published.find((a) => a.key === '2020 UNION ST | 94123')
    expect(union).toBeDefined()
    expect(union!.companies).toHaveLength(6)
    expect(union!).toMatchObject({ address: '2020 Union St', city: 'San Francisco', zip: '94123', brands: ['Super Duper'], foodBuilding: false })
    expect(union!.storefronts).toContain('783 MISSION ST')
  })

  it('F1 undeliverable, F2 agent share, F3 authored agent list, F5 incubator venue', () => {
    expect(result.removed).toEqual({ undeliverable: 1, agentShare: 1, agentList: 1, venue: 1 })
    const keys = result.queue.map((c) => c.key)
    expect(keys).not.toContain('1 AGENT PLAZA | 94105')
    expect(keys).not.toContain('2948 FOLSOM ST | 94110')
    expect(AGENT_MAILING_KEYS.has('548 MARKET ST | 94104')).toBe(true)
  })

  it('withholds an address where any registration is not a company — but queues it for review', () => {
    expect(result.published.find((a) => a.key === '99 HOME AVE | 94122')).toBeUndefined()
    expect(result.withheldCount).toBe(1)
    const queued = result.queue.find((c) => c.key === '99 HOME AVE | 94122')
    expect(queued).toMatchObject({ allCompanies: false })
  })

  it('F4 flags — never drops — a mailing address that is itself a building with 3+ food tenants', () => {
    const pacific = result.published.find((a) => a.key === '470 PACIFIC AVE | 94133')
    expect(pacific?.foodBuilding).toBe(true)
  })

  it('publishes no field that could carry a person', () => {
    for (const a of result.published) {
      expect(Object.keys(a).sort()).toEqual(['address', 'brands', 'city', 'companies', 'foodBuilding', 'key', 'storefronts', 'zip'])
    }
    expect(JSON.stringify(result.published)).not.toMatch(/Person Example|Home Ave/)
  })
})
