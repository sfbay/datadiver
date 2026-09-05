// src/lib/provenance/sourceLine.ts
// Every reader-facing source sentence is a pure function of the registry,
// the NON_SOCRATA table, the view's citation records, live portal metadata,
// the page URL and a clock (spec §7). No component assembles source prose.
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import type { ViewManifestEntry } from '@/cities/manifest'
import { NON_SOCRATA, type NonSocrataSource, type NonSocrataId } from './nonSocrata'
import type { CitableQuery } from './citations'
import { completeWindow } from '@/utils/completeWindow'
import { apDate } from '@/utils/apDate'

export interface SourceSummary {
  kind: 'dataset' | 'static'
  id: string                       // Socrata 4×4 or NonSocrataId
  key: string                      // registry key or NonSocrataId
  cityId: CityId
  publisher: { short: string; full: string }
  /** Registry `name` (short label) or the static title. */
  title: string
  portalName: string
  host?: string
  dateField?: string
  socrataId?: string
  static?: NonSocrataSource
}

/** Static "kinds" that ARE the substantive content of a view rather than
 *  infrastructure that merely joins geometry onto a Socrata feed. A boundary
 *  layer, a crosswalk, or the basemap never justifies leading the source
 *  list on its own — a certified results file or a census release does. */
const PRIMARY_STATIC_KINDS = new Set<NonSocrataSource['kind']>(['results', 'ballots', 'census'])

/** A view is DATASET-LED when it draws rows from a Socrata dataset (its
 *  citable set carries map-sample or window-sample, or declares nothing AND
 *  its lead static source is mere infrastructure — a boundary/crosswalk/
 *  basemap layer) and STATIC-LED otherwise (Elections: results files;
 *  Demographics: ACS — both lead with a static source whose kind IS the
 *  view's actual content, not a joined-on layer). The lead group comes
 *  first — it is the primary source for the pill face and the About link.
 *  Within the dataset group, the view's own `eraSource.datasetKey` (its
 *  time-anchor dataset — CLAUDE.md's "Era Track" — when declared) leads;
 *  `entry.sources` is otherwise an unordered membership list (Task 5's scan
 *  output), not a narrative order, so a cross-reference dataset like
 *  crime-incidents' 911 lookup must never outrank the view's own dataset. */
export function summarizeSources(cityId: CityId, entry: ViewManifestEntry): SourceSummary[] {
  const city = getCity(cityId)
  const sourceKeys = entry.sources ?? []
  const anchorKey = entry.eraSource?.datasetKey
  const orderedKeys = anchorKey && sourceKeys.includes(anchorKey)
    ? [anchorKey, ...sourceKeys.filter((k) => k !== anchorKey)]
    : sourceKeys
  const datasets = orderedKeys.map((key): SourceSummary => {
    const c = city.datasets[key]
    return { kind: 'dataset', id: c.id, key, cityId, publisher: c.publisher, title: c.name, portalName: city.portal.name, host: city.portal.host, dateField: c.dateField, socrataId: c.id }
  })
  const staticIds: readonly NonSocrataId[] = entry.staticSources ?? []
  const statics = staticIds.map((id): SourceSummary => {
    const s = NON_SOCRATA[id]
    return { kind: 'static', id, key: id, cityId, publisher: s.publisher, title: s.title, portalName: s.socrataHost ? city.portal.name : s.publisher.short, host: s.socrataHost, socrataId: s.socrataId, static: s }
  })
  const citable = entry.citable ?? []
  const citableSaysDataset = citable.some((p) => p === 'map-sample' || p === 'window-sample')
  const leadStaticIsPrimary = statics.length > 0 && PRIMARY_STATIC_KINDS.has(statics[0].static!.kind)
  const datasetLed = datasets.length > 0 && (citableSaysDataset || (citable.length === 0 && !leadStaticIsPrimary))
  return datasetLed ? [...datasets, ...statics] : [...statics, ...datasets]
}

/** The closed pill's text. The LEAD group is every source of the primary
 *  kind (sources[0].kind); one shared publisher → the single form, else a
 *  count. The basemap row never counts. */
export function pillFace(sources: SourceSummary[]): string {
  const visible = sources.filter((s) => s.static?.kind !== 'basemap')
  if (visible.length === 0) return 'via DataDiver'
  const leadKind = visible[0].kind
  const lead = visible.filter((s) => s.kind === leadKind)
  const shorts = [...new Set(lead.map((s) => s.publisher.short))]
  if (shorts.length === 1) {
    const s = lead[0]
    return s.kind === 'dataset' ? `${shorts[0]} · ${s.portalName} · via DataDiver` : `${shorts[0]} · via DataDiver`
  }
  return `${lead.length} sources · via DataDiver`
}

const latestOf = (f: CitableQuery | undefined) => {
  const v = f?.head[0]?.latest
  return typeof v === 'string' && v.length >= 10 ? v.slice(0, 10) : null
}

/** "Through" per city — null when no fact exists (spec §7.2). */
export function throughLine(args: { cityId: CityId; datasetKey: string; freshness: CitableQuery | undefined; nowYear: number }): string | null {
  const latest = latestOf(args.freshness)
  if (!latest) return null
  const edge = getCity(args.cityId).datasets[args.datasetKey]?.completeness?.edgeDays
  if (args.cityId === 'oakland' && edge !== undefined) {
    const { end } = completeWindow(latest, edge, 1)
    return `Complete through ${apDate(end, args.nowYear)} · newest row ${apDate(latest, args.nowYear)}`
  }
  return `Published through ${apDate(latest, args.nowYear)}`
}

/** The human-readable core of a query: SELECT … WHERE … GROUP BY …  */
export function queryClause(rec: CitableQuery): string {
  const p = rec.params
  const parts: string[] = []
  if (p.$select) parts.push(`SELECT ${p.$select}`)
  if (p.$where) parts.push(`WHERE ${p.$where}`)
  if (p.$group) parts.push(`GROUP BY ${p.$group}`)
  return parts.join(' ')
}

export function citationLines(args: {
  cityId: CityId; entry: ViewManifestEntry; records: CitableQuery[]
  portalTitles: Record<string, string>; pageUrl: string; accessed: string
}): string[] {
  const accessed = `${apDate(args.accessed, 0)}` // year always shown (nowYear 0 never matches)
  return summarizeSources(args.cityId, args.entry)
    .filter((s) => s.static?.kind !== 'basemap')
    .map((s) => {
      const title = (s.socrataId && args.portalTitles[s.socrataId]) || s.title
      const idPart = s.socrataId ? ` (${s.socrataId})` : ''
      const where = s.kind === 'dataset'
        ? (args.records.find((r) => r.datasetKey === s.key && r.purpose === 'map-sample') ?? args.records.find((r) => r.datasetKey === s.key))?.params.$where
        : undefined
      const origin = s.kind === 'dataset' ? `${s.portalName}, ${s.host}` : new URL(s.static!.landingUrl).host
      const filtered = where ? ` Filtered: ${where}.` : ''
      return `${s.publisher.full}. "${title}"${idPart}. ${origin}.${filtered} Accessed ${accessed}, via DataDiver, ${args.pageUrl}.`
    })
}
