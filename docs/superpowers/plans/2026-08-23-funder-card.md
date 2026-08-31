# Funder Card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Click any funder in a committee's list (or find one in ⌘K) and open a top-right card with that funder's whole SF giving history — big numbers, a year strip stacked by recipient type, ranked recipients with stance, the merged identity variants, and the itemized gifts — with notices, in-kind, and unitemized money handled structurally.

**Architecture:** Pure modules first (`src/lib/funders/*`: key, stance, stats — node-tested), then six SoQL builders on the SF dialect, then two hooks (profile fetch ×5 in parallel; ⌘K typeahead), then the `DetailPanelShell` card composed of small section components, then ⌘K integration and docs. `?funder=`/`?fzip=` are the only state; the card is cycle-independent.

**Tech Stack:** Vite + React 18 + TS + Tailwind v4, React Router `useSearchParams`, D3 (year strip), Vitest (node). Data: `pitq-e56w` via `fetchDataset`.

**Spec:** `docs/superpowers/specs/2026-08-23-funder-card-design.md` — read it first. §3 (builders), §3.1 (notice rule), §4 (card), §5 (stance) are the acceptance tables.

## Global Constraints

- Branch `feat/funder-card` (spec `8c51598`). Never commit to main. **Never run `pnpm dev` via Bash.** Build: `~/dev/devman/tools/devman-build.mjs pnpm build`. Tests: `pnpm test` (Vitest, node — `appStore` is unimportable in tests; keep logic in pure leaf modules).
- `src/lib/funders/*` imports nothing from `src/` outside `src/lib/funders/` and `src/types/`.
- DataSF datetimes are floating strings — compare `YYYY-MM-DD` prefixes (`.slice(0,10)`), never `Date.parse`. Money arrives as strings — `parseFloat`.
- Identity key: `fold(first) + '|' + fold(last)`; `fold` = trim → upper → collapse whitespace → strip trailing periods. Orgs (`entity_code ≠ 'IND'`): empty first part. Nothing fuzzier.
- Every profile query filters `record_type = 'RCPT' AND form_type IN ('A','C')`; notices query = `record_type IN ('S497','RCPT') AND form_type IN ('F497P1','F496P3')`. Notice match rule: same `filer_nid`, `|Δamount| < 0.005`, dates within 30 days. Matched notices are dropped; unmatched are **pending** and never in TOTAL.
- Common-name guard: variants span **> 1 distinct city AND > 3 distinct 5-digit ZIPs**.
- Year strip: one bar per calendar year from first gift year through the CURRENT year; zero years = 1px hairline; stacked by recipient TYPE (candidate plum-700 `#5e3f57`, measure plum-500 `#8b6282`, pac plum-300 `#b79bb0` — read the ramp from `src/styles/tokens.css` and use its actual hexes); current year hatched + "partial"; ≤16 years flex, >16 years fixed 22px/year in a horizontal scroller scrolled to the right on mount; click = filter.
- Reader copy (verbatim): guard line "This name appears at {n} addresses in {m} cities and may be more than one person." · empty state "No itemized gifts found under this name" · notice tile sub "not yet on a statement" · capped line "gift list capped at 5,000 — totals are server sums" · recipients footer "stance read from the committee's registered name".
- `md:` is BANNED — use `desk:`. Micro type = `text-nano`/`text-micro`/`text-label`. SVG text sizes via inline rem `style`, never the attribute. No glow on rows/buttons/tooltips.
- Plum is the pigment. Ochre = guard warning. Moss = nothing here. No new hardcoded px font sizes in charts.
- `useUrlSync` never touches `funder`/`fzip` (pin test). Oakland: `builders.funder === null`; card never mounts; params ignored.
- Commit trailers on every commit:
  ```
  Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>
  Claude-Session: https://claude.ai/code/session_01WFSt6G6pKSasxwzr49canD
  ```

---

## File map

