# Alerts Chain Polish — Design

**Date:** 2026-07-16 · **Status:** approved in conversation (Jesse's post-QA design brief + refinements)
**Scope:** PR C of the alerts-chain arc. PR D (business openings + traffic crashes streams, staggered windows) and PR E (Pulse-in-digest opt-in) follow separately.

## Problem

Jesse's first full subscribe→confirm→digest QA run (2026-07-16) found the out-of-app chain
undercooked relative to the app: the confirmation page is a flat cream page that doesn't match
the in-app "Check your inbox." card's energy; the digest email is functional but flat (uniform
type, jammed counts, unlabeled time blocks, no date anywhere, top-down map); the subscribe page
has a full-width button that doesn't read as a button, and a full-width map that captures
trackpad scroll as zoom — a trap ~every user hits after picking an address.

## Decisions

### 1. Out-of-app pages (confirm / unsubscribe / error) — browser pages, full CSS

Match the in-app "Check your inbox." card: espresso stage (`#1e140d`), centered glass card with
a top-left corner glow (pure CSS radial gradient), rule-leading eyebrow (`── ALERT ACTIVE`),
large Georgia-italic display line ("You're in."), body copy in warm paper tones, terracotta
button-style CTA ("Open DataDiver →"). The duplicated `page()` helper in confirm.ts and
unsubscribe.ts is extracted to a shared `api/_lib/pages.ts`. Error and "Link expired" variants
wear the same skin. No webfonts (Georgia/system stacks only — these pages must never block on
assets).

### 2. Digest email — "printed neighborhood bulletin" register

Email-safe toolkit only (tables, `bgcolor`, border rules, inline styles, Georgia — whose default
figures are oldstyle, matching the site's body-numeral convention). Deliberate choices:

- **Espresso masthead band** (bgcolor'd table cell): "THE LAST 48" letterspaced caps in ochre,
  the **date as the deck** in Georgia italic ("Wednesday, July 15"), and the place + honest
  window line ("Near 77 Chula Lane · published since your last digest").
- **Subject line carries the anchor**: "7 new reports near 77 Chula Lane · Wednesday, July 15".
- **True stat header** replaces "AT A GLANCE" + the jammed counts line: a table row of stat
  cells — lead cell with a big numeral + NEW REPORTS small-caps, then one cell per non-zero
  stream with a 3px top rule in the stream's pigment (911 terracotta, Fire/EMS brick, 311 moss —
  same identity as the app), numeral + small-caps label. Significant/busiest stays as a caption.
- **Map at pitch 30°**: leave the Static API's `auto` positioning for explicit
  center/zoom/bearing/pitch; zoom computed from the radius (pure `zoomForRadius`, clamped) so the
  circle fills the frame comfortably. The circle + pins render in perspective.
- **Hour strip gets an axis**: the existing 12-cell two-hour heat strip gains a label row
  (12 a.m. · 6 a.m. · noon · 6 p.m.) and keeps the "busiest 10–11 a.m." caption.
- **Time blocks get their ranges** (from the existing BLOCKS table): "MORNING · 6–11 a.m.",
  "AFTERNOON · noon–5 p.m.", "EVENING · 6–11 p.m.", "OVERNIGHT · 12–5 a.m.".
- **Honest temporal framing / staggered timeline**: the daily window label becomes "published
  since your last digest" (which is what the watermark actually implements). Rows group under
  the SF calendar day they OCCURRED (day headers with double-rule dividers when the digest spans
  more than one day); events older than 24h get a quiet italic "late report" tag. This is the
  layout gateway for the PR-D long-lag streams (traffic crashes).
- **Row hierarchy**: colored ● + short stream tag in the stream's pigment, time column, event
  title up to 16px, location in the muted meta tone. 311 category underscores are humanized
  (`Garbage_and_debris` → "Garbage and debris") in `humanizeCallType` (site-wide benefit).
- **No emoji** in body or subject — colored glyphs and rules carry the crafted feel; emoji reads
  toy-like against this palette (agreed deviation from the brief's offered toolkit).
- Plain-text part mirrors all of it (day headers, ranges, honest window line).

### 3. Subscribe page

- **Button**: fit-content width (real button proportions), keep the notch idiom.
- **Map scroll trap**: `scrollZoom.disable()` on the LocationPicker map only (map VIEWS keep
  free scroll-zoom — there the map is the page). Zoom stays available via the nav-control
  buttons and double-click. cooperativeGestures was considered and rejected: its overlay fires
  on every plain scroll — a nag in a form flow (Jesse's call after seeing the tradeoff).
- **Auto-frame the radius**: fit the map to the union of all pins' radius circles (padding ~48,
  maxZoom cap so ⅛ mi doesn't dive to rooftop level) on pin add/remove, radius change, and
  geocoder-result select — killing most of the need to zoom at all. Preserve the picker's
  pitch/bearing through fitBounds (the fitbounds-flattens-pitch lesson; existing code already
  does this for its current fit — extend, don't regress).

### 4. Preview loop

A small `scripts/preview-digest.ts` renders `renderDigest` with a realistic fixture payload to
an HTML file so email iterations can be reviewed in a browser (and sent to Jesse) without
touching a real inbox. Map URL uses `VITE_MAPBOX_TOKEN` from the environment when present.

## Out of scope (deliberately)

- New streams (business openings, traffic crashes) + per-stream fetch windows → PR D.
- Pulse-in-digest opt-in (signup option + server-side citywide signals) → PR E.
- Additional DataSF stream candidates (street-use/film permits, food facilities) — not yet in
  the client dataset registry; future consideration.
- Email dark-mode variants: the cream palette is the safest single scheme across clients that
  force-invert; revisit only if a real client renders it badly.

## Verification

- All alerts pure-module suites green (digestRender/digestSummary/staticMap tests updated to the
  new shapes); `npx tsc -b --force` clean; full devman build at branch end.
- Preview HTML reviewed by Jesse before merge (the email is a designed surface; the preview IS
  the design gate).
- Manual: /alerts scroll-over-map scrolls the page; pins/radius auto-frame; button reads as a
  button; confirm page matches the app's card energy.
