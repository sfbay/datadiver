# Alerts Chain Polish Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring the out-of-app alerts chain (confirmation pages, digest email, subscribe-page interactions) up to DataDiver's crafted register, per the approved spec `docs/superpowers/specs/2026-07-16-alerts-chain-polish-design.md`.

**Architecture:** All email markup stays in the pure, tested `digestRender.ts`; day/block shaping stays in pure `digestSummary.ts`; browser pages get a shared `api/_lib/pages.ts` skin; the static map URL builder gains pitch + radius-derived zoom (pure, tested); UI fixes are confined to `AlertsView.tsx` + `LocationPicker.tsx`.

**Tech Stack:** email-safe HTML (tables, bgcolor, inline styles, Georgia), Mapbox Static Images API, Mapbox GL handlers, Vitest.

## Global Constraints

- Relative imports inside `api/**` carry the `.js` suffix (Vercel Node ESM). `src/lib/alerts` modules must not gain runtime `@/` value imports (type-only `import type ... from '@/types/last48'` is fine — erased).
- Email HTML: tables + inline styles + `bgcolor` only; no flexbox, no webfonts, no external CSS, no emoji. Every dynamic string goes through `escapeHtml`. The plain-text part mirrors every fact in the HTML part.
- Browser pages (`api/_lib/pages.ts`): no webfonts, no external assets — system Georgia stack; a `<style>` block is fine (they are real browser pages).
- Palette hexes (from tokens): ink `#1e140d`, cream `#f5ecd9`, paper-line `#d8c9a8`, muted `#7a6a52`, paper-500 `#a8926a`, terracotta `#b85a33`, brick `#963e30`, moss `#7a9954`, ochre `#d4a435`, dusty teal `#5c9693`. Stream pigments: 911 = terracotta, Fire/EMS = brick, 311 = moss.
- AP style for dates/times: "Wednesday, July 15" (months Jan./Feb./Aug.–Dec. abbreviated; March–July spelled out); times like "10–11 a.m.".
- Never run `pnpm dev`. Per-task: `npx vitest run <files>` + `npx tsc -b --force`. Branch end: `~/dev/devman/tools/devman-build.mjs pnpm build`.
- Commit messages end with both trailers:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>` and
  `Claude-Session: https://claude.ai/code/session_01B4AmHQuZEzvkMFqZFoCPSK`.

---

### Task 1: Shared out-of-app page skin

**Files:**
- Create: `api/_lib/pages.ts`
- Modify: `api/alerts/confirm.ts`, `api/alerts/unsubscribe.ts` (delete their local `page()` helpers, use the shared one)

**Interfaces:**
- Produces: `renderPage(spec: PageSpec): string` where `PageSpec = { eyebrow, title, body, tone?, cta? }`.
- Consumes: `escapeHtml` from `./email.js`.

- [ ] **Step 1: Create `api/_lib/pages.ts`**

```ts
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
```

- [ ] **Step 2: Rewire `api/alerts/confirm.ts`**

Delete the local `page()` helper and its `escapeHtml` import if now unused. Import `renderPage`:
`import { renderPage } from '../_lib/pages.js'`. Replace the four sends:

- Missing secret (500): `renderPage({ eyebrow: 'Something went wrong', title: 'Please try again.', body: 'The server is misconfigured. Try the link again in a few minutes.', tone: 'error', cta: null })`
- Bad/expired token AND `confirmSubscription(...)` returning false (both 400): `renderPage({ eyebrow: 'Link expired', title: 'This link has expired.', body: 'Confirmation links last seven days and work once. Subscribe again from DataDiver to get a fresh one.', cta: { href: base + '/alerts', label: 'Back to Alerts →' } })` — compute `const base = (process.env.PUBLIC_BASE_URL || '').replace(/\/$/, '')` in the handler.
- DB error (503): `renderPage({ eyebrow: 'Something went wrong', title: 'Please try again.', body: 'We could not confirm your alert right now. Please try the link again shortly.', tone: 'error', cta: null })`
- Success (200): `renderPage({ eyebrow: 'Alert active', title: "You're in.", body: "This alert is confirmed. You'll get a daily email when matching events happen near your locations — quiet days send nothing." })`

- [ ] **Step 3: Rewire `api/alerts/unsubscribe.ts`**

