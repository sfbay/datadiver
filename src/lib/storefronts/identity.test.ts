import { describe, expect, it } from 'vitest'
import {
  canJoinById,
  facilityIdFrom5tti,
  inspectionKey5tti,
  nameSimilarity,
  pickRegistryRow,
  registrationCovers,
  registryTenureDays,
} from './identity'
import { groupOperators, isStrictOperator, longestChain, meetsTurnoverBar, turnoverBucket, type Sighting } from './nameChain'
import { ownerGroupKey } from './ownerGroups'
import type { RegistryRow } from './registryRows'

// Registry rows are the real g8m3-pdis registrations at each door (research
// scratch own/g8m3.json, cross-checked live 2026-09-24); sightings are the
// real inspection names + dates.

let n = 0
const reg = (ownership_name: string, dba_name: string, start: string, end: string | null, extra: Partial<RegistryRow> = {}): RegistryRow => ({
  uniqueid: `u${++n}`,
  ownership_name,
  dba_name,
  full_business_address: extra.full_business_address ?? '',
  location_start_date: `${start}T00:00:00.000`,
  ...(end ? { location_end_date: `${end}T00:00:00.000` } : {}),
  ...extra,
})

const HAYES_REGISTRY: RegistryRow[] = [
  reg('Pradhan Dilip', 'Panhandle Pizza', '2012-04-01', '2014-05-31'),
  reg('Ma Teddy', 'Panhandle Pizza', '2014-06-01', '2016-09-20'),
  reg('Erkelens Linda', '2077-2095 Hayes St Commercials', '2015-07-27', null, { full_business_address: '2077 Hayes St' }),
  reg('Red Smart LLC', 'Katani Pizza', '2016-08-04', '2019-08-31'),
  reg('5 Friends Foods Inc', 'Gochees Pizza - Katani Pizza', '2019-09-18', '2019-10-15'),
  reg('Carlos Zarate Ambrocio', 'Hayes Pizza', '2019-10-16', '2019-12-04'),
  reg('Jmc Foods LLC', 'Hayes Pizza', '2019-12-04', '2024-02-23'),
  reg('Red Smart LLC', 'The Hungry Spot', '2024-02-06', null, { self_reported_naics_code: '722511', lic: 'H24R' }),
  reg('Linda Erkelens', '2077-2095 Hayes', '2026-02-24', null, { full_business_address: '2077 Hayes St' }),
]
const HAYES_SIGHTINGS: Sighting[] = [
  { name: 'Katani Pizza', date: '2016-11-09', era: 2016 },
  { name: 'Katani Pizza', date: '2017-03-27', era: 2016 },
  { name: 'Katani Pizza', date: '2018-08-21', era: 2016 },
  { name: 'HAYES PIZZA', date: '2021-03-09', era: 2020 },
  { name: 'HAYES PIZZA', date: '2022-09-06', era: 2020 },
  { name: 'THE HUNGRY SPOT', date: '2024-03-14', era: 2024 },
  { name: 'THE HUNGRY SPOT', date: '2024-04-25', era: 2024 },
  { name: 'THE HUNGRY SPOT', date: '2025-01-08', era: 2024 },
]

const GREEN_REGISTRY: RegistryRow[] = [
  reg('Petersen Adele Etal', '570 Green St', '1968-10-01', null, { full_business_address: '570 Green St #574', self_reported_naics_code: '53111' }),
  reg('On The Stem LLC', 'Amante', '2002-01-10', '2015-10-01'),
  reg('Noodles Raw Catering LLC', 'Chubby Noodle', '2013-10-17', '2019-06-30'),
  reg("Pete's On Green LLC", "Pete's On Green", '2015-11-25', '2019-12-12'),
  reg("Pete's On Green LLC", 'Chubby Noodle', '2015-11-25', '2015-11-25'),
  reg("Pete's On Green LLC", "Don Pisto's", '2015-11-25', '2024-11-01'),
  reg('A - Z Hospitality LLC Of San Francisco', 'Next Door SF', '2024-11-15', null),
  reg('Aguilar Marco', 'Street Meet Tacos And Restaurant', '2025-01-27', '2025-08-26'),
]
const GREEN_SIGHTINGS: Sighting[] = [
  ...['2017-07-31', '2019-05-29', '2019-07-03', '2019-07-11'].map((date) => ({ name: "Pete's on Green", date, era: 2016 as const })),
  ...['2020-11-09', '2020-11-16', '2021-09-07', '2021-09-15', '2021-09-21', '2022-08-22', '2022-08-29', '2022-09-08', '2023-04-26']
    .map((date) => ({ name: 'CHUBBY NOODLE', date, era: 2020 as const })),
  { name: "DON PISTO'S", date: '2024-08-15', era: 2024 },
  ...['2025-02-18', '2025-02-19', '2025-02-26', '2025-04-09', '2025-06-16'].map((date) => ({ name: 'STREET MEET TACOS AND RESTAURANT', date, era: 2024 as const })),
  { name: 'NEXT DOOR SF', date: '2026-07-30', era: 2024 },
]