| Path | Task | Role |
|---|---|---|
| `src/lib/funders/funderKey.ts` (+test) | 1 | `fold`, `funderKey`, `parseFunderParam`, `formatFunderParam`, `displayName` |
| `src/lib/funders/stance.ts` (+test) | 1 | `parseStance` |
| `src/lib/funders/types.ts` | 2 | row + profile types |
| `src/lib/funders/funderStats.ts` (+test) | 2 | `matchNotices`, `commonNameGuard`, `buildFunderProfile` |
| `src/views/CampaignFinance/fppcDialect.ts` (+test) | 3 | `funder: FunderBuilders \| null` |
| `src/hooks/useFunderProfile.ts`, `src/hooks/useFunderTypeahead.ts` | 4 | fetches |
| `src/components/charts/FunderList.tsx` | 5 | `onOpenFunder`, `funderKeyOf` |
| `src/views/CampaignFinance/funder/FunderCard.tsx`, `FunderMasthead.tsx`, `FunderTiles.tsx` | 5 | shell + A + B |
| `src/views/CampaignFinance/CampaignFinance.tsx` | 5 | params, mount, `onOpenFunder` |
| `src/views/CampaignFinance/funder/YearStrip.tsx` | 6 | C |
| `src/views/CampaignFinance/funder/FiledAs.tsx`, `GiftList.tsx`, `FunderFooter.tsx` | 7 | D (via FunderList) + E + F + G |
| `src/components/search/useOmniSearch.ts` (+test), `OmniSearch.tsx` | 8 | `'funder'` rows |
| `src/views/About/About.tsx`, `docs/data-insights.md`, `CLAUDE.md` | 9 | disclosure + bank |

---

### Task 1: `funderKey` + `stance` (pure)

**Files:** Create `src/lib/funders/funderKey.ts`, `funderKey.test.ts`, `stance.ts`, `stance.test.ts`.

**Interfaces (produces):**
```ts
export function fold(s: string | undefined | null): string
export function funderKey(row: { transaction_first_name?: string; transaction_last_name: string; entity_code?: string }): string  // 'MICHAEL|MORITZ' or '|NEIGHBORS FOR A BETTER SAN FRANCISCO'
export function parseFunderParam(raw: string | null): { first: string; last: string; key: string } | null  // null when raw is empty or has no '|' or empty last
export function formatFunderParam(key: string): string  // lower-cased for the URL: 'michael|moritz'
export function displayName(key: string): string        // 'Michael Moritz' via toSentenceCase-style casing (own tiny impl — no import from utils)
export type StanceKind = 'candidate' | 'yes' | 'no' | 'measure' | 'pac'
export interface Stance { kind: StanceKind; measure?: string; also?: { kind: 'yes' | 'no'; measure: string } }
export function parseStance(filerName: string, filerType: string | undefined): Stance
export function stanceChip(s: Stance): string  // 'candidate' | 'Yes on K' | 'No on G' | 'Yes on D · No on E' | 'measure' | 'PAC'
```

- [ ] **Step 1: failing tests**

`src/lib/funders/funderKey.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { fold, funderKey, parseFunderParam, formatFunderParam, displayName } from './funderKey'

describe('fold', () => {
  it('upper-cases, trims, collapses whitespace, strips trailing periods', () => {
    expect(fold('  Michael   moritz. ')).toBe('MICHAEL MORITZ')
    expect(fold(undefined)).toBe('')
  })
  it('does NOT strip suffixes or punctuation inside the name (a Jr. is a different person)', () => {
    expect(fold('John Smith Jr.')).toBe('JOHN SMITH JR')
    expect(fold("O'Brien")).toBe("O'BRIEN")
  })
})
describe('funderKey', () => {
  it('person = FIRST|LAST', () => {
    expect(funderKey({ transaction_first_name: 'Michael', transaction_last_name: 'MORITZ', entity_code: 'IND' })).toBe('MICHAEL|MORITZ')
  })
  it('org = |NAME (first part empty) even if a first name is present', () => {
    expect(funderKey({ transaction_first_name: 'x', transaction_last_name: 'Neighbors For A Better San Francisco', entity_code: 'COM' })).toBe('|NEIGHBORS FOR A BETTER SAN FRANCISCO')
  })
  it('missing entity_code is treated as a person', () => {
    expect(funderKey({ transaction_first_name: 'A', transaction_last_name: 'B' })).toBe('A|B')
  })
})
describe('URL param round-trip', () => {
  it('formats lower-case and parses back to the folded key', () => {
    expect(formatFunderParam('MICHAEL|MORITZ')).toBe('michael|moritz')
    expect(parseFunderParam('michael|moritz')).toEqual({ first: 'MICHAEL', last: 'MORITZ', key: 'MICHAEL|MORITZ' })
    expect(parseFunderParam('|neighbors for a better san francisco')?.key).toBe('|NEIGHBORS FOR A BETTER SAN FRANCISCO')
  })
  it('rejects empty, missing bar, empty last', () => {
    expect(parseFunderParam(null)).toBeNull()
    expect(parseFunderParam('')).toBeNull()
    expect(parseFunderParam('moritz')).toBeNull()
    expect(parseFunderParam('michael|')).toBeNull()
  })
})
describe('displayName', () => {
  it('sentence-cases a person and an org', () => {
    expect(displayName('MICHAEL|MORITZ')).toBe('Michael Moritz')
    expect(displayName('|NEIGHBORS FOR A BETTER SAN FRANCISCO')).toBe('Neighbors For A Better San Francisco')
  })
})
```

