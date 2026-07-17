// src/lib/alerts/digestRender.ts
// Pure renderer: a DigestPayload becomes { subject, html, text }. All email
// markup lives here (testable) so api/_lib/email.ts stays a thin Resend send.
// NOTE: a local escapeHtml is intentional — src/ must not import from api/
// (dependency direction), so we can't reuse api/_lib/email.ts's copy.
import type { Summary, TimeBlock, DigestRow, DayGroup, ReleasedGroup, ReleasedRow } from './digestSummary.js'
import { sfDayKey, sfDayLine } from './digestSummary.js'
import { ALERT_STREAMS } from './streams.js'
import type { PulseRow } from './pulseDigest.js'

export interface LocationDigest {
  label: string
  mapUrl: string | null
  mapAlt: string
  summary: Summary
  buckets: number[]
  days: DayGroup[]
  /** "Newly released" groups (released-tier streams) — [] when none. */
  released: ReleasedGroup[]
  /** "Neighborhood pulse" rows — [] when opted out, unavailable, or
   *  nothing elevated (the section renders nothing in every [] case). */
  pulse: PulseRow[]
}

export interface DigestPayload {
  /** Honest window copy, e.g. 'published since your last digest'. */
  windowLabel: string
  /** Assembly instant — drives the date line + day-header logic. */
  nowMs: number
  locations: LocationDigest[]
}

export interface RenderedDigest {
  subject: string
  html: string
  text: string
}

const PUBLIC_LINK_BASE = 'https://datadiver.jlabsf.org'
const SENDER_IDENTITY = 'DataDiver — civic data for San Francisco · jlabsf.org'

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

export function mapAltText(label: string, radiusLabel: string, significant: number): string {
  if (significant <= 0) return `Map — no major incidents within ${radiusLabel} of ${label}`
  return `Map — ${significant} major incident${significant === 1 ? '' : 's'} within ${radiusLabel} of ${label}`
}

function lerpHex(a: string, b: string, t: number): string {
  const ch = [1, 3, 5].map((i) => {
    const va = parseInt(a.slice(i, i + 2), 16)
    const vb = parseInt(b.slice(i, i + 2), 16)
    return Math.round(va + (vb - va) * t).toString(16).padStart(2, '0')
  })
  return `#${ch.join('')}`
}

const INK = '#1e140d'
const CREAM = '#f5ecd9'
const MUTED = '#7a6a52'
const PAPERLINE = '#d8c9a8'
const OCHRE = '#d4a435'

/** Stream tags + pigments come from the ALERT_STREAMS registry — the app's
 *  canonical stream identity (live three pinned to FlowMapLayer COLORS by
 *  streams.test.ts). The first bulletin preview shipped 911 as terracotta
 *  from a hand-written copy of this table; deriving it kills that bug class. */
const STREAM_META: Record<string, { tag: string; hex: string }> = Object.fromEntries(
  Object.entries(ALERT_STREAMS).map(([id, cfg]) => [id, { tag: cfg.tag, hex: cfg.hex }]),
)

/** '77 Chula Lane' from a full geocoder label. */
function placeShort(label: string): string {
  const first = label.split(',')[0].trim()
  // A label-less pin (map click, no geocode) falls back to "lat, lng" —
  // splitting that on the comma would leave a bare latitude ("near 37.764").
  // Keep the full coordinate pair in that case.
  return /^-?\d+(\.\d+)?$/.test(first) ? label : first
}

/** Tahoma leads the label voice (designed for small sizes — the email cousin
 *  of the app's mono micro-labels); Georgia stays the reading voice. */
const SANS = "Tahoma,Verdana,'Segoe UI',Arial,sans-serif"

/** Times for the two ceremonial voices — the brand eyebrow and the day
 *  headers (Jesse's call: the masthead wears newsprint, not UI). */
const TIMES = "'Times New Roman',Times,serif"

/** Display order for the heat strip: the civic day reads dawn to dawn, so
 *  the strip starts at 6 a.m. and wraps through the small hours. Buckets
 *  stay midnight-indexed upstream (peak label et al. unaffected). */
const STRIP_ORDER = [3, 4, 5, 6, 7, 8, 9, 10, 11, 0, 1, 2]

