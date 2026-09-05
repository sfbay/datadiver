// src/lib/provenance/sourceLine.ts
// Every reader-facing source sentence is a pure function of the registry,
// the NON_SOCRATA table, the view's citation records, live portal metadata,
// the page URL and a clock (spec §7). No component assembles source prose.
import { getCity } from '@/cities/registry'
import type { CityId } from '@/cities/routing'
import type { ViewManifestEntry } from '@/cities/manifest'
import { NON_SOCRATA, type NonSocrataSource, type NonSocrataId } from './nonSocrata'
import type { CitableQuery } from './citations'
import { QUERY_PURPOSES, type QueryPurpose } from './purposes'
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

/** A view is DATASET-LED when it draws rows from a Socrata dataset AND
 *  (an explicit `citable` says so via map-sample/window-sample, OR — the
 *  unconditional default whenever `citable` doesn't say otherwise — its lead
 *  static source is mere joined-on infrastructure: boundary/crosswalk/
 *  basemap). STATIC-LED otherwise (Elections: results files; Demographics:
 *  ACS — both lead with a static source whose kind IS the view's actual
 *  content). Deliberately NOT gated on "citable is empty": Oakland's
 *  311/parking-citations views carry OPD's beat polygon (kind 'boundary')
 *  as their only static, and once THEY declare a real `citable` set for
 *  their own purposes (stat-totals, freshness — never map/window-sample,
 *  since neither view draws its map dots from a citable purpose today),
 *  a citable-length gate would flip them to static-led and print "OPD · via
 *  DataDiver" over service requests and parking tickets that have nothing
 *  to do with the police. The static's own KIND is what earns the lead, not
 *  whether some OTHER field happens to be declared — pinned by the
 *  "non-empty citable … must not flip a boundary-led view" test.
 *  The lead group comes first — it is the primary source for the pill face
 *  and the About link. Within the dataset group, the view's own
 *  `eraSource.datasetKey` and (SF crime's two-extract case)
 *  `eraSource.historical.datasetKey` lead, modern first — `entry.sources`
 *  is otherwise an unordered membership list (Task 5's scan output), not a
 *  narrative order, so a same-view cross-reference dataset (crime-incidents'
 *  911 lookup) or the older half of the view's own series must never
 *  outrank the dataset the view is actually about. */
export function summarizeSources(cityId: CityId, entry: ViewManifestEntry): SourceSummary[] {
  const city = getCity(cityId)
  const sourceKeys = entry.sources ?? []
  const eraKeys = [entry.eraSource?.datasetKey, entry.eraSource?.historical?.datasetKey]
    .filter((k): k is string => !!k && sourceKeys.includes(k))
  const orderedKeys = eraKeys.length > 0 ? [...eraKeys, ...sourceKeys.filter((k) => !eraKeys.includes(k))] : sourceKeys
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
  const datasetLed = datasets.length > 0 && (citableSaysDataset || !leadStaticIsPrimary)
  return datasetLed ? [...datasets, ...statics] : [...statics, ...datasets]
}

/** The closed pill's text. The LEAD group is every source of the primary
 *  kind (sources[0].kind); one shared publisher → the single form, else a
 *  count. The basemap row never counts — defensive: no view's
 *  `staticSources` lists `mapbox-basemap` today (its attribution is the
 *  Mapbox wordmark + "i" control beside the map, and it's credited in
 *  About's own generated tables), so this filter is currently a no-op, kept
 *  so a view that ever DOES declare it doesn't inflate the pill/citation. */
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

/** "Through" per city — null when no fact exists (spec §7.2), including a
 *  freshness record that names a DIFFERENT dataset than asked (a caller
 *  bug should read as absence, never as license to look up some other
 *  dataset's completeness edge). Gated on the completeness FACT
 *  (`edge !== undefined`), not on `cityId === 'oakland'` — SF declares no
 *  edges today so behavior is unchanged, and a third city that ever
 *  declares one gets the right framing with no code change here (the
 *  standing "gate on the fact, not the city" lesson). */
export function throughLine(args: { cityId: CityId; datasetKey: string; freshness: CitableQuery | undefined; nowYear: number }): string | null {
  if (!args.freshness || args.freshness.datasetKey !== args.datasetKey) return null
  const latest = latestOf(args.freshness)
  if (!latest) return null
  const edge = getCity(args.cityId).datasets[args.datasetKey]?.completeness?.edgeDays
  if (edge !== undefined) {
    const { end } = completeWindow(latest, edge, 1)
    return `Complete through ${apDate(end, args.nowYear)} · newest row ${apDate(latest, args.nowYear)}`
  }
  return `Published through ${apDate(latest, args.nowYear)}`
}

const plural = (n: number, noun: string) => `${n.toLocaleString('en-US')} ${noun}${n === 1 ? '' : 's'}`

