# Funder card ("baseball card") inside CampaignFinance — design

**Date:** 2026-08-23 · **Follows:** PR #164 (funder rows: full name + city, turn-down detail) · **Scope:** SF only this pass; Oakland's builders return `null` and the card never mounts there. **Sibling spec staged the same day:** `2026-08-23-consultants-lens-design.md` (independent; shares only the "identity has no id → disclose the merge" lesson).

**Jesse's calls (2026-08-23 brainstorm):** (1) the card is a **top-right `DetailPanelShell`** over the committee view, not a column takeover; (2) identity = **name merge with disclosed variants** + a common-name guard with ZIP narrowing, no authored crosswalk; (3) entry = funder rows **and** a ⌘K `funder` row type with a live typeahead; (4) the history strip is **by YEAR**, all years from first gift, stacked by recipient TYPE (never per gift), vertical bars, click-to-filter, and a horizontal scroller anchored to the newest years once the span exceeds 16 years.

## 1. Goal

Click any funder in a committee's list (or type a name into ⌘K) and see that funder's whole giving history across every SF committee in `pitq-e56w`: big numbers, a year-by-year strip, a ranked recipients list with stance, the identity variants that were merged, and the itemized gifts — with the three double-counting traps (497/496 notices, in-kind, sub-$100 unitemized) handled structurally and said on the card.

**Probe facts (2026-08-23) the spec is built on.** Michael Moritz: Schedule A $6,146,992 (30 rows) + Schedule C in-kind $512,418.42 (3) = **$6.66M real**; plus `S497` notices $3,129,999 (16) and `F496P3` receipts $1,460,000 (6) that are the SAME gifts reported early — a naive sum says $11.2M. He appears under **12 identities** (MICHAEL/Michael, ZIPs 94103 · 94123 · 94025 · 94117 · 94125, employers Sequoia Capital / Sequoia Heritage / HRTG Partners / Sequoia Investments), 2003 → 2026, top recipients Clean Up City Hall ($2.0M), Committee to Fix SF Government (two names, $2.6M), Neighbors for a Better SF ($1.2M).