Same import swap; the POST path (`res.status(...).end()`) is UNCHANGED — only the HTML branch of `sendResult` switches to `renderPage`:

- Missing secret (500) and DB error (503): the same two error specs as confirm (body for 503: 'We could not process your unsubscribe right now. Please try again shortly.').
- Invalid token (400): `renderPage({ eyebrow: 'Link expired', title: 'This link has expired.', body: 'This unsubscribe link is invalid or has expired. Use the link in any recent digest — every email carries a fresh one.', cta: null })`
- Success (200): `renderPage({ eyebrow: 'All clear', title: "You're unsubscribed.", body: "Your subscriptions and email address have been deleted. You won't hear from DataDiver again." })`

- [ ] **Step 4: Verify and commit**

Run: `npx tsc -b --force` → clean. `npx vitest run src/lib/alerts` → green (nothing in src changed).

```bash
git add api/_lib/pages.ts api/alerts/confirm.ts api/alerts/unsubscribe.ts
git commit -m "feat(alerts): out-of-app pages match the app's card energy — espresso stage, corner glow, Georgia italic"
```

---

### Task 2: Static map — pitch 30 + radius-derived zoom

**Files:**
- Modify: `src/lib/alerts/staticMap.ts`
- Test: `src/lib/alerts/staticMap.test.ts` (update)

**Interfaces:**
- Produces: `zoomForRadius(radiusMiles, lat, heightPx?, fillFrac?): number`; `buildStaticMapUrl` gains `pitch?: number` (default 30), loses `padding` (auto-positioning only), and emits explicit `{lng},{lat},{zoom},0,{pitch}` positioning.

- [ ] **Step 1: Add `zoomForRadius` and switch off `auto`**

In `staticMap.ts`, add above `buildStaticMapUrl`:

```ts
/** Mapbox GL zoom at which a circle of `radiusMiles` around `lat` fills
 *  `fillFrac` of a `heightPx`-tall frame. 512px-tile zoom semantics:
 *  metersPerPixel = 78271.517 · cos(lat) / 2^zoom. Needed because a PITCHED
 *  static map can't use the API's `auto` positioning — pitch requires the
 *  explicit center/zoom form. Clamped to sane city zooms. */
export function zoomForRadius(
  radiusMiles: number,
  lat: number,
  heightPx = 280,
  fillFrac = 0.55,
): number {
  const diameterM = radiusMiles * 1609.344 * 2
  const targetMpp = diameterM / (fillFrac * heightPx)
  const z = Math.log2((78271.517 * Math.cos((lat * Math.PI) / 180)) / targetMpp)
  return Math.round(Math.min(15.5, Math.max(11.5, z)) * 100) / 100
}
```

In `StaticMapOptions`: REMOVE `padding?: number`; ADD `/** Camera pitch in degrees (0–60). The tilt is the email map's whole personality. */ pitch?: number`.

In `buildStaticMapUrl`: remove the `padding` const; add `const pitch = opts.pitch ?? 30` and `const zoom = zoomForRadius(radiusMiles, center.lat, height)`. Replace the URL assembly with:

```ts
  const url =
    `${MAPBOX_STATIC_BASE}/${style}/static/${overlays}/` +
    `${center.lng.toFixed(5)},${center.lat.toFixed(5)},${zoom},0,${pitch}/${width}x${height}@2x` +
    `?access_token=${token}`
```

- [ ] **Step 2: Update the tests**

In `staticMap.test.ts`, update any assertion that pins `/auto/` or `padding=` to the new form, and add:

```ts
describe('zoomForRadius', () => {
  it('pins city-scale zooms for the radius vocabulary at SF latitude', () => {
    expect(zoomForRadius(0.5, 37.76)).toBeCloseTo(12.53, 1)
    expect(zoomForRadius(0.125, 37.76)).toBeCloseTo(14.53, 1)
  })
  it('clamps extreme radii into the sane band', () => {
    expect(zoomForRadius(20, 37.76)).toBe(11.5)
    expect(zoomForRadius(0.001, 37.76)).toBe(15.5)
  })
})

it('positions explicitly with pitch 30 (no auto)', () => {
  const url = buildStaticMapUrl({ center: { lat: 37.76, lng: -122.42 }, radiusMiles: 0.5, dots: [], token: 'tok' })!
  expect(url).not.toContain('/auto/')
  expect(url).toMatch(/,-?\d+(\.\d+)?,0,30\/560x280@2x/)
})
```

