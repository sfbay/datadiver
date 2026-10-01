// src/views/Trees/treeCardModel.ts
//
// The tree card's logic, pure and node-tested (treeCardModel.test.ts). The
// card (TreeCard.tsx) reads ONE inventory row live by site id plus that
// site's removal notices (useTreeCard.ts); this file decides what state the
// card is in and turns the row into the lines a reader sees. Every sentence
// comes from treesPhrase.ts.
//
// Review Focus 1 — never a blank, never an endless spinner: a site that is
// in the snapshot but absent from a SUCCESSFUL live read "left the
// inventory"; a failed read is an error with a retry, never absence; a site
// in neither is an unknown number; a live row newer than the snapshot still
// renders.
// Review Focus 2 — a removal notice posted before the current tree's
// planting date belongs to an earlier tree at the site (readNotice).

import { classifyRow, parseSpecies, speciesLabel, type RowKind } from '@/lib/trees/species'
import { noticeIdForms, noticeSiteId, readNotice } from '@/lib/trees/siteNotices'
import { FALL_WINDOW_START } from '@/lib/trees/fallReports'
import { TRUNK_LABEL, trunkClass } from '@/lib/trees/trunk'
import type { SpeciesAggregate, TreesSnapshot } from '@/lib/trees/types'
import { apDate } from '@/utils/apDate'
import { getDatasetConfig } from '@/cities/registry'
import {
  NO_ADDRESS, UNDATED_NOTICE, kindTitle, nearbyFallsLine, noticeLine, plantedLine, speciesRankLine, trunkLine,
} from './treesPhrase'
import { siteLngLat } from './mapLayers'

/** One Street Tree Inventory row (tkzw-k3nq), as Socrata serializes it. */
export interface InventoryRow {
  treeid: string
  species?: string
  description?: string
  planteddate?: string
  mapdbh?: string
  legalstatus?: string
  planter?: string
  waterresponsibility?: string
  siteinfo?: string
  plotsize?: string
  analysis_neighborhood?: string
}

/** One Street Tree Removal Notifications row (qrwx-q4gg). `treeid` is TEXT
 *  in two spellings ("123", "TRE-123"). */
export interface NoticeRow {
  treeid?: string
  posteddate?: string
  postedtype?: string
}

/** The inventory columns the card shows — the live read's `$select`. */
export const INVENTORY_SELECT = [
  'treeid', 'species', 'description', 'planteddate', 'mapdbh', 'legalstatus', 'planter',
  'waterresponsibility', 'siteinfo', 'plotsize', 'analysis_neighborhood',
].join(',')
export const NOTICE_SELECT = 'treeid,posteddate,postedtype'

/** The inventory read's `$where`. `treeid` is a NUMBER column there: the id
 *  is UNQUOTED (a quoted value is a type mismatch). */
export function inventoryWhere(siteId: number): string {
  return `treeid = ${Math.trunc(siteId)}`
}

/** The notices read's `$where`. `treeid` is TEXT there, in two spellings
 *  ("123", "TRE-123"): both forms, quoted. */
export function noticesWhere(siteId: number): string {
  const [a, b] = noticeIdForms(siteId)
  return `treeid in('${a}','${b}')`
}

/** What the card's live reads last settled on: the site id and the attempt
 *  (Retry count) the reads were ISSUED for, and what came back. */
export interface SettledRead {
  forId: number
  attempt: number
  rows: InventoryRow[]
  notices: NoticeRow[]
  error: string | null
}

/**
 * Does the settled read belong to the site and attempt on screen now? After
 * an id change (or a Retry) the hook still holds the previous read until the
 * new one lands; that read is not this site's, so the card is loading. An
 * EMPTY result counts only when it was issued for this id — that is what
 * lets "left the inventory" be said.
 */
export function readBelongsTo(siteId: number, attempt: number, settled: SettledRead | null): settled is SettledRead {
  return settled !== null && settled.forId === siteId && settled.attempt === attempt
}

/** Belt and braces: only rows and notices that NAME the site count (a row
 *  naming another site is dropped, never allowed to disown the read — that
 *  would be a spinner with no end). */
export function rowsForSite(siteId: number, settled: SettledRead): { row: InventoryRow | null; notices: NoticeRow[] } {
  return {
    row: settled.rows.find((r) => Number(r.treeid) === siteId) ?? null,
    notices: settled.notices.filter((n) => noticeSiteId(n.treeid) === siteId),
  }
}

export interface CardModel {
  kind: RowKind
  title: string
  latin: string | null
  /** The published species string, verbatim — the `?species=` value. Set
   *  only when the rank line is (a recorded tree species in the rankings). */
  species: string | null
  address: string
  trunk: string
  /** The sentence ("Planted May 7" / "Planting date not recorded"). */
  planted: string
  /** The date alone for the fact table ("May 7"), or null. */
  plantedDate: string | null
  rankLine: string | null
  legalStatus: string | null
  planter: string | null
  watering: string | null
  site: string | null
  plot: string | null
  neighborhood: string | null
  notices: string[]
  /** null = the site is not in the snapshot, so no nearby count exists. */
  falls: string | null
  portalUrl: string
}

export type CardState =
  | { kind: 'loading' }
  | { kind: 'unknown' }
  | { kind: 'left'; asOf: string; rowKind: RowKind }
  | { kind: 'error'; message: string }
  | { kind: 'site'; model: CardModel }

