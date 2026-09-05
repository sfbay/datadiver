// src/components/maps/SourcePanel.tsx
// The open panel of the source pill (spec §6.3). Pure prose comes from
// sourceLine.ts; this file only lays it out. Tier 3 — no glow.
import { useMemo, useState, useCallback, useEffect } from 'react'
import { Link } from 'react-router-dom'
import type { CityId } from '@/cities/routing'
import type { ViewManifestEntry } from '@/cities/manifest'
import { PURPOSE_LABEL } from '@/lib/provenance/purposes'
import type { CitableQuery } from '@/lib/provenance/citations'
import { summarizeSources, throughLine, queryClause, citationLines, type SourceSummary } from '@/lib/provenance/sourceLine'
import { usePortalMeta } from '@/lib/provenance/portalMeta'
import { csvUrl, fullCsvUrl, geojsonUrl, portalPageUrl } from '@/lib/provenance/downloads'
import { apDate } from '@/utils/apDate'
import { formatApTime } from '@/utils/format'
import { sfLocalCutoff } from '@/utils/sfTime'

const LINK = 'underline decoration-paper-400/40 underline-offset-2 hover:text-ink dark:hover:text-paper-100 transition-colors'

// Per-QUERY, not per-dataset (fix-round-1 finding 4): a dataset can register
// both a distinct-count aggregate (stat-totals) and a plain row sample
// (map-sample) — pasting the note under the sample too claimed a unit
// correction that query never needed.
const UNIT_NOTE_RE = /count\(distinct (incident_number|casenumber|call_number)\)/
const unitNoteFor = (rec: CitableQuery): string | undefined =>
  UNIT_NOTE_RE.test(rec.params.$select ?? '')
    ? 'Counts are distinct cases or calls, not rows — the publisher files one row per charge or per unit dispatched.'
    : undefined

function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false)
  const copy = useCallback(() => {
    navigator.clipboard.writeText(text).then(() => { setDone(true); setTimeout(() => setDone(false), 1500) })
  }, [text])
  return (
    <button onClick={copy} className={`text-micro font-mono px-1.5 py-0.5 rounded ${done ? 'bg-moss-500/15 text-moss-500' : 'text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-100'}`}>
      {done ? 'Copied' : label}
    </button>
  )
}

function QueryBlock({ rec, unitNote }: { rec: CitableQuery; unitNote?: string }) {
  const [full, setFull] = useState(false)
  const label = `${PURPOSE_LABEL[rec.purpose]}${rec.facet ? ` — ${rec.facet}` : ''}`
  // A one-row aggregate is a GROUP total, not "a record" — say so when the
  // query grouped (fix-round-1 finding 5); an ungrouped query still counts rows.
  const unit = rec.params.$group ? 'group' : 'row'
  const count = rec.hitLimit
    ? `newest ${rec.rowCount.toLocaleString('en-US')} rows (capped)`
    : `${rec.rowCount.toLocaleString('en-US')} ${unit}${rec.rowCount === 1 ? '' : 's'}`
  return (
    <div className="mt-2">
      <p className="text-label text-ink dark:text-paper-100">
        {label} <span className="text-paper-600 dark:text-paper-400">— {count} · fetched {formatApTime(rec.fetchedAt)}{rec.fromCache ? ' (cached)' : ''}</span>
      </p>
      <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-micro text-paper-700 dark:text-paper-300 bg-paper-100/60 dark:bg-espresso-800/60 rounded px-2 py-1.5">
        {full ? JSON.stringify(rec.params, null, 1) : queryClause(rec)}
      </pre>
      {unitNote && <p className="text-micro text-paper-600 dark:text-paper-400 mt-0.5">{unitNote}</p>}
      <div className="flex items-center gap-2 mt-1 text-micro font-mono">
        <a className={LINK} href={rec.url} target="_blank" rel="noopener noreferrer">JSON ↗</a>
        <a className={LINK} href={csvUrl(rec.host, rec.datasetId, rec.url.split('?')[1] ?? '')} target="_blank" rel="noopener noreferrer">CSV ↗</a>
        <CopyButton text={rec.url} label="Copy" />
        <button onClick={() => setFull((v) => !v)} className="text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-100">{full ? 'Short query' : 'Full query'}</button>
      </div>
    </div>
  )
}

