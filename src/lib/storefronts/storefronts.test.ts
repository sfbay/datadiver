/**
 * Standing pins over the COMMITTED Behind the Storefront snapshot
 * (`public/data/restaurants/storefronts.json`, written by
 * `scripts/build-storefronts.ts`). Reads the file from disk — never the
 * network. If a pin fails, the snapshot was regenerated against moved data:
 * re-pin HERE, update the Restaurants copy, About's source notes and
 * docs/data-insights.md in the SAME commit (the census precedent — the failing
 * pins ARE the checklist). Never hand-edit the JSON.
 *
 * Three kinds of pin:
 *   EXACT      the figures the view's ledes and data notes cite, at asOf.
 *   STRUCTURAL the gates (G2–G4 re-checked from the file itself) and the
 *              schema's invariants — these hold at every regeneration.
 *   PRIVACY    §11: no natural person's mailing street or ZIP anywhere; a
 *              company mailing address only on the shared-address fact; a
 *              plain mailing city on every owner.
 */
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  ARTIFACT_PATH,
  QUEUE_PATH,
  displayAddress,
  inSf,
  normStreet,
  scanForPersonAddresses,
  scoreBand,
  type StorefrontArtifact,
} from '../../../scripts/build-storefronts'
import { RESTAURANT_GROUPS } from '../../cities/sf/restaurantGroups'
import { CONTRACT_OPERATORS } from './ownerGroups'
import { isCompany } from './ownerLabel'
import { isStorefrontAddress, storefrontKey } from './storefrontKey'
import { isVenue } from './venues'

const artifact = JSON.parse(readFileSync(join(process.cwd(), ARTIFACT_PATH), 'utf8')) as StorefrontArtifact
const S = artifact.storefronts
const at = (key: string) => {
  const s = S.find((x) => x.key === key)
  if (!s) throw new Error(`storefront ${key} missing`)
  return s
}

// ── EXACT ─────────────────────────────────────────────────────────────────

