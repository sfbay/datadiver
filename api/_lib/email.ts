// api/_lib/email.ts — Resend wrapper + plain, CAN-SPAM-compliant templates.
import { Resend } from 'resend'

let _resend: Resend | null = null
function resend(): Resend {
  if (!_resend) {
    const key = process.env.RESEND_API_KEY
    if (!key) throw new Error('RESEND_API_KEY is not set')
    _resend = new Resend(key)
  }
  return _resend
}

function fromAddress(): string {
  const from = process.env.ALERTS_FROM_EMAIL
  if (!from) throw new Error('ALERTS_FROM_EMAIL is not set')
  return from
}

function baseUrl(): string {
  const url = process.env.PUBLIC_BASE_URL
  if (!url) throw new Error('PUBLIC_BASE_URL is not set')
  return url.replace(/\/$/, '')
}

const SENDER_IDENTITY =
  'DataDiver — civic data for San Francisco · jlab-sf.org'

export function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))
}

function shell(title: string, bodyHtml: string, footerHtml: string): string {
  return `<!doctype html><html><body style="margin:0;background:#f5ecd9;font-family:Georgia,'Times New Roman',serif;color:#1e140d">
  <div style="max-width:560px;margin:0 auto;padding:28px 24px">
    <div style="font-size:13px;letter-spacing:.18em;text-transform:uppercase;color:#b85a33">The Last 48</div>
    <h1 style="font-size:22px;margin:6px 0 16px">${escapeHtml(title)}</h1>
    ${bodyHtml}
    <hr style="border:none;border-top:1px solid #d8c9a8;margin:24px 0">
    <div style="font-size:12px;color:#7a6a52;line-height:1.5">${footerHtml}</div>
  </div></body></html>`
}

export async function sendConfirmEmail(to: string, confirmToken: string): Promise<void> {
  const url = `${baseUrl()}/api/alerts/confirm?token=${encodeURIComponent(confirmToken)}`
  const body = `
    <p style="font-size:15px;line-height:1.6">You asked DataDiver to email you when civic events happen near places you care about. Confirm to start receiving your daily digest.</p>
    <p style="margin:22px 0"><a href="${escapeHtml(url)}" style="background:#b85a33;color:#f5ecd9;text-decoration:none;padding:11px 20px;border-radius:6px;font-family:Arial,sans-serif;font-size:14px">Confirm my alerts</a></p>
    <p style="font-size:13px;color:#7a6a52">If you didn't request this, ignore this email — nothing was activated.</p>`
  await resend().emails.send({
    from: fromAddress(),
    to,
    subject: 'Confirm your DataDiver alerts',
    html: shell('Confirm your alerts', body, SENDER_IDENTITY),
    text: `Confirm your DataDiver alerts:\n${url}\n\nIf you didn't request this, ignore this email.\n\n${SENDER_IDENTITY}`,
  })
}

export interface DigestItem {
  text: string
  href: string
  when: string
}
export interface DigestSection {
  locationLabel: string
  items: DigestItem[]
}

export async function sendDigestEmail(
  to: string,
  sections: DigestSection[],
  unsubscribeToken: string,
): Promise<void> {
  const unsubUrl = `${baseUrl()}/api/alerts/unsubscribe?token=${encodeURIComponent(unsubscribeToken)}`
  const total = sections.reduce((n, s) => n + s.items.length, 0)

  const sectionsHtml = sections
    .map(
      (s) => `
      <div style="margin:0 0 20px">
        <div style="font-size:12px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin-bottom:6px">${escapeHtml(s.locationLabel)}</div>
        ${s.items
          .map(
            (it) => `<div style="margin:0 0 10px;line-height:1.45">
              <a href="${escapeHtml(it.href)}" style="color:#1e140d;text-decoration:none;font-size:15px">${escapeHtml(it.text)}</a>
              <div style="font-size:12px;color:#7a6a52;font-style:italic">${escapeHtml(it.when)}</div>
            </div>`,
          )
          .join('')}
      </div>`,
    )
    .join('')

  const footer = `${SENDER_IDENTITY}<br>
    You're receiving this because you subscribed to DataDiver alerts.<br>
    <a href="${escapeHtml(unsubUrl)}" style="color:#7a6a52">Unsubscribe</a> (one click — removes your data).`

  await resend().emails.send({
    from: fromAddress(),
    to,
    subject: `DataDiver: ${total} new event${total === 1 ? '' : 's'} near you`,
    html: shell(`${total} new event${total === 1 ? '' : 's'} near you`, sectionsHtml, footer),
    text:
      sections
        .map((s) => `${s.locationLabel}\n` + s.items.map((it) => `- ${it.text} (${it.when})\n  ${it.href}`).join('\n'))
        .join('\n\n') + `\n\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`,
    headers: { 'List-Unsubscribe': `<${unsubUrl}>`, 'List-Unsubscribe-Post': 'List-Unsubscribe=One-Click' },
  })
}