`src/lib/funders/stance.test.ts`:
```ts
import { describe, it, expect } from 'vitest'
import { parseStance, stanceChip } from './stance'

describe('parseStance (real SF committee names)', () => {
  it('candidate by filerType', () => {
    expect(parseStance('Manny Yekutiel for Supervisor 2026', 'Candidate or Officeholder').kind).toBe('candidate')
  })
  it('Yes on K / No on G', () => {
    expect(parseStance('Yes on K, Ocean Beach Park for All Sponsored By Community Nonprofits', 'Primarily Formed Measure')).toEqual({ kind: 'yes', measure: 'K' })
    expect(parseStance('No on G, Save Sunset Dunes sponsored by Friends of Sunset Dunes', 'Primarily Formed Measure')).toEqual({ kind: 'no', measure: 'G' })
  })
  it('"for Yes on Prop D" → yes D', () => {
    expect(parseStance('Mayor Mark Farrell for Yes on Prop D', 'Primarily Formed Measure')).toEqual({ kind: 'yes', measure: 'D' })
  })
  it('Yes on D, No on E → yes D with also no E', () => {
    const s = parseStance("Committee to Fix San Francisco Government, Yes on D, No on E, A Coalition of San Francisco Civic Organizations Dedicated to Improving the City's Future", 'Primarily Formed Measure')
    expect(s).toEqual({ kind: 'yes', measure: 'D', also: { kind: 'no', measure: 'E' } })
    expect(stanceChip(s)).toBe('Yes on D · No on E')
  })
  it('measure-type with no parseable letter → measure; anything else → pac', () => {
    expect(parseStance('Committee to Fix San Francisco Government', 'Primarily Formed Measure').kind).toBe('measure')
    expect(parseStance('Neighbors For A Better San Francisco', 'General Purpose').kind).toBe('pac')
    expect(parseStance('GrowSF Voter Guide', undefined).kind).toBe('pac')
  })
  it('never reads "for Supervisor" as a measure letter and never matches inside a word', () => {
    expect(parseStance('Theo Ellington for Supervisor 2026', 'General Purpose').kind).toBe('pac')
    expect(parseStance('Information for All', 'General Purpose').kind).toBe('pac')
  })
  it('chips', () => {
    expect(stanceChip({ kind: 'candidate' })).toBe('candidate')
    expect(stanceChip({ kind: 'yes', measure: 'K' })).toBe('Yes on K')
    expect(stanceChip({ kind: 'measure' })).toBe('measure')
    expect(stanceChip({ kind: 'pac' })).toBe('PAC')
  })
})
```

- [ ] **Step 2: run → FAIL** `pnpm vitest run src/lib/funders/`

- [ ] **Step 3: implement**

`src/lib/funders/funderKey.ts`:
```ts
// A funder has no id anywhere in pitq-e56w. The NAME is the id, and every
// surface that merges on it must say so (spec §2). Nothing fuzzier than
// case + whitespace + trailing periods — "Jr." stays a different person.
export function fold(s: string | undefined | null): string {
  return (s ?? '').trim().toUpperCase().replace(/\s+/g, ' ').replace(/\.+$/, '')
}

export function funderKey(row: { transaction_first_name?: string; transaction_last_name: string; entity_code?: string }): string {
  const isPerson = !row.entity_code || row.entity_code === 'IND'
  return `${isPerson ? fold(row.transaction_first_name) : ''}|${fold(row.transaction_last_name)}`
}

export function parseFunderParam(raw: string | null): { first: string; last: string; key: string } | null {
  if (!raw) return null
  const bar = raw.indexOf('|')
  if (bar < 0) return null
  const first = fold(raw.slice(0, bar))
  const last = fold(raw.slice(bar + 1))
  if (!last) return null
  return { first, last, key: `${first}|${last}` }
}

export function formatFunderParam(key: string): string {
  return key.toLowerCase()
}

const KEEP_UPPER = new Set(['SF', 'CA', 'LLC', 'PAC', 'LGBTQ', 'AI', 'II', 'III'])
function caseWord(w: string): string {
  if (KEEP_UPPER.has(w)) return w
  return w.charAt(0) + w.slice(1).toLowerCase()
}

export function displayName(key: string): string {
  const bar = key.indexOf('|')
  const first = bar >= 0 ? key.slice(0, bar) : ''
  const last = bar >= 0 ? key.slice(bar + 1) : key
  return [first, last].filter(Boolean).join(' ').split(' ').map(caseWord).join(' ')
}
```

