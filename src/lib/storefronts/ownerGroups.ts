// LEAF (imports only sibling leaves) — shared ownership, visible and hidden
// (spec §3.8 as amended by §11).
//
// VISIBLE. One company registered at many storefronts: 195 owners of every
// kind hold 3+ open food addresses (F §2). The list is COMPANY owners only —
// a list of a natural person's holdings is exactly the tool §11 rules out
// ("never a tool that turns a person's name into their holdings + location").
// Contract food-service companies (Aramark, Compass, …) run other people's
// cafeterias; they fold under a turn-down rather than top the ranking.
//
// ONE SIGN, MANY OWNERS. The franchise inversion — Subway, Super Duper — is
// the natural doorway into hidden ownership: the same trade name registered
// by many different companies.
//
// HIDDEN. Differently named companies sharing one mailing address (23 at 2020
// Union St behind Super Duper, Beretta, Delarosa and others, F §3). Grouped by
// algorithm that is only ~77% right, so the two halves ship differently:
//   · the FACT — "These N companies list the same mailing address on their
//     city registrations" — is published automatically once filters F1–F5
//     have run, and only where EVERY owner registered at the address is a
//     company (otherwise it may be a home: withheld, and counted);
//   · the CLAIM — "same restaurant group" — exists only as a curated row in
//     src/cities/sf/restaurantGroups.ts with ≥ 2 evidence kinds (G6).
//
// Filters, in order (F §3):
//   F1  the undeliverable placeholder ('0000 Undeliverable Mail')
//   F2  registered agents / CPAs / mailbox stores: ≥ 15 owners across ALL
//       sectors where food owners are < 50% (2261 Market 249, 548 Market 179)
//   F3  an authored agent/mailbox list (belt-and-braces — removed nothing
//       beyond F2 at probe)
//   F4  FLAG, don't drop: the mailing address is itself a building with 3+
//       food tenants (dropping it would lose Quince/Cotogna at 470 Pacific)
//   F5  incubators and venues via the venue list (La Cocina, 2948 Folsom)

import { cleanOwnerName, isCompany, isUndeliverableMailing, mailCityLabel, ownerKind } from './ownerLabel'
import { isFoodRegistryRow, isOpenRow, type RegistryRow } from './registryRows'
import { storefrontKey } from './storefrontKey'
import type {
  CuratedGroup,
  FranchiseBrand,
  GroupEvidenceKind,
  OwnerKind,
  SharedMailingAddress,
  VisibleOwner,
} from './types'
import { isVenue } from './venues'

// ── owner grouping ─────────────────────────────────────────────────────

/** Owner-group key — upper-case, punctuation and legal suffixes stripped, for
 *  GROUPING only ('Guckenheimer Services LLC' ≡ 'Guckenheimer Services, LLC').
 *  Display always uses a registered spelling. */
