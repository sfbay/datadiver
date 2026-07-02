# The Pulse — Phase 2 roadmap

_Written 2026-07-01, after the three-week retrospective review (PRs #67–#100). Phase 1 shipped
in PR #98; this captures everything that remains so the feature can be picked back up cold._

## Where Phase 1 landed

`/pulse` (nav slot 2) + the Home teaser shipped 2026-06-30: a ranked, plain-English wire of
"what stands out right now in SF," ticket-stub cards over the existing z-score engine. The
architecture held up well under review:

- **`src/lib/pulse/pulsePhrase.ts`** — the pure writing/encoding layer, 188 lines of tests,
  including the dejargon guard (a test fails the build if σ / z-score / baseline / YoY reaches
  reader-facing text). This is the load-bearing design decision; keep all prose here.
- **Freshness gating** works as designed — "unusually quiet" is suppressed unless the stream
  confirms recent publishing (the Quakebot / "crashes −100%" trap).
- **The teaser adds zero network** — it renders Home's already-fetched `useCivicIndicators`
  result. Do NOT add a second `useCivicIndicators` call (not single-flighted; would double
  ~10 cold-load queries).
- Craft that should survive refactors: zero-width-space slash softening for narrow stubs
  (`WireCard.tsx`), the magnitude word spoken exactly once via `aria-label` (never rendered),
  deterministic rank tiebreaks, one colour per card = its feed.

**Dependency note:** PR #101 (SF-local timestamp fix) corrects the 48h windows Pulse counts
ride on — every "in the last 48h" number was ~41h before it. Phase 2 work should land on top
of it.

> **Status (2026-07-02):** items 1–5 shipped as PRs #103–#107 (evidence links carry the full
> drill set + Last48 normalizes bare `?nh=` arrivals; `/pulse?nh=` URL-synced with an honest
> filtered-empty state; `/about#whats-unusual` methodology anchor with hash delivery + the
> stale "7h 911 lag" copy corrected; card polish — tickLabel, masthead "updated" stamp,
> 1.0K fix, truncation note; mobile pass — sub-360px grid overflow fix, liquid stub clamp,
> pointer-coarse chip targets, overscroll containment). #107 also swapped the nav: The Last 48
> is slot 2, The Pulse slot 3. **Item 6 shipped later the same day as PRs #108/#110**:
> continuous diverging ramp (design gate run on live data via an in-map `?ramp=` switcher,
> since stripped — Jesse picked diverging; soft too wispy, warm-only invisible because the
> quiet side carries the texture on a typical afternoon), Stouffer combine replacing the
> flattening mean, selected-neighborhood ring, `AnomalyLegend`, and the rail/peek dejargon
> via `pulsePhrase.combinedDeviation`. Remaining: item 7 (expansions), the preview
> verification below, and an on-device thumb-scroll of /pulse (mobile pass shipped without
> visual QA — Chrome automation was down).

## Phase 2 work items, in shipping order

### 1. Evidence links must deliver the evidence (the one real Phase-1 defect)

A neighborhood anomaly card links to `/live?nh=Mission` (`pulsePhrase.ts:166`) — but on The
Last 48 a bare `nh` param is **inert**: the `AnomalyRail` + `Last48NeighborhoodPeek` only
mount when `fill === 'anomaly' && !pointsOn` (`Last48UnifiedView.tsx:189`), and the anomaly
fill layer doesn't mount under the default demographic fill either. The heartbeat's own
drill-in knows the contract — it sets `nh` + `fill=anomaly` + `points=off` together in one
update (`Last48.tsx:211-216`). A reader who clicks "dig in" on a Mission spike currently
lands on the generic view with no Mission highlight: the card promises evidence and delivers
the lobby.

**Fix:** `evidenceHref` becomes `/live?nh=…&fill=anomaly&points=off`, matching the heartbeat
drill exactly. Update the href test in `pulsePhrase.test.ts`. Consider (secondary) making
Last48 auto-enter the drill state on any arrival with `?nh=` set, so the URL contract is
robust for hand-typed links too.

**Lesson to carry:** a URL between two views is an API — the param *set* is the contract, not
just the param that names the entity. Phase 1 tested the href string in isolation; nothing
tested what the URL does on the receiving view.

### 2. URL-sync the place filter

`Pulse.tsx:19` holds the neighborhood filter in plain `useState`. DataDiver's shareability
principle (URL-encoded state everywhere) says `/pulse?nh=Mission` should be a linkable,
sendable state. Mirror the Last48 `?nh=` pattern (`replace: true`, guard against redundant
writes). This also gives the Home teaser and future cross-links a way to open The Pulse
pre-filtered.