/** 12-cell two-hour heat strip + a time axis so the day has coordinates. */
function barHtml(buckets: number[]): string {
  const max = Math.max(1, ...buckets)
  const cells = STRIP_ORDER
    .map((i) => {
      const bg = lerpHex('#ece0c6', '#b85a33', buckets[i] / max)
      return `<td width="40" height="20" bgcolor="${bg}" style="font-size:0;line-height:0">&nbsp;</td>`
    })
    .join('<td width="2" style="font-size:0;line-height:0">&nbsp;</td>')
  const axis = ['6 a.m.', 'noon', '6 p.m.', '12 a.m.']
    .map((l) => `<td width="25%" style="font-family:${SANS};font-size:10px;color:${MUTED};padding-top:3px">${l}</td>`)
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0"><tr>${cells}</tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${axis}</tr></table>`
}

/** A spacer cell whose gap CANNOT collapse. The header row's elastic
 *  width="100%" cell is greedy under table auto-layout, which compresses
 *  every other column to min-content — and a bare &nbsp; at font-size:0 has
 *  min-content 0, so plain spacer tds silently vanish and the pigment
 *  plates fuse into one continuous bar (Jesse's rounds 1/3/5 screenshots).
 *  An inner div with an explicit width pins the min-content. */
function gapCell(px: number): string {
  return `<td width="${px}" style="font-size:0;line-height:0"><div style="width:${px}px;height:1px;font-size:0;line-height:0">&nbsp;</div></td>`
}

/** The stat legend: total NEW REPORTS + SIGNIFICANT lead as a pair, a
 *  hairline divider, then one pigment-ruled cell per non-zero stream —
 *  the compact one-line form at EVERY stream count (figures 32/20, 9px
 *  labels; "NEW REPORTS" is the defining first field). Jesse, July 17
 *  2026: the full-size two-tier header with its "Reports" row-head
 *  (bulletin rounds 6–7) was retired to save vertical space; one form
 *  also can't drift from a second. The trailing elastic cell is the
 *  graceful-degradation valve: it collapses first under width pressure,
 *  so the plates keep their gaps. */
function statHeaderHtml(s: Summary, buckets: number[]): string {
  const byStream = s.byStream as Record<string, number>
  const activeIds = Object.keys(STREAM_META).filter((id) => byStream[id])
  const caption = s.busiestLabel ? `busiest ${s.busiestLabel}` : ''
  const streamCells = activeIds
    .map((id) => {
      const m = STREAM_META[id]
      return `<td valign="bottom" style="border-top:5px solid ${m.hex};padding:7px 10px 0 0">
        <div style="font-style:italic;font-size:20px;font-weight:bold;color:${INK};line-height:1">${byStream[id]}</div>
        <div style="font-family:${SANS};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${m.hex};margin-top:3px;white-space:nowrap">${m.tag}</div>
      </td>`
    })
    .join(gapCell(12))
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
      <td valign="bottom" style="padding-right:16px">
        <div style="font-style:italic;font-size:32px;font-weight:bold;color:${INK};line-height:1">${s.total}</div>
        <div style="font-family:${SANS};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:${MUTED};margin-top:3px;white-space:nowrap">New reports</div>
      </td>
      <td valign="bottom" style="border-top:5px solid #963e30;padding:7px 14px 0 0">
        <div style="font-style:italic;font-size:32px;font-weight:bold;color:${INK};line-height:1">${s.significant}</div>
        <div style="font-family:${SANS};font-size:9px;letter-spacing:.1em;text-transform:uppercase;color:#963e30;margin-top:3px;white-space:nowrap">Significant</div>
      </td>
      <td width="1" bgcolor="${PAPERLINE}" style="font-size:0;line-height:0"><div style="width:1px;height:1px;font-size:0;line-height:0">&nbsp;</div></td>
      ${gapCell(14)}
      ${streamCells}
      <td width="100%" style="font-size:0">&nbsp;</td>
    </tr></table>
    ${caption ? `<div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:6px">${escapeHtml(caption)}</div>` : ''}
    ${barHtml(buckets)}`
}

// Row lists are TABLES (design-gate round 3, Jesse): fixed label columns
// hold their alignment — an inline-block slot can't (● FIRE/EMS overflows
// 64px and pushes everything right) — and a wrapping row hangs inside its
// own text cell instead of falling back to the page's left margin. The
// nowrap label cells carry real content, so their min-content width
// protects them from the elastic text column (the gapCell lesson).
const ROW_TABLE = `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0">`
/** Clock/date slot, then tag slot — shared by day + released rows so every
 *  section's columns land on the same grid. Tag width fits ● FIRE/EMS. */
const CLOCK_TD = `width="64" valign="top" style="padding:4px 8px 10px 0;white-space:nowrap;font-family:${SANS};color:${MUTED};font-size:11px;line-height:1.45"`
function tagTd(hex: string): string {
  return `width="78" valign="top" style="padding:5px 8px 10px 0;white-space:nowrap;font-family:${SANS};color:${hex};font-size:10px;letter-spacing:.08em;line-height:1.45"`
}

function rowHtml(r: DigestRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: r.streamLabel.toUpperCase(), hex: MUTED }
  const sig = r.significant ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>' : ''
  const where = r.location ? ` <span style="color:${MUTED};font-size:13px">· ${escapeHtml(r.location)}</span>` : ''
  const late = r.late ? ` <span style="font-size:11px;color:#a8926a;font-style:italic">late report</span>` : ''
  const href = `${PUBLIC_LINK_BASE}/live?event=${encodeURIComponent(r.id)}`
  return `<tr>
    <td ${CLOCK_TD}>${escapeHtml(r.clock)}</td>
    <td ${tagTd(m.hex)}>&#9679;&nbsp;${escapeHtml(m.tag)}</td>
    <td valign="top" width="100%" style="padding:0 0 10px;line-height:1.45"><a href="${href}" style="color:${INK};text-decoration:none;font-size:16px">${sig}${escapeHtml(r.what)}</a>${where}${late}</td>
  </tr>`
}

