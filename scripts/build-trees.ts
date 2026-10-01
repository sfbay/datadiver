/**
 * build-trees.ts
 *
 * Generator for the Trees view's committed snapshots:
 *   public/data/trees/trees.json        one columnar entry per inventory SITE
 *                                       (map point, species, kind, trunk class,
 *                                       planting year, neighborhood, removal
 *                                       notices posted there, 311 fall reports
 *                                       within 30 m)
 *   public/data/trees/aggregates.json   species ranks, neighborhood table with
 *                                       both equity denominators, fall-report
 *                                       years, removal-notice arithmetic
 *   public/data/trees/disappeared.json  sites that left the inventory between
 *                                       two snapshots (and same-site species or
 *                                       planting-year changes — ruling R3)
 *
 * Spec: docs/superpowers/specs/2026-09-30-trees-design.md — §10 (Fable review)
 * SUPERSEDES §1–§9. Plan: docs/superpowers/plans/2026-09-30-trees.md, Task 6,
 * as amended by "Rulings after the first generator run" (R1–R3).
 *
 * ONE RULEBOOK. Every rule is imported from the leaves the view also uses —
 * `src/lib/trees/*` (species parser + row classes, trunk class, notice site
 * ids, fall-report rules + the 30 m grid, equity math). This file only
 * fetches, joins and gates; it never re-implements a rule.
 *
 * INPUTS (live, data.sf.gov — never the retired legacy host):
 *   tkzw-k3nq  Street Tree Inventory, paged by treeid (a treeid names a SITE)
 *   qrwx-q4gg  Street Tree Removal Notifications (a notice is not a removal)
 *   vw6y-z8j6  311 cases, "Tree Maintenance" fallen_tree / about_to_fall since
 *              2021 (FALL_WHERE)
 *   src/data/census-neighborhoods.json                 ACS, 41 neighborhoods
 *   public/data/geo/sf-analysis-neighborhoods.geojson  boundaries (`nhood`)
 *
 * GATES (any failure → exit 1, nothing written):
 *   G0  every distinct inventory species string that LOOKS like a non-tree
 *       (stump / planting site / shrub / vacant / empty basin) is classed by
 *       the authored list in species.ts
 *   G1  paged inventory row count within 0.5% of a live count(*) taken AFTER
 *       the paged read (a snapshot made mid-refresh is refused)
 *   G2  every non-null inventory analysis_neighborhood is one of the 41; each
 *       of the 41 has a boundary feature and a census row WITH a finite
 *       totalPopulation (censusPopulationGaps); every sp/nb index
 *       resolves; every NON-BLANK 311 analysis_neighborhood is one of the 41
 *       (blank is allowed and counted); every UNFLAGGED neighborhood has a
 *       finite, positive population, area and median income and a finite
 *       poverty rate (a missing census figure is published as null, never 0)
 *   G3  the most recent FULL year's non-duplicate fall reports are placeable
 *       (placed share ≥ PLACEABLE_FLOOR, 75%). Older unplaceable years are
 *       recorded (placedShare / placeable on each FallYear) and shown citywide
 *       only — ruling R1; they are not fatal
 *   G4  removal-notice rows whose id joins to nothing ≤ 1%
 *   G5  disappeared.json only diffs two snapshots whose asOf dates differ
 *   G6  gzip size of trees.json ≤ 2.5 MB
 *
 * DATES. DataSF datetimes are floating SF-local strings. Everything here works
 * on the 'YYYY-MM-DD' prefix as text; `asOf` comes from sfLocalCutoff (never
 * toISOString, which is UTC digits).
 *
 * REGENERATING = re-pin src/lib/trees/trees.test.ts + About sourceNotes.ts +
 * docs/data-insights.md in the SAME commit. The failing pins are the checklist.
 *
 * Module scope stays side-effect-free: trees.test.ts imports the path
 * constants from this file; main() runs only under the CLI guard.
 *
 * Run:  pnpm build:trees    (needs network; ~1–3 min)
 *       VITE_SOCRATA_APP_TOKEN is read from the environment if present.
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { gzipSync } from 'node:zlib'
import { pathToFileURL } from 'node:url'

import { sodaAll, sodaCount } from './lib/soda'
import { equityCorrelations, equityFlag, equityRows, featureAreaKm2, type EquityInput } from '../src/lib/trees/equity'
import {
  FALL_WHERE, FALL_WINDOW_START, PLACEABLE_FLOOR, buildGrid, countWithin, fallKind, isCityDuplicate, isPlaced, placedShare,
} from '../src/lib/trees/fallReports'
import { noticeSiteId, readNotice } from '../src/lib/trees/siteNotices'
import { classifyRow, parseSpecies, unclassifiedNonTrees, type RowKind } from '../src/lib/trees/species'
import { TRUNK_CLASSES, trunkClass } from '../src/lib/trees/trunk'
import type {
  DisappearedLog,
  DisappearedRun,
  FallYear,
  NeighborhoodAggregate,
  SpeciesAggregate,
  TreesAggregates,
  TreesSnapshot,
} from '../src/lib/trees/types'
import { NON_RESIDENTIAL_NEIGHBORHOODS, SF_NEIGHBORHOODS } from '../src/utils/geo'
import { sfLocalCutoff } from '../src/utils/sfTime'

// ── Constants the test imports ──────────────────────────────────────────────

export const TREES_PATH = 'public/data/trees/trees.json'
export const AGGREGATES_PATH = 'public/data/trees/aggregates.json'
export const DISAPPEARED_PATH = 'public/data/trees/disappeared.json'

const CENSUS_PATH = 'src/data/census-neighborhoods.json'
const BOUNDARY_PATH = 'public/data/geo/sf-analysis-neighborhoods.geojson'

const INVENTORY = 'tkzw-k3nq'
const NOTICES = 'qrwx-q4gg'
const CASES_311 = 'vw6y-z8j6'

/** G6 ceiling for the gzipped map file. */
const G6_GZIP_MAX = 2.5e6