`src/lib/funders/stance.ts`:
```ts
// Stance is PARSED from a committee's registered name — there is no stance
// column. Every surface that shows a chip says so (spec §5).
export type StanceKind = 'candidate' | 'yes' | 'no' | 'measure' | 'pac'
export interface Stance { kind: StanceKind; measure?: string; also?: { kind: 'yes' | 'no'; measure: string } }

const MEASURE = String.raw`(?:on\s+)?(?:prop(?:osition)?\.?\s*)?([A-Z]{1,2}|\d{1,3})\b`
const YES = new RegExp(String.raw`\b(?:yes|support(?:ing)?)\s+${MEASURE}`, 'i')
const YES_FOR = new RegExp(String.raw`\bfor\s+yes\s+${MEASURE}`, 'i')
const NO = new RegExp(String.raw`\b(?:no|oppos(?:e|ing)|against)\s+${MEASURE}`, 'i')

export function parseStance(filerName: string, filerType: string | undefined): Stance {
  if (filerType && /candidate/i.test(filerType)) return { kind: 'candidate' }
  const yes = YES_FOR.exec(filerName) ?? YES.exec(filerName)
  const no = NO.exec(filerName)
  const yesM = yes?.[1]?.toUpperCase()
  const noM = no?.[1]?.toUpperCase()
  if (yesM && noM) {
    return yes!.index <= no!.index
      ? { kind: 'yes', measure: yesM, also: { kind: 'no', measure: noM } }
      : { kind: 'no', measure: noM, also: { kind: 'yes', measure: yesM } }
  }
  if (yesM) return { kind: 'yes', measure: yesM }
  if (noM) return { kind: 'no', measure: noM }
  if (filerType && /measure/i.test(filerType)) return { kind: 'measure' }
  return { kind: 'pac' }
}

function one(kind: 'yes' | 'no', m: string): string { return `${kind === 'yes' ? 'Yes' : 'No'} on ${m}` }

export function stanceChip(s: Stance): string {
  if (s.kind === 'candidate') return 'candidate'
  if (s.kind === 'measure') return 'measure'
  if (s.kind === 'pac') return 'PAC'
  const head = one(s.kind, s.measure ?? '?')
  return s.also ? `${head} · ${one(s.also.kind, s.also.measure)}` : head
}
```
The "for Supervisor" test: `YES` requires `yes|support|supporting` — "for" alone never matches; `YES_FOR` requires "for yes". "Information for All": no `yes`/`no` word boundary match ("Information" contains "on" but `\bno\b`… careful: `\bno\s+` — "Information for All" has no standalone "no"; "on All"? The MEASURE group requires 1–2 UPPER letters or digits followed by `\b` — "All" is 3 letters, so no). Keep the tests; adjust the regex only if a pinned name fails, never the pin.

- [ ] **Step 4: run → PASS** · **Step 5: commit** `git add src/lib/funders && git commit -m "feat(funders): identity key + stance parser (pure)"`

---

### Task 2: `funderStats` (pure) + types

**Files:** Create `src/lib/funders/types.ts`, `funderStats.ts`, `funderStats.test.ts`.