Non-goals: no map; no authored funder crosswalk; no state (CAL-ACCESS) money; no IE-spender view (a funder's own 496 spending is a different ledger); no per-gift bar segments.

## 2. Identity

- **Key:** `funderKey = fold(first) + '|' + fold(last)`; for `entity_code ≠ 'IND'` the first part is empty and `last` carries the organization name. `fold` = trim, upper-case, collapse whitespace runs, strip trailing periods. Nothing fuzzier — no punctuation/suffix stripping (a "Jr." is a different person until a reader says otherwise).
- **URL:** `?funder=<encoded key>` (`michael|moritz`, `|neighbors for a better san francisco`), optional `&fzip=94103` (5-digit) narrowing every query to `transaction_zip LIKE '94103%'`. `useUrlSync` never writes or strips either param (pin test). Both are deleted when the card closes.
- **Common-name guard** (pure, in `funderStats`): tripped when the variants span **> 1 distinct city AND > 3 distinct 5-digit ZIPs**. Tripped → ochre line "This name appears at {n} addresses in {m} cities and may be more than one person." + ZIP chips (each sets `&fzip=`; active chip shows a × to clear). Moritz trips it (5 ZIPs, SF + Menlo Park). One-city donors never do.
- **Filed as** block (§4E) lists every variant regardless — the disclosure is unconditional; the guard only adds the warning + chips.

## 3. Data — six builders on `FppcQueryBuilders.funder` (SF; Oakland `null`)

All against `campaignFinance` (`pitq-e56w`). `N` = `upper(transaction_first_name) = '<FIRST>' AND upper(transaction_last_name) = '<LAST>'` (for orgs: `transaction_first_name IS NULL AND upper(transaction_last_name) = …`), plus `AND transaction_zip LIKE '<fzip>%'` when narrowed. `A` = `record_type = 'RCPT' AND form_type IN ('A','C')`.

| Builder | `$select` / `$group` | Feeds |
|---|---|---|
| `variants` | `transaction_first_name, transaction_last_name, transaction_city, transaction_state, transaction_zip, transaction_employer, transaction_occupation, entity_code, COUNT(*) as gifts, SUM(calculated_amount) as total` grouped on the eight; `WHERE N AND A`; `$limit 200` | Filed as, guard, masthead employer line |
| `byYear` | `date_extract_y(calculated_date) as y, form_type, COUNT(*) as gifts, SUM(calculated_amount) as total` grouped on `y, form_type`; `WHERE N AND A` | Year strip totals + the cash/in-kind split per year |
| `recipients` | `filer_nid, filer_name, filer_type, COUNT(*) as gifts, SUM(calculated_amount) as total, MIN(calculated_date) as first_date, MAX(calculated_date) as last_date` grouped on the three; `WHERE N AND A`; `$order total DESC`; `$limit 500` | Recipients list, RECIPIENTS tile, the year strip's TYPE stacking (via `stance` per recipient) |
| `gifts` | `transaction_id, calculated_date, calculated_amount, form_type, filer_nid, filer_name, filer_type, transaction_zip, transaction_employer`; `WHERE N AND A`; `$order calculated_date DESC`; `$limit 5000` | Gift list, median, per-year × type stacking (client-side join gift → recipient stance), `capped` |
| `notices` | same projection + `record_type`; `WHERE N AND record_type IN ('S497','RCPT') AND form_type IN ('F497P1','F496P3')`; `$limit 2000` | Pending-notice detection (§3.1) |
| `typeahead(q)` | `transaction_first_name, transaction_last_name, entity_code, MAX(transaction_city) as city, COUNT(*) as gifts, SUM(calculated_amount) as total` grouped on the three; `WHERE A AND (upper(transaction_last_name) LIKE 'Q%' OR upper(transaction_first_name \|\| ' ' \|\| transaction_last_name) LIKE 'Q%')`; `$order total DESC`; `$limit 8` | ⌘K `funder` rows |

`calculated_date`/`calculated_amount` are the house fields for this dataset (they already drive every CampaignFinance query). Money arrives as strings — `parseFloat`.

### 3.1 Notices (the double-count rule)
A notice row (`S497` late-contribution notice, or an `F496P3` receipt reported on an IE committee's 496) is **matched** to a Schedule A/C gift when recipient `filer_nid` is equal, `|amount − amount| < 0.005`, and the dates are within 30 days. Matched notices are dropped (they are the same gift). Unmatched notices are **pending**: counted and summed separately as "by notice, not yet on a statement", never added to TOTAL, shown as the sixth tile and as `notice` rows in the gift list. Rule lives in `funderStats.matchNotices` and is pinned.

### 3.2 Fetch
`useFunderProfile(key, fzip)` fires the five profile builders in parallel via `fetchDataset` (`cityId: 'sf'`, `timeoutMs: 15_000, retries: 1`), `enabled` only when a key is present AND `builders.funder !== null`. Each result is independent — a failed one yields `null` for its section, never an empty array (an empty array is a fact, a null is "did not load"). Re-fires on key or `fzip` change. The card is cycle-independent: `dateRange` is never read.

`useFunderTypeahead(query, open)`: debounced 250 ms, fires only when the palette is open, `cityId === 'sf'`, and `query.trim().length ≥ 3`; `timeoutMs: 6_000`; result rows become `SearchResult`s with `category: 'funder'`, `label` = display name (sentence-cased), `sublabel` = `city · $total · n gifts`, `icon` ◎, `path` `/campaign-finance`, `params { funder }`. Merged AFTER the static index (static rows keep their rank; `funder` rows fill remaining slots up to the palette's cap).

## 4. The card

`DetailPanelShell` — `open` when a key is set, `widthClass="w-[26rem]"`, `mobileCompact`, `glowColor` plum `#8b6282`, `buildShareUrl` = current URL with `funder`(+`fzip`), close → delete both params. Inner wrapper `id="funder-card"` is a PNG export target (ExportButton in the masthead). Scrolls inside the shell's `max-h-[80vh]`. Skeleton per section while loading (the progressive-skeleton rule).

**A. Masthead.** Name (Fraunces upright; `toSentenceCase` of the raw upper-case). Chip `committee` / `business` / `party` for non-persons. Muted line: primary city (most dollars) · top two employers by dollars. Guard warning + ZIP chips when tripped (§2). If `fzip` is active: "showing ZIP 94103 only ×".

**B. Big numbers** — 3+2 grid of `StatCard`-style tiles, lining tabular figures, plum accent:
- `TOTAL` cash + in-kind — sub "`$6.1M cash + $512K in-kind`" (sub omits in-kind when 0)
- `GIFTS` itemized count
- `AVERAGE` total ÷ gifts — sub "`median $50K`" (median from `gifts` rows; sub reads "median n/a (list capped)" when `capped`)
- `SPAN` `2003–2026` — sub "`12 active years`"
- `RECIPIENTS` distinct `filer_nid` — sub "`3 candidates · 9 measures · 2 PACs`" (from `stance`)
- `BY NOTICE` (sixth, muted, only when pending > 0) — sub "`not yet on a statement`"
When `capped`, TOTAL/GIFTS/SPAN/RECIPIENTS come from the server-aggregate builders (`byYear`, `recipients`), never from the capped rows; a nano line under the grid says "gift list capped at 5,000 — totals are server sums."

**C. Year strip** (`YearStrip.tsx`, D3 in SVG, rem text). One vertical bar per calendar year from the first gift year through the CURRENT year; zero years render as a 1px hairline in paper-500 (a gap is a fact). Each bar is stacked by recipient TYPE — candidates plum-700, measures plum-500, PACs/other plum-300 — computed by joining `gifts` → recipient → `stance`; when `capped`, stacking is unavailable and bars render solid plum-500 with a legend note. The current year is hatched (house hatch idiom) with "partial" under its label. Hover: `2024 · 9 gifts · $3.26M · 7 measures, 2 candidates`. **Click = filter**: sets local `year` state; D and F narrow to it; the bar gets a ring; click again (or a "all years ×" chip) clears. Layout: ≤ 16 years → bars flex to fill ~380px; > 16 → fixed 22px/year in an `overflow-x-auto` track, scrolled to the right on mount, with a left-edge fade mask. Height 90px + axis. Legend row under it: three swatches + "partial".

**D. Recipients.** `FunderList` (from #164) in recipient mode: name · stance chip (`candidate` / `Yes on K` / `No on G` / `measure` / `PAC`) · bar · total; turn-down: `n gifts · first–last · $x by notice`. Sorted by total. Filtered by the strip's year when set. Footer line: "stance read from the committee's registered name" (§5).

**E. Filed as.** Muted table, sorted by dollars: `Michael Moritz · San Francisco 94103 · Sequoia Heritage · 8 gifts · $5.1M` — one row per `variants` group (employer and occupation folded into the row's third cell as "occupation, employer"). Unconditional.

**F. Gift list.** `<details>` collapsed: "all 33 gifts" (or "newest 5,000 gifts" when capped). Rows: AP date · recipient · amount · form chip (`cash` / `in-kind` / `notice`). Newest first. Filtered by the strip's year when set. Notice rows are the PENDING ones only (matched notices are gone).

**G. Footer.** One serif paragraph: SF Ethics filings only (state committees absent); gifts under $100 are never itemized and are not here; identities merged on name — see Filed as; late-contribution notices are excluded from totals until they appear on a statement; stance is parsed from names. Link → `/about`.

**Entry points.** `FunderList` gains an optional `onOpenFunder?: (key: string) => void`; when passed, each row's name renders as a button (chevron + turn-down unchanged). `CampaignFinance.tsx` passes it (SF only) to both `ForAgainstSplit` lists and the Top Donors card; the handler sets `?funder=` (`replace: false` — a card open is a navigation a reader may back out of). `funderKey` is built from the row's `transaction_first_name`/`transaction_last_name`/`entity_code`. ⌘K `funder` rows navigate to `/campaign-finance?funder=…`.

## 5. Stance (`src/lib/funders/stance.ts`, pure)
`parseStance(filerName, filerType) → { kind: 'candidate' | 'yes' | 'no' | 'measure' | 'pac', measure?: string }`:
- `filerType` contains `Candidate` → `candidate`.
- else name matches `/\b(yes|support(ing)?|for)\s+(on\s+)?(prop(osition)?\.?\s*)?([A-Z]{1,2}|\d{1,3})\b/i` → `yes` with the measure letter/number; `/\b(no|oppos(e|ing)|against)\s+(on\s+)?(prop(osition)?\.?\s*)?([A-Z]{1,2}|\d{1,3})\b/i` → `no`. A name matching BOTH ("Yes on D, No on E") → `yes` for the first match and the chip reads `Yes on D · No on E`.
- else `filerType` contains `Measure` → `measure`; else `pac`.
Pinned on real names: "Yes on K, Ocean Beach Park for All…" → yes K; "No on G, Save Sunset Dunes…" → no G; "Mayor Mark Farrell for Yes on Prop D" → yes D; "Committee to Fix San Francisco Government, Yes on D, No on E…" → yes D + no E; "Neighbors For A Better San Francisco" (type PAC) → pac; "Manny Yekutiel for Supervisor 2026" (Candidate) → candidate.

## 6. Files

| Path | Role |
|---|---|
| `src/lib/funders/funderKey.ts` (+test) | `fold`, `funderKey(row)`, `parseFunderParam`, `formatFunderParam`, `displayName(key)` |
| `src/lib/funders/stance.ts` (+test) | §5 |
| `src/lib/funders/funderStats.ts` (+test) | `matchNotices`, `commonNameGuard`, `buildFunderProfile` → `FunderProfile` (§3/§4 fields incl. `byYear: { year, cash, inKind, gifts, byType: {candidate, measure, pac} }[]`, `capped`, `pending`) |
| `src/views/CampaignFinance/fppcDialect.ts` (+test) | `funder: FunderBuilders \| null` — six builders, byte-pinned; Oakland `null` |
| `src/hooks/useFunderProfile.ts`, `src/hooks/useFunderTypeahead.ts` | §3.2 |
| `src/views/CampaignFinance/funder/FunderCard.tsx`, `FunderMasthead.tsx`, `FunderTiles.tsx`, `YearStrip.tsx`, `FiledAs.tsx`, `GiftList.tsx` | §4 A–G (D reuses `FunderList`) |
| `src/components/charts/FunderList.tsx` | `onOpenFunder?`, recipient-mode chips |
| `src/components/search/useOmniSearch.ts` (+test), `OmniSearch.tsx` | `'funder'` category + live rows |
| `src/views/CampaignFinance/CampaignFinance.tsx` | reads `funder`/`fzip`, mounts the card (z-30), passes `onOpenFunder` |
| `src/views/About/About.tsx`, `docs/data-insights.md`, `CLAUDE.md` | the notice/in-kind/identity findings + view bullet |

## 7. Errors
- A profile fetch fails → its section shows "Did not load — retry" (per-section retry re-fires that one builder); tiles that depend on it show `—`. Never a blank card.
- `gifts` capped → `capped: true` (§4B/C/F behaviors).
- Key with zero Schedule A/C rows → "No itemized gifts found under this name" + the name + close. If notices exist but no statements, the BY NOTICE tile still renders with the same empty-state line above it.
- Typeahead failure → silent (static ⌘K rows unaffected).
- Oakland URL with `?funder=` → ignored (builders null; params left in place, harmless).

## 8. Testing + verification
- Pure: `funderKey` (fold cases, org keys, param round-trip), `stance` (§5 pins), `funderStats` (notice matched → dropped; unmatched → pending, excluded from total; in-kind separated; median vs average; guard trips on the Moritz fixture and not on a one-ZIP donor; byYear includes hairline zero years and the current year; capped flag propagates).
- Dialect: six SF builders byte-pinned; `fzip` narrowing appends the LIKE; Oakland `funder === null`.
- `useOmniSearch.test.ts`: `'funder'` is a category; static index byte-identical; live rows append after static.
- URL pin: `useUrlSync.ts` never touches `funder`/`fzip`.
- Build via `~/dev/devman/tools/devman-build.mjs pnpm build` + full `pnpm test`; preview walk (light/dark, desktop + effective-mobile): `?funder=michael|moritz` (guard, scroller anchored right, BY NOTICE tile, Filed as 12 rows), `&fzip=94103`, a one-gift donor, `?funder=|neighbors for a better san francisco`, ⌘K "moritz", `/oakland/campaign-finance?funder=…` ignored, PNG export of `#funder-card`, Escape/X clears params.

## 9. Banked
- Oakland funder card (fill `funder` builders on the Sch A columns `tran_namf/naml/city/zip4/emp/occ/entity_cd`).
- A funder's own IE spending (496) as a second ledger on the card.
- Employer roll-up card ("everyone at Sequoia") — same machinery, different key.
