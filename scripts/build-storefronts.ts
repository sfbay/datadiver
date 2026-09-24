/**
 * build-storefronts.ts
 *
 * Generator for Behind the Storefront's committed snapshot
 * (`public/data/restaurants/storefronts.json`) — everything the Restaurants
 * view shows that joins inspection ERAS or the business REGISTRY: turnover
 * chains, owners of record, 2020+ closure episodes for the map and lists, the
 * 2016–23 biography lanes, visible multi-location owners, the franchise
 * inversion, and the shared-mailing-address fact.
 *
 * Spec: docs/superpowers/specs/2026-09-24-restaurant-inspections-design.md
 * §3.4, AS AMENDED BY §11 (Jesse's rulings, 2026-09-24).
 *
 * ONE NORMALIZER. Every rule is imported from the SAME leaves the view uses —
 * `src/lib/storefronts/*` (keys, identity, name chains, venues, registry rows,
 * owner labels, owner groups) and `src/views/Restaurants/*` (food permits,
 * placards, the episode rule, violation families). This file only fetches,
 * joins and gates; it never re-implements a rule.
 *
 * INPUTS (live, data.sf.gov — never the retired legacy host):
 *   pyih-qa8i  2016–19 scores, grouped to one row per inspection
 *   5tti-66ds  2020–23 placards, grouped to one row per inspection
 *   tvy3-wexg  2024+ placards, raw rows, today-clamped (a junk 2031 row exists)
 *   g8m3-pdis  the full business registry, paged, deduped by `uniqueid`
 *
 * GATES (any failure → exit 1, nothing written):
 *   G0  every live tvy3 permit_type is classified, and a live count under
 *       FOOD_WHERE equals total − non-food
 *   G1  era row counts at or above the dossier floors (B §1, §3)
 *   G2  no published storefront is a venue, multi-tenant, not a storefront
 *       address, or mostly non-storefront permits
 *   G3  (§11) no natural person's mailing street or ZIP anywhere in the file;
 *       a company mailing address only where EVERY registration at it — open
 *       or closed — is a company; every owner carries `mailCity`, and an
 *       undeliverable-placeholder registration carries `mailCity: null`
 *   G4  every operator counted toward `chainStrict` has 2+ inspection dates or
 *       ≥90 days of registry tenure (the ghost rule)
 *   G5  the episodes stored per storefront are exactly the pinned rule's
 *       output over the full 2024+ / 2020–23 extracts, permit for permit
 *   G6  every curated group (restaurantGroups.ts) has ≥2 evidence kinds, each
 *       with a URL and a checked date
 *   G7  the review queue — people's names, possibly home addresses — is
 *       written only under the gitignored scripts/out/
 *
 * DATES. DataSF datetimes are floating SF-local strings. Everything here works
 * on the 'YYYY-MM-DD' prefix as a string; `asOf` / the today clamp come from
 * sfTime.ts (never toISOString, which is UTC digits).
 *
 * Module scope stays side-effect-free: storefronts.test.ts imports
 * ARTIFACT_PATH and the artifact type; main() runs only under the CLI guard.
 *
 * Run:  pnpm build:storefronts          (needs network; ~2–4 min)
 *       pnpm build:storefronts --cache  (reuse fetched pages from scripts/out/cache
 *                                        — for iterating on rules only; the
 *                                        committed file must come from a fresh run)
 *       VITE_SOCRATA_APP_TOKEN is read from the environment if present.
 */

import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join, relative, resolve } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

import { canJoinById, facilityIdFrom5tti, inspectionKey5tti, pickRegistryRow, registryTenureDays } from '../src/lib/storefronts/identity'
import {
  groupOperators,
  isMultiTenant,
  isStrictOperator,
  longestChain,
  meetsTurnoverBar,
  turnoverBucket,
  turnoverExclusion,
  type OperatorGroup,
  type Sighting,
  type TurnoverExclusion,
} from '../src/lib/storefronts/nameChain'
import { franchiseBrands, ownerGroupKey, sharedMailingAddresses, validateCuratedGroup, visibleOwners, mailingKey } from '../src/lib/storefronts/ownerGroups'
import { isCompany, isUndeliverableMailing, mailCityLabel, ownerOf } from '../src/lib/storefronts/ownerLabel'
import { dedupeByUniqueId, isFoodRegistryRow, isOpenRow, registryDay, type RegistryRow } from '../src/lib/storefronts/registryRows'
import { applySuffixFill, buildSuffixFill, storefrontKey } from '../src/lib/storefronts/storefrontKey'
import type {
  ClosureEpisode,
  InspectionEra,
  PlacardReading,
  PublishingCount,
  ScoreBand,
  ScoreReading,
  SharedMailingAddress,
  SnapshotGroup,
  Storefront,
  StorefrontOperator,
  StorefrontOwner,
  StorefrontSnapshot,
  TurnoverBucket,
} from '../src/lib/storefronts/types'
import { isVenue } from '../src/lib/storefronts/venues'
import { RESTAURANT_GROUPS } from '../src/cities/sf/restaurantGroups'
import { HISTORICAL_NEIGHBORHOOD_BY_REGION_ID } from '../src/views/CrimeIncidents/crimeEra'
import {
  closureEpisodes,
  episodesByKey,
  meetsRepeatBar,
  summarizeEpisodes,
  type ClosureEpisode as RuleEpisode,
  type EpisodeSummary,
} from '../src/views/Restaurants/closureEpisodes'
import {
  FOOD_WHERE,
  NON_FOOD_PERMIT_TYPES,
  classifyPermit,
  isFoodPermit,
  unclassifiedPermitTypes,
} from '../src/views/Restaurants/foodPermits'
import { FEED_BREAK } from '../src/views/Restaurants/inspectionFeed'
import { normalizePlacard } from '../src/views/Restaurants/placard'
import { violationFamilies } from '../src/views/Restaurants/violationFamilies'
import { sfLocalCutoff } from '../src/utils/sfTime'

// ── Constants the test imports ──────────────────────────────────────────────

/** Repo-relative path of the committed snapshot. */
export const ARTIFACT_PATH = 'public/data/restaurants/storefronts.json'
/** Repo-relative path of the review queue — gitignored (G7). */
export const QUEUE_PATH = 'scripts/out/restaurant-groups-queue.json'