function DatasetBlock({ s, records, citable, nowYear, open, onTitle }: { s: SourceSummary; records: CitableQuery[]; citable: readonly string[]; nowYear: number; open: boolean; onTitle: (id: string, title: string) => void }) {
  const { meta } = usePortalMeta(s.host, s.socrataId, open)
  // Lift the live portal title so the citation can use it (spec §7.3).
  useEffect(() => { if (meta?.title && s.socrataId) onTitle(s.socrataId, meta.title) }, [meta?.title, s.socrataId, onTitle])
  const mine = records.filter((r) => r.datasetKey === s.key)
  const freshness = mine.find((r) => r.purpose === 'freshness' && !r.facet)
  const through = throughLine({ cityId: s.cityId, datasetKey: s.key, freshness, nowYear })
  const updated = meta?.rowsUpdatedAt ? ` · publisher updated ${apDate(sfLocalCutoff(meta.rowsUpdatedAt), nowYear)}` : ''
  const license = meta ? (meta.licenseName ? <>License: {meta.licenseUrl ? <a className={LINK} href={meta.licenseUrl} target="_blank" rel="noopener noreferrer">{meta.licenseName}</a> : meta.licenseName}</> : <>License: not stated by the publisher</>) : null
  const ordered = citable.flatMap((p) => mine.filter((r) => r.purpose === p && r.purpose !== 'freshness'))
  return (
    <section className="pb-3 mb-3 border-b border-paper-200/60 dark:border-espresso-800 last:border-0">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-paper-600 dark:text-paper-400">── {s.publisher.short}</p>
      <p className="text-label text-ink dark:text-paper-100 mt-0.5">{s.publisher.full}</p>
      <p className="text-micro text-paper-700 dark:text-paper-300">
        {meta?.title || s.title} · <a className={`font-mono ${LINK}`} href={portalPageUrl(s.host!, s.socrataId!)} target="_blank" rel="noopener noreferrer">{s.socrataId} ↗</a>
      </p>
      {(through || updated) && <p className="text-micro text-paper-600 dark:text-paper-400">{through ?? ''}{updated}</p>}
      {license && <p className="text-micro text-paper-600 dark:text-paper-400">{license}</p>}
      {ordered.map((r) => <QueryBlock key={`${r.purpose}|${r.facet ?? ''}`} rec={r} unitNote={unitNoteFor(r)} />)}
      {citable.length > 0 && ordered.length === 0 && <p className="text-micro text-paper-500 mt-1">— queries not registered yet</p>}
      <p className="text-micro font-mono mt-2"><a className={LINK} href={fullCsvUrl(s.host!, s.socrataId!)} target="_blank" rel="noopener noreferrer">Full dataset (CSV) ↗</a></p>
    </section>
  )
}

function StaticBlock({ s }: { s: SourceSummary }) {
  const st = s.static!
  const lic = st.license === 'not stated' ? 'not stated by the publisher' : st.license.name
  return (
    <section className="pb-3 mb-3 border-b border-paper-200/60 dark:border-espresso-800 last:border-0">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-paper-600 dark:text-paper-400">── {s.publisher.short}</p>
      <p className="text-label text-ink dark:text-paper-100 mt-0.5">{s.publisher.full}</p>
      <p className="text-micro text-paper-700 dark:text-paper-300">{st.title} · {st.vintage}</p>
      <p className="text-micro text-paper-600 dark:text-paper-400">License: {lic}{st.derivedLicense ? ` · DataDiver's transformation ${st.derivedLicense}` : ''}</p>
      <p className="text-micro font-mono mt-1 flex flex-wrap gap-2">
        <a className={LINK} href={st.socrataId && st.socrataHost ? geojsonUrl(st.socrataHost, st.socrataId, 1000) : st.upstreamUrl} target="_blank" rel="noopener noreferrer">Publisher's file ↗</a>
        {st.servedPath && <a className={LINK} href={st.servedPath} target="_blank" rel="noopener noreferrer">File we serve ↗</a>}
        <a className={LINK} href={st.landingUrl} target="_blank" rel="noopener noreferrer">About the source ↗</a>
      </p>
    </section>
  )
}

export default function SourcePanel({ cityId, entry, records, labelledBy }: { cityId: CityId; entry: ViewManifestEntry; records: CitableQuery[]; labelledBy: string }) {
  const sources = useMemo(() => summarizeSources(cityId, entry).filter((s) => s.static?.kind !== 'basemap'), [cityId, entry])
  const nowYear = new Date().getFullYear()
  const primary = sources[0]
  const aboutHref = primary ? `/about#source-${cityId}-${primary.id}` : '/about#sources'
  const [titles, setTitles] = useState<Record<string, string>>({})
  const onTitle = useCallback((id: string, title: string) => setTitles((t) => (t[id] === title ? t : { ...t, [id]: title })), [])
  const citation = useMemo(() => citationLines({
    cityId, entry, records, portalTitles: titles,
    pageUrl: window.location.href, accessed: sfLocalCutoff(Date.now()).slice(0, 10),
  }).join('\n'), [cityId, entry, records, titles])
  return (
    <div role="dialog" aria-labelledby={labelledBy} className="panel-rise w-[26rem] max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-3">
      {sources.map((s) => s.kind === 'dataset'
        ? <DatasetBlock key={s.key} s={s} records={records} citable={entry.citable ?? []} nowYear={nowYear} open onTitle={onTitle} />
        : <StaticBlock key={s.key} s={s} />)}
      <footer className="flex items-center justify-between gap-2 pt-1">
        <p className="text-micro font-mono text-paper-600 dark:text-paper-400">via DataDiver · <Link className={LINK} to={aboutHref}>About this data →</Link></p>
        <CopyButton text={citation} label="Copy citation" />
      </footer>
    </div>
  )
}