**Interfaces (produces):**
```ts
// types.ts
export interface VariantRow { transaction_first_name?: string; transaction_last_name: string; transaction_city?: string; transaction_state?: string; transaction_zip?: string; transaction_employer?: string; transaction_occupation?: string; entity_code?: string; gifts: string; total: string }
export interface YearRow { y: string; form_type: string; gifts: string; total: string }
export interface RecipientRow { filer_nid: string; filer_name: string; filer_type?: string; gifts: string; total: string; first_date?: string; last_date?: string }
export interface GiftRow { transaction_id?: string; calculated_date?: string; calculated_amount: string; form_type: string; record_type?: string; filer_nid: string; filer_name: string; filer_type?: string; transaction_zip?: string; transaction_employer?: string }
export interface FunderVariant { first?: string; last: string; city?: string; state?: string; zip?: string; employer?: string; occupation?: string; entityCode?: string; gifts: number; total: number }
export interface FunderRecipient { filerNid: string; filerName: string; stance: Stance; gifts: number; total: number; firstDate?: string; lastDate?: string; pending: number }
export interface FunderYear { year: number; cash: number; inKind: number; gifts: number; byType: { candidate: number; measure: number; pac: number } | null; partial: boolean }
export interface FunderGift { id: string; date: string; amount: number; kind: 'cash' | 'in-kind' | 'notice'; filerNid: string; filerName: string; year: number }
export interface FunderProfile {
  key: string; total: number; cash: number; inKind: number; gifts: number; average: number | null; median: number | null
  firstYear: number | null; lastYear: number | null; activeYears: number
  recipients: FunderRecipient[]; recipientCounts: { candidate: number; measure: number; pac: number }
  byYear: FunderYear[]; variants: FunderVariant[]; giftList: FunderGift[]; pending: { count: number; total: number }
  guard: { tripped: boolean; cities: string[]; zips: string[] }; primaryCity?: string; topEmployers: string[]; capped: boolean
}
// funderStats.ts
export const GIFT_CAP = 5000
export function matchNotices(gifts: GiftRow[], notices: GiftRow[]): { pending: GiftRow[] }
export function commonNameGuard(variants: FunderVariant[]): FunderProfile['guard']
export function buildFunderProfile(input: { key: string; variants: VariantRow[] | null; byYear: YearRow[] | null; recipients: RecipientRow[] | null; gifts: GiftRow[] | null; notices: GiftRow[] | null; currentYear: number }): FunderProfile
```
Rules: `stance` from Task 1 keyed by `filer_nid` → year `byType` is computed from `gifts` rows joined to recipients; `byType` is `null` when `gifts` is null or `capped`. `capped = gifts.length >= GIFT_CAP`; when capped, `total/cash/inKind/gifts/firstYear/lastYear/activeYears/recipientCounts` come from `byYear`/`recipients` (server sums) and `median` is `null`. Otherwise gifts rows and server sums agree and either may be used — use server sums always (one source). `byYear` spans `firstYear..currentYear` with zero-filled years; `partial = year === currentYear`. `primaryCity` = the city with the most dollars across variants; `topEmployers` = top two employers by dollars (persons only). Null inputs mean "did not load": `variants: null` → `variants: []`, guard untripped, and the card shows the section's retry (Task 5) — the profile itself never throws.

- [ ] **Step 1: failing tests** — `src/lib/funders/funderStats.test.ts` with a Moritz-shaped fixture (two cities, five ZIPs; Schedule A + C rows; two S497 notices — one matching an A row on amount/filer within 30 d, one unmatched $2,000,000 dated 2026-04-07 to filer `X`), pins:
  - matched notice dropped, unmatched → `pending = { count: 1, total: 2000000 }`, `total` excludes it;
  - `cash` = Σ form A, `inKind` = Σ form C, `total = cash + inKind`;
  - `median` differs from `average` on the fixture; `median === null` when a 5,000-row gifts array is passed (`capped: true`);
  - guard trips on the fixture; does not trip on a one-city three-ZIP variant set;
  - `byYear` runs from 2003 to `currentYear`, contains a zero year with `gifts: 0`, and the last entry `partial: true`; `byType` sums equal the year's gifts count;
  - `recipients` sorted by total desc with `stance` set; `recipientCounts` tallies kinds (`yes`/`no`/`measure` all count as `measure`);
  - null `recipients` → `recipients: []` and `byType: null`.
- [ ] **Step 2: run → FAIL** · **Step 3: implement** `funderStats.ts` per the rules above (pure; `datePrefix = s.slice(0,10)`; day diff via `Date.UTC` on parsed prefixes, the `reconcile.ts` pattern) · **Step 4: run → PASS** · **Step 5: commit** `feat(funders): profile stats — notice matching, common-name guard, year stacking (pure)`

---

### Task 3: Dialect `funder` builders + pins

**Files:** Modify `src/views/CampaignFinance/fppcDialect.ts`, `fppcDialect.test.ts`.

**Interfaces (produces):**
```ts
export interface FunderBuilders {
  variants(first: string, last: string, fzip?: string): FppcQuerySpec
  byYear(first: string, last: string, fzip?: string): FppcQuerySpec
  recipients(first: string, last: string, fzip?: string): FppcQuerySpec
  gifts(first: string, last: string, fzip?: string): FppcQuerySpec
  notices(first: string, last: string, fzip?: string): FppcQuerySpec
  typeahead(q: string): FppcQuerySpec
}
// FppcQueryBuilders gains: funder: FunderBuilders | null
```
`first === ''` means org: `transaction_first_name IS NULL AND upper(transaction_last_name) = '<LAST>'`; else `upper(transaction_first_name) = '<FIRST>' AND upper(transaction_last_name) = '<LAST>'`. Escape with `esc`. `fzip` (validated `/^\d{5}$/` by the caller) appends ` AND transaction_zip LIKE '<fzip>%'`. Exact `$select`/`$group`/`$order`/`$limit` per spec §3 table; all use `datasetKey: CF`. Typeahead: `q` folded, `LIKE '<Q>%'` on `upper(transaction_last_name)` OR on `upper(transaction_first_name || ' ' || transaction_last_name)`.