interface InvRow { treeid: string; species?: string; planteddate?: string; mapdbh?: string; latitude?: string; longitude?: string; analysis_neighborhood?: string; data_as_of?: string }
interface NoticeRow { treeid?: string; posteddate: string; postedtype?: string }
interface FallRow { requested_datetime: string; service_details?: string; status_notes?: string; lat?: string; long?: string; analysis_neighborhood?: string }

interface CensusRow { name: string; totalPopulation?: number | null; medianIncome?: number | null; povertyRate?: number | null }
interface BoundaryFeature { properties: { nhood: string }; geometry: { type: 'Polygon' | 'MultiPolygon'; coordinates: unknown } }

const KIND_CODE: Readonly<Record<RowKind, number>> = { tree: 0, stump: 1, site: 2, shrub: 3 }

// ── Gate bookkeeping ────────────────────────────────────────────────────────

const failures: string[] = []
function gate(id: string, ok: boolean, detail: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'} ${id} ${detail}`)
  if (!ok) failures.push(`${id}: ${detail}`)
}

const ymd = (s: string | null | undefined): string => (s ?? '').slice(0, 10)
const pct = (n: number, d: number): string => (d ? `${((n / d) * 100).toFixed(1)}%` : '—')

// ── Disappeared log (pure; unit-tested in scripts/__tests__/build-trees.test.ts) ──

/** The columns the diff reads. */
export type SnapshotIdentity = Pick<TreesSnapshot, 'asOf' | 'id' | 'sp' | 'species' | 'yr'>

/**
 * Diff two snapshots by site id: `gone` = present in `prior`, absent in `now`;
 * `changed` = same site, different species string OR planting year (ruling R3).
 * A NULL species reads as '' on both sides, a missing planting year as 0.
 */
export function diffSnapshots(prior: SnapshotIdentity, now: SnapshotIdentity): DisappearedRun {
  const nowBySite = new Map<number, { species: string; planted: number }>()
  for (let i = 0; i < now.id.length; i += 1) {
    nowBySite.set(now.id[i], { species: now.sp[i] === -1 ? '' : now.species[now.sp[i]], planted: now.yr[i] })
  }
  const gone: number[] = []
  const changed: DisappearedRun['changed'] = []
  for (let i = 0; i < prior.id.length; i += 1) {
    const pid = prior.id[i]
    const was = prior.sp[i] === -1 ? '' : prior.species[prior.sp[i]]
    const plantedWas = prior.yr[i]
    const cur = nowBySite.get(pid)
    if (cur === undefined) gone.push(pid)
    else if (cur.species !== was || cur.planted !== plantedWas) {
      changed.push({ id: pid, was, now: cur.species, plantedWas, plantedNow: cur.planted })
    }
  }
  gone.sort((a, b) => a - b)
  changed.sort((a, b) => a.id - b.id)
  return { from: prior.asOf, to: now.asOf, gone, changed }
}

/**
 * G5. Decide what disappeared.json becomes on this run:
 * - no prior snapshot → a fresh log, tracking from this run, no runs;
 * - prior with the SAME asOf → `log: null` (leave the file untouched);
 * - prior with a LATER asOf → gate failure;
 * - otherwise → the existing log (or a new one tracking from the prior's asOf)
 *   with this run's diff added: APPENDED as a new run, or — when the log's
 *   last run already has this same `from` and `to` (a run that died after
 *   writing the log but before writing trees.json) — REPLACING that last run,
 *   so the step is never recorded twice and the log matches the trees.json
 *   written now. Never mutates its inputs.
 */
