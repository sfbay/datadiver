// src/lib/alerts/digestRender.ts
// Pure renderer: a DigestPayload becomes { subject, html, text }. All email
// markup lives here (testable) so api/_lib/email.ts stays a thin Resend send.
// NOTE: a local escapeHtml is intentional — src/ must not import from api/
// (dependency direction), so we can't reuse api/_lib/email.ts's copy.
import type { Summary, TimeBlock, DigestRow, DayGroup, ReleasedGroup, ReleasedRow } from './digestSummary.js'
import { sfDayKey, sfDayLine } from './digestSummary.js'
import { ALERT_STREAMS } from './streams.js'

export interface LocationDigest {
  label: string
  mapUrl: string | null
  mapAlt: string
  summary: Summary
  buckets: number[]
  days: DayGroup[]
  /** "Newly released" groups (released-tier streams) — [] when none. */
  released: ReleasedGroup[]
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

/** The true header: NEW + SIGNIFICANT lead as a pair, a hairline divider,
 *  then one pigment-ruled cell per non-zero stream. */
function statHeaderHtml(s: Summary, buckets: number[]): string {
  const byStream = s.byStream as Record<string, number>
  const streamCells = Object.keys(STREAM_META)
    .filter((id) => byStream[id])
    .map((id) => {
      const m = STREAM_META[id]
      return `<td valign="bottom" style="border-top:6px solid ${m.hex};padding:8px 18px 0 0">
        <div style="font-style:italic;font-size:22px;font-weight:bold;color:${INK};line-height:1">${byStream[id]}</div>
        <div style="font-family:${SANS};font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${m.hex};margin-top:3px;white-space:nowrap">${m.tag}</div>
      </td>`
    })
    .join('<td width="14" style="font-size:0">&nbsp;</td>')
  const caption = s.busiestLabel ? `busiest ${s.busiestLabel}` : ''
  return `
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
      <td valign="bottom" style="padding-right:34px">
        <div style="font-style:italic;font-size:27px;color:${INK};line-height:1">Reports</div>
        <div style="font-size:10px;margin-top:3px;line-height:1">&nbsp;</div>
      </td>
      <td width="100%" style="font-size:0">&nbsp;</td>
      <td valign="bottom" style="padding-right:22px">
        <div style="font-style:italic;font-size:36px;font-weight:bold;color:${INK};line-height:1">${s.total}</div>
        <div style="font-family:${SANS};font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${MUTED};margin-top:3px;white-space:nowrap">New</div>
      </td>
      <td valign="bottom" style="border-top:6px solid #963e30;padding:8px 22px 0 0">
        <div style="font-style:italic;font-size:36px;font-weight:bold;color:${INK};line-height:1">${s.significant}</div>
        <div style="font-family:${SANS};font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:#963e30;margin-top:3px;white-space:nowrap">Significant</div>
      </td>
      <td width="1" bgcolor="${PAPERLINE}" style="font-size:0;line-height:0">&nbsp;</td>
      <td width="20" style="font-size:0">&nbsp;</td>
      ${streamCells}
    </tr></table>
    ${caption ? `<div style="font-family:${SANS};font-size:12px;color:${MUTED};margin-top:6px">${escapeHtml(caption)}</div>` : ''}
    ${barHtml(buckets)}`
}

function rowHtml(r: DigestRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: r.streamLabel.toUpperCase(), hex: MUTED }
  const sig = r.significant ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>' : ''
  const where = r.location ? ` <span style="color:${MUTED};font-size:13px">· ${escapeHtml(r.location)}</span>` : ''
  const late = r.late ? ` <span style="font-size:11px;color:#a8926a;font-style:italic">late report</span>` : ''
  const href = `${PUBLIC_LINK_BASE}/live?event=${encodeURIComponent(r.id)}`
  return `<div style="margin:0 0 10px;line-height:1.45">
    <span style="display:inline-block;width:64px;font-family:${SANS};color:${MUTED};font-size:11px">${escapeHtml(r.clock)}</span>
    <span style="font-family:${SANS};color:${m.hex};font-size:10px;letter-spacing:.08em">&#9679;&nbsp;${escapeHtml(m.tag)}</span>
    <a href="${href}" style="color:${INK};text-decoration:none;font-size:16px">&nbsp;${sig}${escapeHtml(r.what)}</a>${where}${late}
  </div>`
}

function blockHtml(block: TimeBlock): string {
  return `
    <div style="font-family:${SANS};font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:24px 0 10px">${escapeHtml(block.label)} <span style="color:${MUTED};letter-spacing:.06em">· ${escapeHtml(block.rangeLabel)}</span></div>
    ${block.rows.map(rowHtml).join('')}`
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
  return `<div style="margin:0 0 10px;line-height:1.45">
    <span style="display:inline-block;width:64px;font-family:${SANS};color:${MUTED};font-size:11px">${escapeHtml(r.dateLabel)}</span>
    <span style="font-family:${SANS};color:${m.hex};font-size:10px;letter-spacing:.08em">&#9679;&nbsp;${escapeHtml(m.tag)}</span>
    <span style="color:${INK};font-size:16px">&nbsp;${sig}${escapeHtml(r.what)}</span>${where}
  </div>`
}

/** The staggered-timeline section: released-tier events under their own
 *  Times-rule head with the honest framing note. Same double-rule language
 *  as day headers — these ARE day-scale content, just batch-published. */
function releasedGroupHtml(g: ReleasedGroup): string {
  const note = g.note
    ? `<div style="font-size:12.5px;color:${MUTED};font-style:italic;margin:8px 0 12px;line-height:1.5">${escapeHtml(g.note)}</div>`
    : ''
  return `
    <div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-family:${TIMES};font-size:14px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">NEWLY RELEASED &#183; ${escapeHtml(g.heading.toUpperCase())}</div>
    ${note}${g.rows.map(releasedRowHtml).join('')}`
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
          `NEWLY RELEASED · ${g.heading.toUpperCase()}\n${g.note}\n` +
          g.rows
            .map((r) => `  ${r.dateLabel}  [${STREAM_META[r.datasetId]?.tag ?? ''}] ${r.what}${r.location ? ` · ${r.location}` : ''}`)
            .join('\n'),
        )
        .join('\n\n')
      return `${head}${loc.mapAlt}\n${glance}\n\n${body}${releasedText ? `\n\n${releasedText}` : ''}`
    })
    .join('\n\n')
  return `THE LAST 48 — ${dateLine}\n${introLine}\n\n${blocks}\n\nReports are grouped by the day they occurred; some arrive late as the city releases data.\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`
}