(Keep the existing polyline/ring/budget tests — they are untouched behavior.)

- [ ] **Step 3: Run, typecheck, commit**

Run: `npx vitest run src/lib/alerts/staticMap.test.ts` → green. `npx tsc -b --force` → clean (the dispatch caller passes no `padding`, so removing it breaks nothing — verify with the typecheck).

```bash
git add src/lib/alerts/staticMap.ts src/lib/alerts/staticMap.test.ts
git commit -m "feat(alerts): digest map gains 30° pitch — radius-derived zoom replaces auto positioning"
```

---

### Task 3: Digest redesign — bulletin register, honest window, day grouping

**Files:**
- Modify: `src/utils/humanizeCivic.ts` (underscore fix) + its test file (locate with `ls src/utils/humanize*`; if no test exists, add the case to `src/lib/alerts/digestSummary.test.ts` instead)
- Modify: `src/lib/alerts/digestSummary.ts` (+ its test)
- Modify: `src/lib/alerts/digestRender.ts` (+ its test)
- Modify: `api/cron/dispatch-digests.ts` (payload shape + window label)
- Create: `scripts/preview-digest.ts`

**Interfaces:**
- `digestSummary` produces: `DayGroup { dateKey, dayLabel, blocks }`, `bucketByDay(events, nowMs): DayGroup[]` (REPLACES `bucketByTimeOfDay` — delete it), `sfDayKey(ms)`, `sfDayLine(ms)`; `TimeBlock` gains `rangeLabel`; `DigestRow` gains `datasetId: DatasetId` and `late: boolean`.
- `digestRender` consumes: `LocationDigest.days: DayGroup[]` (replaces `blocks`), `DigestPayload.nowMs: number`.
- Dispatch supplies both; `buildPayload(sub, events, now)` gains the third param.

- [ ] **Step 1: `humanizeCivic.ts` — underscores are word separators**

In `humanizeCallType`, change the first transform line to also split underscores:

```ts
  const withExpanded = raw.replace(/_/g, ' ').replace(/\bw\//gi, 'with ')
```

Add a test (in the humanizeCivic test file if one exists, else in `digestSummary.test.ts`):

```ts
  it('treats underscores as word separators (311 category keys)', () => {
    expect(humanizeCallType('Garbage_and_debris')).toBe('Garbage and debris')
  })
```

- [ ] **Step 2: `digestSummary.ts` — day groups, range labels, late flag**