/** Headline figures measured at `asOf` — what the view's ledes and data
 *  notes cite. Carried in the snapshot beside the StorefrontSnapshot fields. */
export interface SnapshotStats {
  /** Doors with at least one food sighting that pass the storefront pattern. */
  storefrontAddresses: number
  /** …left out of turnover and the file, by reason (the {N} is their sum). */
  excluded: Record<Exclude<TurnoverExclusion, 'not-storefront'>, number>
  /** Doors meeting the turnover bar, and by owner-resolution bucket. */
  turnover: number
  buckets: Record<TurnoverBucket, number>
  /** Turnover doors by strict chain length (3, 4, 5+). */
  chainStrict: Record<string, number>
  /** The closure-episode rule over every FOOD-permit 2024+ reading (G5 scope). */
  episodes2024: EpisodeSummary & { beforeBreak: number; afterBreak: number }
  /** The same rule over EVERY 2024+ reading, any permit type (the spec's H/E scope). */
  episodes2024AllPermits: EpisodeSummary
  /** The rule over 2020–23 placards, keyed by facility id. */
  episodes2020: EpisodeSummary
  /** "Signs of vermin were cited at {n} of the {m} closure inspections at food
   *  businesses since January 2024" — distinct (permit, date) Closure readings
   *  under FOOD_WHERE. */
  vermin: { n: number; m: number }
  /** 2024+ storefront permits in the file whose current operator matched a
   *  registration (the "91% of inspected places match" disclosure). */
  registryMatch: { matched: number; total: number }
  /** Open food registrations in San Francisco and their mailing-city spread. */
  openFoodRegistrations: number
  mailCity: { sanFrancisco: number; undeliverable: number }
  /** Shared-mailing-address clusters: survivors of F1–F5, how many are
   *  published (all-company), withheld, and removed by each filter. */
  sharedAddressClusters: {
    survivors: number
    published: number
    withheld: number
    /** Withheld by the strict G3 re-check: an all-company OPEN set, but a
     *  closed registration at the address is not a company. */
    withheldByClosedRegistration: number
    removed: { undeliverable: number; agentShare: number; agentList: number; venue: number }
  }
  /** Row counts read live (G1). */
  rows: { pyih: number; tvy3: number; t5ti: number; registry: number }
  pyihInspections: number
  t5tiInspections: number
  scoreBands: Record<ScoreBand, number>
  /** The live data edge: max(inspection_date) ≤ today. */
  dataEdge: string
}

/** The committed file: the view's snapshot + the measured stats. */
export interface StorefrontArtifact extends StorefrontSnapshot {
  stats: SnapshotStats
}

// ── Pure helpers (exported for the test) ────────────────────────────────────

/** Dossier floors for G1 (B §1, §3). */
export const G1_FLOORS = {
  pyihRows: 53_973,
  t5tiRows: 49_562,
  tvy3Rows: 22_603,
  pyihInspections: 26_663,
  scoreBands: { Good: 7_809, Adequate: 3_168, 'Needs Improvement': 2_815, Poor: 239 } as Record<ScoreBand, number>,
}

/** SF's 2016–19 score bands (spec §6). */
export function scoreBand(score: number | null): ScoreBand | null {
  if (score === null || !Number.isFinite(score)) return null
  if (score >= 91) return 'Good'
  if (score >= 86) return 'Adequate'
  if (score >= 71) return 'Needs Improvement'
  return 'Poor'
}

/** Inside the city (Treasure Island included); drops the 0/90 junk and the
 *  43 out-of-bbox tvy3 points (A §5). */
export function inSf(lat: number, lng: number): boolean {
  return lat > 37.6 && lat < 37.85 && lng > -122.53 && lng < -122.35
}

const ADDRESS_WORD_CASE: Readonly<Record<string, string>> = {
  OFARRELL: "O'Farrell",
  OSHAUGHNESSY: "O'Shaughnessy",
}

/** A storefront key as a display address: '2704 24TH ST' → '2704 24th St',
 *  '455A CASTRO ST' → '455A Castro St', '1740 OFARRELL ST' → "1740 O'Farrell
 *  St". Built from the KEY, never the raw string, so no unit or suite token a
 *  raw address carried can reach the page. */
export function displayAddress(key: string): string {
  return key
    .split(' ')
    .map((t) => {
      if (ADDRESS_WORD_CASE[t]) return ADDRESS_WORD_CASE[t]
      if (/^\d+[A-Z½]?$/.test(t)) return t
      if (/^\d+(ST|ND|RD|TH)$/.test(t)) return t.toLowerCase()
      if (/^[NSEW]$/.test(t)) return t
      if (/^MC[A-Z]{2,}/.test(t)) return `Mc${t[2]}${t.slice(3).toLowerCase()}`
      return t.charAt(0) + t.slice(1).toLowerCase()
    })
    .join(' ')
}

const cmp = (a: string, b: string): number => (a < b ? -1 : a > b ? 1 : 0)

function mode<T extends string>(values: readonly (T | null | undefined)[]): T | null {
  const counts = new Map<T, number>()
  for (const v of values) if (v) counts.set(v, (counts.get(v) ?? 0) + 1)
  let best: T | null = null
  let bestN = 0
  for (const [v, n] of counts) if (n > bestN || (n === bestN && best !== null && v < best)) { best = v; bestN = n }
  return best
}

// ── SODA fetch ──────────────────────────────────────────────────────────────