export interface CardExtras {
  /** Snapshot `fl` for this site; null when the site is not in the snapshot. */
  fallsNearby: number | null
  rank: number | null
  ranked: number
}

const FALLS_SINCE = Number(FALL_WINDOW_START.slice(0, 4))
const KIND_BY_CODE: readonly RowKind[] = ['tree', 'stump', 'site', 'shrub']
const NO_EXTRAS: CardExtras = { fallsNearby: null, rank: null, ranked: 0 }

const text = (s: string | null | undefined): string | null => {
  const t = (s ?? '').trim()
  return t ? t : null
}

export function cardState(input: {
  siteId: number
  inSnapshot: boolean
  /** The snapshot row's kind; null when the site is not in the snapshot. */
  snapshotKind: RowKind | null
  asOf: string
  loading: boolean
  error: string | null
  row: InventoryRow | null
  notices?: NoticeRow[]
  extras?: CardExtras
  nowYear?: number
  /** Whether `inSnapshot` can be trusted yet. With no live row, "left" vs
   *  "unknown" needs the snapshot: while it loads the card waits, and if it
   *  failed the card is an error (with Retry), never a guess. Default 'ready'. */
  snapshot?: 'ready' | 'loading' | { failed: string }
}): CardState {
  if (input.loading) return { kind: 'loading' }
  if (input.error !== null) return { kind: 'error', message: input.error }
  if (input.row) {
    const nowYear = input.nowYear ?? Number(input.asOf.slice(0, 4))
    return { kind: 'site', model: buildCardModel(input.row, input.notices ?? [], input.extras ?? NO_EXTRAS, nowYear) }
  }
  const snap = input.snapshot ?? 'ready'
  if (snap === 'loading') return { kind: 'loading' }
  if (snap !== 'ready') return { kind: 'error', message: snap.failed }
  if (input.inSnapshot) return { kind: 'left', asOf: input.asOf, rowKind: input.snapshotKind ?? 'tree' }
  return { kind: 'unknown' }
}

export function buildCardModel(row: InventoryRow, notices: NoticeRow[], extras: CardExtras, nowYear: number): CardModel {
  const kind = classifyRow(row.species)
  const parsed = parseSpecies(row.species)
  const title = kind === 'tree' ? speciesLabel(parsed) : kindTitle(kind)
  // The Latin line only when it adds something: a tree, and not already the title.
  const latin = kind === 'tree' && parsed.latin && parsed.latin !== title ? parsed.latin : null

  const cls = trunkClass(row.mapdbh)
  const inches = cls === 'unmeasured' ? null : Number(row.mapdbh)
  const planted = text(row.planteddate)

  const noticeLines = notices.map((n) => {
    const posted = text(n.posteddate)
    if (!posted) return UNDATED_NOTICE
    return noticeLine(readNotice(posted, planted), posted.slice(0, 10), (n.postedtype ?? '').trim(), nowYear)
  })

  const address = text((row.description ?? '').split('|')[0]) ?? NO_ADDRESS

  return {
    kind,
    title,
    latin,
    species: extras.rank !== null ? row.species ?? null : null,
    address,
    trunk: trunkLine(inches, TRUNK_LABEL[cls]),
    planted: plantedLine(planted, nowYear),
    plantedDate: planted ? apDate(planted.slice(0, 10), nowYear) : null,
    rankLine: extras.rank !== null ? speciesRankLine(extras.rank, extras.ranked) : null,
    legalStatus: text(row.legalstatus),
    planter: text(row.planter),
    watering: text(row.waterresponsibility),
    site: text(row.siteinfo),
    plot: text(row.plotsize),
    neighborhood: text(row.analysis_neighborhood),
    notices: noticeLines,
    falls: extras.fallsNearby !== null ? nearbyFallsLine(extras.fallsNearby, FALLS_SINCE) : null,
    // The row as the portal serves it (raw data — the link says so). The host
    // comes from the registry, never a hand-typed string.
    portalUrl: `${getDatasetConfig('sf', 'streetTrees').endpoint}?treeid=${encodeURIComponent(row.treeid)}`,
  }
}

export interface SnapshotSite {
  kind: RowKind
  /** Snapshot `fl`; null when the site has no map point — nothing was
   *  measured around it, so no "No fall reports" claim can be made. */
  fallsNearby: number | null
  /** [lng, lat], or null when the city published no point for the site. */
  center: [number, number] | null
}

/** The snapshot's facts for one site id, or null when the snapshot is not
 *  loaded or does not list the site. */
export function snapshotSite(
  snap: Pick<TreesSnapshot, 'id' | 'kind' | 'fl' | 'x' | 'y'> | null,
  siteId: number,
): SnapshotSite | null {
  if (!snap) return null
  const i = snap.id.indexOf(siteId)
  if (i < 0) return null
  const center = siteLngLat(snap.x[i], snap.y[i])
  return {
    kind: KIND_BY_CODE[snap.kind[i]] ?? 'tree',
    fallsNearby: center ? snap.fl[i] ?? 0 : null,
    center,
  }
}

/** The species' rank in the snapshot rankings — matched on the published
 *  string VERBATIM, and only for a tree (rankings hold recorded tree species). */
export function speciesRank(species: readonly Pick<SpeciesAggregate, 'name' | 'rank'>[], name: string | null | undefined, kind: RowKind): number | null {
  if (kind !== 'tree' || !name) return null
  return species.find((s) => s.name === name)?.rank ?? null
}