1. Extend `DigestRow` with `datasetId: DatasetId` (after `streamLabel`) and `late: boolean` (after `receivedAt`), documented:
```ts
  /** Occurred more than 24h before the digest was assembled — i.e. it reached
   *  this email late because the source publishes behind real time. */
  late: boolean
```
2. Extend `TimeBlock` with `rangeLabel: string` and the BLOCKS table with the ranges:
```ts
const BLOCKS: Array<{ key: TimeBlock['key']; label: string; rangeLabel: string; from: number; to: number }> = [
  { key: 'overnight', label: 'OVERNIGHT', rangeLabel: '12–5 a.m.', from: 0, to: 5 },
  { key: 'morning', label: 'MORNING', rangeLabel: '6–11 a.m.', from: 6, to: 11 },
  { key: 'afternoon', label: 'AFTERNOON', rangeLabel: 'noon–5 p.m.', from: 12, to: 17 },
  { key: 'evening', label: 'EVENING', rangeLabel: '6–11 p.m.', from: 18, to: 23 },
]
```
3. Add day helpers + the new bucketing (and DELETE `bucketByTimeOfDay` — its only caller was the cron, rewired below):
```ts
/** 'YYYY-MM-DD' for an instant, on the SF calendar. */
export function sfDayKey(ms: number): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: SF_TZ, year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date(ms))
}

// AP style: March–July are spelled out; the rest abbreviate.
const AP_MONTH: Record<string, string> = {
  January: 'Jan.', February: 'Feb.', August: 'Aug.',
  September: 'Sept.', October: 'Oct.', November: 'Nov.', December: 'Dec.',
}

/** 'Wednesday, July 15' — the digest's temporal anchor, AP month style. */
export function sfDayLine(ms: number): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: SF_TZ, weekday: 'long', month: 'long', day: 'numeric',
  }).formatToParts(new Date(ms))
  const get = (t: Intl.DateTimeFormatPartTypes) => parts.find((p) => p.type === t)?.value ?? ''
  const month = get('month')
  return `${get('weekday')}, ${AP_MONTH[month] ?? month} ${get('day')}`
}

export interface DayGroup {
  dateKey: string
  /** 'WEDNESDAY, JULY 15' — day header for multi-day digests. */
  dayLabel: string
  blocks: TimeBlock[]
}

const LATE_MS = 24 * 60 * 60 * 1000

/** Rows grouped by the SF calendar day they OCCURRED (newest day first),
 *  then time-of-day blocks within each day. The staggered-timeline layout:
 *  sources publish behind real time, so a digest can honestly span days. */
export function bucketByDay(events: NormalizedEvent[], nowMs: number): DayGroup[] {
  const ordered = [...events].sort((a, b) => b.receivedAt - a.receivedAt)
  const groups: DayGroup[] = []
  const byKey = new Map<string, DayGroup>()
  for (const e of ordered) {
    const key = sfDayKey(e.receivedAt)
    let g = byKey.get(key)
    if (!g) {
      g = {
        dateKey: key,
        dayLabel: sfDayLine(e.receivedAt).toUpperCase(),
        blocks: BLOCKS.map((b) => ({ key: b.key, label: b.label, rangeLabel: b.rangeLabel, rows: [] })),
      }
      byKey.set(key, g)
      groups.push(g) // events are sorted desc, so groups arrive newest-day-first
    }
    const h = sfHour(e.receivedAt)
    const bi = BLOCKS.findIndex((b) => h >= b.from && h <= b.to)
    if (bi < 0) continue
    g.blocks[bi].rows.push({
      id: e.id,
      clock: clockText(e.receivedAt),
      streamLabel: streamLabelShort(e.datasetId),
      datasetId: e.datasetId,
      what: humanizeCallType(e.callType) || e.headline || 'Incident',
      location: e.address ?? e.neighborhood ?? '',
      significant: classifySignificant(e) != null,
      receivedAt: e.receivedAt,
      late: nowMs - e.receivedAt > LATE_MS,
    })
  }
  for (const g of groups) g.blocks = g.blocks.filter((b) => b.rows.length > 0)
  return groups
}
```
4. Update `digestSummary.test.ts`: port the existing `bucketByTimeOfDay` cases to `bucketByDay` (same block-assignment assertions, now under `groups[0].blocks`), and add: two events on different SF days produce two `DayGroup`s newest-first with correct `dateKey`/`dayLabel`; an event >24h old carries `late: true` and a fresh one `late: false`; every block carries its `rangeLabel`.

- [ ] **Step 3: `digestRender.ts` — the bulletin**

Replace the file's rendering functions with the following (keep the header comment, `escapeHtml`, `mapAltText`, `lerpHex`, `PUBLIC_LINK_BASE`, `SENDER_IDENTITY`):