- [ ] **Step 1: pins** — add to `fppcDialect.test.ts` SF block: byte-equal `toEqual` for `variants('MICHAEL','MORITZ')`, `variants('','NEIGHBORS FOR A BETTER SAN FRANCISCO')` (IS NULL form), `gifts('MICHAEL','MORITZ','94103')` (LIKE appended, `$limit: 5000`, `$order: 'calculated_date DESC'`), `notices(...)` (`record_type IN ('S497','RCPT') AND form_type IN ('F497P1','F496P3')`), `typeahead("o'br")` (escaped, `$limit: 8`); Oakland: `expect(b.funder).toBeNull()`.
- [ ] **Step 2: run → FAIL** · **Step 3: implement** (SF `funder: SF_FUNDER`, Oakland `funder: null`) · **Step 4: run → PASS** · **Step 5: commit** `feat(campaign-finance): funder query builders (SF)`

---

### Task 4: Hooks

**Files:** Create `src/hooks/useFunderProfile.ts`, `src/hooks/useFunderTypeahead.ts`.

**Interfaces (produces):**
```ts
export interface FunderSections { variants: VariantRow[] | null; byYear: YearRow[] | null; recipients: RecipientRow[] | null; gifts: GiftRow[] | null; notices: GiftRow[] | null }
export function useFunderProfile(key: string | null, fzip: string | null, builders: FunderBuilders | null): { profile: FunderProfile | null; sections: FunderSections; failed: (keyof FunderSections)[]; isLoading: boolean; retry: (section: keyof FunderSections) => void }
export function useFunderTypeahead(query: string, active: boolean, builders: FunderBuilders | null): { rows: TypeaheadRow[] }  // TypeaheadRow { transaction_first_name?: string; transaction_last_name: string; entity_code?: string; city?: string; gifts: string; total: string }
```
`useFunderProfile`: parse key → `{first,last}`; on change, set all five sections `undefined` (loading), fire five `fetchDataset` calls (`cityId: 'sf'`, `timeoutMs: 15_000`, `retries: 1`) via `Promise.allSettled`; rejected → `null` + section name in `failed`; `profile = buildFunderProfile({...sections-with-null-for-loading-too, currentYear: new Date().getFullYear()})` only once all five settled. `retry(section)` re-fires that one builder. Generation guard (`useRef` counter) so a stale response never lands. `useFunderTypeahead`: `useEffect` with 250 ms `setTimeout`, fires only when `active && builders && fold(query).length >= 3`; `timeoutMs: 6_000`; failures → `rows: []`.

- [ ] Implement both; `npx tsc -b` clean; commit `feat(funders): profile + typeahead hooks`. (No node tests — hooks; the pure layer carries the logic.)

---

### Task 5: Card shell + masthead + tiles + wiring

**Files:** Create `src/views/CampaignFinance/funder/FunderCard.tsx`, `FunderMasthead.tsx`, `FunderTiles.tsx`; modify `src/components/charts/FunderList.tsx`, `src/views/CampaignFinance/CampaignFinance.tsx`; test `src/views/CampaignFinance/funderParams.test.ts`.