const AS_OF = '2026-09-24'

/** The generator's per-door pipeline, end to end, over the pure leaves. */
function resolveDoor(sightings: Sighting[], registry: RegistryRow[]) {
  const ops = groupOperators(sightings).map((op) => {
    const pick = pickRegistryRow(registry, op)
    const tenure = pick ? registryTenureDays(pick.row, AS_OF) : null
    return { ...op, owner: pick?.row.ownership_name ?? null, strict: isStrictOperator(op, tenure) }
  })
  const strictChain = longestChain(ops.filter((o) => o.strict))
  return {
    ops,
    strictChain,
    bar: meetsTurnoverBar(strictChain),
    bucket: turnoverBucket(strictChain.map((o) => (o.owner ? ownerGroupKey(o.owner) : null))),
  }
}

describe('cross-era ids', () => {
  it('5tti inspection_id minus its 8-char date = the facility id = pyih business_id', () => {
    expect(facilityIdFrom5tti('8733820220615')).toBe('87338')
    expect(facilityIdFrom5tti('308420210225')).toBe('3084')
    expect(facilityIdFrom5tti('20220615')).toBe('')
  })

  it('keys a 5tti inspection by id + type (230 same-day id collisions)', () => {
    expect(inspectionKey5tti('8733820220615', 'routine')).toBe('8733820220615|routine')
    expect(inspectionKey5tti('8733820220615', 'routine')).not.toBe(inspectionKey5tti('8733820220615', 'reinspection'))
  })

  it('joins by number only at ≥ 60,000 AND the same storefront (B trap 4)', () => {
    expect(canJoinById('87338', '87338', true)).toBe(true)
    expect(canJoinById('87338', '87338', false)).toBe(false)
    expect(canJoinById('639', '639', true)).toBe(false) // Swan Oyster Depot was renumbered 639 → 305
    expect(canJoinById('59999', '59999', true)).toBe(false)
    expect(canJoinById('087338', '87338', true)).toBe(true)
    expect(canJoinById('87338', 'H2406732977', true)).toBe(false)
  })
})

describe('registry join', () => {
  it('name similarity reaches the 0.6 floor on trade-name spellings', () => {
    expect(nameSimilarity('HAYES PIZZA', 'Hayes Pizza')).toBe(1)
    expect(nameSimilarity("Pete's on Green", "Pete's On Green LLC")).toBe(1)
    expect(nameSimilarity('Katani Pizza', 'Gochees Pizza - Katani Pizza')).toBeGreaterThanOrEqual(0.6)
    expect(nameSimilarity('THE HUNGRY SPOT', 'Katani Pizza')).toBeLessThan(0.6)
    expect(nameSimilarity('', 'Katani Pizza')).toBe(0)
  })

  it('an open registration covers every later day', () => {
    const r = HAYES_REGISTRY[7]
    expect(registrationCovers(r, '2024-02-06')).toBe(true)
    expect(registrationCovers(r, '2026-09-24')).toBe(true)
    expect(registrationCovers(r, '2024-02-05')).toBe(false)
  })

  it('picks the owner by DATE WINDOW when two registrations share a name', () => {
    // Hayes Pizza, inspected 2021–22: Carlos Zarate Ambrocio held it Oct–Dec 2019, Jmc Foods LLC from Dec 2019.
    const pick = pickRegistryRow(HAYES_REGISTRY, { name: 'HAYES PIZZA', dateList: ['2021-03-09', '2022-09-06'] })
    expect(pick?.row.ownership_name).toBe('Jmc Foods LLC')
    expect(pick?.coverage).toBe(2)
  })

  it('refuses a registration whose window covers none of the dates', () => {
    const chubby = ['2020-11-09', '2021-09-07', '2023-04-26']
    expect(pickRegistryRow(GREEN_REGISTRY, { name: 'CHUBBY NOODLE', dateList: chubby })).toBeNull()
  })

  it('never picks a landlord row', () => {
    const pick = pickRegistryRow(HAYES_REGISTRY, { name: '2077-2095 Hayes St Commercials', dateList: ['2020-01-01'] })
    expect(pick).toBeNull()
  })

  it('tenure runs to the registration end, or to asOf when still open', () => {
    expect(registryTenureDays(HAYES_REGISTRY[3], AS_OF)).toBe(1122) // 2016-08-04 → 2019-08-31
    expect(registryTenureDays(HAYES_REGISTRY[7], AS_OF)).toBe(961) // 2024-02-06 → asOf
  })
})