```ts
import type { Summary, TimeBlock, DigestRow, DayGroup } from './digestSummary.js'
import { sfDayKey, sfDayLine } from './digestSummary.js'

export interface LocationDigest {
  label: string
  mapUrl: string | null
  mapAlt: string
  summary: Summary
  buckets: number[]
  days: DayGroup[]
}

export interface DigestPayload {
  /** Honest window copy, e.g. 'published since your last digest'. */
  windowLabel: string
  /** Assembly instant — drives the date line + day-header logic. */
  nowMs: number
  locations: LocationDigest[]
}

const INK = '#1e140d'
const CREAM = '#f5ecd9'
const MUTED = '#7a6a52'
const PAPERLINE = '#d8c9a8'
const OCHRE = '#d4a435'

/** Same stream identity the app uses: 911 terracotta, Fire/EMS brick, 311 moss. */
const STREAM_META: Record<string, { tag: string; hex: string }> = {
  '911-realtime': { tag: '911', hex: '#b85a33' },
  'fire-ems-dispatch': { tag: 'FIRE/EMS', hex: '#963e30' },
  '311-cases': { tag: '311', hex: '#7a9954' },
}

/** '77 Chula Lane' from a full geocoder label. */
function placeShort(label: string): string {
  return label.split(',')[0].trim()
}

/** 12-cell two-hour heat strip + a time axis so the day has coordinates. */
function barHtml(buckets: number[]): string {
  const max = Math.max(1, ...buckets)
  const cells = buckets
    .map((c) => {
      const bg = lerpHex('#ece0c6', '#b85a33', c / max)
      return `<td width="40" height="20" bgcolor="${bg}" style="font-size:0;line-height:0">&nbsp;</td>`
    })
    .join('<td width="2" style="font-size:0;line-height:0">&nbsp;</td>')
  const axis = ['12 a.m.', '6 a.m.', 'noon', '6 p.m.']
    .map((l) => `<td width="25%" style="font-size:10px;color:${MUTED};padding-top:3px">${l}</td>`)
    .join('')
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" style="margin:10px 0 0"><tr>${cells}</tr></table>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0"><tr>${axis}</tr></table>`
}

/** The true header: big total + one pigment-ruled cell per non-zero stream. */
function statHeaderHtml(s: Summary, buckets: number[]): string {
  const byStream = s.byStream as Record<string, number>
  const streamCells = Object.keys(STREAM_META)
    .filter((id) => byStream[id])
    .map((id) => {
      const m = STREAM_META[id]
      return `<td valign="bottom" style="border-top:3px solid ${m.hex};padding:8px 18px 0 0">
        <div style="font-size:22px;font-weight:bold;color:${INK};line-height:1">${byStream[id]}</div>
        <div style="font-size:10px;letter-spacing:.16em;text-transform:uppercase;color:${m.hex};margin-top:3px;white-space:nowrap">${m.tag}</div>
      </td>`
    })
    .join('<td width="14" style="font-size:0">&nbsp;</td>')
  const caption = [
    s.significant > 0 ? `${s.significant} significant` : null,
    s.busiestLabel ? `busiest ${s.busiestLabel}` : null,
  ].filter(Boolean).join(' · ')
  return `
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" style="margin:22px 0 0"><tr>
      <td valign="bottom" style="padding-right:24px">
        <div style="font-size:36px;font-weight:bold;color:${INK};line-height:1">${s.total}</div>
        <div style="font-size:10px;letter-spacing:.18em;text-transform:uppercase;color:${MUTED};margin-top:3px;white-space:nowrap">New report${s.total === 1 ? '' : 's'}</div>
      </td>
      ${streamCells}
    </tr></table>
    ${caption ? `<div style="font-size:12px;color:${MUTED};margin-top:6px">${escapeHtml(caption)}</div>` : ''}
    ${barHtml(buckets)}`
}

function rowHtml(r: DigestRow): string {
  const m = STREAM_META[r.datasetId] ?? { tag: r.streamLabel.toUpperCase(), hex: MUTED }
  const sig = r.significant ? '<span style="color:#963e30;font-weight:bold">&#9656; </span>' : ''
  const where = r.location ? ` <span style="color:${MUTED};font-size:13px">· ${escapeHtml(r.location)}</span>` : ''
  const late = r.late ? ` <span style="font-size:11px;color:#a8926a;font-style:italic">late report</span>` : ''
  const href = `${PUBLIC_LINK_BASE}/live?event=${encodeURIComponent(r.id)}`
  return `<div style="margin:0 0 10px;line-height:1.45">
    <span style="display:inline-block;width:64px;color:${MUTED};font-size:12px">${escapeHtml(r.clock)}</span>
    <span style="color:${m.hex};font-size:10px;letter-spacing:.08em">&#9679;&nbsp;${escapeHtml(m.tag)}</span>
    <a href="${href}" style="color:${INK};text-decoration:none;font-size:16px">&nbsp;${sig}${escapeHtml(r.what)}</a>${where}${late}
  </div>`
}

function blockHtml(block: TimeBlock): string {
  return `
    <div style="font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#5c9693;margin:18px 0 10px;border-top:1px solid ${PAPERLINE};padding-top:10px">${escapeHtml(block.label)} <span style="color:${MUTED};letter-spacing:.06em">· ${escapeHtml(block.rangeLabel)}</span></div>
    ${block.rows.map(rowHtml).join('')}`
}