**Interfaces:**
- `FunderList` gains `onOpenFunder?: (key: string) => void`; `Funder` gains `funderKey?: string`; `funderFromDonorRow` sets it via Task 1's `funderKey(row)`. When both are present the name renders as `<button type="button">` (plum on hover) calling `onOpenFunder(funderKey)`.
- `<FunderCard keyParam={string} fzip={string|null} builders={FunderBuilders} onClose={() => void} onSetZip={(zip: string|null) => void} />` — the shell (`DetailPanelShell open widthClass="w-[26rem]" mobileCompact glowColor="#8b6282" spinnerClass="border-plum-400" buildShareUrl={() => location.href}`), inner `<div id="funder-card">`, `ExportButton targetSelector="#funder-card" filename={displayName}`; composes Masthead + Tiles now, and leaves labeled slots `{/* Task 6: YearStrip */} {/* Task 7: Recipients / FiledAs / GiftList / Footer */}`.
- `FunderMasthead({ profile, failed, onSetZip, fzip })` — name, org chip, muted line, guard warning + ZIP chips (active chip ×), "showing ZIP … only ×".
- `FunderTiles({ profile })` — five (six) `StatCard`s in `grid grid-cols-3 gap-2` + a second row of two; `color="#8b6282"`; captions per spec §4B; the capped nano line.
- `CampaignFinance.tsx`: `const [sp, setSp] = useSearchParams()`; `const funderParam = builders.funder ? parseFunderParam(sp.get('funder')) : null`; `fzip = /^\d{5}$/.test(sp.get('fzip') ?? '') ? sp.get('fzip') : null`; `openFunder(key)` → `setSp(p => { p.set('funder', formatFunderParam(key)); p.delete('fzip'); return p })` (NOT replace); `closeFunder` deletes both (`replace: true`); `setZip`. Mount `<FunderCard>` as a sibling of the `#cf-capture` div (outside it, so the committee PNG is unchanged) when `funderParam`. Pass `onOpenFunder={isSF ? openFunder : undefined}` into both `FunderList` usages (ForAgainstSplit needs to accept and forward the prop).
- Empty state (profile loaded, `gifts === 0 && pending.count === 0`): the card body is one line "No itemized gifts found under this name" + the name; when `pending.count > 0` the BY NOTICE tile still renders under it.
- Section failures: Masthead/Tiles read `failed`; a failed `variants` shows "Filed-as details did not load — retry" (button → `retry('variants')`); tiles depending on a failed section show `—`.

- [ ] **Step 1: URL pin test** `src/views/CampaignFinance/funderParams.test.ts`: read `src/hooks/useUrlSync.ts` and assert no `set('funder'`/`delete('funder'`/`set('fzip'`/`delete('fzip'`.
- [ ] Implement; `npx tsc -b`; `~/dev/devman/tools/devman-build.mjs pnpm build`; commit `feat(campaign-finance): funder card shell — masthead, big numbers, ?funder= wiring`.

---

### Task 6: YearStrip

**Files:** Create `src/views/CampaignFinance/funder/YearStrip.tsx`; modify `FunderCard.tsx` (mount; lift `year` filter state).

**Interfaces:** `<YearStrip years={FunderYear[]} selected={number|null} onSelect={(y: number|null) => void} />`. Layout per Global Constraints (≤16 flex / >16 scroller at 22px scrolled right on mount via `ref.scrollLeft = ref.scrollWidth`, left fade via `mask-image: linear-gradient(to right, transparent, black 24px)`). SVG: bars stacked candidate/measure/pac (from `byType`; solid plum-500 when `byType === null` + legend note "type split unavailable — gift list capped"); zero years 1px hairline `#a8926a`; current year overlaid with a `<pattern>` hatch (copy the `DatasetSuperChips` pattern: 5×5 userSpaceOnUse, rotate(-45), stroke `#a8926a` 0.6, opacity 0.35) and label "partial"; `<title>` per bar `2024 · 9 gifts · $3.26M · 7 measures, 2 candidates`; selected bar gets a 1.5px plum-700 ring; click toggles. Text: year labels every bar when ≤16, every other when scrolling, `style={{ fontSize: '0.5625rem' }}` mono. Legend row: three swatches + hatch swatch "partial". Height 90 + 18 axis. `FunderCard` holds `const [year, setYear] = useState<number|null>(null)` and passes it down to Task 7's sections; a chip "all years ×" under the strip clears it.

- [ ] Implement; build; commit `feat(campaign-finance): funder year strip — stacked by recipient type, click to filter`.

---

### Task 7: Recipients + Filed as + Gift list + Footer

**Files:** Create `FiledAs.tsx`, `GiftList.tsx`, `FunderFooter.tsx`; modify `FunderCard.tsx`, `FunderList.tsx` (recipient chips).

- Recipients: `FunderList label="Recipients" color="#8b6282" funders={profile.recipients.filter(byYear).map(r => ({ key: r.filerNid, name: toSentenceCase(r.filerName), chip: stanceChip(r.stance), amount: r.total, detail: `${r.gifts} gifts · ${apDay(first)}–${apDay(last)}${r.pending ? ` · ${money(r.pending)} by notice` : ''}` }))}` — when `year` is set, totals come from `giftList` filtered to that year (client rows; when `capped`, filtering is disabled with a note). Footer line "stance read from the committee's registered name".
- `FiledAs({ variants })`: muted table sorted by total: name · `city ZIP` · `occupation, employer` · gifts · total.
- `GiftList({ gifts, capped, year })`: `<details>` summary "all N gifts" / "newest 5,000 gifts"; rows date (AP) · recipient · amount · chip `cash`/`in-kind`/`notice`; newest first; filtered by `year`.
- `FunderFooter`: the spec §4G paragraph (serif), link to `/about`.
- Section failure lines with retry for `recipients`/`gifts`/`notices` (notices failed → "Late-contribution notices did not load — pending amounts unknown", and the BY NOTICE tile shows `—`).