function blockHtml(block: TimeBlock): string {
  return `
    <div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:24px 0 10px">${escapeHtml(block.label)} <span style="color:${MUTED};letter-spacing:.06em">· ${escapeHtml(block.rangeLabel)}</span></div>
    ${ROW_TABLE}${block.rows.map(rowHtml).join('')}</table>`
}

function dayHtml(day: DayGroup, showHeader: boolean): string {
  const header = showHeader
    ? `<div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">${escapeHtml(day.dayLabel)}</div>`
    : ''
  return header + day.blocks.map(blockHtml).join('')
}

function releasedRowHtml(r: ReleasedRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: '', hex: MUTED }
  const sig = r.significant ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>' : ''
  const where = r.location ? ` <span style="color:${MUTED};font-size:13px">· ${escapeHtml(r.location)}</span>` : ''
  // No deep link: released streams have no Last 48 presence, and a link
  // that lands nowhere is worse than none.
  return `<tr>
    <td ${CLOCK_TD}>${escapeHtml(r.dateLabel)}</td>
    <td ${tagTd(m.hex)}>&#9679;&nbsp;${escapeHtml(m.tag)}</td>
    <td valign="top" width="100%" style="padding:0 0 10px;line-height:1.45"><span style="color:${INK};font-size:16px">${sig}${escapeHtml(r.what)}</span>${where}</td>
  </tr>`
}

/** The staggered-timeline section: released-tier events under their own
 *  Times-rule head with the honest framing note. Same double-rule language
 *  as day headers — these ARE day-scale content, just batch-published. */
function releasedGroupHtml(g: ReleasedGroup): string {
  const note = g.note
    ? `<div style="font-size:12.5px;color:${MUTED};font-style:italic;margin:8px 0 12px;line-height:1.5">${escapeHtml(g.note)}</div>`
    : ''
  return `
    <div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">${escapeHtml(g.heading.toUpperCase())} <span style="color:${MUTED};font-weight:normal">&#183; NEWLY RELEASED</span></div>
    ${note}${ROW_TABLE}${g.rows.map(releasedRowHtml).join('')}</table>`
}