export function ownerGroupKey(name: string | null | undefined): string {
  let s = (name ?? '').toUpperCase().replace(/[’'`]/g, '').replace(/&/g, ' AND ')
  s = s.replace(/[^A-Z0-9 ]/g, ' ').replace(/\s+/g, ' ')
  s = s.replace(/\b(INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|THE|DBA)\b/g, ' ')
  return s.replace(/\s+/g, ' ').trim()
}

/** Contract food-service companies (F §2), matched against ownerGroupKey.
 *  Anchored patterns, because the registry also holds 'Horvitz & Levy Llp',
 *  'Compassionate Tides' and 'Smg Communications' (probed 2026-09-24). */
export const CONTRACT_OPERATORS: readonly { id: string; label: string; pattern: RegExp }[] = [
  { id: 'aramark', label: 'Aramark', pattern: /^ARAMARK\b/ },
  { id: 'compass', label: 'Compass Group', pattern: /^COMPASS (GROUP|CALIFORNIA|ONE)\b/ },
  { id: 'levy', label: 'Levy Restaurants', pattern: /^LEVY RESTAURANTS$/ },
  { id: 'bon-appetit', label: 'Bon Appétit Management', pattern: /^BON APPETIT MANAGEMENT\b/ },
  { id: 'sodexo', label: 'Sodexo', pattern: /^SODEXO\b/ },
  { id: 'smg', label: 'SMG', pattern: /^SMG$/ },
  { id: 'guckenheimer', label: 'Guckenheimer', pattern: /^GUCKENHEIMER\b/ },
  { id: 'avatar', label: 'Avatar Foods', pattern: /^AVATAR FOODS\b/ },
  { id: 'events-management', label: 'Events Management', pattern: /^EVENTS MANAGEMENT$/ },
  { id: 'service-systems', label: 'Service Systems Associates', pattern: /^SERVICE SYSTEMS ASSOCIATES$/ },
]

/** The CONTRACT_OPERATORS id an owner name belongs to, or null. */
export function contractOperatorOf(name: string | null | undefined): string | null {
  const k = ownerGroupKey(name)
  return CONTRACT_OPERATORS.find((c) => c.pattern.test(k))?.id ?? null
}

function mostCommon(values: readonly string[]): string {
  const counts = new Map<string, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best = ''
  let bestN = 0
  for (const [v, n] of counts) {
    if (n > bestN || (n === bestN && v < best)) {
      best = v
      bestN = n
    }
  }
  return best
}

function openFoodRows(rows: readonly RegistryRow[]): RegistryRow[] {
  return rows.filter((r) => isOpenRow(r) && isFoodRegistryRow(r))
}

export interface OwnerGroupOptions {
  /** Storefront key of a registry row; defaults to storefrontKey(full_business_address).
   *  The generator passes its suffix-filled keyer so keys match the snapshot. */
  keyOf?: (row: RegistryRow) => string
}

const defaultKeyOf = (r: RegistryRow) => storefrontKey(r.full_business_address)

/** A trade name as displayed: whitespace collapsed, '#' store numbers dropped. */
export function displayBrand(dba: string | null | undefined): string {
  return (dba ?? '').replace(/#\s*[\w-]+/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * "Registered to one company at 3+ storefronts." Open food registrations
 * (NAICS 722 OR a DPH food license) grouped by ownerGroupKey; a group
 * qualifies when it is a company (any registered spelling passes isCompany,
 * or it is an authored contract operator) and holds `minStorefronts`+
 * distinct storefront keys. Sorted by storefront count, then name.
 */
export function visibleOwners(
  rows: readonly RegistryRow[],
  opts: OwnerGroupOptions & { minStorefronts?: number } = {},
): VisibleOwner[] {
  const keyOf = opts.keyOf ?? defaultKeyOf
  const min = opts.minStorefronts ?? 3
  const byOwner = new Map<string, RegistryRow[]>()
  for (const r of openFoodRows(rows)) {
    const k = ownerGroupKey(r.ownership_name)
    if (!k) continue
    const list = byOwner.get(k)
    if (list) list.push(r)
    else byOwner.set(k, [r])
  }
  const out: VisibleOwner[] = []
  for (const group of byOwner.values()) {
    const spellings = group.map((r) => cleanOwnerName(r.ownership_name))
    const companySpellings = spellings.filter((n) => isCompany(n))
    const contract = contractOperatorOf(spellings[0])
    if (!companySpellings.length && !contract) continue
    const storefronts = [...new Set(group.map(keyOf).filter(Boolean))].sort()
    if (storefronts.length < min) continue
    const byBrand = new Map<string, string[]>()
    for (const r of group) {
      const b = brandKey(r.dba_name)
      if (!b) continue
      const list = byBrand.get(b)
      if (list) list.push(displayBrand(r.dba_name))
      else byBrand.set(b, [displayBrand(r.dba_name)])
    }
    const cities = group.map((r) => mailCityLabel(r)).filter((c): c is string => c !== null)
    out.push({
      name: mostCommon(companySpellings.length ? companySpellings : spellings),
      kind: 'company',
      mailCity: cities.length ? mostCommon(cities) : null,
      storefronts,
      brands: [...byBrand.values()].map(mostCommon).sort(),
      contract,
    })
  }
  return out.sort((a, b) => b.storefronts.length - a.storefronts.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
}

// ── one sign, many owners ──────────────────────────────────────────────

const BRAND_STOP = /\b(INC|INCORPORATED|LLC|L L C|CORP|CORPORATION|CO|COMPANY|LTD|LP|LLP|THE|DBA)\b/g
/** Words that can never be a brand on their own — a trade name that is just
 *  'CAFE' must not become the root that swallows every 'CAFE …' in the city. */
const GENERIC_BRAND_WORDS = new Set([
  'CAFE', 'COFFEE', 'PIZZA', 'DELI', 'MARKET', 'SUSHI', 'TAQUERIA', 'BAKERY', 'RESTAURANT', 'BAR', 'KITCHEN',
  'GRILL', 'TEA', 'BOBA', 'THAI', 'PHO', 'RAMEN', 'BURGER', 'BURGERS', 'TACOS', 'LIQUOR', 'LIQUORS', 'FOOD',
  'FOODS', 'EXPRESS', 'HOUSE', 'SF', 'SAN', 'FRANCISCO', 'CATERING', 'BISTRO', 'LOUNGE', 'NEW', 'GOLDEN',
  'CITY', 'THE', 'AND', 'MINI', 'MART', 'STORE', 'SHOP', 'SNACK', 'NOODLE', 'NOODLES', 'DIM', 'SUM', 'JUICE',
])

/** Words a franchise appends to its own name ('Subway Sandwiches', 'Super
 *  Duper Burgers') — the ONLY remainder that may fold a longer trade name onto
 *  a shorter one. A wider fold ('Golden Gate' taking 'Golden Gate Pizza' and
 *  'Golden Gate Market') invented brands out of unrelated businesses: the
 *  word-prefix fold published 'Dumpling 101' at 16 owners and '500 Club' at 13. */
const FOLD_SUFFIX_WORDS = new Set(['SANDWICHES', 'SANDWICH', 'BURGERS', 'BURGER'])

/** Brand-grouping key: upper-case, store numbers ('#10219', a bare 3+-digit
 *  '30303' AFTER the first word) and legal forms dropped. 'Subway Sandwiches
 *  #24254' → 'SUBWAY SANDWICHES'. A leading number is part of the name ('500
 *  Club', 'Pho 2000' keeps its 2000 only because 'PHO' alone is generic —
 *  see franchiseBrands). */
export function brandKey(dba: string | null | undefined): string {
  let s = (dba ?? '').toUpperCase().replace(/[’'`]/g, '').replace(/#\s*[\w-]+/g, ' ')
  s = s.replace(/&/g, ' AND ').replace(/[^A-Z0-9 ]/g, ' ').replace(BRAND_STOP, ' ')
  return s.split(/\s+/).filter(Boolean).filter((t, i) => i === 0 || !/^\d{3,}$/.test(t)).join(' ')
}

/**
 * Brands registered by `minOwners`+ distinct owners among open food rows. A
 * brand is ONE trade name, matched exactly after brandKey — the only fold is a
 * franchise's own descriptor suffix ('SUBWAY SANDWICHES' → 'SUBWAY', 'SUPER
 * DUPER BURGERS' → 'SUPER DUPER'; FOLD_SUFFIX_WORDS). A key made only of
 * generic words ('CAFE', 'PHO') is never a brand. Undercounting a franchise
 * that spells itself two ways is the accepted cost: a false brand is a false
 * claim of common identity. Owners of every kind are listed with their kind —
 * this is a list per SIGN, not a lookup by person.
 */
export function franchiseBrands(
  rows: readonly RegistryRow[],
  opts: OwnerGroupOptions & { minOwners?: number } = {},
): FranchiseBrand[] {
  const keyOf = opts.keyOf ?? defaultKeyOf
  const min = opts.minOwners ?? 3
  const byKey = new Map<string, RegistryRow[]>()
  for (const r of openFoodRows(rows)) {
    const k = brandKey(r.dba_name)
    if (!k || k.split(' ').every((w) => GENERIC_BRAND_WORDS.has(w) || /^\d+$/.test(w))) continue
    const list = byKey.get(k)
    if (list) list.push(r)
    else byKey.set(k, [r])
  }
  const keys = [...byKey.keys()].sort((a, b) => a.split(' ').length - b.split(' ').length || (a < b ? -1 : a > b ? 1 : 0))
  const roots = new Map<string, string[]>() // root → member keys
  for (const k of keys) {
    const words = k.split(' ')
    let root: string | undefined
    for (let n = words.length - 1; n >= 1 && !root; n--) {
      if (!words.slice(n).every((w) => FOLD_SUFFIX_WORDS.has(w))) break
      const prefix = words.slice(0, n).join(' ')
      if (roots.has(prefix)) root = prefix
    }
    if (root) roots.get(root)!.push(k)
    else roots.set(k, [k])
  }
  const out: FranchiseBrand[] = []
  for (const [root, members] of roots) {
    const group = members.flatMap((m) => byKey.get(m)!)
    const byOwner = new Map<string, RegistryRow[]>()
    for (const r of group) {
      const o = ownerGroupKey(r.ownership_name)
      if (!o) continue
      const list = byOwner.get(o)
      if (list) list.push(r)
      else byOwner.set(o, [r])
    }
    if (byOwner.size < min) continue
    const owners = [...byOwner.values()].map((rs) => {
      const name = mostCommon(rs.map((r) => cleanOwnerName(r.ownership_name)))
      return { name, kind: ownerKind(name) as OwnerKind, storefronts: [...new Set(rs.map(keyOf).filter(Boolean))].sort() }
    })
    owners.sort((a, b) => b.storefronts.length - a.storefronts.length || (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    out.push({
      brand: mostCommon(byKey.get(root)!.map((r) => displayBrand(r.dba_name))),
      locations: new Set(group.map(keyOf).filter(Boolean)).size,
      owners,
    })
  }
  return out.sort((a, b) => b.owners.length - a.owners.length || (a.brand < b.brand ? -1 : a.brand > b.brand ? 1 : 0))
}

// ── shared mailing addresses ───────────────────────────────────────────

/** Mailing-address key: the street line normalized (case, punctuation,
 *  STREET/AVENUE/SUITE/BOULEVARD spellings) + ' | ' + the 5-digit ZIP. A suite
 *  number stays in the key — two companies at one mailbox-store PMB share an
 *  address; two tenants of one office tower do not. null when blank. */
export function mailingKey(row: { mailing_address_1?: string | null; mail_zipcode?: string | null }): string | null {
  let a = (row.mailing_address_1 ?? '').toUpperCase().replace(/[’'`]/g, '')
  a = a.replace(/[.,#]/g, ' ').replace(/\s+/g, ' ').trim()
  if (!a) return null
  a = a.replace(/\bSTREET\b/g, 'ST').replace(/\bAVENUE\b/g, 'AVE').replace(/\bSUITE\b/g, 'STE').replace(/\bBOULEVARD\b/g, 'BLVD')
  return `${a} | ${(row.mail_zipcode ?? '').slice(0, 5)}`
}

/** F3 — authored registered-agent / CPA / mailbox-store mailing keys. */
export const AGENT_MAILING_KEYS: ReadonlySet<string> = new Set([
  '2261 MARKET ST | 94114',
  '548 MARKET ST | 94104',
])

/** One surviving cluster, published or not — the generator's REVIEW QUEUE
 *  row. It holds people's names and possibly home addresses, so it is written
 *  only to the gitignored scripts/out/ path (gate G7), never to public/. */
export interface MailingCluster {
  key: string
  address: string
  city: string | null
  zip: string | null
  foodOwners: { name: string; kind: OwnerKind }[]
  /** Distinct owners of every sector registered at the address. */
  allOwners: number
  brands: string[]
  storefronts: string[]
  foodBuilding: boolean
  /** Every open registration at the address is a company → publishable. */
  allCompanies: boolean
}

export interface SharedAddressResult {
  published: SharedMailingAddress[]
  /** Survivors withheld because a non-company is registered at the address. */
  withheldCount: number
  queue: MailingCluster[]
  removed: { undeliverable: number; agentShare: number; agentList: number; venue: number }
}

/**
 * Cluster open food registrations by mailing address and run F1–F5. A
 * cluster needs 2+ distinct food owners. Survivors are all queued; those
 * where EVERY open registration at the address (every sector) is a company
 * are published as the shared-address FACT, the rest counted as withheld.
 */
export function sharedMailingAddresses(
  rows: readonly RegistryRow[],
  opts: OwnerGroupOptions & { agentKeys?: ReadonlySet<string> } = {},
): SharedAddressResult {
  const keyOf = opts.keyOf ?? defaultKeyOf
  const agents = opts.agentKeys ?? AGENT_MAILING_KEYS
  const open = rows.filter(isOpenRow)
  const all = new Map<string, RegistryRow[]>()
  for (const r of open) {
    const k = mailingKey(r)
    if (!k) continue
    const list = all.get(k)
    if (list) list.push(r)
    else all.set(k, [r])
  }
  const food = open.filter(isFoodRegistryRow)
  // F4 index: business storefront key → distinct food owners doing business there.
  const tenants = new Map<string, Set<string>>()
  for (const r of food) {
    const k = keyOf(r)
    if (!k) continue
    ;(tenants.get(k) ?? tenants.set(k, new Set()).get(k)!).add(ownerGroupKey(r.ownership_name))
  }
  const removed = { undeliverable: 0, agentShare: 0, agentList: 0, venue: 0 }
  const queue: MailingCluster[] = []
  for (const [key, everyRow] of all) {
    const foodHere = everyRow.filter(isFoodRegistryRow)
    const foodOwnerKeys = new Set(foodHere.map((r) => ownerGroupKey(r.ownership_name)).filter(Boolean))
    if (foodOwnerKeys.size < 2) continue
    const street = mostCommon(everyRow.map((r) => (r.mailing_address_1 ?? '').replace(/\s+/g, ' ').trim()))
    if (isUndeliverableMailing(street)) { removed.undeliverable++; continue }
    const allOwnerKeys = new Set(everyRow.map((r) => ownerGroupKey(r.ownership_name)).filter(Boolean))
    if (allOwnerKeys.size >= 15 && foodOwnerKeys.size / allOwnerKeys.size < 0.5) { removed.agentShare++; continue }
    if (agents.has(key)) { removed.agentList++; continue }
    const streetKey = storefrontKey(street)
    if (isVenue(streetKey)) { removed.venue++; continue }
    const ownersByKey = new Map<string, string[]>()
    for (const r of foodHere) {
      const o = ownerGroupKey(r.ownership_name)
      if (!o) continue
      const list = ownersByKey.get(o)
      if (list) list.push(cleanOwnerName(r.ownership_name))
      else ownersByKey.set(o, [cleanOwnerName(r.ownership_name)])
    }
    const foodOwners = [...ownersByKey.values()].map(mostCommon).sort().map((name) => ({ name, kind: ownerKind(name) }))
    const cities = everyRow.map((r) => mailCityLabel(r)).filter((c): c is string => c !== null)
    queue.push({
      key,
      address: street,
      city: cities.length ? mostCommon(cities) : null,
      zip: key.split(' | ')[1] || null,
      foodOwners,
      allOwners: allOwnerKeys.size,
      brands: [...new Set(foodHere.map((r) => displayBrand(r.dba_name)).filter(Boolean))].sort(),
      storefronts: [...new Set(foodHere.map(keyOf).filter(Boolean))].sort(),
      foodBuilding: (tenants.get(streetKey)?.size ?? 0) >= 3,
      allCompanies: everyRow.every((r) => isCompany(r.ownership_name)),
    })
  }
  queue.sort((a, b) => b.foodOwners.length - a.foodOwners.length || (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
  const published: SharedMailingAddress[] = queue
    .filter((c) => c.allCompanies)
    .map((c) => ({
      key: c.key,
      address: c.address,
      city: c.city,
      zip: c.zip,
      companies: c.foodOwners.map((o) => o.name),
      brands: c.brands,
      storefronts: c.storefronts,
      foodBuilding: c.foodBuilding,
    }))
  return { published, withheldCount: queue.length - published.length, queue, removed }
}

// ── curated groups (gate G6) ───────────────────────────────────────────

export const GROUP_EVIDENCE_KINDS: readonly GroupEvidenceKind[] = [
  'registry-mailing-address',
  'shared-trade-name',
  'group-website',
  'abc-licensee-address',
  'sos-agent-address',
]

function isRealDay(s: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return false
  const [y, m, d] = s.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d))
  return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d
}

// The retired DataSF host, assembled so portalHost.test.ts's source scan
// (which fails the build on the literal) never flags this guard itself.
const RETIRED_PORTAL_HOST = ['data', 'sfgov', 'org'].join('.')

/** Gate G6 for one curated group: the list of problems ([] = valid). */
export function validateCuratedGroup(g: CuratedGroup): string[] {
  const errs: string[] = []
  const where = `group "${g.id}"`
  if (!/^[a-z0-9]+(-[a-z0-9]+)*$/.test(g.id)) errs.push(`${where}: id must be a lower-case slug`)
  if (!g.label.trim()) errs.push(`${where}: empty label`)
  if (!g.brands.length) errs.push(`${where}: needs at least one brand`)
  if (g.companies.length < 2) errs.push(`${where}: a group needs 2+ registered companies`)
  const kinds = new Set(g.evidence.map((e) => e.kind))
  if (kinds.size < 2) errs.push(`${where}: needs 2+ distinct evidence kinds, has ${kinds.size}`)
  for (const e of g.evidence) {
    if (!GROUP_EVIDENCE_KINDS.includes(e.kind)) errs.push(`${where}: unknown evidence kind "${e.kind}"`)
    if (!/^https:\/\/\S+$/.test(e.url)) errs.push(`${where}: evidence url must be https ("${e.url}")`)
    if (e.url.toLowerCase().includes(RETIRED_PORTAL_HOST)) errs.push(`${where}: evidence url uses the retired ${RETIRED_PORTAL_HOST} host`)
    if (!isRealDay(e.checked)) errs.push(`${where}: evidence checked date must be YYYY-MM-DD ("${e.checked}")`)
    if (!e.detail.trim()) errs.push(`${where}: evidence detail is empty`)
  }
  return errs
}
