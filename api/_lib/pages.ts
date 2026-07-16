// api/_lib/pages.ts — shared skin for the out-of-app browser pages (confirm,
// unsubscribe, errors). These are real browser pages, not email — full CSS is
// available — but they must render instantly with zero asset fetches, so the
// type stack is system Georgia only. The look mirrors the in-app "Check your
// inbox." card: espresso stage, glass card, top-left corner glow, rule-leading
// eyebrow, big Georgia-italic display line.
import { escapeHtml } from './email.js'

export interface PageSpec {
  /** Rule-leading micro label, e.g. 'Alert active'. Rendered uppercase. */
  eyebrow: string
  /** Display line, e.g. "You're in." */
  title: string
  /** One or two sentences of body copy (plain text — escaped here). */
  body: string
  /** 'ok' (terracotta accent) | 'error' (brick accent). Default 'ok'. */
  tone?: 'ok' | 'error'
  /** Call-to-action button. Omit for the default "Open DataDiver →";
   *  pass null for no button at all. */
  cta?: { href: string; label: string } | null
}

export function renderPage(spec: PageSpec): string {
  const error = spec.tone === 'error'
  const accent = error ? '#963e30' : '#b85a33'
  const glow = error ? 'rgba(150,62,48,.40)' : 'rgba(184,90,51,.42)'
  const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')
  const cta =
    spec.cta === null
      ? ''
      : (() => {
          const c = spec.cta ?? { href: `${base}/live`, label: 'Open DataDiver →' }
          return `<a class="cta" href="${escapeHtml(c.href)}">${escapeHtml(c.label)}</a>`
        })()
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(spec.title)} — DataDiver</title>
  <style>
    body{margin:0;background:#1e140d;font-family:Georgia,'Times New Roman',serif;color:#d8c9a8;min-height:100vh;display:grid;place-items:center}
    .card{position:relative;overflow:hidden;max-width:560px;margin:24px;background:#2a1d13;border:1px solid rgba(245,236,217,.08);border-radius:18px;padding:44px 48px 40px;box-shadow:0 24px 60px rgba(0,0,0,.45)}
    .glow{position:absolute;inset:0;pointer-events:none;background:radial-gradient(240px 240px at 0% 0%,${glow},transparent 70%)}
    .eyebrow{position:relative;display:flex;align-items:center;gap:10px;font-family:ui-monospace,Menlo,Consolas,monospace;font-size:11px;letter-spacing:.22em;text-transform:uppercase;color:${accent}}
    .eyebrow::before{content:"";display:inline-block;width:26px;height:1px;background:${accent}}
    h1{position:relative;font-style:italic;font-weight:normal;font-size:clamp(34px,6vw,46px);letter-spacing:-.02em;color:#f5ecd9;margin:14px 0 12px}
    p{position:relative;font-size:16px;line-height:1.65;margin:0;color:#d8c9a8}
    .cta{position:relative;display:inline-block;margin-top:26px;background:#b85a33;color:#f5ecd9;text-decoration:none;font-family:Arial,Helvetica,sans-serif;font-size:14px;letter-spacing:.02em;padding:12px 22px;border-radius:8px}
    .cta:hover{background:#a34d2b}
  </style></head>
  <body><div class="card"><div class="glow"></div>
    <div class="eyebrow">${escapeHtml(spec.eyebrow)}</div>
    <h1>${escapeHtml(spec.title)}</h1>
    <p>${escapeHtml(spec.body)}</p>
    ${cta}
  </div></body></html>`
}