describe('snapshot — exact pins at asOf', () => {
  it('is stamped 2026-09-24, data edge the day before (the 2031 junk row clamped away)', () => {
    expect(artifact.asOf).toBe('2026-09-24')
    expect(artifact.stats.dataEdge).toBe('2026-09-23')
  })

  it('storefronts, exclusions and the turnover buckets', () => {
    expect(S).toHaveLength(5_893)
    expect(artifact.stats.storefrontAddresses).toBe(6_374)
    expect(artifact.stats.excluded).toEqual({ venue: 30, 'multi-tenant': 185, 'non-storefront-permits': 266 })
    expect(artifact.excludedAddresses).toBe(481)
    expect(artifact.stats.turnover).toBe(124)
    expect(artifact.stats.buckets).toEqual({
      'three-owners': 101,
      'same-owner': 13,
      'owner-returned': 2,
      'owners-unknown': 8,
    })
    expect(artifact.stats.chainStrict).toEqual({ '3': 113, '4': 9, '5+': 2 })
    // …and the file agrees with its own stats.
    expect(S.filter((s) => s.turnoverBucket).length).toBe(artifact.stats.turnover)
  })

  it('2024+ closure episodes reproduce the spec §3.6 figures (median/p75/p90 exclude same-day, rule 4)', () => {
    expect(artifact.stats.episodes2024).toEqual({
      episodes: 399,
      keys: 356,
      cleared: 341,
      sameDay: 66,
      unresolved: 58,
      unresolvedAfterBreak: 42,
      medianDays: 2,
      p75Days: 5,
      p90Days: 20,
      maxDays: 380,
      keysWith2Plus: 39,
      keysWith3Plus: 4,
      repeatKeys: 30,
      beforeBreak: 321,
      afterBreak: 78,
    })
    // Every 2024+ Closure reading sits on a food permit: the all-permit run is identical.
    const { beforeBreak: _b, afterBreak: _a, ...food } = artifact.stats.episodes2024
    expect(artifact.stats.episodes2024AllPermits).toEqual(food)
  })

  it('2020–23 episodes, keyed by facility id', () => {
    expect(artifact.stats.episodes2020).toMatchObject({ episodes: 444, keys: 394, cleared: 391, sameDay: 30, unresolved: 53, repeatKeys: 40 })
  })

  it('what the published doors carry', () => {
    const count = (f: (s: (typeof S)[number]) => number) => S.reduce((t, s) => t + f(s), 0)
    expect(S.filter((s) => s.lat !== null).length).toBe(5_300)
    expect(S.filter((s) => s.permits.length).length).toBe(4_784)
    expect(S.filter((s) => s.repeatCurrent).length).toBe(72)
    expect(count((s) => s.episodes.filter((e) => e.era === 2024).length)).toBe(349)
    expect(count((s) => s.episodes.filter((e) => e.era === 2020).length)).toBe(395)
    expect(count((s) => s.operators.length)).toBe(7_320)
    expect(count((s) => s.lanes.scores2016.length)).toBe(20_204)
    expect(count((s) => s.lanes.placards2020.length)).toBe(13_233)
  })

  it('vermin at closure inspections, and registry coverage', () => {
    expect(artifact.stats.vermin).toEqual({ n: 369, m: 456 })
    expect(artifact.stats.registryMatch).toEqual({ matched: 4_669, total: 4_784 })
  })

  it('owners, franchises and the shared-mailing-address fact', () => {
    expect(artifact.owners).toHaveLength(152)
    expect(artifact.owners.filter((o) => o.contract)).toHaveLength(9)
    expect(artifact.franchises).toHaveLength(33)
    // One trade name per brand: the old word-prefix fold invented these from
    // unrelated businesses sharing a first word (or a dropped leading number).
    const brands = new Set(artifact.franchises.map((f) => f.brand))
    for (const fake of ['Dumpling 101', '500 Club', 'Golden Gate', '707 Sutter', 'Sam\'s', 'Butter']) expect(brands.has(fake), fake).toBe(false)
    expect(artifact.franchises.slice(0, 3).map((f) => [f.brand, f.locations, f.owners.length])).toEqual([
      ['Subway', 19, 12], ['Super Duper', 7, 7], ["Mcdonald's", 8, 6],
    ])
    expect(artifact.sharedAddresses).toHaveLength(167)
    expect(artifact.withheldSharedCount).toBe(94)
    expect(artifact.stats.sharedAddressClusters).toEqual({
      survivors: 261,
      published: 167,
      withheld: 94,
      withheldByClosedRegistration: 0,
      removed: { undeliverable: 1, agentShare: 7, agentList: 0, venue: 5 },
    })
    expect(artifact.stats.openFoodRegistrations).toBe(7_185)
    expect(artifact.stats.mailCity).toEqual({ sanFrancisco: 5_074, undeliverable: 101 })
  })

  it('era row counts and the publishing strip (B §2 reproduced exactly for 2016–23)', () => {
    expect(artifact.stats.rows).toEqual({ pyih: 53_973, tvy3: 22_620, t5ti: 49_562, registry: 367_367 })
    expect(artifact.stats.pyihInspections).toBe(26_663)
    expect(artifact.stats.t5tiInspections).toBe(17_135)
    expect(artifact.stats.scoreBands).toEqual({ Good: 7_809, Adequate: 3_168, 'Needs Improvement': 2_815, Poor: 239 })
    const lane = (era: number) => artifact.publishing.filter((p) => p.era === era).map((p) => [p.year, p.inspections])
    expect(lane(2016)).toEqual([[2016, 1_778], [2017, 7_817], [2018, 8_218], [2019, 8_850]])
    expect(lane(2020)).toEqual([[2020, 1_972], [2021, 5_493], [2022, 6_330], [2023, 3_340]])
    expect(lane(2024)).toEqual([[2024, 11_059], [2025, 8_602], [2026, 2_958]])
  })
})