/** One pulse row: tag column (shared grid with the day rows), then
 *  right-aligned chevrons and a ratio column — right-aligning the glyph
 *  keeps the ≈N× figures vertically aligned while 1–3 chevrons grow
 *  leftward — then the phrase as the evidence link. The glyph carries
 *  "how unusual," so the words never say "unusually" (the pulsePhrase
 *  discipline). Order per Jesse, design-gate rounds 2–3. */
function pulseRowHtml(r: PulseRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: '', hex: MUTED }
  const chevrons = '&#9650;'.repeat(r.magnitude)
  const href = `${PUBLIC_LINK_BASE}${r.href}`
  const ratio = r.ratioLabel
    ? `<span style="font-family:${SANS};font-size:12px;font-weight:bold;color:${INK}">${escapeHtml(r.ratioLabel)}</span>`
    : '&nbsp;'
  return `<tr>
    <td ${tagTd(m.hex)}>&#9679;&nbsp;${escapeHtml(m.tag)}</td>
    <td align="right" valign="top" style="padding:4px 6px 10px 0;white-space:nowrap;color:${m.hex};font-size:11px;line-height:1.45">${chevrons}</td>
    <td valign="top" style="padding:3px 8px 10px 0;white-space:nowrap;line-height:1.45">${ratio}</td>
    <td valign="top" width="100%" style="padding:0 0 10px;line-height:1.45"><a href="${href}" style="color:${INK};text-decoration:none;font-size:16px">${escapeHtml(r.subject)} in ${escapeHtml(r.neighborhood)}</a><span style="color:${MUTED};font-size:13px"> &#183; ${r.count48h} in last 48h (${escapeHtml(r.factLine)})</span></td>
  </tr>`
}

/** The "Neighborhood pulse" block: how nearby areas are running vs their
 *  usual pace — busy-only, capped upstream (pulseDigest). Sits between the
 *  stat header and the day groups: context first, then the incident list
 *  it frames. Same double-rule head language as the other section heads. */
function pulseSectionHtml(rows: PulseRow[]): string {
  if (rows.length === 0) return ''
  return `
    <div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">NEIGHBORHOOD PULSE</div>
    <div style="font-size:12.5px;color:${MUTED};font-style:italic;margin:8px 0 12px;line-height:1.5">How neighborhoods around this spot compare with their usual pace.</div>
    ${ROW_TABLE}${rows.map(pulseRowHtml).join('')}</table>`
}

function locationHtml(loc: LocationDigest, showLabel: boolean, nowMs: number): string {
  const mapBlock = loc.mapUrl
    ? `<img src="${escapeHtml(loc.mapUrl)}" width="560" alt="${escapeHtml(loc.mapAlt)}" style="width:100%;max-width:560px;border:1px solid ${PAPERLINE};border-radius:8px;display:block">`
    : `<div style="font-size:13px;color:${MUTED};font-style:italic">${escapeHtml(loc.mapAlt)}</div>`
  const label = showLabel
    ? `<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:0 0 8px">${escapeHtml(placeShort(loc.label))}</div>`
    : ''
  // Day headers appear when the digest spans more than one day, or when its
  // single day isn't today — the staggered-timeline honesty rule.
  const showDayHeaders =
    loc.days.length > 1 || (loc.days.length === 1 && loc.days[0].dateKey !== sfDayKey(nowMs))
  return `
    ${label}
    ${mapBlock}
    ${statHeaderHtml(loc.summary, loc.buckets)}
    ${pulseSectionHtml(loc.pulse)}
    ${loc.days.map((d) => dayHtml(d, showDayHeaders)).join('')}
    ${loc.released.map(releasedGroupHtml).join('')}`
}