const HOST = 'https://data.sf.gov'
const APP_TOKEN = process.env.VITE_SOCRATA_APP_TOKEN
const PAGE = 50_000
const CACHE_DIR = 'scripts/out/cache'
let useCache = false
let requestCount = 0

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function sodaOnce<T>(dataset: string, params: Record<string, string>, label: string): Promise<T[]> {
  const url = new URL(`${HOST}/resource/${dataset}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)
  const cacheFile = join(CACHE_DIR, `${createHash('sha1').update(url.href).digest('hex')}.json`)
  if (useCache && existsSync(cacheFile)) return JSON.parse(readFileSync(cacheFile, 'utf8')) as T[]

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN
  const attempts = 4
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    await sleep(attempt ? 2_000 * attempt : 150)
    requestCount += 1
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(240_000) })
      if (res.ok) {
        const rows = (await res.json()) as T[]
        if (useCache) {
          mkdirSync(CACHE_DIR, { recursive: true })
          writeFileSync(cacheFile, JSON.stringify(rows))
        }
        return rows
      }
      const body = await res.text().catch(() => '')
      if (!(res.status === 429 || res.status >= 500) || attempt === attempts - 1) {
        throw new Error(`SODA ${dataset} [${label}] ${res.status}: ${body.slice(0, 400)}`)
      }
      console.warn(`  retrying ${label} after ${res.status}`)
    } catch (err) {
      const e = err as Error
      if (e.message.startsWith('SODA ') || attempt === attempts - 1) throw e
      console.warn(`  retrying ${label} after ${e.name}: ${e.message}`)
    }
  }
  throw new Error(`unreachable: ${label}`)
}

/** Page a query with $order + $offset until a short page. `$order` is required —
 *  offset paging without a total order returns stray duplicates and gaps. */
async function sodaAll<T>(dataset: string, params: Record<string, string>, label: string): Promise<T[]> {
  if (!params.$order) throw new Error(`${label}: paging needs $order`)
  const out: T[] = []
  for (let offset = 0; ; offset += PAGE) {
    const rows = await sodaOnce<T>(dataset, { ...params, $limit: String(PAGE), $offset: String(offset) }, `${label} @${offset}`)
    out.push(...rows)
    console.log(`  ${label}: ${out.length.toLocaleString()} rows`)
    if (rows.length < PAGE) return out
  }
}

async function count(dataset: string, where?: string): Promise<number> {
  const params: Record<string, string> = { $select: 'count(*) AS n' }
  if (where) params.$where = where
  const rows = await sodaOnce<{ n: string }>(dataset, params, `${dataset} count`)
  return Number(rows[0]?.n ?? 0)
}

// ── Row shapes ──────────────────────────────────────────────────────────────

interface PyihRow {
  business_id?: string
  business_name?: string
  business_address?: string
  business_latitude?: string
  business_longitude?: string
  region?: string
  inspection_id?: string
  inspection_date?: string
  inspection_type?: string
  inspection_score?: string
  nv?: string
}

interface T5tiRow {
  inspection_id?: string
  inspection_type?: string
  name?: string
  address?: string
  date?: string
  facility_status?: string
  latitude?: string
  longitude?: string
}

interface Tvy3Row {
  permit_number?: string
  dba?: string
  street_address?: string
  street_address_clean?: string
  permit_type?: string
  inspection_date?: string
  inspection_type?: string
  facility_rating_status?: string
  violation_codes?: string
  latitude?: string
  longitude?: string
  analysis_neighborhood?: string
}

type RegRow = RegistryRow & { city?: string; business_zip?: string }

/** One inspection seen at a storefront, any era. */
interface Seen {
  era: InspectionEra
  /** Entity id within its era: pyih business_id, 5tti facility id, tvy3 permit. */
  id: string
  date: string
  name: string
  lat: number | null
  lng: number | null
}

// ── Gate bookkeeping ────────────────────────────────────────────────────────

const failures: string[] = []
function gate(id: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`)
  if (!ok) failures.push(`${id}: ${detail}`)
}