describe('snapshot — the storefronts the voice samples cite', () => {
  it('2704 24th St: five names; the ghost rule counts registry tenure, so all five are strict', () => {
    const s = at('2704 24TH ST')
    expect(s.operators.map((o) => o.name)).toEqual([
      'Almanac San Francisco',
      'SEVEN STILLS',
      'BREWVINO SF',
      'AYAHUAZKA RESTAURANT',
      'CAPRIZZA RISTORANTE',
    ])
    expect(s.operators.filter((o) => o.seenOnce).map((o) => o.name)).toEqual(['SEVEN STILLS', 'AYAHUAZKA RESTAURANT'])
    expect(s.chainStrict).toBe(5)
    expect(s.turnoverBucket).toBe('three-owners')
  })

  it('2077 Hayes St: the owner came back — never "same owner"', () => {
    const s = at('2077 HAYES ST')
    expect(s.turnoverBucket).toBe('owner-returned')
    expect(s.operators.map((o) => o.owner?.name)).toEqual(['Red Smart LLC', 'Jmc Foods LLC', 'Red Smart LLC'])
  })

  it("570 Green St: one company behind two of the names (Chubby Noodle has no covering registration)", () => {
    const s = at('570 GREEN ST')
    expect(s.turnoverBucket).toBe('same-owner')
    expect(s.operators.find((o) => o.name === 'CHUBBY NOODLE')?.owner).toBeNull()
    expect(s.operators.filter((o) => o.owner?.name === "Pete's On Green LLC").map((o) => o.name)).toEqual([
      "Pete's on Green",
      "DON PISTO'S",
    ])
  })
})

// ── STRUCTURAL ────────────────────────────────────────────────────────────

describe('snapshot — gates re-checked from the file', () => {
  it('G2: every published door is a storefront address and not a venue', () => {
    expect(S.filter((s) => !isStorefrontAddress(s.key)).map((s) => s.key)).toEqual([])
    expect(S.filter((s) => isVenue(s.key)).map((s) => s.key)).toEqual([])
  })

  it('G4: a strict operator has 2+ dates, or a registration (the only source of tenure)', () => {
    const bad = S.flatMap((s) => s.operators.filter((o) => o.strict && o.dates < 2 && !o.owner).map((o) => `${s.key}: ${o.name}`))
    expect(bad).toEqual([])
  })

  it('the turnover bar: a bucket only on a strict chain of 3+ spanning 2+ eras', () => {
    for (const s of S.filter((x) => x.turnoverBucket)) {
      expect(s.chainStrict).toBeGreaterThanOrEqual(3)
      const eras = new Set(s.operators.filter((o) => o.strict).flatMap((o) => o.eras))
      expect(eras.size).toBeGreaterThanOrEqual(2)
    }
  })

  it('episodes: days only on a cleared, not-same-day run; the feed note from July 2025', () => {
    for (const s of S) {
      for (const e of s.episodes) {
        if (e.sameDay || e.clearedOn === null) expect(e.days).toBeNull()
        else expect(e.days).toBeGreaterThan(0)
        expect(e.afterBreak).toBe(e.start >= '2025-07-01')
        if (e.era === 2024) expect(s.permits).toContain(e.permit)
      }
    }
  })

  it('display addresses are built from the key — no unit or suite token survives', () => {
    for (const s of S) {
      expect(s.address).toBe(displayAddress(s.key))
      expect(s.address).not.toMatch(/\b(APT|UNIT|STE|SUITE|#)\b/i)
    }
  })

  it('every point is inside the city', () => {
    for (const s of S) if (s.lat !== null) expect(inSf(s.lat, s.lng!)).toBe(true)
  })

  it('G6: curated groups copied from restaurantGroups.ts (ships empty)', () => {
    expect(artifact.groups.map((g) => g.id)).toEqual(RESTAURANT_GROUPS.map((g) => g.id))
  })

  it('contract operators fold: every CONTRACT_OPERATORS entry but one holds 3+ storefronts', () => {
    const present = new Set(artifact.owners.map((o) => o.contract).filter(Boolean))
    // Service Systems Associates (the Zoo concessionaire) is registered at ONE
    // door — 1 Zoo Rd — so it never reaches the 3-storefront list. Kept in
    // CONTRACT_OPERATORS so a second door folds instead of ranking.
    expect(CONTRACT_OPERATORS.map((c) => c.id).filter((id) => !present.has(id))).toEqual(['service-systems'])
  })

  it('the multi-location owners list is companies only', () => {
    for (const o of artifact.owners) {
      expect(o.kind).toBe('company')
      expect(o.storefronts.length).toBeGreaterThanOrEqual(3)
    }
  })
})

// ── PRIVACY (§11) ─────────────────────────────────────────────────────────

/** Every [path, value] string in the artifact; array indices collapsed to []. */
function strings(value: unknown, path = '', out: [string, string][] = []): [string, string][] {
  if (typeof value === 'string') out.push([path.replace(/\[\d+\]/g, '[]'), value])
  else if (Array.isArray(value)) value.forEach((v) => strings(v, `${path}[]`, out))
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) strings(v, path ? `${path}.${k}` : k, out)
  }
  return out
}
function keys(value: unknown, path = '', out: string[] = []): string[] {
  if (Array.isArray(value)) value.forEach((v) => keys(v, `${path}[]`, out))
  else if (value !== null && typeof value === 'object') {
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      const p = path ? `${path}.${k}` : k
      out.push(p)
      keys(v, p, out)
    }
  }
  return out
}