function dayHtml(day: DayGroup, showHeader: boolean): string {
  const header = showHeader
    ? `<div style="border-top:3px double ${PAPERLINE};margin-top:22px;padding-top:12px;font-size:12px;letter-spacing:.18em;text-transform:uppercase;color:${INK};font-weight:bold">${escapeHtml(day.dayLabel)}</div>`
    : ''
  return header + day.blocks.map(blockHtml).join('')
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
    ${loc.days.map((d) => dayHtml(d, showDayHeaders)).join('')}`
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
        <div style="font-size:11px;letter-spacing:.24em;text-transform:uppercase;color:${OCHRE}">The Last 48</div>
        <div style="font-style:italic;font-size:24px;color:${CREAM};margin-top:6px">${escapeHtml(dateLine)}</div>
        <div style="font-size:13px;color:${PAPERLINE};margin-top:5px">${escapeHtml(introLine)}</div>
      </td>
    </tr></table>
    ${body}
    <hr style="border:none;border-top:1px solid ${PAPERLINE};margin:24px 0">
    <div style="font-size:12px;color:${MUTED};line-height:1.5">
      ${SENDER_IDENTITY}<br>
      Reports are grouped by the day they occurred; some arrive a day late as the city releases data.<br>
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
      const glance = `${s.total} new report${s.total === 1 ? '' : 's'} — ${split}` +
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
      return `${head}${loc.mapAlt}\n${glance}\n\n${body}`
    })
    .join('\n\n')
  return `THE LAST 48 — ${dateLine}\n${introLine}\n\n${blocks}\n\nReports are grouped by the day they occurred; some arrive a day late as the city releases data.\nUnsubscribe: ${unsubUrl}\n${SENDER_IDENTITY}`
}
```

- [ ] **Step 4: Update `digestRender.test.ts`**

Port the existing suite to the new shapes (`days` instead of `blocks`, `nowMs` on the payload — build fixtures via `bucketByDay(events, nowMs)` with a FIXED `nowMs`, e.g. `Date.UTC(2026, 6, 15, 19, 0, 0)`), and pin the new behavior:

- subject matches `/^\d+ new reports? near .+ · [A-Z][a-z]+day, /` and contains the short place (no commas from the full geocoder label).
- html contains the masthead date line and `The Last 48`; does NOT contain `AT A GLANCE`.
- html contains each block's `rangeLabel` (e.g. `6–11 a.m.`) and the axis labels `12 a.m.` / `noon`.
- a row with `late: true` renders `late report`; with `late: false` it doesn't.
- a payload whose events span two SF days renders both `dayLabel`s; a single-day today payload renders no `border-top:3px double` day header.
- escaping still holds (`<script>` in a location label comes out entity-escaped).
- the text part contains the date line, `rangeLabel`s, and `(late report)` where applicable.

- [ ] **Step 5: Rewire the cron**

In `api/cron/dispatch-digests.ts`:
1. `WINDOW_LABEL.daily` → `'published since your last digest'` (hourly/weekly unchanged — Phase-2 cadences).
2. Import change: `bucketByTimeOfDay` → `bucketByDay` from `digestSummary.js`.
3. `buildPayload(sub: DueSubscription, events: NormalizedEvent[], now: number)` — add the third param; in the `locations.push` call, `blocks: bucketByTimeOfDay(inRadius)` becomes `days: bucketByDay(inRadius, now)`; the returned object becomes `{ windowLabel: WINDOW_LABEL[sub.cadence], nowMs: now, locations }`.
4. The call site becomes `buildPayload(sub, matched, now)`.

- [ ] **Step 6: Preview script**

Create `scripts/preview-digest.ts`:

```ts
// scripts/preview-digest.ts — render the digest email with a realistic
// fixture to an HTML file for design review. The email is a designed surface;
// this is its dev server. Usage:
//   VITE_MAPBOX_TOKEN=pk.… npx tsx scripts/preview-digest.ts /tmp/digest.html
import { writeFileSync } from 'node:fs'
import type { NormalizedEvent } from '../src/types/last48'
import { summarize, busiestBuckets, bucketByDay, radiusLabelText } from '../src/lib/alerts/digestSummary.js'
import { renderDigest, mapAltText } from '../src/lib/alerts/digestRender.js'
import { buildStaticMapUrl } from '../src/lib/alerts/staticMap.js'

const now = Date.now()
const H = 3600_000
const ev = (o: Partial<NormalizedEvent>): NormalizedEvent => (o as NormalizedEvent)

const events: NormalizedEvent[] = [
  ev({ id: 'p1', datasetId: '911-realtime', receivedAt: now - 2 * H, callType: 'Suspicious person', address: '16th St & Church St', latitude: 37.7646, longitude: -122.4288 }),
  ev({ id: 'p2', datasetId: '911-realtime', receivedAt: now - 5 * H, callType: 'Shots fired', address: 'Dolores St & 17th St', latitude: 37.7633, longitude: -122.4262 }),
  ev({ id: 'p3', datasetId: '311-cases', receivedAt: now - 7 * H, callType: 'Garbage_and_debris', address: '3448 16th St', latitude: 37.7642, longitude: -122.4311 }),
  ev({ id: 'p4', datasetId: '311-cases', receivedAt: now - 11 * H, callType: 'Building_inspection', address: '372 Dolores St', latitude: 37.7614, longitude: -122.4257 }),
  ev({ id: 'p5', datasetId: 'fire-ems-dispatch', receivedAt: now - 26 * H, callType: 'Medical incident', address: '17th St & Dolores St', latitude: 37.7631, longitude: -122.4262 }),
  ev({ id: 'p6', datasetId: 'fire-ems-dispatch', receivedAt: now - 30 * H, callType: 'Structure fire', address: 'Church St & Market St', latitude: 37.7671, longitude: -122.4291 }),
  ev({ id: 'p7', datasetId: '311-cases', receivedAt: now - 15 * H, callType: 'Graffiti', address: '200 Church St', latitude: 37.7659, longitude: -122.4289 }),
]

const center = { lat: 37.7645, lng: -122.429 }
const radiusMiles = 0.25
const token = process.env.VITE_MAPBOX_TOKEN ?? ''
const summary = summarize(events)
const dots = events
  .filter((e) => e.latitude != null && e.longitude != null)
  .map((e) => ({ lat: e.latitude as number, lng: e.longitude as number }))

const payload = {
  windowLabel: 'published since your last digest',
  nowMs: now,
  locations: [{
    label: '77 Chula Lane, San Francisco, California 94114, United States',
    mapUrl: buildStaticMapUrl({ center, radiusMiles, dots, token }),
    mapAlt: mapAltText('77 Chula Lane', radiusLabelText(radiusMiles), summary.significant),
    summary,
    buckets: busiestBuckets(events),
    days: bucketByDay(events, now),
  }],
}

const { subject, html, text } = renderDigest(payload, 'https://datadiver.jlabsf.org/api/alerts/unsubscribe?token=preview')
const out = process.argv[2] ?? '/tmp/digest-preview.html'
writeFileSync(out, html)
writeFileSync(out.replace(/\.html$/, '.txt'), `SUBJECT: ${subject}\n\n${text}`)
console.log(`subject: ${subject}\nwrote ${out} (+ .txt)`)
```

Run `npx tsx scripts/preview-digest.ts /tmp/digest-preview.html` to confirm it executes without error (map URL may be null without a token — fine).

- [ ] **Step 7: Verify and commit**

Run: `npx vitest run src/lib/alerts src/utils` → green. `npx tsc -b --force` → clean.

```bash
git add src/utils/humanizeCivic.ts src/lib/alerts/digestSummary.ts src/lib/alerts/digestSummary.test.ts src/lib/alerts/digestRender.ts src/lib/alerts/digestRender.test.ts api/cron/dispatch-digests.ts scripts/preview-digest.ts
git commit -m "feat(alerts): digest becomes a dated bulletin — masthead, stat header, day grouping, honest window"
```

(Include the humanizeCivic test file in the `git add` if it exists separately.)

---

### Task 4: Subscribe page — button proportions + inert-scroll auto-framing map

**Files:**
- Modify: `src/views/Alerts/AlertsView.tsx` (SubscribeButton only)
- Modify: `src/views/Alerts/LocationPicker.tsx`

- [ ] **Step 1: Button becomes button-sized**

In `SubscribeButton` (bottom of AlertsView.tsx): in the `<button>` className, replace `w-full inline-flex items-center justify-between gap-4` with `inline-flex items-center gap-3` and `pl-5 pr-[60px] py-4` with `pl-6 pr-[64px] py-3.5`. DELETE the `confirm via email` span entirely (the caption right below the button already says "Double opt-in · we email a confirmation link first"). Everything else — the notch tab, the display-italic label, hover states — stays.

- [ ] **Step 2: Picker map — scroll passes through; camera frames the circles**

In `LocationPicker.tsx`:

1. `handleReady` becomes:

```ts
  function handleReady(map: mapboxgl.Map) {
    // A full-width map inside a scrolling form: plain trackpad scroll must
    // scroll the PAGE, not zoom the map — the picker is a form station, not
    // an exploration view, and the scroll-capture trap catches ~everyone
    // whose cursor rests here after picking an address. Zoom stays available
    // via the buttons + double-click, and the auto-framing below removes
    // most of the need to zoom at all.
    map.scrollZoom.disable()
    map.addControl(new mapboxgl.NavigationControl({ showCompass: false }), 'top-right')
    map.on('click', (e) => onAdd({ lat: e.lngLat.lat, lng: e.lngLat.lng }))
  }
```

(First verify `MapView` doesn't already add a NavigationControl — `grep -n NavigationControl src/components/maps/MapView.tsx`; if it does, skip the addControl line and say so in your report.)

2. Extend the camera-fit effect: a RADIUS change now also reframes — to the union of every circle (the whole subscription is being rescoped), while a pin ADD keeps framing just the new pin's circle. Replace the existing fit effect with:

```ts
  const prevRadius = useRef(radiusMiles)
  useEffect(() => {
    const map = mapRef.current?.getMap()
    const pinAdded = locations.length > prevCount.current
    const radiusChanged = radiusMiles !== prevRadius.current
    if (map && locations.length > 0 && (pinAdded || radiusChanged)) {
      // Pin add → frame the NEW pin's circle (tight, local). Radius change →
      // frame the union of all circles. Removals still never yank the camera.
      const targets = pinAdded ? [locations[locations.length - 1]] : locations
      let west = Infinity, south = Infinity, east = -Infinity, north = -Infinity
      for (const l of targets) {
        const { dLat, dLng } = radiusDegrees(l.lat, radiusMiles)
        west = Math.min(west, l.lng - dLng)
        east = Math.max(east, l.lng + dLng)
        south = Math.min(south, l.lat - dLat)
        north = Math.max(north, l.lat + dLat)
      }
      map.fitBounds(
        [[west, south], [east, north]],
        {
          padding: 40,
          maxZoom: 16,
          duration: 1200,
          bearing: map.getBearing(),
          // lean in a touch MORE than the resting camera for a dramatic settle
          pitch: Math.min(map.getPitch() + (pinAdded ? 14 : 0), 60),
        },
      )
    }
    prevCount.current = locations.length
    prevRadius.current = radiusMiles
  }, [locations, radiusMiles])
```

Keep the explanatory comment block above the effect, amending its first line to mention the radius-change case. (The fitBounds pitch/bearing passthrough is load-bearing — the fitbounds-flattens-pitch lesson; do not drop it.)

- [ ] **Step 3: Verify and commit**

Run: `npx tsc -b --force` → clean. There are no unit tests for these components; state in your report exactly what you verified by reading (scrollZoom disabled before any interaction, controls not duplicated, removal still doesn't move the camera).

```bash
git add src/views/Alerts/AlertsView.tsx src/views/Alerts/LocationPicker.tsx
git commit -m "fix(alerts): picker map scrolls the page not the zoom; radius reframes; button gets button proportions"
```

---

## Final verification (branch end)

- `npx vitest run` → full suite green.
- `~/dev/devman/tools/devman-build.mjs pnpm build` → passes.
- Controller renders the preview (`npx tsx scripts/preview-digest.ts`) with a real token and sends the HTML to Jesse — **the preview is the design gate for the email; the PR does not merge until Jesse approves the rendering.**
- Whole-branch review before the PR.