const num = (s: string | undefined): number | null => {
  if (s === undefined || s === null || s === '') return null
  const n = Number(s)
  return Number.isFinite(n) ? n : null
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  useCache = process.argv.includes('--cache')
  const started = Date.now()
  const T = sfLocalCutoff(Date.now()).slice(0, 10)
  const asOf = T
  console.log(`build-storefronts · asOf ${asOf}${useCache ? ' · CACHE (not for commit)' : ''}`)

  // ── G0: permit vocabulary ─────────────────────────────────────────────────
  console.log('\nG0 permit vocabulary')
  const types = await sodaOnce<{ permit_type?: string; n: string }>(
    'tvy3-wexg',
    { $select: 'permit_type, count(*) AS n', $group: 'permit_type', $limit: '1000' },
    'tvy3 permit types',
  )
  const unclassified = unclassifiedPermitTypes(types.map((t) => t.permit_type))
  const nullTypeRows = types.filter((t) => !t.permit_type).reduce((s, t) => s + Number(t.n), 0)
  const totalTypeRows = types.reduce((s, t) => s + Number(t.n), 0)
  const nonFoodRows = types
    .filter((t) => t.permit_type && NON_FOOD_PERMIT_TYPES.includes(t.permit_type))
    .reduce((s, t) => s + Number(t.n), 0)
  const foodLive = await count('tvy3-wexg', FOOD_WHERE)
  gate('G0', unclassified.length === 0, `unclassified permit types: ${unclassified.length ? unclassified.join(' | ') : 'none'} (${types.length} distinct)`)
  gate(
    'G0',
    foodLive === totalTypeRows - nonFoodRows - nullTypeRows,
    `FOOD_WHERE count ${foodLive} = total ${totalTypeRows} − non-food ${nonFoodRows}${nullTypeRows ? ` − untyped ${nullTypeRows}` : ''}`,
  )

  // ── G1: era floors ────────────────────────────────────────────────────────
  console.log('\nG1 era row counts')
  const [pyihCount, t5tiCount, tvy3Count] = await Promise.all([count('pyih-qa8i'), count('5tti-66ds'), count('tvy3-wexg')])
  gate('G1', pyihCount >= G1_FLOORS.pyihRows, `pyih-qa8i rows ${pyihCount} ≥ ${G1_FLOORS.pyihRows}`)
  gate('G1', t5tiCount >= G1_FLOORS.t5tiRows, `5tti-66ds rows ${t5tiCount} ≥ ${G1_FLOORS.t5tiRows}`)
  gate('G1', tvy3Count >= G1_FLOORS.tvy3Rows, `tvy3-wexg rows ${tvy3Count} ≥ ${G1_FLOORS.tvy3Rows}`)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  console.log('\nfetch')
  const pyihGroup = [
    'business_id', 'business_name', 'business_address', 'business_latitude', 'business_longitude',
    ':@computed_region_ajp5_b2md', 'inspection_id', 'inspection_date', 'inspection_type', 'inspection_score',
  ]
  const pyihRaw = await sodaAll<PyihRow & Record<string, string>>(
    'pyih-qa8i',
    {
      $select: `${pyihGroup.join(', ')}, count(violation_id) AS nv`,
      $group: pyihGroup.join(', '),
      $order: 'inspection_id, business_id',
    },
    'pyih-qa8i inspections',
  )
  const pyih: PyihRow[] = pyihRaw.map((r) => ({ ...r, region: r[':@computed_region_ajp5_b2md'] }))
  const t5tiGroup = ['inspection_id', 'inspection_type', 'name', 'address', 'date', 'facility_status', 'latitude', 'longitude']
  const t5ti = await sodaAll<T5tiRow>(
    '5tti-66ds',
    { $select: `${t5tiGroup.join(', ')}, count(*) AS n`, $group: t5tiGroup.join(', '), $order: 'inspection_id, inspection_type, date' },
    '5tti-66ds inspections',
  )
  const tvy3 = await sodaAll<Tvy3Row>(
    'tvy3-wexg',
    {
      $select: [
        'permit_number', 'dba', 'street_address', 'street_address_clean', 'permit_type', 'inspection_date',
        'inspection_type', 'facility_rating_status', 'violation_codes', 'latitude', 'longitude', 'analysis_neighborhood',
      ].join(', '),
      $where: `inspection_date <= '${T}'`,
      $order: ':id',
    },
    'tvy3-wexg rows',
  )
  const registryRaw = await sodaAll<RegRow>(
    'g8m3-pdis',
    {
      $select: [
        'uniqueid', 'certificate_number', 'ownership_name', 'dba_name', 'full_business_address', 'city', 'business_zip',
        'location_start_date', 'location_end_date', 'dba_end_date', 'administratively_closed', 'mailing_address_1',
        'mail_city', 'mail_state', 'mail_zipcode', 'self_reported_naics_code', 'lic',
      ].join(', '),
      $order: 'uniqueid',
    },
    'g8m3-pdis registry',
  )
  const registry = dedupeByUniqueId(registryRaw)
  console.log(`  registry: ${registryRaw.length.toLocaleString()} fetched → ${registry.length.toLocaleString()} after uniqueid dedupe`)
  const edgeRows = await sodaOnce<{ edge?: string }>(
    'tvy3-wexg',
    { $select: 'max(inspection_date) AS edge', $where: `inspection_date <= '${T}'` },
    'tvy3 data edge',
  )
  const dataEdge = (edgeRows[0]?.edge ?? '').slice(0, 10)

  // ── G1 (cont.): inspections and score bands ───────────────────────────────
  const pyihInspections = new Map<string, PyihRow>()
  for (const r of pyih) if (r.inspection_id && !pyihInspections.has(r.inspection_id)) pyihInspections.set(r.inspection_id, r)
  const bands: Record<ScoreBand, number> = { Good: 0, Adequate: 0, 'Needs Improvement': 0, Poor: 0 }
  for (const r of pyihInspections.values()) {
    const b = scoreBand(num(r.inspection_score))
    if (b) bands[b]++
  }
  gate('G1', pyihInspections.size >= G1_FLOORS.pyihInspections, `pyih inspections ${pyihInspections.size} ≥ ${G1_FLOORS.pyihInspections}`)
  for (const b of Object.keys(bands) as ScoreBand[]) {
    gate('G1', bands[b] >= G1_FLOORS.scoreBands[b], `score band ${b} ${bands[b]} ≥ ${G1_FLOORS.scoreBands[b]}`)
  }
  const t5tiInspectionKeys = new Set(t5ti.filter((r) => r.inspection_id).map((r) => inspectionKey5tti(r.inspection_id!, r.inspection_type)))

  // ── Keys: one normalizer, suffixes filled only where unambiguous ─────────
  const rawKeys: string[] = []
  for (const r of pyih) rawKeys.push(storefrontKey(r.business_address))
  for (const r of t5ti) rawKeys.push(storefrontKey(r.address))
  for (const r of tvy3) rawKeys.push(storefrontKey(r.street_address_clean || r.street_address))
  const fill = buildSuffixFill(rawKeys.filter(Boolean))
  const keyer = (raw: string | null | undefined): string => applySuffixFill(storefrontKey(raw), fill)

  // Each entity lives at its MODAL key, so one stray spelling never splits a
  // permit (or facility, or business) across two doors.
  const modalKey = <R>(rows: readonly R[], idOf: (r: R) => string | undefined, addrOf: (r: R) => string | undefined) => {
    const votes = new Map<string, string[]>()
    for (const r of rows) {
      const id = idOf(r)
      if (!id) continue
      const k = keyer(addrOf(r))
      if (!k) continue
      ;(votes.get(id) ?? votes.set(id, []).get(id)!).push(k)
    }
    const out = new Map<string, string>()
    for (const [id, ks] of votes) out.set(id, mode(ks)!)
    return out
  }
  const pyihKey = modalKey(pyih, (r) => r.business_id, (r) => r.business_address)
  const t5tiKey = modalKey(t5ti, (r) => (r.inspection_id ? facilityIdFrom5tti(r.inspection_id) : undefined), (r) => r.address)
  const tvy3Key = modalKey(tvy3, (r) => r.permit_number, (r) => r.street_address_clean || r.street_address)

  // ── Per-door collections ──────────────────────────────────────────────────
  interface Door {
    seen: Seen[]
    storefrontRows: number
    offsiteRows: number
    permits: Map<string, string> // storefront permit → last date
    facilities: Set<string>
    scores: ScoreReading[]
    placards: PlacardReading[]
    nhoods: string[]
    regionNhoods: string[]
  }
  const doors = new Map<string, Door>()
  const door = (k: string): Door => {
    let d = doors.get(k)
    if (!d) {
      d = { seen: [], storefrontRows: 0, offsiteRows: 0, permits: new Map(), facilities: new Set(), scores: [], placards: [], nhoods: [], regionNhoods: [] }
      doors.set(k, d)
    }
    return d
  }

  for (const r of pyihInspections.values()) {
    const k = r.business_id ? pyihKey.get(r.business_id) : undefined
    if (!k || !r.inspection_date) continue
    const d = door(k)
    const date = r.inspection_date.slice(0, 10)
    const name = (r.business_name ?? '').replace(/\s+/g, ' ').trim()
    const lat = num(r.business_latitude)
    const lng = num(r.business_longitude)
    d.seen.push({ era: 2016, id: r.business_id!, date, name, lat, lng })
    const score = num(r.inspection_score)
    d.scores.push({ date, type: r.inspection_type ?? '', score, band: scoreBand(score), violations: num(r.nv) ?? 0, name })
    const nh = r.region ? HISTORICAL_NEIGHBORHOOD_BY_REGION_ID[r.region] : undefined
    if (nh) d.regionNhoods.push(nh)
  }

  const seen5tti = new Set<string>()
  for (const r of t5ti) {
    if (!r.inspection_id || !r.date) continue
    const facility = facilityIdFrom5tti(r.inspection_id)
    const k = t5tiKey.get(facility)
    if (!k) continue
    const d = door(k)
    const date = r.date.slice(0, 10)
    const name = (r.name ?? '').replace(/\s+/g, ' ').trim()
    const ik = inspectionKey5tti(r.inspection_id, r.inspection_type)
    if (!seen5tti.has(ik)) {
      seen5tti.add(ik)
      d.seen.push({ era: 2020, id: facility, date, name, lat: num(r.latitude), lng: num(r.longitude) })
    }
    d.facilities.add(facility)
    const p = normalizePlacard(r.facility_status)
    if (p) {
      const status = p === 'pass' ? 'Pass' : p === 'conditional' ? 'Conditional Pass' : 'Closure'
      if (!d.placards.some((x) => x.date === date && x.facility === facility && x.status === status && x.type === (r.inspection_type ?? ''))) {
        d.placards.push({ date, status, type: r.inspection_type ?? '', facility, name })
      }
    }
  }

  for (const r of tvy3) {
    if (!r.permit_number || !r.inspection_date) continue
    const cls = classifyPermit(r.permit_type)
    if (cls !== 'storefront' && cls !== 'offsite-food') continue
    const k = tvy3Key.get(r.permit_number)
    if (!k) continue
    const d = door(k)
    const date = r.inspection_date.slice(0, 10)
    if (cls === 'offsite-food') {
      d.offsiteRows++
      continue
    }
    d.storefrontRows++
    d.seen.push({ era: 2024, id: r.permit_number, date, name: (r.dba ?? '').replace(/\s+/g, ' ').trim(), lat: num(r.latitude), lng: num(r.longitude) })
    const prev = d.permits.get(r.permit_number)
    if (!prev || date > prev) d.permits.set(r.permit_number, date)
    if (r.analysis_neighborhood) d.nhoods.push(r.analysis_neighborhood)
  }

  // ── Registry, joined by ADDRESS (never NAICS, never a number) ─────────────
  const inSfRegistry = (r: RegRow): boolean => {
    const c = (r.city ?? '').replace(/\s+/g, ' ').trim().toUpperCase()
    return c === 'SAN FRANCISCO' || (!c && (r.business_zip ?? '').startsWith('941'))
  }
  const sfRegistry = registry.filter(inSfRegistry)
  const regKeyOf = (r: RegistryRow): string => keyer(r.full_business_address)
  const regByKey = new Map<string, RegRow[]>()
  for (const r of sfRegistry) {
    const k = regKeyOf(r)
    if (!k) continue
    ;(regByKey.get(k) ?? regByKey.set(k, []).get(k)!).push(r)
  }

  // ── Episodes: the pinned rule over the FULL extracts ──────────────────────
  const foodReadings = tvy3
    .filter((r) => r.permit_number && r.inspection_date && isFoodPermit(r.permit_type))
    .map((r) => ({ key: r.permit_number!, date: r.inspection_date!, status: r.facility_rating_status }))
  const eps2024 = closureEpisodes(foodReadings, { sfToday: T })
  const eps2024All = closureEpisodes(
    tvy3.filter((r) => r.permit_number && r.inspection_date).map((r) => ({ key: r.permit_number!, date: r.inspection_date!, status: r.facility_rating_status })),
    { sfToday: T },
  )
  const eps2020 = closureEpisodes(
    t5ti.filter((r) => r.inspection_id && r.date).map((r) => ({ key: facilityIdFrom5tti(r.inspection_id!), date: r.date!, status: r.facility_status })),
    { sfToday: T },
  )
  const eps2024ByPermit = episodesByKey(eps2024)
  const eps2020ByFacility = episodesByKey(eps2020)

  // Violation families cited on each Closure reading (permit|date).
  const closureFamilies = new Map<string, Set<string>>()
  for (const r of tvy3) {
    if (!r.permit_number || !r.inspection_date || normalizePlacard(r.facility_rating_status) !== 'closure') continue
    if (!isFoodPermit(r.permit_type) || r.inspection_date.slice(0, 10) > T) continue
    const k = `${r.permit_number}|${r.inspection_date.slice(0, 10)}`
    const set = closureFamilies.get(k) ?? closureFamilies.set(k, new Set()).get(k)!
    for (const f of violationFamilies(r.violation_codes)) if (f !== 'closure-notice') set.add(f)
  }
  let verminN = 0
  for (const fams of closureFamilies.values()) if (fams.has('vermin')) verminN++

  const toSnapshotEpisode = (e: RuleEpisode, era: 2020 | 2024): ClosureEpisode => {
    const families = new Set<string>()
    if (era === 2024) for (const d of e.closureDates) for (const f of closureFamilies.get(`${e.key}|${d}`) ?? []) families.add(f)
    return {
      permit: e.key,
      era,
      start: e.start,
      clearedOn: e.clearedOn,
      days: e.days,
      closureVisits: e.closureVisits,
      sameDay: e.sameDay,
      afterBreak: e.afterBreak,
      familyIds: [...families].sort(),
    }
  }

  // ── Doors → storefronts ───────────────────────────────────────────────────
  console.log('\nstorefronts')
  const excluded: SnapshotStats['excluded'] = { venue: 0, 'multi-tenant': 0, 'non-storefront-permits': 0 }
  let storefrontAddresses = 0
  const storefronts: Storefront[] = []
  const ownerChecks: { owner: StorefrontOwner; row: RegistryRow }[] = []
  const strictChecks: { key: string; name: string; dates: number; tenure: number | null }[] = []
  let registryMatched = 0
  let registryTotal = 0

  for (const [key, d] of [...doors].sort((a, b) => cmp(a[0], b[0]))) {
    if (!d.seen.length) continue
    const sightings: Sighting[] = d.seen.map((s) => ({ name: s.name, date: s.date, era: s.era }))
    const ops = groupOperators(sightings)
    if (!ops.length) continue
    const foodRows = d.storefrontRows + d.offsiteRows
    const exclusion = turnoverExclusion({
      key,
      multiTenant: isMultiTenant(ops),
      nonStorefrontShare: foodRows ? d.offsiteRows / foodRows : null,
    })
    if (exclusion === 'not-storefront') continue
    storefrontAddresses++
    if (exclusion) {
      excluded[exclusion]++
      continue
    }

    const candidates = regByKey.get(key) ?? []
    const built = ops.map((op: OperatorGroup) => {
      const pick = pickRegistryRow(candidates, { name: op.name, dateList: op.dateList })
      const tenure = pick ? registryTenureDays(pick.row, asOf) : null
      let owner: StorefrontOwner | null = null
      if (pick) {
        owner = {
          ...ownerOf(pick.row),
          registeredFrom: registryDay(pick.row.location_start_date),
          registeredTo: registryDay(pick.row.location_end_date),
        }
        ownerChecks.push({ owner, row: pick.row })
      }
      return { op, owner, tenure, strict: isStrictOperator(op, tenure) }
    })
    const chainAll = longestChain(built.map((b) => ({ ...b, firstDate: b.op.firstDate, lastDate: b.op.lastDate })))
    const inChain = new Set(chainAll.map((c) => c.op))
    const strictChain = longestChain(
      built.filter((b) => b.strict).map((b) => ({ ...b, firstDate: b.op.firstDate, lastDate: b.op.lastDate, eras: b.op.eras })),
    )
    const bar = meetsTurnoverBar(strictChain)
    const bucket: TurnoverBucket | null = bar
      ? turnoverBucket(strictChain.map((b) => (b.owner ? ownerGroupKey(b.owner.name) : null)))
      : null

    const operators: StorefrontOperator[] = built.map((b) => ({
      name: b.op.name,
      firstDate: b.op.firstDate,
      lastDate: b.op.lastDate,
      dates: b.op.dateList.length,
      eras: b.op.eras,
      seenOnce: b.op.seenOnce,
      strict: b.strict,
      inChain: inChain.has(b.op),
      owner: b.owner,
    }))
    for (const b of strictChain) strictChecks.push({ key, name: b.op.name, dates: b.op.dateList.length, tenure: b.tenure })

    // Episodes at this door: its 2024+ storefront permits + its 2020–23 facilities.
    const permits = [...d.permits.keys()].sort()
    const episodes: ClosureEpisode[] = [
      ...[...d.facilities].sort().flatMap((f) => (eps2020ByFacility.get(f) ?? []).map((e) => toSnapshotEpisode(e, 2020))),
      ...permits.flatMap((p) => (eps2024ByPermit.get(p) ?? []).map((e) => toSnapshotEpisode(e, 2024))),
    ].sort((a, b) => cmp(a.start, b.start) || cmp(a.permit, b.permit))

    // D5: the CURRENT permit's own record — plus its 2020–23 facility when the
    // id joins by number (≥ 60,000, same door).
    const current = [...d.permits].sort((a, b) => cmp(b[1], a[1]) || cmp(a[0], b[0]))[0]?.[0]
    let repeatCurrent = false
    if (current) {
      const own: RuleEpisode[] = [...(eps2024ByPermit.get(current) ?? [])]
      for (const f of d.facilities) if (canJoinById(f, current, true)) own.push(...(eps2020ByFacility.get(f) ?? []))
      repeatCurrent = meetsRepeatBar(own)
      registryTotal++
      const currentOp = built
        .filter((b) => b.op.eras.includes(2024))
        .sort((a, b) => cmp(b.op.lastDate, a.op.lastDate))[0]
      if (currentOp?.owner) registryMatched++
    }

    // Coordinates: newest in-city point, 2024+ first (old-era coordinates are
    // biased — 0% for ids ≥ 80k, B trap 5).
    const point = [...d.seen]
      .filter((s) => s.lat !== null && s.lng !== null && inSf(s.lat, s.lng))
      .sort((a, b) => b.era - a.era || cmp(b.date, a.date))[0]

    storefronts.push({
      key,
      address: displayAddress(key),
      nhood: mode(d.nhoods) ?? mode(d.regionNhoods),
      lat: point ? Number(point.lat!.toFixed(6)) : null,
      lng: point ? Number(point.lng!.toFixed(6)) : null,
      permits,
      operators,
      chainStrict: strictChain.length,
      chainAll: chainAll.length,
      turnoverBucket: bucket,
      lanes: {
        scores2016: d.scores.sort((a, b) => cmp(a.date, b.date) || cmp(a.type, b.type)),
        placards2020: d.placards.sort((a, b) => cmp(a.date, b.date) || cmp(a.facility, b.facility) || cmp(a.status, b.status)),
      },
      episodes,
      repeatCurrent,
    })
  }

  // ── G2 ────────────────────────────────────────────────────────────────────
  console.log('\nG2–G5')
  const g2bad = storefronts.filter((s) => isVenue(s.key))
  gate('G2', g2bad.length === 0, `venue keys in file: ${g2bad.length}`)
  // Re-derive every published door's eligibility from its raw sightings —
  // the storefront pattern, the venue list, the single-tenant test and the
  // non-storefront permit share, independently of the loop that built it.
  const accepted = new Set(storefronts.map((s) => s.key))
  let g2recheck = 0
  for (const key of accepted) {
    const d = doors.get(key)!
    const ops = groupOperators(d.seen.map((s) => ({ name: s.name, date: s.date, era: s.era })))
    const foodRows = d.storefrontRows + d.offsiteRows
    if (turnoverExclusion({ key, multiTenant: isMultiTenant(ops), nonStorefrontShare: foodRows ? d.offsiteRows / foodRows : null }) !== null) g2recheck++
  }
  gate('G2', g2recheck === 0, `published keys failing the single-tenant / share re-check: ${g2recheck}`)

  // ── G4 ────────────────────────────────────────────────────────────────────
  const g4bad = strictChecks.filter((c) => !(c.dates >= 2 || (c.tenure ?? 0) >= 90))
  // A one-date operator can only be strict through a registration — so it must carry an owner.
  const flagBad = storefronts.flatMap((s) => s.operators.filter((o) => o.strict && o.dates < 2 && !o.owner))
  gate('G4', g4bad.length === 0 && flagBad.length === 0, `strict-chain operators without 2+ dates or 90 days' tenure: ${g4bad.length + flagBad.length}`)

  // ── G5 ────────────────────────────────────────────────────────────────────
  let g5mismatch = 0
  for (const s of storefronts) {
    for (const p of s.permits) {
      const want = JSON.stringify((eps2024ByPermit.get(p) ?? []).map((e) => [e.start, e.clearedOn, e.days, e.closureVisits, e.sameDay, e.afterBreak]))
      const got = JSON.stringify(
        s.episodes.filter((e) => e.era === 2024 && e.permit === p).map((e) => [e.start, e.clearedOn, e.days, e.closureVisits, e.sameDay, e.afterBreak]),
      )
      if (want !== got) g5mismatch++
    }
  }
  const sum2024 = summarizeEpisodes(eps2024)
  gate('G5', g5mismatch === 0, `permits whose stored episodes differ from the rule's full-extract output: ${g5mismatch}`)
  console.log(
    `  2024+ FOOD episodes: ${sum2024.episodes} at ${sum2024.keys} permits · cleared ${sum2024.cleared} (same day ${sum2024.sameDay}) · no later pass ${sum2024.unresolved} (${sum2024.unresolvedAfterBreak} after break) · median ${sum2024.medianDays} p75 ${sum2024.p75Days} p90 ${sum2024.p90Days} max ${sum2024.maxDays} · 2+ ${sum2024.keysWith2Plus} · 3+ ${sum2024.keysWith3Plus} · repeat bar ${sum2024.repeatKeys}`,
  )

  // ── Owners, franchises, shared mailing addresses ──────────────────────────
  console.log('\nowners')
  const owners = visibleOwners(sfRegistry, { keyOf: regKeyOf })
  const franchises = franchiseBrands(sfRegistry, { keyOf: regKeyOf })
  const shared = sharedMailingAddresses(registry, { keyOf: regKeyOf })

  // §11 strictly: EVERY owner registered at the address — closed registrations
  // too — must be a company, or the address is withheld as possibly a home.
  const nonCompanyMailing = new Set<string>()
  for (const r of registry) {
    if (isUndeliverableMailing(r.mailing_address_1)) continue
    const mk = mailingKey(r)
    if (mk && !isCompany(r.ownership_name)) nonCompanyMailing.add(mk)
  }
  const sharedAddresses: SharedMailingAddress[] = shared.published.filter((a) => !nonCompanyMailing.has(a.key))
  const withheldByClosed = shared.published.length - sharedAddresses.length
  const withheldSharedCount = shared.withheldCount + withheldByClosed

  // ── G3 ────────────────────────────────────────────────────────────────────
  console.log('\nG3 privacy')
  // Owners carry mailCity, computed from their own registration; undeliverable → null.
  const g3city = ownerChecks.filter(({ owner, row }) => {
    if (!('mailCity' in owner)) return true
    if (isUndeliverableMailing(row.mailing_address_1)) return owner.mailCity !== null
    return owner.mailCity !== mailCityLabel(row)
  })
  gate('G3', g3city.length === 0, `owners whose mailCity is missing or not their registration's plain city: ${g3city.length}`)
  // Published company addresses: every registration at them is a company.
  const byMailing = new Map<string, RegistryRow[]>()
  for (const r of registry) {
    const mk = mailingKey(r)
    if (mk) (byMailing.get(mk) ?? byMailing.set(mk, []).get(mk)!).push(r)
  }
  const g3addr = sharedAddresses.filter((a) => (byMailing.get(a.key) ?? []).some((r) => !isCompany(r.ownership_name)))
  gate('G3', g3addr.length === 0, `published mailing addresses with a non-company registration: ${g3addr.length}`)

  const groups: SnapshotGroup[] = []
  // ── G6 ────────────────────────────────────────────────────────────────────
  console.log('\nG6 curated groups')
  const g6 = RESTAURANT_GROUPS.flatMap(validateCuratedGroup)
  const ids = RESTAURANT_GROUPS.map((g) => g.id)
  if (new Set(ids).size !== ids.length) g6.push('duplicate group ids')
  gate('G6', g6.length === 0, g6.length ? g6.join('; ') : `${RESTAURANT_GROUPS.length} curated group(s) valid`)
  for (const g of RESTAURANT_GROUPS) {
    const want = new Set(g.companies.map(ownerGroupKey))
    const keys = sfRegistry.filter((r) => isOpenRow(r) && isFoodRegistryRow(r) && want.has(ownerGroupKey(r.ownership_name))).map(regKeyOf)
    groups.push({ ...g, storefronts: [...new Set(keys.filter(Boolean))].sort() })
  }

  // ── Publishing strip ──────────────────────────────────────────────────────
  const publishing: PublishingCount[] = []
  const bump = (era: InspectionEra, date: string | undefined, m: Map<string, number>) => {
    if (!date) return
    const y = date.slice(0, 4)
    m.set(`${era}|${y}`, (m.get(`${era}|${y}`) ?? 0) + 1)
  }
  const pubMap = new Map<string, number>()
  for (const r of pyihInspections.values()) bump(2016, r.inspection_date, pubMap)
  const t5tiFirst = new Map<string, string>()
  for (const r of t5ti) if (r.inspection_id && r.date) t5tiFirst.set(inspectionKey5tti(r.inspection_id, r.inspection_type), r.date)
  for (const d of t5tiFirst.values()) bump(2020, d, pubMap)
  for (const r of tvy3) bump(2024, r.inspection_date, pubMap)
  for (const [k, n] of [...pubMap].sort((a, b) => cmp(a[0], b[0]))) {
    const [era, year] = k.split('|').map(Number)
    publishing.push({ era: era as InspectionEra, year, inspections: n })
  }

  // ── Stats ─────────────────────────────────────────────────────────────────
  const buckets: Record<TurnoverBucket, number> = { 'three-owners': 0, 'same-owner': 0, 'owner-returned': 0, 'owners-unknown': 0 }
  const chainHist: Record<string, number> = {}
  for (const s of storefronts) {
    if (!s.turnoverBucket) continue
    buckets[s.turnoverBucket]++
    const k = s.chainStrict >= 5 ? '5+' : String(s.chainStrict)
    chainHist[k] = (chainHist[k] ?? 0) + 1
  }
  const openFood = sfRegistry.filter((r) => isOpenRow(r) && isFoodRegistryRow(r))
  const stats: SnapshotStats = {
    storefrontAddresses,
    excluded,
    turnover: storefronts.filter((s) => s.turnoverBucket).length,
    buckets,
    chainStrict: chainHist,
    episodes2024: {
      ...sum2024,
      beforeBreak: eps2024.filter((e) => e.start < FEED_BREAK).length,
      afterBreak: eps2024.filter((e) => e.start >= FEED_BREAK).length,
    },
    episodes2024AllPermits: summarizeEpisodes(eps2024All),
    episodes2020: summarizeEpisodes(eps2020),
    vermin: { n: verminN, m: closureFamilies.size },
    registryMatch: { matched: registryMatched, total: registryTotal },
    openFoodRegistrations: openFood.length,
    mailCity: {
      sanFrancisco: openFood.filter((r) => mailCityLabel(r) === 'San Francisco').length,
      undeliverable: openFood.filter((r) => isUndeliverableMailing(r.mailing_address_1)).length,
    },
    sharedAddressClusters: {
      survivors: shared.queue.length,
      published: sharedAddresses.length,
      withheld: withheldSharedCount,
      withheldByClosedRegistration: withheldByClosed,
      removed: shared.removed,
    },
    rows: { pyih: pyihCount, tvy3: tvy3Count, t5ti: t5tiCount, registry: registry.length },
    pyihInspections: pyihInspections.size,
    t5tiInspections: t5tiInspectionKeys.size,
    scoreBands: bands,
    dataEdge,
  }

  const artifact: StorefrontArtifact = {
    asOf,
    storefronts,
    owners,
    franchises,
    sharedAddresses,
    withheldSharedCount,
    groups,
    publishing,
    excludedAddresses: excluded.venue + excluded['multi-tenant'] + excluded['non-storefront-permits'],
    stats,
  }
  const json = JSON.stringify(artifact)

  // ── G3 (cont.): scan the serialized file ──────────────────────────────────
  const personStreets = new Set<string>()
  for (const r of registry) {
    if (isCompany(r.ownership_name) || isUndeliverableMailing(r.mailing_address_1)) continue
    const s = normStreet(r.mailing_address_1)
    if (s) personStreets.add(s)
  }
  const leaks = scanForPersonAddresses(artifact, personStreets)
  gate('G3', leaks.length === 0, `strings matching a non-company mailing street, or ZIP-shaped values outside sharedAddresses: ${leaks.length}${leaks.length ? ` (${leaks.slice(0, 5).join(' | ')})` : ''}`)

  // ── G7 ────────────────────────────────────────────────────────────────────
  console.log('\nG7 review queue')
  const queueAbs = resolve(QUEUE_PATH)
  let ignored = false
  try {
    execFileSync('git', ['check-ignore', '-q', QUEUE_PATH], { stdio: 'ignore' })
    ignored = true
  } catch {
    ignored = false
  }
  gate('G7', relative(resolve('scripts/out'), queueAbs).split('/')[0] !== '..' && ignored, `${QUEUE_PATH} is under scripts/out/ and gitignored: ${ignored}`)

  // ── Write ─────────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(`\n${failures.length} gate failure(s) — nothing written:\n  ${failures.join('\n  ')}`)
    process.exitCode = 1
    return
  }
  mkdirSync(dirname(ARTIFACT_PATH), { recursive: true })
  writeFileSync(ARTIFACT_PATH, json)
  mkdirSync(dirname(QUEUE_PATH), { recursive: true })
  writeFileSync(QUEUE_PATH, JSON.stringify({ asOf, clusters: shared.queue }, null, 1))

  const gz = gzipSync(json).length
  console.log(`\nwrote ${ARTIFACT_PATH}: ${(json.length / 1e6).toFixed(2)} MB raw · ${(gz / 1e6).toFixed(2)} MB gzip`)
  console.log(`wrote ${QUEUE_PATH}: ${shared.queue.length} clusters (gitignored)`)
  console.log(JSON.stringify({
    storefronts: storefronts.length,
    ...stats,
    owners: owners.length,
    ownersContract: owners.filter((o) => o.contract).length,
    franchises: franchises.length,
    sharedAddresses: sharedAddresses.length,
    withheldSharedCount,
  }, null, 1))
  console.log(`\n${requestCount} SODA requests · ${((Date.now() - started) / 1000).toFixed(0)} s`)
}