### 3. The methodology anchor ("How we decide what's unusual")

The wire's footer promises a methodology link but points at bare `/about`, which has no Pulse
section — the reader lands at the top of a long page. Write the section in `About.tsx` with an
anchor (e.g. `/about#whats-unusual`):

- what's watched (911, Fire/EMS, 311 per-neighborhood volume; citywide trends),
- the comparison ("the last two days vs the same stretch in recent weeks, and a year ago"),
- the inclusion thresholds — documented plainly, numbers included (this is the ONE page where
  the statistical machinery may be named; the data-transparency principle asks for it),
- the freshness rule (never a "quiet" claim on a stream that's behind on publishing),
- known limits (publishing lag per stream, neighborhoods with tiny baselines).

Keep in sync with `pulsePhrase.ts` thresholds (`VOLUME_MIN_Z`, `QUIET_MIN_Z`, `TREND_MIN_PCT`).

### 4. Small card polish (one PR)

- **DeviationBar tick label is context-blind** — it always reads "usual," but trend cards'
  `ratio` compares to *a year ago*. Pass a `tickLabel` prop ("usual" | "last yr") derived from
  `WireItem.kind`.
- **Render the timestamp** — `WireItem.at` is carried but unused; the plan called for
  `formatApTime` on rows. Either render it (mono, small, in the caption line) or drop the field.
- **`formatCount` can emit "1.0K"** for exactly 1,000 — strip the trailing `.0`.
- Consider surfacing the item count when `MAX_VISIBLE` (24) truncates — a silent cap reads as
  "this is everything."

### 5. Mobile pass on `/pulse`

The view is a scroll page so it mostly works, but verify: the filter-chip row's horizontal
scroll on touch, the 320px card minmax vs 390px viewports (stub width 136px leaves ~180px for
the body), and tap targets. Note the mobile review (#89 retro) found Alerts/Demographics/
Elections/CityBudget got no mobile treatment — The Pulse should not join that list, it's the
most phone-shaped view in the app.

### 6. The anomaly choropleth rethink (the bigger sibling)

CLAUDE.md still flags the Last48 anomaly choropleth as "near-flat single color … flagged for a
rethink." The Pulse clarifies its job: it is now the **evidence view Pulse cards land on**.
Rework it around that role —

- when arriving with a selected neighborhood, the fill should *frame the claim the card made*
  (that neighborhood's deviation vs everywhere else, not a flat citywide wash),
- consider a diverging fill anchored at "typical" (matching the DeviationBar's mental model:
  left-of-usual cool, right-of-usual warm) instead of the current single-hue ramp,
- the `AnomalyRail` should carry the same dejargoned phrasing as the wire (reuse
  `pulsePhrase` — it is UI-agnostic on purpose; the warm-over-mono retrofit the FlowRail got
  in PR #42 is still pending on AnomalyRail too).

This is a design task first — sketch options before building (the WireCard "design studies via
served HTML gallery" method from Phase 1 worked well; see memory `pulse-card-design`).

### 7. Candidate expansions (post-choropleth, judgment calls)

- **More feeds**: crime incidents (39h publish lag — the freshness framing must be honest:
  "as of Sunday" not "right now"), traffic crashes (worse lag; the old ticker item was dropped
  for exactly this — see `project_ticker_data_freshness`). Only add a feed if its lag story
  can be told without undermining the wire's "right now" promise.
- **Citywide quiet items**: the phrase layer supports `fall` for citywide trends but the live
  significant tally has no "quiet" counterpart ("an unusually calm 48 hours citywide" is a
  story too). Needs the same freshness discipline.
- **A "since you last looked" affordance** — localStorage timestamp, subtle "new since
  yesterday" markers. Cheap, and it converts the wire from a page into a habit.

## Verification (Phase 1's still-open step + Phase 2's)

The plan's step 5 was never run: **preview verification against live Socrata data** — confirm
items populate with real timing, and specifically that no "unusually quiet" false positive
appears during a stream's publish gap (the failure mode unit tests can't see). Run it on the
Vercel preview after item 1 lands, at a few different times of day. Also verify each card's
click-through now lands with the neighborhood framed (item 1's acceptance test).

## Explicitly out of scope

- New detection math — the wire stays a writing layer over `useAnomalyBaseline` +
  `useCivicIndicators`. If a detector is wrong, fix the detector, not the phrasing.
- Push/email delivery of Pulse items — the alerts digest is the delivery channel; a future
  "Pulse in your digest" block should reuse `pulsePhrase` verbatim, not fork it.