- [ ] Implement; build; commit `feat(campaign-finance): funder card — recipients, filed-as, gift list, footer`.

---

### Task 8: ⌘K funder rows

**Files:** Modify `src/components/search/useOmniSearch.ts` (+test), `src/components/search/OmniSearch.tsx`.

- `SearchCategory` gains `'funder'`. `useOmniSearch` calls `useFunderTypeahead(query, isOpen, cityId === 'sf' ? fppcBuildersFor('sf').funder : null)` and appends mapped rows AFTER the static filter result, then `.slice(0, 8)` — static rows keep priority. Row: `id: funder:<key>`, `label: displayName(key)`, `sublabel: `${city ? toSentenceCase(city) + ' · ' : ''}${money(total)} · ${gifts} gifts``, `icon: '◎'`, `path: '/campaign-finance'`, `params: { funder: formatFunderParam(key) }`. `OmniSearch.tsx`: render `funder` like other categories (the category label cell reads "funder").
- Test: `'funder'` is a valid category (type-level: a `SearchResult` literal with `category: 'funder'` compiles); static index for SF byte-identical to before (existing pins).
- [ ] Implement; build; commit `feat(search): ⌘K funder rows (live typeahead, SF)`.

---

### Task 9: About + data-insights + CLAUDE.md + full verification

- `About.tsx`: `<Finding title="A funder's total is not the sum of every row with their name">` — three sentences: notices (497/496) repeat gifts that later appear on Schedule A and are excluded until they do; in-kind (Schedule C) is shown separately; gifts under $100 are never itemized; identity is a name merge with the variants listed on the card.
- `docs/data-insights.md` → `### Campaign Finance (SF Ethics `pitq-e56w`) — funder identity and double-count traps`: the Moritz probe figures ($6.1M A + $512K C real; $3.13M S497 + $1.46M F496P3 repeats; 12 identities), the guard rule, the notice rule.
- `CLAUDE.md` CampaignFinance bullet: one sentence — "**Funder card (Aug 2026):** `?funder=first|last` (+`&fzip=`) opens a top-right `DetailPanelShell` (`src/views/CampaignFinance/funder/`), SF only (`builders.funder`), cycle-independent; identity = name merge with a disclosed Filed-as block + common-name guard (>1 city AND >3 ZIPs); totals = Schedule A + C only — 497/496 notices are matched (nid + amount + 30 d) and dropped, unmatched are 'by notice' and never in TOTAL; year strip stacks by `parseStance` kind; ⌘K `funder` rows are a live typeahead."
- Verification: `~/dev/devman/tools/devman-build.mjs pnpm build && pnpm test`; preview walk (Chrome — `tabs_context_mcp` first; navigate one turn, read the next) light/dark + effective-mobile: `?funder=michael|moritz` (guard + 5 ZIP chips, scroller anchored right, BY NOTICE tile, 12 Filed-as rows, year click filters), `&fzip=94103`, `?funder=|neighbors for a better san francisco`, a one-gift donor, ⌘K "moritz", `/oakland/campaign-finance?funder=x|y` (nothing mounts), PNG export of `#funder-card`, Escape/X clears both params, Back closes the card.
- [ ] Commit `docs: funder card — About finding, data-insights, CLAUDE.md`.

---

## Self-review
- **Coverage:** §2 → T1/T2/T5 (guard UI) · §3 builders → T3 · §3.1 → T2 · §3.2 → T4 · §4A/B → T5 · §4C → T6 · §4D–G → T7 · entry points → T5 (rows) + T8 (⌘K) · §5 → T1 · §7 errors → T4/T5/T7 · §8 tests → T1/T2/T3/T5/T8/T9.
- **Types:** `FunderProfile`/`FunderYear`/`FunderRecipient` (T2) are what T5–T7 render; `FunderBuilders` (T3) is what T4/T8 consume; `Stance`/`stanceChip` (T1) drive T2's `recipientCounts` and T7's chips; `funderKey`/`formatFunderParam`/`parseFunderParam` (T1) are used by T5's wiring and T8's rows.
- **Judgment points for the implementer (not placeholders):** plum ramp hexes come from `tokens.css`; the `YES`/`NO` regexes may be tightened only if a pinned name fails (pins never loosen); T2's fixture must reproduce the Moritz shape in the spec §1 probe facts.
