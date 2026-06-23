// src/lib/alerts/digestRender.ts
// Pure renderer: a DigestPayload becomes { subject, html, text }. All email
// markup lives here (testable) so api/_lib/email.ts stays a thin Resend send.
// NOTE: a local escapeHtml is intentional — src/ must not import from api/
// (dependency direction), so we can't reuse api/_lib/email.ts's copy.
import type { Summary, TimeBlock } from './digestSummary.js'

export interface LocationDigest {
  label: string
  mapUrl: string | null
  mapAlt: string
  summary: Summary
  buckets: number[]
  blocks: TimeBlock[]
}

export interface DigestPayload {
  windowLabel: string
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

/** Heat-strip: 12 fixed cells, shade scaled to each bucket's share of the
 *  peak. The single bulletproof email data-viz primitive — <td bgcolor>. */
function barHtml(buckets: number[]): string {
  const max = Math.max(1, ...buckets)
  const cells = buckets
    .map((c) => {
      const bg = lerpHex('#ece0c6', '#b85a33', c / max)
      return `<td width="40" height="20" bgcolor="${bg}" style="font-size:0;line-height:0">&nbsp;</td>`
    })
    .join('<td width="2" style="font-size:0;line-height:0">&nbsp;</td>')
  return `<table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:8px 0 0"><tr>${cells}</tr></table>`
}

function summaryBandHtml(s: Summary): string {
  const splits: string[] = []
  if (s.byStream['911-realtime']) splits.push(`911·${s.byStream['911-realtime']}`)
  if (s.byStream['fire-ems-dispatch']) splits.push(`Fire·${s.byStream['fire-ems-dispatch']}`)
  if (s.byStream['311-cases']) splits.push(`311·${s.byStream['311-cases']}`)
  const sigBusiest = [
    s.significant > 0 ? `${s.significant} significant` : null,
    s.busiestLabel ? `busiest ${s.busiestLabel}` : null,
  ].filter(Boolean).join(' · ')
  return `
    <div style="font-size:11px;letter-spacing:.16em;text-transform:uppercase;color:#7a6a52;margin:20px 0 6px">AT A GLANCE</div>
    <div style="font-size:17px;color:#1e140d">
      <strong>${s.total}</strong> event${s.total === 1 ? '' : 's'}
      <span style="color:#7a6a52">&nbsp;&nbsp;${escapeHtml(splits.join('  '))}</span>
    </div>
    ${sigBusiest ? `<div style="font-size:13px;color:#7a6a52;margin-top:2px">${escapeHtml(sigBusiest)}</div>` : ''}
    ${barHtml(s.buckets ? s.buckets : [])}`
}

function blockHtml(block: TimeBlock): string {
  const rows = block.rows
    .map((r) => {
      const sig = r.significant
        ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>'
        : ''
      const where = r.neighborhood ? ` <span style="color:#7a6a52">· ${escapeHtml(r.neighborhood)}</span>` : ''
      const href = `${PUBLIC_LINK_BASE}/live?event=${encodeURIComponent(r.id)}`
      return `<div style="margin:0 0 8px;line-height:1.4">
        <span style="display:inline-block;width:70px;color:#7a6a52;font-size:12px">${escapeHtml(r.clock)}</span>
        <a href="${href}" style="color:#1e140d;text-decoration:none;font-size:15px">${sig}${escapeHtml(r.streamLabel)}: ${escapeHtml(r.what)}</a>${where}
      </div>`
    })
    .join('')
  return `
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:18px 0 8px;border-top:1px solid #d8c9a8;padding-top:10px">${escapeHtml(block.label)}</div>
    ${rows}`
}

function locationHtml(loc: LocationDigest, showLabel: boolean): string {
  const mapBlock = loc.mapUrl
    ? `<img src="${escapeHtml(loc.mapUrl)}" width="560" alt="${escapeHtml(loc.mapAlt)}" style="width:100%;max-width:560px;border:1px solid #d8c9a8;border-radius:8px;display:block">`
    : `<div style="font-size:13px;color:#7a6a52;font-style:italic">${escapeHtml(loc.mapAlt)}</div>`
  const label = showLabel
    ? `<div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:0 0 8px">${escapeHtml(loc.label)}</div>`
    : ''
  return `
    ${label}
    ${mapBlock}
    ${summaryBandHtml(loc.summary)}
    ${loc.blocks.map(blockHtml).join('')}`
}

export function renderDigest(payload: DigestPayload, unsubUrl: string): RenderedDigest {
  const total = payload.locations.reduce((n, l) => n + l.summary.total, 0)
  const subject = `DataDiver: ${total} new event${total === 1 ? '' : 's'} near you`

  const intro =
    payload.locations.length === 1
      ? `Near ${payload.locations[0].label} · ${payload.windowLabel}`
      : `${payload.locations.length} places · ${payload.windowLabel}`
  const showLabels = payload.locations.length > 1
  const body = payload.locations.map((l) => locationHtml(l, showLabels)).join('<div style="height:18px"></div>')

  const html = `<!doctype html><html><body style="margin:0;background:#f5ecd9;font-family:Georgia,'Times New Roman',serif;color:#1e140d">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
    <div style="font-size:14px;color:#7a6a52;margin:4px 0 18px">${escapeHtml(intro)}</div>
    ${body}
    <hr style="border:none;border-top:1px solid #d8c9a8;margin:24px 0">
    <div style="font-size:12px;color:#7a6a52;line-height:1.5">
      ${SENDER_IDENTITY}<br>
      You're receiving this because you subscribed to DataDiver alerts.<br>
      <a href="${escapeHtml(unsubUrl)}" style="color:#7a6a52">Unsubscribe</a> (one click — removes your data).
    </div>
  </div></body></html>`

  const text = renderText(payload, intro, unsubUrl)
  return { subject, html, text }
}

function renderText(payload: DigestPayload, intro: string, unsubUrl: string): string {
  const blocks = payload.locations
    .map((loc) => {
      const head = payload.locations.length > 1 ? `${loc.label}\n` : ''
      const s = loc.summary
      const split = [
        s.byStream['911-realtime'] ? `911·${s.byStream['911-realtime']}` : '',
        s.byStream['fire-ems-dispatch'] ? `Fire·${s.byStream['fire-ems-dispatch']}` : '',
        s.byStream['311-cases'] ? `311·${s.byStream['311-cases']}` : '',
      ].filter(Boolean).join('  ')
      const glance = `AT A GLANCE: ${s.total} events  ${split}` +
        (s.busiestLabel ? `  · busiest ${s.busiestLabel}` : '')
      const alt = loc.mapAlt
      const body = loc.blocks
        .map((b) => `${b.label}\n` + b.rows.map((r) => `  ${r.clock}  ${r.streamLabel}: ${r.what}${r.neighborhood ? ` · ${r.neighborhood}` : ''}`).join('\n'))
        .join('\n')
      return `${head}${alt}\n${glance}\n\n${body}`
    })
    .join('\n\n')
  return `THE LAST 48 — ${intro}\n\n${blocks}\n\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`
}