const STREET_SHAPED = /\b\d+[A-Z]?\s+(?:[A-Z0-9]+\s+){0,3}(ST|STREET|AVE|AVENUE|BLVD|DR|WAY|PL|CT|LN|TER|RD)\b|\b(APT|UNIT)\b/i
const ZIP_SHAPED = /^\d{5}(-\d{4})?$/

/** Where a street-shaped string may legitimately appear: public business
 *  LOCATIONS (DPH's own doors), trade names as published, company names
 *  (companies named for their building: '1800 Fillmore Corp'), and the
 *  published company mailing address. */
const STREET_OK = new Set([
  'storefronts[].key',
  'storefronts[].address',
  'storefronts[].operators[].name',
  'storefronts[].operators[].owner.name',
  'storefronts[].lanes.scores2016[].name',
  'storefronts[].lanes.placards2020[].name',
  'owners[].name',
  'owners[].brands[]',
  'owners[].storefronts[]',
  'franchises[].brand',
  'franchises[].owners[].name',
  'franchises[].owners[].storefronts[]',
  'sharedAddresses[].key',
  'sharedAddresses[].address',
  'sharedAddresses[].companies[]',
  'sharedAddresses[].brands[]',
  'sharedAddresses[].storefronts[]',
  'groups[].storefronts[]',
])