export function nextDisappearedLog(
  prior: SnapshotIdentity | null,
  now: SnapshotIdentity,
  priorLog: DisappearedLog | null,
): { log: DisappearedLog | null; ok: boolean; detail: string } {
  if (!prior) return { log: { trackingSince: now.asOf, runs: [] }, ok: true, detail: `no prior snapshot; tracking begins ${now.asOf}` }
  if (prior.asOf === now.asOf) {
    return { log: null, ok: true, detail: `prior snapshot has the same asOf (${now.asOf}); disappeared.json left untouched` }
  }
  if (prior.asOf > now.asOf) {
    return { log: null, ok: false, detail: `prior snapshot asOf ${prior.asOf} is AFTER this run's ${now.asOf}` }
  }
  const run = diffSnapshots(prior, now)
  const base: DisappearedLog = priorLog ?? { trackingSince: prior.asOf, runs: [] }
  const last = base.runs[base.runs.length - 1]
  // A run that died between the log write and the snapshot write left a run
  // for this same step (same `from`, same `to`) in the log while trees.json
  // stayed at `from`. Re-running must not record the step twice: the new
  // diff REPLACES that run, so the log matches the snapshot written now.
  const repeat = last !== undefined && last.from === run.from && last.to === run.to
  const runs = repeat ? [...base.runs.slice(0, -1), run] : [...base.runs, run]
  return {
    log: { trackingSince: base.trackingSince, runs },
    ok: true,
    detail: `${repeat ? 're-diffed (replacing an unfinished run) ' : 'diffed '}${prior.asOf} → ${now.asOf}: ` +
      `${run.gone.length} sites gone, ${run.changed.length} species or planting-year changes`,
  }
}

/**
 * G2's census check: the names among `names` whose census row is missing or
 * carries no finite `totalPopulation`. A missing population must fail the
 * gate — read as 0 it would flag the neighborhood "small-population" in
 * silence and drop it from the equity comparison.
 */