/** A mailing street line in comparison form. */
export function normStreet(s: string | null | undefined): string {
  return (s ?? '').toUpperCase().replace(/[’'`.,#]/g, ' ').replace(/\s+/g, ' ').trim()
}

/**
 * G3's file scan. Walks every string in the artifact and reports:
 *   · a value equal (in comparison form) to a NON-company registration's
 *     mailing street line — anywhere, including business-location fields
 *     (a storefront key is compared too: a door that is also a person's
 *     mailing address is still a public DPH business address, so those are
 *     skipped only on the storefront location paths);
 *   · a ZIP-shaped value outside `sharedAddresses[].zip` (permit numbers and
 *     facility ids are five-digit too, so their own fields are exempt).
 */
export function scanForPersonAddresses(artifact: unknown, personStreets: ReadonlySet<string>): string[] {
  const hits: string[] = []
  const ID_PATH = /\.(facility|permit)$|\.permits\[\d+\]$/
  const LOCATION_PATH = /^storefronts\[\d+\]\.(key|address)$|\.storefronts\[\d+\]$|^sharedAddresses\[\d+\]\.(key|address)$/
  const walk = (v: unknown, path: string): void => {
    if (typeof v === 'string') {
      if (/^\d{5}(-\d{4})?$/.test(v.trim()) && !ID_PATH.test(path) && !/^sharedAddresses\[\d+\]\.zip$/.test(path)) hits.push(`${path}=${v}`)
      if (!LOCATION_PATH.test(path) && personStreets.has(normStreet(v))) hits.push(`${path}=${v}`)
    } else if (Array.isArray(v)) {
      v.forEach((x, i) => walk(x, `${path}[${i}]`))
    } else if (v !== null && typeof v === 'object') {
      for (const [k, x] of Object.entries(v as Record<string, unknown>)) walk(x, path ? `${path}.${k}` : k)
    }
  }
  walk(artifact, '')
  return hits
}

// CLI entry guard — module scope must stay side-effect-free (the snapshot test
// imports ARTIFACT_PATH and the artifact type from this file).
const isCliEntry = (() => {
  if (!process.argv[1]) return false
  try {
    return pathToFileURL(process.argv[1]).href === import.meta.url
  } catch {
    return false
  }
})()
if (isCliEntry) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