// 1101 Geary Blvd, live g8m3-pdis 2026-09-24: the restaurant's owner and an
// ATM operator both register the trade name "Tommy's Joynt", both still open.
describe('the host store’s trade name on someone else’s registration', () => {
  const TOMMYS: Sighting[] = [
    { name: "TOMMY'S JOYNT", date: '2017-03-06', era: 2016 },
    { name: "TOMMY'S JOYNT", date: '2022-05-10', era: 2020 },
    { name: "TOMMY'S JOYNT", date: '2025-02-11', era: 2024 },
  ]
  const dates = TOMMYS.map((s) => s.date)
  const apple = reg('Apple Annie LLC', "Tommy's Joynt", '2015-06-30', null, { self_reported_naics_code: '722511' })
  const atm = reg('Cardtronics Usa, Inc.', "Tommy's Joynt", '2015-08-05', null, { self_reported_naics_code: '52' })

  it('never names an ATM/kiosk operator the owner — even as the only candidate', () => {
    expect(pickRegistryRow([apple, atm], { name: "TOMMY'S JOYNT", dateList: dates })?.row.ownership_name).toBe('Apple Annie LLC')
    expect(pickRegistryRow([atm], { name: "TOMMY'S JOYNT", dateList: dates })).toBeNull()
  })

  it('demotes a finance-coded row whose owner name is unlike the business, on a coverage tie', () => {
    const side = reg('Acme Payments Inc', "Tommy's Joynt", '2016-01-01', null, { self_reported_naics_code: '522320' })
    expect(pickRegistryRow([apple, side], { name: "TOMMY'S JOYNT", dateList: dates.slice(1) })?.row.ownership_name).toBe('Apple Annie LLC')
    // …and the business's own registration wins even when its code is non-food (a pharmacy).
    const walgreen = reg('Walgreen Co', 'Walgreens #1327', '2010-01-01', null, { self_reported_naics_code: '446110' })
    const sideAtWalgreens = reg('Acme Payments Inc', 'Walgreens', '2016-01-01', null, { self_reported_naics_code: '522320' })
    expect(pickRegistryRow([walgreen, sideAtWalgreens], { name: 'WALGREENS', dateList: ['2025-01-01'] })?.row.ownership_name).toBe('Walgreen Co')
  })
})

describe('owner-resolution buckets, end to end (spec §3.7 rule 8)', () => {
  it('2077 Hayes St → owner-returned: Red Smart LLC left in 2019 and came back as The Hungry Spot', () => {
    const door = resolveDoor(HAYES_SIGHTINGS, HAYES_REGISTRY)
    expect(door.strictChain.map((o) => o.owner)).toEqual(['Red Smart LLC', 'Jmc Foods LLC', 'Red Smart LLC'])
    expect(door.bar).toBe(true)
    expect(door.bucket).toBe('owner-returned')
  })

  it("570 Green St → same-owner: Pete's On Green LLC behind the first three names", () => {
    const door = resolveDoor(GREEN_SIGHTINGS, GREEN_REGISTRY)
    expect(door.ops.map((o) => o.name)).toEqual([
      "Pete's on Green", 'CHUBBY NOODLE', "DON PISTO'S", 'STREET MEET TACOS AND RESTAURANT', 'NEXT DOOR SF',
    ])
    // Chubby Noodle (2020–23) matches only registrations that ended by 2019 —
    // no window covers it, so the registry does not vouch for its owner.
    expect(door.strictChain.map((o) => o.owner)).toEqual([
      "Pete's On Green LLC", null, "Pete's On Green LLC", 'Aguilar Marco', 'A - Z Hospitality LLC Of San Francisco',
    ])
    expect(door.bar).toBe(true)
    expect(door.bucket).toBe('same-owner')
  })
})