export function renderDigest(payload: DigestPayload, unsubUrl: string): RenderedDigest {
  const total = payload.locations.reduce((n, l) => n + l.summary.total, 0)
  const dateLine = sfDayLine(payload.nowMs)
  const place =
    payload.locations.length === 1
      ? `near ${placeShort(payload.locations[0].label)}`
      : `near ${payload.locations.length} places`
  const subject = `${total} new report${total === 1 ? '' : 's'} ${place} · ${dateLine}`
  const introLine =
    payload.locations.length === 1
      ? `Near ${placeShort(payload.locations[0].label)} · ${payload.windowLabel}`
      : `${payload.locations.length} places · ${payload.windowLabel}`
  const showLabels = payload.locations.length > 1
  const body = payload.locations
    .map((l) => locationHtml(l, showLabels, payload.nowMs))
    .join('<div style="height:18px"></div>')

  const html = `<!doctype html><html><body style="margin:0;background:${CREAM};font-family:Georgia,'Times New Roman',serif;color:${INK}">
  <div style="max-width:560px;margin:0 auto;padding:24px 24px 28px">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:0 0 20px"><tr>
      <td bgcolor="${INK}" style="padding:20px 24px;border-radius:10px">
        <div style="font-family:${TIMES};font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${OCHRE}">DataDiver &#8226; The Last 48</div>
        <div style="font-style:italic;font-size:24px;color:${CREAM};margin-top:6px">${escapeHtml(dateLine)}</div>
        <div style="font-size:13px;color:${PAPERLINE};margin-top:5px">${escapeHtml(introLine)}</div>
      </td>
    </tr></table>
    ${body}
    <hr style="border:none;border-top:1px solid ${PAPERLINE};margin:24px 0">
    <div style="font-size:12px;color:${MUTED};line-height:1.5">
      ${SENDER_IDENTITY}<br>
      Reports are grouped by the day they occurred; some arrive late as the city releases data.<br>
      You're receiving this because you subscribed to DataDiver alerts.<br>
      <a href="${escapeHtml(unsubUrl)}" style="color:${MUTED}">Unsubscribe</a> (one click — removes your data).
    </div>
  </div></body></html>`

  const text = renderText(payload, dateLine, introLine, unsubUrl)
  return { subject, html, text }
}

function renderText(payload: DigestPayload, dateLine: string, introLine: string, unsubUrl: string): string {
  const blocks = payload.locations
    .map((loc) => {
      const head = payload.locations.length > 1 ? `${placeShort(loc.label)}\n` : ''
      const s = loc.summary
      const byStream = s.byStream as Record<string, number>
      const split = Object.keys(STREAM_META)
        .filter((id) => byStream[id])
        .map((id) => `${STREAM_META[id].tag} ${byStream[id]}`)
        .join(' · ')
      const glance = `${s.total} new report${s.total === 1 ? '' : 's'}, ${s.significant} significant — ${split}` +
        (s.busiestLabel ? ` · busiest ${s.busiestLabel}` : '')
      const showDayHeaders =
        loc.days.length > 1 || (loc.days.length === 1 && loc.days[0].dateKey !== sfDayKey(payload.nowMs))
      const body = loc.days
        .map((d) => {
          const dh = showDayHeaders ? `== ${d.dayLabel} ==\n` : ''
          return dh + d.blocks
            .map((b) => `${b.label} · ${b.rangeLabel}\n` + b.rows
              .map((r) => `  ${r.clock}  [${STREAM_META[r.datasetId]?.tag ?? r.streamLabel}] ${r.what}${r.location ? ` · ${r.location}` : ''}${r.late ? ' (late report)' : ''}`)
              .join('\n'))
            .join('\n')
        })
        .join('\n')
      const releasedText = loc.released
        .map((g) =>
          `${g.heading.toUpperCase()} · NEWLY RELEASED\n${g.note}\n` +
          g.rows
            .map((r) => `  ${r.dateLabel}  [${STREAM_META[r.datasetId]?.tag ?? ''}] ${r.what}${r.location ? ` · ${r.location}` : ''}`)
            .join('\n'),
        )
        .join('\n\n')
      const pulseText = loc.pulse.length
        ? 'NEIGHBORHOOD PULSE\n' +
          loc.pulse
            .map((r) => `  [${STREAM_META[r.datasetId]?.tag ?? ''}] ${r.ratioLabel ? `${r.ratioLabel} ` : ''}${r.subject} in ${r.neighborhood} — ${r.count48h} in last 48h (${r.factLine})`)
            .join('\n') +
          '\n\n'
        : ''
      return `${head}${loc.mapAlt}\n${glance}\n\n${pulseText}${body}${releasedText ? `\n\n${releasedText}` : ''}`
    })
    .join('\n\n')
  return `THE LAST 48 — ${dateLine}\n${introLine}\n\n${blocks}\n\nReports are grouped by the day they occurred; some arrive late as the city releases data.\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`
}