/** How many records came back and — when the row limit cut them off — HOW
 *  they were cut, derived from the query rather than assumed.
 *
 *  The old phrasing was a flat `newest N rows (capped)` for every capped
 *  result, which made two claims the query often contradicts. ParkingRevenue's
 *  map sample is `GROUP BY post_id ORDER BY total_revenue DESC LIMIT 10000`
 *  and a single month of that dataset holds ~14,229 distinct meters — so the
 *  panel said "newest 10,000 rows" about a slice that is neither newest (it is
 *  top-revenue) nor rows (they are meters). The bias a capped result carries
 *  IS the reader's caveat, so it has to be named exactly:
 *
 *    - GROUPED results count groups, not rows (a one-row aggregate is a group
 *      total, not "a record").
 *    - "newest" is earned ONLY by `$order` = the dataset's own date field,
 *      descending — the shape `resolveQuery` injects from `defaultSort` for a
 *      plain row query. Any other ordering is named verbatim instead.
 *    - No `$order` at all: Socrata returns rows in no guaranteed order, so the
 *      cut is arbitrary and says so.
 *
 *  `dateField` comes from the registry (SourceSummary carries it); passing
 *  none simply means no result can claim to be the newest. */
export function resultLine(rec: CitableQuery, dateField?: string): string {
  const noun = rec.params.$group ? 'group' : 'row'
  const counted = plural(rec.rowCount, noun)
  if (!rec.hitLimit) return counted
  const order = rec.params.$order?.trim().replace(/\s+/g, ' ')
  if (!order) return `${counted} in no stated order (capped)`
  if (dateField && order.toLowerCase() === `${dateField.toLowerCase()} desc`) return `newest ${counted} (capped)`
  return `first ${counted} by ${order} (capped)`
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

/** Priority order for picking WHICH fired query's $where becomes a
 *  dataset's citation filter, when more than one purpose was recorded
 *  against it this session. Explicit and total — never "whichever query
 *  happened to resolve first": `records` is populated in RESOLUTION order
 *  (a race), not priority order, so a first-write-wins fallback let the
 *  same URL print two different copyable citations across two loads. */
const CITE_FILTER_PRIORITY: readonly QueryPurpose[] = ['map-sample', 'window-sample', 'scope-count', 'stat-totals', 'ranking']

/** TOTAL over the purpose vocabulary: the ranked purposes first, then every
 *  remaining purpose in `QUERY_PURPOSES`' own authored order. The tail is not
 *  decoration — Demographics records only `civic-metric`, which is outside the
 *  priority list, so a `mine[0]` fallback left THAT view's citation filter
 *  resolution-ordered (the exact race the priority list exists to kill, just
 *  one purpose further out). Every purpose now has a stated rank. */
const CITE_FILTER_ORDER: readonly QueryPurpose[] = [
  ...CITE_FILTER_PRIORITY,
  ...QUERY_PURPOSES.filter((p) => !CITE_FILTER_PRIORITY.includes(p)),
]

function filterRecordFor(records: CitableQuery[], key: string): CitableQuery | undefined {
  const mine = records.filter((r) => r.datasetKey === key)
  for (const p of CITE_FILTER_ORDER) {
    const hit = mine.find((r) => r.purpose === p)
    if (hit) return hit
  }
  // Unreachable for a well-typed record (QueryPurpose IS QUERY_PURPOSES), and
  // deliberately kept: a purpose that ever reaches here unranked should still
  // produce a citation rather than silently lose its filter clause.
  return mine[0]
}

export function citationLines(args: {
  cityId: CityId; entry: ViewManifestEntry; records: CitableQuery[]
  portalTitles: Record<string, string>; pageUrl: string; accessed: string
}): string[] {
  const accessed = `${apDate(args.accessed, 0)}` // year always shown (nowYear 0 never matches)
  // A citation is a claim about what the READER SAW, so a DATASET earns a
  // line only once a query has actually been recorded against it. This
  // reverses an earlier ruling ("one line per declared source, always"),
  // which was wrong in a way the reader pays for: Traffic Safety declares
  // five datasets and four of them — speed cameras, red-light cameras,
  // pavement condition, the High Injury Network — are overlays that ship
  // OFF, so every copied citation credited four sources the screen never
  // drew. Crediting an unread source is the same species of untruth as
  // failing to credit a read one.
  //   STATIC sources are unconditional: the boundary layer and the census
  // spine are joined onto every render of the view (they have no `cite`
  // purpose to record because they are not Socrata queries at all), so
  // their absence from `records` says nothing about whether they were used.
  const queried = new Set(args.records.map((r) => r.datasetKey))
  return summarizeSources(args.cityId, args.entry)
    // Defensive, matching pillFace's filter above — see its comment.
    .filter((s) => s.static?.kind !== 'basemap')
    .filter((s) => s.kind !== 'dataset' || queried.has(s.key))
    .map((s) => {
      const title = (s.socrataId && args.portalTitles[s.socrataId]) || s.title
      const idPart = s.socrataId ? ` (${s.socrataId})` : ''
      const where = s.kind === 'dataset' ? filterRecordFor(args.records, s.key)?.params.$where : undefined
      const origin = s.kind === 'dataset' ? `${s.portalName}, ${s.host}` : new URL(s.static!.landingUrl).host
      const filtered = where ? ` Filtered: ${where}.` : ''
      return `${s.publisher.full}. "${title}"${idPart}. ${origin}.${filtered} Accessed ${accessed}, via DataDiver, ${args.pageUrl}.`
    })
}