export function censusPopulationGaps(
  census: readonly { name: string; totalPopulation?: number | null }[],
  names: readonly string[],
): string[] {
  const byName = new Map(census.map((c) => [c.name, c]))
  return names.filter((nm) => {
    const v = byName.get(nm)?.totalPopulation
    return !(typeof v === 'number' && Number.isFinite(v))
  })
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const started = Date.now()
  const asOf = sfLocalCutoff(Date.now()).slice(0, 10)
  const runYear = Number(asOf.slice(0, 4))
  console.log(`build-trees — asOf ${asOf}`)

  // ── Fetch ─────────────────────────────────────────────────────────────────
  const inv = await sodaAll<InvRow>(INVENTORY, {
    $select: 'treeid,species,planteddate,mapdbh,latitude,longitude,analysis_neighborhood,data_as_of',
    $order: 'treeid',
  }, 'inventory')
  const liveCount = await sodaCount(INVENTORY)
  const notices = await sodaAll<NoticeRow>(NOTICES, {
    $select: 'treeid,posteddate,postedtype',
    $order: ':id',
  }, 'notices')
  const falls = await sodaAll<FallRow>(CASES_311, {
    $where: FALL_WHERE,
    $select: 'requested_datetime,service_details,status_notes,lat,long,analysis_neighborhood',
    $order: 'service_request_id',
  }, 'fall reports')

  const census = JSON.parse(readFileSync(CENSUS_PATH, 'utf8')) as CensusRow[]
  const boundaries = JSON.parse(readFileSync(BOUNDARY_PATH, 'utf8')) as { features: BoundaryFeature[] }

  console.log('\ngates')

  // ── G1 ────────────────────────────────────────────────────────────────────
  const drift = liveCount ? Math.abs(inv.length - liveCount) / liveCount : 1
  gate('G1', drift <= 0.005, `paged ${inv.length.toLocaleString()} vs live count ${liveCount.toLocaleString()} (${(drift * 100).toFixed(2)}% apart, limit 0.5%)`)

  // ── G0 ────────────────────────────────────────────────────────────────────
  const distinctSpeciesStrings = [...new Set(inv.map((r) => (r.species ?? '').trim()).filter(Boolean))]
  const unclassed = unclassifiedNonTrees(distinctSpeciesStrings)
  gate('G0', unclassed.length === 0, `species strings that look like non-trees but are unclassed: ${unclassed.length}${unclassed.length ? ` (${unclassed.slice(0, 8).join(' | ')})` : ''}`)

  // ── Per-row codes ─────────────────────────────────────────────────────────
  const nbIndex = new Map<string, number>(SF_NEIGHBORHOODS.map((n, i) => [n, i]))
  const unknownNb = new Map<string, number>()
  const n = inv.length
  const rawSpecies: (string | null)[] = new Array(n)
  const kind: number[] = new Array(n)
  const cls: number[] = new Array(n)
  const yr: number[] = new Array(n)
  const nb: number[] = new Array(n)
  const x: number[] = new Array(n)
  const y: number[] = new Array(n)
  const id: number[] = new Array(n)
  const planted: (string | null)[] = new Array(n)
  let dataAsOf = ''
  for (let i = 0; i < n; i += 1) {
    const r = inv[i]
    id[i] = Number(r.treeid)
    const s = (r.species ?? '').trim()
    rawSpecies[i] = s || null
    kind[i] = KIND_CODE[classifyRow(rawSpecies[i])]
    cls[i] = TRUNK_CLASSES.indexOf(trunkClass(r.mapdbh))
    yr[i] = Number((r.planteddate ?? '').slice(0, 4)) || 0
    planted[i] = r.planteddate ? ymd(r.planteddate) : null
    const nh = (r.analysis_neighborhood ?? '').trim()
    if (nh) {
      const k = nbIndex.get(nh)
      if (k === undefined) unknownNb.set(nh, (unknownNb.get(nh) ?? 0) + 1)
      nb[i] = k ?? -1
    } else nb[i] = -1
    if (isPlaced(r.latitude, r.longitude)) {
      x[i] = Math.round((Number(r.longitude) + 123) * 1e5)
      y[i] = Math.round((Number(r.latitude) - 37) * 1e5)
    } else {
      x[i] = -1
      y[i] = -1
    }
    const d = ymd(r.data_as_of)
    if (d > dataAsOf) dataAsOf = d
  }

  // Species lookup: distinct non-null strings, by TREE count desc then string asc.
  const treeCountBySpecies = new Map<string, number>()
  for (let i = 0; i < n; i += 1) {
    const s = rawSpecies[i]
    if (s === null) continue
    treeCountBySpecies.set(s, (treeCountBySpecies.get(s) ?? 0) + (kind[i] === 0 ? 1 : 0))
  }
  const speciesTable = [...treeCountBySpecies.keys()].sort((a, b) =>
    (treeCountBySpecies.get(b)! - treeCountBySpecies.get(a)!) || (a < b ? -1 : a > b ? 1 : 0))
  const spIndex = new Map(speciesTable.map((s, i) => [s, i]))
  const sp = rawSpecies.map((s) => (s === null ? -1 : spIndex.get(s)!))

  // ── G2 ────────────────────────────────────────────────────────────────────
  const featureByName = new Map(boundaries.features.map((f) => [f.properties.nhood, f]))
  const censusByName = new Map(census.map((c) => [c.name, c]))
  const missingFeature = SF_NEIGHBORHOODS.filter((nm) => !featureByName.has(nm))
  const missingCensus = SF_NEIGHBORHOODS.filter((nm) => !censusByName.has(nm))
  // A row present but without a population is a gap too (never read as 0).
  const missingPopulation = censusPopulationGaps(census, SF_NEIGHBORHOODS).filter((nm) => censusByName.has(nm))
  let badIndex = 0
  for (let i = 0; i < n; i += 1) {
    if (sp[i] < -1 || sp[i] >= speciesTable.length || (sp[i] === -1) !== (rawSpecies[i] === null)) badIndex += 1
    if (nb[i] < -1 || nb[i] >= SF_NEIGHBORHOODS.length) badIndex += 1
    if (!Number.isInteger(id[i]) || id[i] <= 0) badIndex += 1
  }
  const duplicateIds = n - new Set(id).size
  gate('G2', unknownNb.size === 0 && missingFeature.length === 0 && missingCensus.length === 0 &&
    missingPopulation.length === 0 && badIndex === 0 && duplicateIds === 0,
    `unknown neighborhood names ${unknownNb.size}${unknownNb.size ? ` (${[...unknownNb].map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''} · ` +
    `missing boundary ${missingFeature.length}${missingFeature.length ? ` (${missingFeature.join(', ')})` : ''} · ` +
    `missing census ${missingCensus.length}${missingCensus.length ? ` (${missingCensus.join(', ')})` : ''} · ` +
    `census rows with no population ${missingPopulation.length}${missingPopulation.length ? ` (${missingPopulation.join(', ')})` : ''} · ` +
    `unresolved indexes ${badIndex} · duplicate site ids ${duplicateIds}`)

  // ── Removal notices (G4) ──────────────────────────────────────────────────
  const rowBySite = new Map<number, number>()
  for (let i = 0; i < n; i += 1) rowBySite.set(id[i], i)
  const nt: number[] = new Array(n).fill(0)
  const latestBySite = new Map<number, string>()   // latest DATED notice per site
  const noticeSiteSet = new Set<number>()
  let unjoinable = 0
  let undatedNotices = 0
  const byType = new Map<string, number>()
  const byYear = new Map<number, number>()
  for (const r of notices) {
    const t = (r.postedtype ?? '').trim() || 'Not recorded'
    byType.set(t, (byType.get(t) ?? 0) + 1)
    const yy = Number(ymd(r.posteddate).slice(0, 4))
    if (yy) byYear.set(yy, (byYear.get(yy) ?? 0) + 1)
    const site = noticeSiteId(r.treeid)
    if (site === null) { unjoinable += 1; continue }
    noticeSiteSet.add(site)
    const posted = ymd(r.posteddate)
    // An undated notice can't be placed before or after the tree: it stays out
    // of the replanted-after rule (counted in diagnostics).
    if (!posted) undatedNotices += 1
    else {
      const prev = latestBySite.get(site)
      if (prev === undefined || posted > prev) latestBySite.set(site, posted)
    }
    const row = rowBySite.get(site)
    if (row !== undefined) nt[row] += 1
  }
  let listed = 0
  let replantedAfter = 0
  for (const site of noticeSiteSet) {
    const row = rowBySite.get(site)
    if (row === undefined) continue
    listed += 1
    const posted = latestBySite.get(site)
    if (posted !== undefined && readNotice(posted, planted[row]) === 'earlier-tree') replantedAfter += 1
  }
  const noticeSites = noticeSiteSet.size
  gate('G4', notices.length > 0 && unjoinable / notices.length <= 0.01, `notice rows with no joinable site id: ${unjoinable} of ${notices.length} (${pct(unjoinable, notices.length)}, limit 1%)`)

  // ── Fall reports (G3) ─────────────────────────────────────────────────────
  const years: FallYear[] = []
  for (let yy = Number(FALL_WINDOW_START.slice(0, 4)); yy <= runYear; yy += 1) {
    years.push({ year: yy, fallen: 0, aboutToFall: 0, duplicates: 0, unplaced: 0, placedShare: 0, placeable: false, partial: yy === runYear })
  }
  const yearRow = new Map(years.map((r) => [r.year, r]))
  const placedPoints: { lat: number; lon: number }[] = []
  const reportsByDay = new Map<string, number>()
  const nbFalls = new Map<string, Map<number, [number, number]>>()
  const unknown311Nb = new Map<string, number>()   // NON-BLANK names outside the 41 (G2), any fall row
  let blank311Placed = 0                            // placed non-duplicate reports with a blank name
  let notFallKind = 0
  let outOfWindow = 0
  for (const r of falls) {
    const k = fallKind(r.service_details)
    if (k === null) { notFallKind += 1; continue }
    const nh = (r.analysis_neighborhood ?? '').trim()
    if (nh && !nbIndex.has(nh)) unknown311Nb.set(nh, (unknown311Nb.get(nh) ?? 0) + 1)
    const day = ymd(r.requested_datetime)
    const yr311 = yearRow.get(Number(day.slice(0, 4)))
    if (!yr311) { outOfWindow += 1; continue }
    if (isCityDuplicate(r.status_notes)) { yr311.duplicates += 1; continue }
    if (k === 'fallen') yr311.fallen += 1; else yr311.aboutToFall += 1
    reportsByDay.set(day, (reportsByDay.get(day) ?? 0) + 1)
    if (!isPlaced(r.lat, r.long)) { yr311.unplaced += 1; continue }
    placedPoints.push({ lat: Number(r.lat), lon: Number(r.long) })
    if (!nh) { blank311Placed += 1; continue }
    if (!nbIndex.has(nh)) continue // already failing G2
    let perYear = nbFalls.get(nh)
    if (!perYear) { perYear = new Map(); nbFalls.set(nh, perYear) }
    const cell = perYear.get(yr311.year) ?? [0, 0]
    if (k === 'fallen') cell[0] += 1; else cell[1] += 1
    perYear.set(yr311.year, cell)
  }
  gate('G2', unknown311Nb.size === 0,
    `311 fall reports naming a neighborhood outside the 41: ${unknown311Nb.size}` +
    `${unknown311Nb.size ? ` (${[...unknown311Nb].map(([k, v]) => `${k}: ${v}`).join(', ')})` : ''} · blank names allowed`)
  let busiestDay = { ymd: '', reports: 0 }
  for (const [d, c] of reportsByDay) {
    if (c > busiestDay.reports || (c === busiestDay.reports && d < busiestDay.ymd)) busiestDay = { ymd: d, reports: c }
  }
  // Ruling R1: every year carries its placed share; only placeable years are
  // split by neighborhood. G3 holds the most recent FULL year to the floor.
  for (const r of years) {
    r.placedShare = placedShare(r.fallen + r.aboutToFall, r.unplaced)
    r.placeable = r.placedShare >= PLACEABLE_FLOOR
  }
  const lastFull = [...years].reverse().find((r) => !r.partial)
  gate('G3', lastFull !== undefined && lastFull.placeable,
    `most recent full year ${lastFull?.year ?? '—'} must be placeable (floor ${PLACEABLE_FLOOR}%); placed share per year: ` +
    years.map((r) => `${r.year} ${r.fallen + r.aboutToFall - r.unplaced}/${r.fallen + r.aboutToFall} = ${r.placedShare}%` +
      `${r.placeable ? '' : ' (citywide only)'}${r.partial ? ' (partial)' : ''}`).join(' · '))

  const grid = buildGrid(placedPoints)
  const fl: number[] = new Array(n)
  for (let i = 0; i < n; i += 1) {
    fl[i] = x[i] === -1 ? 0 : countWithin(grid, Number(inv[i].latitude), Number(inv[i].longitude))
  }

  // ── Species aggregates ────────────────────────────────────────────────────
  interface Acc { count: number; trunk: [number, number, number, number]; plantedRecorded: number; minY: number; maxY: number; byNb: Map<number, number> }
  const accBySpecies = new Map<string, Acc>()
  let trees = 0, stumps = 0, emptySites = 0, shrubs = 0
  let speciesNotRecorded = 0, largeTrunks = 0, unmeasuredTrunks = 0, plantedRecorded = 0
  for (let i = 0; i < n; i += 1) {
    if (kind[i] === 1) stumps += 1
    else if (kind[i] === 2) emptySites += 1
    else if (kind[i] === 3) shrubs += 1
    if (kind[i] !== 0) continue
    trees += 1
    if (cls[i] === 2) largeTrunks += 1
    if (cls[i] === 3) unmeasuredTrunks += 1
    if (yr[i] > 0) plantedRecorded += 1
    const s = rawSpecies[i]
    if (!parseSpecies(s).recorded) { speciesNotRecorded += 1; continue }
    let a = accBySpecies.get(s!)
    if (!a) {
      a = { count: 0, trunk: [0, 0, 0, 0], plantedRecorded: 0, minY: Infinity, maxY: -Infinity, byNb: new Map() }
      accBySpecies.set(s!, a)
    }
    a.count += 1
    a.trunk[cls[i]] += 1
    if (yr[i] > 0) { a.plantedRecorded += 1; a.minY = Math.min(a.minY, yr[i]); a.maxY = Math.max(a.maxY, yr[i]) }
    if (nb[i] >= 0) a.byNb.set(nb[i], (a.byNb.get(nb[i]) ?? 0) + 1)
  }
  const speciesRows = [...accBySpecies.entries()].sort((a, b) =>
    (b[1].count - a[1].count) || (a[0] < b[0] ? -1 : a[0] > b[0] ? 1 : 0))
  const species: SpeciesAggregate[] = []
  speciesRows.forEach(([name, a], i) => {
    const p = parseSpecies(name)
    // Standard competition ranking: ties share the lower rank (1, 2, 2, 4).
    const rank = i > 0 && species[i - 1].count === a.count ? species[i - 1].rank : i + 1
    species.push({
      name,
      latin: p.latin,
      common: p.common,
      count: a.count,
      rank,
      trunk: a.trunk,
      plantedRecorded: a.plantedRecorded,
      plantedYears: a.plantedRecorded ? [a.minY, a.maxY] : null,
      topNeighborhoods: [...a.byNb.entries()]
        .sort((p1, p2) => (p2[1] - p1[1]) || (p1[0] - p2[0]))
        .slice(0, 5)
        .map(([k, c]) => [SF_NEIGHBORHOODS[k], c] as [string, number]),
    })
  })
  const topFive = species.slice(0, 5).reduce((s, r) => s + r.count, 0)
  const topFiveShare = trees ? Math.round((topFive / trees) * 1000) / 10 : 0

  // ── Neighborhood aggregates + equity ──────────────────────────────────────
  const nbTrees = new Array<number>(SF_NEIGHBORHOODS.length).fill(0)
  const nbStumps = new Array<number>(SF_NEIGHBORHOODS.length).fill(0)
  const nbLarge = new Array<number>(SF_NEIGHBORHOODS.length).fill(0)
  let unmappedWithNb = 0
  for (let i = 0; i < n; i += 1) {
    if (nb[i] < 0) continue
    if (x[i] === -1) unmappedWithNb += 1
    if (kind[i] === 0) { nbTrees[nb[i]] += 1; if (cls[i] === 2) nbLarge[nb[i]] += 1 }
    if (kind[i] === 1) nbStumps[nb[i]] += 1
  }
  const finiteOrNull = (v: number | null | undefined): number | null =>
    typeof v === 'number' && Number.isFinite(v) ? v : null
  const inputs: EquityInput[] = SF_NEIGHBORHOODS.map((name, k) => {
    const c = censusByName.get(name)
    const f = featureByName.get(name)
    return {
      name,
      trees: nbTrees[k],
      population: finiteOrNull(c?.totalPopulation) ?? 0,
      // Rounded to 0.001 km² BEFORE the rate is computed, so the stored area
      // and the stored rate agree.
      areaKm2: f ? Math.round(featureAreaKm2(f.geometry) * 1000) / 1000 : 0,
      // A missing census figure is null, never 0 (a 0 would rank as the poorest).
      medianIncome: finiteOrNull(c?.medianIncome),
      povertyRate: finiteOrNull(c?.povertyRate),
    }
  })
  const censusGaps = inputs
    .filter((i) => equityFlag(i.name, i.population, NON_RESIDENTIAL_NEIGHBORHOODS) === null)
    .filter((i) => !(i.population > 0) || !(i.areaKm2 > 0) || i.medianIncome === null || !(i.medianIncome > 0) || i.povertyRate === null)
    .map((i) => `${i.name} (pop ${i.population}, area ${i.areaKm2}, income ${i.medianIncome}, poverty ${i.povertyRate})`)
  gate('G2', censusGaps.length === 0,
    `unflagged neighborhoods missing a positive population, area or income or a poverty rate: ${censusGaps.length}` +
    `${censusGaps.length ? ` (${censusGaps.join('; ')})` : ''}`)
  if (censusGaps.length) {
    // equityRows refuses an unflagged row with a census gap; stop here.
    console.error(`\n${failures.length} gate failure(s) — nothing written (later gates not run):\n  ${failures.join('\n  ')}`)
    process.exitCode = 1
    return
  }
  const eqRows = equityRows(inputs, NON_RESIDENTIAL_NEIGHBORHOODS)
  const equity = equityCorrelations(eqRows)
  const neighborhoods: NeighborhoodAggregate[] = eqRows.map((r, k) => {
    const perYear = nbFalls.get(r.name)
    return {
      name: r.name,
      trees: r.trees,
      stumps: nbStumps[k],
      largeTrunks: nbLarge[k],
      population: r.population,
      areaKm2: r.areaKm2,
      medianIncome: r.medianIncome,
      povertyRate: r.povertyRate,
      perK: r.perK,
      perKm2: r.perKm2,
      flag: r.flag,
      falls: years.filter((yy) => yy.placeable).map((yy) => {
        const c = perYear?.get(yy.year) ?? [0, 0]
        return [yy.year, c[0], c[1]] as [number, number, number]
      }),
    }
  })

  // ── Assemble ──────────────────────────────────────────────────────────────
  const unmapped = x.filter((v) => v === -1).length
  const snapshot: TreesSnapshot = {
    asOf,
    dataAsOf,
    species: speciesTable,
    neighborhoods: [...SF_NEIGHBORHOODS],
    id, x, y, sp, kind, cls, yr, nb, nt, fl,
  }
  const aggregates: TreesAggregates = {
    asOf,
    dataAsOf,
    totals: {
      rows: n, trees, stumps, emptySites, shrubs,
      unmapped, speciesNotRecorded, distinctSpecies: species.length,
      topFive, topFiveShare,
      largeTrunks, unmeasuredTrunks, plantedRecorded,
    },
    species,
    neighborhoods,
    equity,
    falls: { years, busiestDay },
    notices: {
      rows: notices.length,
      sites: noticeSites,
      listed,
      absent: noticeSites - listed,
      replantedAfter,
      unjoinable,
      byType: [...byType.entries()].sort((a, b) => (b[1] - a[1]) || (a[0] < b[0] ? -1 : 1)),
      byYear: [...byYear.entries()].sort((a, b) => a[0] - b[0]),
    },
  }

  // ── Disappeared (G5) ──────────────────────────────────────────────────────
  const prior = existsSync(TREES_PATH) ? JSON.parse(readFileSync(TREES_PATH, 'utf8')) as TreesSnapshot : null
  const priorLog = existsSync(DISAPPEARED_PATH) ? JSON.parse(readFileSync(DISAPPEARED_PATH, 'utf8')) as DisappearedLog : null
  const g5 = nextDisappearedLog(prior, snapshot, priorLog)
  const disappeared = g5.log // null = leave the file untouched
  gate('G5', g5.ok, g5.detail)

  // ── G6 ────────────────────────────────────────────────────────────────────
  const treesJson = JSON.stringify(snapshot)
  const aggregatesJson = JSON.stringify(aggregates, null, 1)
  const treesGz = gzipSync(Buffer.from(treesJson)).length
  const aggregatesGz = gzipSync(Buffer.from(aggregatesJson)).length
  gate('G6', treesGz <= G6_GZIP_MAX, `trees.json gzip ${(treesGz / 1e6).toFixed(2)} MB (limit ${(G6_GZIP_MAX / 1e6).toFixed(1)} MB)`)

  // ── STATS ─────────────────────────────────────────────────────────────────
  console.log('\nSTATS')
  console.log(`asOf ${asOf} · dataAsOf ${dataAsOf}`)
  console.log('totals', JSON.stringify(aggregates.totals, null, 1))
  console.log('notices', JSON.stringify(aggregates.notices, null, 1))
  console.log('equity', JSON.stringify(equity))
  console.log('falls (year · fallen · about to fall · duplicates · unplaced · placedShare · placeable · partial)')
  for (const r of years) console.log(`  ${r.year}  ${r.fallen}  ${r.aboutToFall}  ${r.duplicates}  ${r.unplaced}  ${r.placedShare}%  ${r.placeable ? 'placeable' : 'citywide only'}${r.partial ? '  partial' : ''}`)
  console.log(`  busiest day ${busiestDay.ymd}: ${busiestDay.reports}`)
  console.log('top 12 species')
  for (const s of species.slice(0, 12)) console.log(`  ${s.rank}. ${s.name} — ${s.count}`)
  console.log('equity rows (name · trees · perK · perKm2 · flag)')
  for (const r of neighborhoods) console.log(`  ${r.name} · ${r.trees} · ${r.perK} · ${r.perKm2} · ${r.flag ?? ''}`)
  console.log('diagnostics')
  console.log(`  unmapped sites that still carry a neighborhood: ${unmappedWithNb}`)
  console.log(`  311 rows outside the fall vocabulary: ${notFallKind}; outside the year window: ${outOfWindow}`)
  console.log(`  placed non-duplicate 311 reports with a blank neighborhood (in fl, in no neighborhood row): ${blank311Placed}`)
  console.log(`  removal notices with no posted date (kept out of the replanted-after rule): ${undatedNotices}`)
  console.log(`  placed non-duplicate fall reports in the 30 m grid: ${placedPoints.length}`)
  console.log(`  sizes: trees.json ${treesJson.length.toLocaleString()} B raw · ${treesGz.toLocaleString()} B gzip; aggregates.json ${aggregatesJson.length.toLocaleString()} B raw · ${aggregatesGz.toLocaleString()} B gzip`)

  // ── Write ─────────────────────────────────────────────────────────────────
  if (failures.length) {
    console.error(`\n${failures.length} gate failure(s) — nothing written:\n  ${failures.join('\n  ')}`)
    process.exitCode = 1
    return
  }
  // disappeared.json FIRST: if a run dies part-way, the next run must not see a
  // new trees.json beside a log that never recorded the step to it. Each file
  // is written to a temp path and renamed into place (atomic on one volume).
  mkdirSync(dirname(TREES_PATH), { recursive: true })
  const writeAtomic = (path: string, body: string) => {
    const tmp = `${path}.tmp`
    writeFileSync(tmp, body)
    renameSync(tmp, path)
  }
  if (disappeared) writeAtomic(DISAPPEARED_PATH, JSON.stringify(disappeared, null, 1))
  writeAtomic(TREES_PATH, treesJson)
  writeAtomic(AGGREGATES_PATH, aggregatesJson)
  console.log(`\nwrote ${TREES_PATH}, ${AGGREGATES_PATH}${disappeared ? `, ${DISAPPEARED_PATH}` : ''} · ${((Date.now() - started) / 1000).toFixed(0)} s`)
}

// CLI entry guard — module scope must stay side-effect-free (the snapshot test
// imports the path constants from this file).
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