describe('snapshot — privacy (§11, gate G3)', () => {
  it('no mailing street, ZIP or inspector FIELD outside the shared-address fact', () => {
    const bad = keys(artifact).filter(
      (p) => /mail(ing)?_?(address|street)|street|zip|inspector/i.test(p) && !/^sharedAddresses\[\]\.zip$/.test(p),
    )
    expect(bad).toEqual([])
  })

  it('every owner of record carries exactly name, kind, mailCity and the registration window', () => {
    for (const s of S) {
      for (const o of s.operators) {
        if (!o.owner) continue
        expect(Object.keys(o.owner).sort()).toEqual(['kind', 'mailCity', 'name', 'registeredFrom', 'registeredTo'])
        if (o.owner.mailCity !== null) {
          // A plain city name: no state, no label, no digits.
          expect(o.owner.mailCity).toMatch(/^[A-Za-z .'’-]+$/)
          expect(o.owner.mailCity).not.toMatch(/,|\b(CA|Calif)\b|mailing|lives/i)
        }
      }
    }
  })

  it('ZIP-shaped values appear only as a published company address ZIP (ids exempt)', () => {
    expect(scanForPersonAddresses(artifact, new Set())).toEqual([])
    const zips = strings(artifact).filter(([p, v]) => ZIP_SHAPED.test(v) && !/\.(facility|permit)$|\.permits\[\]$/.test(p))
    expect([...new Set(zips.map(([p]) => p))]).toEqual(['sharedAddresses[].zip'])
  })

  it('street-shaped strings appear only as business locations, trade names, company names or a company mailing address', () => {
    const stray = strings(artifact).filter(([p, v]) => STREET_SHAPED.test(v) && !STREET_OK.has(p))
    expect(stray).toEqual([])
  })

  it('a street-shaped OWNER name is a company, or an entity named for one of the published doors', () => {
    // '1799 Mission Street' (owner of Dahlia Lounge at 1799 Mission St) and
    // '2036 Lombard Street' carry no registered suffix, so ownerKind says
    // 'unknown' — but the name IS a business location in this file, not a
    // residence. Anything street-shaped that is neither fails.
    const doors = new Set(S.map((s) => s.key))
    const personish = S.flatMap((s) => s.operators)
      .filter((o) => o.owner && o.owner.kind !== 'company' && STREET_SHAPED.test(o.owner.name))
      .map((o) => o.owner!.name)
      .filter((n) => !doors.has(storefrontKey(n)))
    expect(personish).toEqual([])
    expect(
      artifact.franchises.flatMap((f) => f.owners).filter((o) => o.kind !== 'company' && STREET_SHAPED.test(o.name)),
    ).toEqual([])
  })

  it('a published mailing address lists companies only', () => {
    for (const a of artifact.sharedAddresses) {
      expect(a.companies.length).toBeGreaterThanOrEqual(2)
      for (const c of a.companies) expect(isCompany(c)).toBe(true)
    }
  })

  it('the review queue (names + possibly home addresses) is never written under public/', () => {
    expect(QUEUE_PATH.startsWith('scripts/out/')).toBe(true)
    expect(existsSync(join(process.cwd(), 'public/data/restaurants/restaurant-groups-queue.json'))).toBe(false)
  })
})

// ── generator helpers ─────────────────────────────────────────────────────

describe('build-storefronts helpers', () => {
  it('displayAddress title-cases the key and keeps house letters, ordinals and Irish-O streets', () => {
    expect(displayAddress('2704 24TH ST')).toBe('2704 24th St')
    expect(displayAddress('455A CASTRO ST')).toBe('455A Castro St')
    expect(displayAddress('1740 OFARRELL ST')).toBe("1740 O'Farrell St")
    expect(displayAddress('601 MISSION BAY BLVD N')).toBe('601 Mission Bay Blvd N')
    expect(displayAddress('900 MCALLISTER ST')).toBe('900 McAllister St')
  })

  it('scoreBand uses SF’s 2016–19 bands', () => {
    expect([100, 91, 90, 86, 85, 71, 70, null].map((s) => scoreBand(s))).toEqual([
      'Good', 'Good', 'Adequate', 'Adequate', 'Needs Improvement', 'Needs Improvement', 'Poor', null,
    ])
  })

  it('the G3 scan flags a person’s mailing street anywhere but a business location, and stray ZIPs', () => {
    const people = new Set([normStreet('123 Elm St., Apt 4')])
    const fake = {
      storefronts: [{ key: '123 ELM ST APT 4', address: '123 Elm St', permits: ['94110'], lanes: { placards2020: [{ facility: '94110' }] } }],
      owners: [{ name: '123 Elm St, Apt 4', zipish: '94110' }],
      sharedAddresses: [{ zip: '94103' }],
    }
    expect(scanForPersonAddresses(fake, people)).toEqual(['owners[0].name=123 Elm St, Apt 4', 'owners[0].zipish=94110'])
  })
})
