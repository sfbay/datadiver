# Oakland Stage 3b — Parking Citations + Campaign Finance Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Bring Oakland's last two dormant views live — Parking Citations (58em-y96b on the 59 beats) and Campaign Finance (4 FPPC datasets) — with zero visible SF change.

**Architecture:** Per-city dialect modules (approach A, stage-3 idiom): `citationsDialect.ts` (zero-import leaf: beat crosswalk, violation labels, hour-bucket module, WHERE builders) and `fppcDialect.ts` (concept→query builders; SF output byte-pinned). Existing components branch on `useRouteView().cityId`; the manifest `dormant` flags flip last.

**Tech Stack:** Vite + React 18 + TS, Socrata SODA (data.oaklandca.gov), Vitest (node), Mapbox GL v3.

**Spec:** `docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md` (commits 4e8b4ce + 29aea20). The spec governs; this plan carries its pinned values.

## Global Constraints

- SF byte-parity: every SF-bound query string/param object must be BYTE-IDENTICAL to today's. The byte-pin tests in Tasks 1/2/4 are the proof; never "improve" an SF literal.
- Direct `fetchDataset` calls from plain async/hook code always pass explicit `{ cityId }` (no route context there). `useDataset` calls inside components rely on the route-derived default — do NOT pass `cityId` from components except for a deliberate cross-city fetch.
- Gate chrome/affordances on dialect facts or liveness — NEVER `city.id === 'sf'` in shell chrome. Inside a per-city-remounted view component, `const isSF = cityId === 'sf'` is acceptable (stage-3 precedent in CrimeIncidents).
- Withheld, not faked: an affordance Oakland's data cannot support is REMOVED (card filtered out, section gated), never shown as a fabricated value.
- Tests: run targeted suites with `npx vitest run <path>` (NEVER `pnpm test -- <path>`). Type gate: `npx tsc -b`. Never run `pnpm dev` (tarmac owns dev servers).
- Commit after each task with a conventional-commit subject; end every commit message body with the two trailer lines:
  `Co-Authored-By: Claude Fable 5 <noreply@anthropic.com>`
  `Claude-Session: https://claude.ai/code/session_01TgLFsJYZVogZjPH6sy68cw`
- The comparison factory swaps date windows by literal string-replace: every Oakland `statsWhere` must OPEN with exactly `ticket_iss >= '<start>T00:00:00' AND ticket_iss <= '<end>T23:59:59'`.
- JSX bare text does NOT process `\uXXXX` escapes — type literal characters (—, ·, σ) or `{'…'}` expressions.
- Socrata groups by the ALIAS when `$select` aliases an expression (`$select=entity_cd as entity_code` → `$group=entity_code`) — SF's own `date_trunc_ym(...) as period` + `$group=period` is the precedent.
- The Oakland beat-region column `:@computed_region_fus4_casw` is NUMBER-typed: filter with an UNQUOTED numeric (`= 7`); a quoted code string is a hard 400 (`query.soql.type-mismatch`, verified live).

## File map

| File | Role |
|---|---|
| `src/views/ParkingCitations/citationsDialect.ts` (create) | Zero-import leaf: crosswalk, labels, groups, hour module, WHERE builders, row adapter |
| `src/views/ParkingCitations/citationsDialect.test.ts` (create) | Crosswalk integrity, hour tables, byte-pins |
| `src/hooks/useHourlyPatternFactory.ts` (modify) | `hourExpr`/`mapHourValue`/`limit` config; `+=` fold; `unparsedCount` |
| `src/hooks/hourlyPattern.test.ts` (modify) | New folding/unparsed tests + SF byte-pin |
| `src/utils/electionCycles.ts` (modify) | `cycles` param on the three utils; `OAKLAND_ELECTIONS`; `cityElections()` |
| `src/utils/electionCycles.test.ts` (create) | Tiling invariant, prior-cycle, default-cycle |
| `src/views/CampaignFinance/fppcDialect.ts` (create) | `FppcQueryBuilders` per city — every CF query routed through it |
| `src/views/CampaignFinance/fppcDialect.test.ts` (create) | SF builder byte-pins vs today's literals; Oakland route sanity |
| `src/hooks/useCampaignFinance.ts` (modify) | `cityId` param; queries via builders; Oakland normalizations |
| `src/hooks/useCampaignDetail.ts` (modify) | `cityId` param; builders; IE gated by `lateIEScope` |
| `src/hooks/useLateFilings.ts` (create) | Oakland-only view-level 496/497 + Sch E null-date fetches |
| `src/views/CampaignFinance/LateFilingsSection.tsx` (create) | Late-money S/O bars + disclosures |
| `src/views/ParkingCitations/oakCitationHooks.ts` (create) | `useOaklandCitationHourlyPattern` (dialect-fed factory call) |
| `src/hooks/useComparisonDataFactory.ts` (modify) | `useOaklandCitationComparisonData` concrete hook |
| `src/types/datasets.ts` (modify) | `OakCitationRecord` (in dialect instead — see Task 1; only comparison row type here if needed) |
| `src/components/filters/ViolationTypeFilter.tsx` (modify) | `groups?` + `formatLabel?` props |
| `src/views/ParkingCitations/ParkingCitations.tsx` (modify) | Full city-branch surgery |
| `src/components/ui/CitationDetailPanel.tsx` (modify) | Oakland branch (ticket_num, raw time, no plate/district) |
| `src/components/charts/FundingSourcesChart.tsx` (modify) | `PTY: 'Political Party'` label |
| `src/views/CampaignFinance/CampaignFinance.tsx` (modify) | City cycles/subtitle/sidebar-fallback/late-section/footer |
| `src/cities/oakland/manifest.ts` (modify) | Delete two `dormant: true`; fix `omniDatasetKeys` |
| `src/components/search/useOmniSearch.test.ts` (modify) | Re-pin oakland index → 70 rows |
| `docs/data-insights.md` (modify) | Oakland citations + campaign-finance traps |

## Pinned probe values (2026-08-06, all live-verified — Tasks reference these verbatim)

- `tran_self` is lowercase TEXT `'y'`/`'n'` (75,540 n / 43 y). Filter form: `tran_self='y'` (the boolean literal `=true` 400s with `query.soql.type-mismatch`). Self-funding IS computable: $12,426.12 across 43 rows.
- `entity_cd` inventory: IND $21.9M · COM $18.3M · OTH $14.1M · SCC $1.78M · **PTY $14,150 (unlabeled in `SOURCE_LABELS` — add `PTY: 'Political Party'`)**.
- Crosswalk: exactly 59 rows, bijective, all names match the beat grammar (full literal in Task 1).
- Violation labels/groups: 30-code table + 5 groups (full literals in Task 1); every top-30 code had an untruncated (≥11-char) description to seed its label; `22658.A` is deliberately group-less (singleton concept).

---

### Task 1: Citations dialect leaf + tests

**Files:**
- Create: `src/views/ParkingCitations/citationsDialect.ts`
- Create: `src/views/ParkingCitations/citationsDialect.test.ts`

**Interfaces:**
- Consumes: nothing (ZERO imports — that property is load-bearing and test-visible).
- Produces (later tasks import these): `OAK_BEAT_REGION_FIELD`, `OAK_CITATION_BEAT_REGIONS`, `beatToRegionId(beat: string): string | null`, `regionToBeat(id: string | number | null | undefined): string`, `OAK_VIOLATION_LABELS`, `OAK_VIOLATION_GROUPS`, `oakViolationLabel(code, rawDesc): string`, `OAK_CITATION_SELECT`, `OAK_HOUR_EXPR`, `OAK_HOUR_BUCKETS`, `bucketToHour(bucket: string | undefined): number | null`, `bucketsForHours(hours: readonly number[]): string[]`, `sfViolationClause`, `sfTodFragment`, `sfStatsWhere`, `sfDateOnlyClause`, `oakViolationClause`, `oakTodClause`, `oakStatsWhere`, `oakDateOnlyClause`, `OakCitationRecord`.

- [ ] **Step 1: Write the failing test** — `src/views/ParkingCitations/citationsDialect.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  OAK_BEAT_REGION_FIELD, OAK_CITATION_BEAT_REGIONS, beatToRegionId, regionToBeat,
  OAK_VIOLATION_LABELS, OAK_VIOLATION_GROUPS, oakViolationLabel,
  OAK_HOUR_EXPR, OAK_HOUR_BUCKETS, bucketToHour, bucketsForHours,
  sfViolationClause, sfTodFragment, sfStatsWhere, sfDateOnlyClause,
  oakViolationClause, oakTodClause, oakStatsWhere,
} from './citationsDialect'
import { OAKLAND_BEATS } from '@/cities/oakland/beats'

describe('beat crosswalk', () => {
  it('has exactly 59 one-to-one entries whose values are real beats', () => {
    const ids = Object.keys(OAK_CITATION_BEAT_REGIONS)
    const codes = Object.values(OAK_CITATION_BEAT_REGIONS)
    expect(ids).toHaveLength(59)
    expect(new Set(codes).size).toBe(59)
    const beatSet = new Set(OAKLAND_BEATS)
    for (const c of codes) expect(beatSet.has(c), c).toBe(true)
    for (const id of ids) expect(id).toMatch(/^\d+$/)
  })
  it('inverse round-trips', () => {
    for (const [id, code] of Object.entries(OAK_CITATION_BEAT_REGIONS)) {
      expect(beatToRegionId(code)).toBe(id)
      expect(regionToBeat(id)).toBe(code)
      expect(regionToBeat(Number(id))).toBe(code)
    }
    expect(beatToRegionId('99Z')).toBeNull()
    expect(regionToBeat(null)).toBe('Unknown')
    expect(regionToBeat(undefined)).toBe('Unknown')
  })
})

describe('violation vocabulary', () => {
  it('labels 30 codes; keys look like municipal-code cites', () => {
    expect(Object.keys(OAK_VIOLATION_LABELS)).toHaveLength(30)
    for (const code of Object.keys(OAK_VIOLATION_LABELS)) {
      expect(code).toMatch(/^[0-9][0-9A-Z.]+$/)
    }
  })
  it('every grouped code has a label; groups have >= 2 codes', () => {
    for (const [name, codes] of Object.entries(OAK_VIOLATION_GROUPS)) {
      expect(codes.length, name).toBeGreaterThanOrEqual(2)
      for (const c of codes) expect(OAK_VIOLATION_LABELS[c], `${name}:${c}`).toBeTruthy()
    }
  })
  it('oakViolationLabel prefers the map, falls back to raw desc, then Unknown', () => {
    expect(oakViolationLabel('10.36.050', 'METER VIOL')).toBe('Expired meter')
    expect(oakViolationLabel('9.9.999', 'SOMETHING')).toBe('SOMETHING')
    expect(oakViolationLabel(null, null)).toBe('Unknown')
  })
})

describe('hour module', () => {
  it('OAK_HOUR_EXPR is the pinned SoQL (AM/PM branches FIRST)', () => {
    expect(OAK_HOUR_EXPR).toBe(
      "case(ticket_i_1 like '%AM', 'A' || substring(ticket_i_1, 1, 2), ticket_i_1 like '%PM', 'P' || substring(ticket_i_1, 1, 2), true, substring(ticket_i_1, 1, 2))"
    )
  })
  it('bucketToHour truth table', () => {
    expect(bucketToHour('00')).toBe(0)
    expect(bucketToHour('23')).toBe(23)
    expect(bucketToHour('0:')).toBe(0)
    expect(bucketToHour('9:')).toBe(9)
    expect(bucketToHour('A12')).toBe(0)
    expect(bucketToHour('P12')).toBe(12)
    expect(bucketToHour('A9:')).toBe(9)
    expect(bucketToHour('A09')).toBe(9)
    expect(bucketToHour('P09')).toBe(21)
    expect(bucketToHour('P1:')).toBe(13)
    expect(bucketToHour('24')).toBeNull()
    expect(bucketToHour('A13')).toBeNull()
    expect(bucketToHour('P00')).toBeNull()
    expect(bucketToHour('xx')).toBeNull()
    expect(bucketToHour('')).toBeNull()
    // Socrata OMITS the aliased field for the NULL-time group — the residual
    // arrives as a MISSING KEY (undefined), a different code path than junk.
    expect(bucketToHour(undefined)).toBeNull()
  })
  it('bucketsForHours round-trips and unions to the parseable vocabulary', () => {
    const all = new Set<string>()
    for (let h = 0; h <= 23; h++) {
      for (const b of bucketsForHours([h])) {
        expect(bucketToHour(b)).toBe(h)
        all.add(b)
      }
    }
    const parseable = OAK_HOUR_BUCKETS.filter((b) => bucketToHour(b) !== null)
    expect(all.size).toBe(parseable.length)
  })
})

describe('SF WHERE builders — byte-pins (never change these strings)', () => {
  const range = { start: '2026-07-01', end: '2026-07-31' }
  it('violation clause', () => {
    expect(sfViolationClause(new Set())).toBe('')
    expect(sfViolationClause(new Set(["STR CLEAN", "O'FARRELL"])))
      .toBe("violation_desc IN ('STR CLEAN','O''FARRELL')")
  })
  it('tod fragment (wrap + non-wrap)', () => {
    expect(sfTodFragment(null)).toBe('')
    expect(sfTodFragment({ startHour: 6, endHour: 11 })).toBe(
      'date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11'
    )
    expect(sfTodFragment({ startHour: 22, endHour: 3 })).toBe(
      '(date_extract_hh(citation_issued_datetime) >= 22 OR date_extract_hh(citation_issued_datetime) <= 3)'
    )
  })
  it('statsWhere composition', () => {
    expect(sfStatsWhere({ dateRange: range, violationClause: '', selectedNeighborhood: null, todFragment: '' })).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59'"
    )
    expect(sfStatsWhere({
      dateRange: range,
      violationClause: "violation_desc IN ('STR CLEAN')",
      selectedNeighborhood: "Fisherman's Wharf",
      todFragment: 'date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11',
    })).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59' AND violation_desc IN ('STR CLEAN') AND analysis_neighborhood = 'Fisherman''s Wharf' AND date_extract_hh(citation_issued_datetime) >= 6 AND date_extract_hh(citation_issued_datetime) <= 11"
    )
  })
  it('dateOnlyClause', () => {
    expect(sfDateOnlyClause(range, '')).toBe(
      "citation_issued_datetime >= '2026-07-01T00:00:00' AND citation_issued_datetime <= '2026-07-31T23:59:59'"
    )
  })
})

describe('Oakland WHERE builders', () => {
  const range = { start: '2026-01-01', end: '2026-03-31' }
  it('violation clause uses the CODE column', () => {
    expect(oakViolationClause(new Set(['10.36.050']))).toBe("violation IN ('10.36.050')")
  })
  it('statsWhere opens with the replace-compatible date clause and converts beat CODE internally', () => {
    const w = oakStatsWhere({ dateRange: range, violationClause: '', selectedBeat: '07X', todClause: '' })
    expect(w.startsWith("ticket_iss >= '2026-01-01T00:00:00' AND ticket_iss <= '2026-03-31T23:59:59'")).toBe(true)
    // 07X is region 4 in the crosswalk; number column → UNQUOTED numeric
    expect(w).toContain(`${OAK_BEAT_REGION_FIELD} = 4`)
    expect(w).not.toContain("= '4'")
  })
  it('unknown beat yields an impossible numeric filter, not an unfiltered query', () => {
    const w = oakStatsWhere({ dateRange: range, violationClause: '', selectedBeat: 'NOPE', todClause: '' })
    expect(w).toContain(`${OAK_BEAT_REGION_FIELD} = -1`)
  })
  it('tod clause enumerates buckets through the hour vocabulary', () => {
    const clause = oakTodClause({ startHour: 7, endHour: 8 })
    expect(clause.startsWith(`(${OAK_HOUR_EXPR}) IN (`)).toBe(true)
    expect(clause).toContain("'07'")
    expect(clause).toContain("'7:'")
    expect(clause).toContain("'A07'")
    expect(clause).toContain("'A7:'")
    expect(clause).not.toContain("'P07'")
    // wrap-around
    const wrap = oakTodClause({ startHour: 22, endHour: 1 })
    expect(wrap).toContain("'22'")
    expect(wrap).toContain("'01'")
    expect(wrap).not.toContain("'02'")
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `npx vitest run src/views/ParkingCitations/citationsDialect.test.ts`
Expected: FAIL — module `./citationsDialect` not found.

- [ ] **Step 3: Write the implementation** — `src/views/ParkingCitations/citationsDialect.ts` (complete file):

```ts
/**
 * Oakland dialect for the Parking Citations view (58em-y96b) — stage 3b.
 *
 * ZERO-IMPORT PURE LEAF (the dialect311 idiom): any hook/factory may import
 * from here without cycle risk. Spec:
 * docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md
 *
 * Data traps this module encodes (probe-verified 2026-08-06):
 * - The beat column is a Socrata computed region holding NUMBER ids, not
 *   beat codes. Crosswalk below; filter with an UNQUOTED numeric.
 * - `violatio_1` descriptions carry a 10-char truncation era (~2M rows) —
 *   group/filter on the clean `violation` CODE, label via the authored map.
 * - `ticket_i_1` mixes three time formats + 18,856 NULLs; the hour module
 *   is the only sanctioned reader.
 */

export const OAK_BEAT_REGION_FIELD = ':@computed_region_fus4_casw'

/** regionId → beat code. Regenerate:
 *  curl -s --get 'https://data.oaklandca.gov/resource/fus4-casw.json' \
 *    --data-urlencode '$select=_feature_id,name' \
 *    --data-urlencode '$limit=100' --data-urlencode '$order=_feature_id' */
export const OAK_CITATION_BEAT_REGIONS: Record<string, string> = {
  '1': '02Y', '2': '16Y', '3': '10Y', '4': '07X', '5': '26Y',
  '6': '18X', '7': '32X', '8': '31Y', '9': '24X', '10': '17X',
  '11': '18Y', '12': '04X', '13': '13Y', '14': '25Y', '15': '34X',
  '16': '22Y', '17': '10X', '18': '31X', '19': '26X', '20': '20X',
  '21': '08X', '22': '05Y', '23': '01X', '24': 'LKM1', '25': '25X',
  '26': '03Y', '27': '30Y', '28': '31Z', '29': '23X', '30': '16X',
  '31': '13Z', '32': '24Y', '33': '15X', '34': '14Y', '35': '19X',
  '36': '12Y', '37': '11X', '38': '21Y', '39': '27X', '40': 'PDT2',
  '41': '13X', '42': '14X', '43': '22X', '44': '02X', '45': '21X',
  '46': '05X', '47': '35X', '48': '09X', '49': '32Y', '50': '28X',
  '51': '27Y', '52': '35Y', '53': '06X', '54': '33X', '55': '03X',
  '56': '29X', '57': '30X', '58': '12X', '59': '17Y',
}

const BEAT_TO_REGION: Record<string, string> = Object.fromEntries(
  Object.entries(OAK_CITATION_BEAT_REGIONS).map(([id, code]) => [code, id])
)

export function beatToRegionId(beat: string): string | null {
  return BEAT_TO_REGION[beat] ?? null
}

export function regionToBeat(id: string | number | null | undefined): string {
  if (id == null) return 'Unknown'
  return OAK_CITATION_BEAT_REGIONS[String(id)] ?? 'Unknown'
}

/** Authored reader-facing labels for the top-30 violation CODES (94.6% of
 *  rows). Seeds = the most frequent UNTRUNCATED (>= 11 char) description per
 *  code, hand-polished; evidence table in the stage-3b plan. */
export const OAK_VIOLATION_LABELS: Record<string, string> = {
  '10.28.240': 'No parking — certain hours',
  '10.36.030B': 'No parking receipt displayed',
  '10.36.050': 'Expired meter',
  '10.40.020A1': 'No parking — red zone',
  '10.44.120A': 'Residential parking permit zone',
  '22500.F': 'No parking — on sidewalk',
  '5204': 'Registration tab not attached',
  '10.28.250': 'No parking anytime',
  '10.28.190': 'Two-hour parking zone',
  '10.40.060': 'No parking — yellow zone',
  '22500.H': 'Double parking',
  '10.16.110': 'Failure to obey posted signs',
  '22514': 'Blocking a fire hydrant',
  '10.40.070': 'No parking — white zone',
  '21211.B': 'Obstructing a bike lane',
  '10.28.040A': 'Parked over 18 inches from curb',
  '10.36.100': 'Expired meter — off-street lot',
  '21113.A': 'Parking on public grounds',
  '5200': 'License plate missing',
  '22500.G': 'Obstructing construction traffic',
  '22500.B': 'No parking — in crosswalk',
  '22507.8A': 'Disabled parking space violation',
  '22500.E': 'No parking — blocking driveway',
  '10.36.020': 'Parked over the marked space/meter',
  '22658.A': 'Removal from private property',
  '10.40.020A4': 'No parking — green zone',
  '10.40.090E': 'No parking — bus stop',
  '10.40.030B': 'No parking — special zone',
  '4000A1': 'No valid registration',
  '22522': 'Blocking a disabled-access ramp',
}

/** Quick groups over CODES (>= 2 codes each; 22658.A is a deliberate
 *  singleton left ungrouped). */
export const OAK_VIOLATION_GROUPS: Record<string, string[]> = {
  'Sweeping/Time limits': ['10.28.240', '10.28.250', '10.28.190', '10.16.110'],
  'Meters': ['10.36.030B', '10.36.050', '10.36.100', '10.36.020'],
  'Zones': ['10.40.020A1', '10.44.120A', '10.40.060', '10.40.070', '10.40.020A4', '10.40.090E', '10.40.030B'],
  'Registration': ['5204', '5200', '4000A1'],
  'Safety/Obstruction': ['22500.F', '22500.H', '22514', '21211.B', '10.28.040A', '21113.A', '22500.G', '22500.B', '22507.8A', '22500.E', '22522'],
}

export function oakViolationLabel(
  code: string | null | undefined,
  rawDesc: string | null | undefined
): string {
  if (code && OAK_VIOLATION_LABELS[code]) return OAK_VIOLATION_LABELS[code]
  return rawDesc || 'Unknown'
}

export const OAK_CITATION_SELECT =
  'the_geom,ticket_num,fine_amount,ticket_iss,ticket_i_1,violation,violatio_1,location,:@computed_region_fus4_casw'

export interface OakCitationRecord {
  the_geom?: { type: string; coordinates: [number, number] } | null
  ticket_num: string
  fine_amount: string
  ticket_iss: string
  ticket_i_1?: string | null
  violation?: string | null
  violatio_1?: string | null
  location?: string | null
  ':@computed_region_fus4_casw'?: string | null
}

// ── Hour module ──────────────────────────────────────────────────
// ticket_i_1 mixes 'HH:MM' (1,723,581), 'H:MM' (926,629),
// 'H:MM:SS AM/PM' (71,323), NULL (18,856). One SoQL expression tags each
// row with a bucket from a CLOSED vocabulary; bucketToHour is the single
// mapping; bucketsForHours inverts it for WHERE clauses. AM/PM branches
// come FIRST — a '10:00:00 AM' row also matches the bare pattern.

export const OAK_HOUR_EXPR =
  "case(ticket_i_1 like '%AM', 'A' || substring(ticket_i_1, 1, 2), ticket_i_1 like '%PM', 'P' || substring(ticket_i_1, 1, 2), true, substring(ticket_i_1, 1, 2))"

/** The closed bucket vocabulary the expression can emit for parseable rows. */
export const OAK_HOUR_BUCKETS: readonly string[] = (() => {
  const out: string[] = []
  for (let h = 0; h <= 23; h++) out.push(String(h).padStart(2, '0')) // '00'–'23'
  for (let h = 0; h <= 9; h++) out.push(`${h}:`)                     // '0:'–'9:'
  for (const m of ['A', 'P'] as const) {
    for (let h = 1; h <= 12; h++) {
      out.push(`${m}${String(h).padStart(2, '0')}`)                  // 'A01'–'A12'
      if (h <= 9) out.push(`${m}${h}:`)                              // 'A1:'–'A9:'
    }
  }
  return out
})()

/**
 * Bucket → hour 0–23, or null for the residual.
 * `undefined` is a REAL input, not defensiveness: Socrata omits the aliased
 * field entirely for the NULL-time GROUP BY bucket, so the residual reaches
 * this function as a missing key. A string-only implementation throws on the
 * exact population the hardened residual design exists for.
 */
export function bucketToHour(bucket: string | undefined): number | null {
  if (bucket == null) return null
  let s = bucket
  let meridiem: 'A' | 'P' | null = null
  if (s.startsWith('A') || s.startsWith('P')) {
    meridiem = s[0] as 'A' | 'P'
    s = s.slice(1)
  }
  s = s.replace(':', '')
  if (!/^\d{1,2}$/.test(s)) return null
  const n = parseInt(s, 10)
  if (meridiem) {
    if (n < 1 || n > 12) return null
    if (meridiem === 'A') return n === 12 ? 0 : n
    return n === 12 ? 12 : n + 12
  }
  return n >= 0 && n <= 23 ? n : null
}

/** Inverse, derived by FILTERING the closed vocabulary through bucketToHour —
 *  one logic source, no dual mapping to drift. */
export function bucketsForHours(hours: readonly number[]): string[] {
  const want = new Set(hours)
  return OAK_HOUR_BUCKETS.filter((b) => {
    const h = bucketToHour(b)
    return h !== null && want.has(h)
  })
}

// ── SF WHERE builders — VERBATIM moves from ParkingCitations.tsx ─────
// Byte-pinned by citationsDialect.test.ts. Never edit these strings.

export function sfViolationClause(selected: ReadonlySet<string>): string {
  if (selected.size === 0) return ''
  const escaped = Array.from(selected).map((c) => `'${c.replace(/'/g, "''")}'`)
  return `violation_desc IN (${escaped.join(',')})`
}

export function sfTodFragment(
  tod: { startHour: number; endHour: number } | null
): string {
  if (!tod) return ''
  const { startHour, endHour } = tod
  if (startHour <= endHour) {
    return `date_extract_hh(citation_issued_datetime) >= ${startHour} AND date_extract_hh(citation_issued_datetime) <= ${endHour}`
  }
  return `(date_extract_hh(citation_issued_datetime) >= ${startHour} OR date_extract_hh(citation_issued_datetime) <= ${endHour})`
}

export interface SfCitationWhereArgs {
  dateRange: { start: string; end: string }
  violationClause: string
  selectedNeighborhood: string | null
  todFragment: string
}

export function sfStatsWhere(args: SfCitationWhereArgs): string {
  const { dateRange, violationClause, selectedNeighborhood, todFragment } = args
  const conditions: string[] = []
  conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
  conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
  if (violationClause) conditions.push(violationClause)
  if (selectedNeighborhood) {
    conditions.push(`analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`)
  }
  if (todFragment) conditions.push(todFragment)
  return conditions.join(' AND ')
}

export function sfDateOnlyClause(
  dateRange: { start: string; end: string },
  todFragment: string
): string {
  const conditions: string[] = []
  conditions.push(`citation_issued_datetime >= '${dateRange.start}T00:00:00'`)
  conditions.push(`citation_issued_datetime <= '${dateRange.end}T23:59:59'`)
  if (todFragment) conditions.push(todFragment)
  return conditions.join(' AND ')
}

// ── Oakland WHERE builders ───────────────────────────────────────

export function oakViolationClause(selected: ReadonlySet<string>): string {
  if (selected.size === 0) return ''
  const escaped = Array.from(selected).map((c) => `'${c.replace(/'/g, "''")}'`)
  return `violation IN (${escaped.join(',')})`
}

export function oakTodClause(
  tod: { startHour: number; endHour: number } | null
): string {
  if (!tod) return ''
  const hours: number[] = []
  const { startHour, endHour } = tod
  if (startHour <= endHour) {
    for (let h = startHour; h <= endHour; h++) hours.push(h)
  } else {
    for (let h = startHour; h <= 23; h++) hours.push(h)
    for (let h = 0; h <= endHour; h++) hours.push(h)
  }
  const buckets = bucketsForHours(hours)
  return `(${OAK_HOUR_EXPR}) IN (${buckets.map((b) => `'${b}'`).join(',')})`
}

export interface OakCitationWhereArgs {
  dateRange: { start: string; end: string }
  violationClause: string
  /** Beat CODE ('07X') — the canonical selection identity everywhere.
   *  The regionId exists ONLY inside this builder. */
  selectedBeat: string | null
  todClause: string
}

export function oakStatsWhere(args: OakCitationWhereArgs): string {
  const { dateRange, violationClause, selectedBeat, todClause } = args
  const conditions: string[] = []
  // MUST open with this exact pair — the comparison factory swaps the date
  // window by literal string-replace on these two clauses.
  conditions.push(`ticket_iss >= '${dateRange.start}T00:00:00'`)
  conditions.push(`ticket_iss <= '${dateRange.end}T23:59:59'`)
  if (violationClause) conditions.push(violationClause)
  if (selectedBeat) {
    // Number-typed column: UNQUOTED numeric. Unknown beat → impossible
    // filter (-1), never a silently unfiltered query.
    const regionId = beatToRegionId(selectedBeat)
    conditions.push(`${OAK_BEAT_REGION_FIELD} = ${regionId ?? -1}`)
  }
  if (todClause) conditions.push(todClause)
  return conditions.join(' AND ')
}

export function oakDateOnlyClause(
  dateRange: { start: string; end: string },
  todClause: string
): string {
  const conditions: string[] = []
  conditions.push(`ticket_iss >= '${dateRange.start}T00:00:00'`)
  conditions.push(`ticket_iss <= '${dateRange.end}T23:59:59'`)
  if (todClause) conditions.push(todClause)
  return conditions.join(' AND ')
}
```

- [ ] **Step 4: Run the tests**

Run: `npx vitest run src/views/ParkingCitations/citationsDialect.test.ts`
Expected: PASS (all suites). Also run `npx tsc -b` — clean.

- [ ] **Step 5: Verify the zero-import property**

Run: `grep -c "^import" src/views/ParkingCitations/citationsDialect.ts`
Expected: `0`.

- [ ] **Step 6: Commit**

```bash
git add src/views/ParkingCitations/citationsDialect.ts src/views/ParkingCitations/citationsDialect.test.ts
git commit -m "feat(oakland): citations dialect leaf — crosswalk, violation vocab, hour module, WHERE builders"
```

---

### Task 2: Hourly factory extension (hourExpr / mapHourValue / limit / += / unparsedCount)

**Files:**
- Modify: `src/hooks/useHourlyPatternFactory.ts`
- Modify: `src/hooks/hourlyPattern.test.ts` (add cases; existing pins must stay green)

**Interfaces:**
- Consumes: nothing new (config-level extension).
- Produces: `HourlyPatternConfig` gains `hourExpr?: string`, `mapHourValue?: (raw: string | undefined) => number | null`, `limit?: number`; `hourlySelect(dateField, countExpr?, hourExpr?)`; `computeHourlyResult(rows, excludePeakHour0?, mapHourValue?)` returns `{ grid, hourTotals, peakHour, quietestHour, unparsedCount }`; `HourlyPatternResult` gains `unparsedCount: number`.

- [ ] **Step 1: Write the failing tests** — append to `src/hooks/hourlyPattern.test.ts`:

```ts
import { hourlySelect, computeHourlyResult } from './useHourlyPatternFactory'

describe('stage-3b hourly extensions', () => {
  it('hourlySelect: SF output BYTE-UNCHANGED with no hourExpr', () => {
    expect(hourlySelect('citation_issued_datetime')).toBe(
      'date_extract_hh(citation_issued_datetime) as hour, date_extract_dow(citation_issued_datetime) as dow, count(*) as call_count'
    )
  })
  it('hourlySelect: hourExpr replaces the extraction, dow keeps the date field', () => {
    expect(hourlySelect('ticket_iss', undefined, "case(x, 'A')")).toBe(
      "case(x, 'A') as hour, date_extract_dow(ticket_iss) as dow, count(*) as call_count"
    )
  })
  it('computeHourlyResult FOLDS multiple buckets into one hour (+= not =)', () => {
    const rows = [
      { hour: '07', dow: '1', call_count: '10' },
      { hour: '7:', dow: '1', call_count: '5' },
    ]
    const map = (raw: string | undefined) =>
      raw == null ? null : parseInt(raw.replace(':', ''), 10)
    const r = computeHourlyResult(rows as never, false, map)
    expect(r.grid[1][7]).toBe(15)
    expect(r.hourTotals[7]).toBe(15)
    expect(r.unparsedCount).toBe(0)
  })
  it('null-mapped rows land in unparsedCount, not the grid', () => {
    const rows = [
      { hour: '07', dow: '2', call_count: '4' },
      { dow: '2', call_count: '9' }, // Socrata omits the aliased key for the NULL group
    ]
    const map = (raw: string | undefined) => (raw === '07' ? 7 : null)
    const r = computeHourlyResult(rows as never, false, map)
    expect(r.grid[2][7]).toBe(4)
    expect(r.unparsedCount).toBe(9)
  })
})
```

- [ ] **Step 2: Run to verify failure**

Run: `npx vitest run src/hooks/hourlyPattern.test.ts`
Expected: FAIL — `hourlySelect` has no third param; `computeHourlyResult` has no `mapHourValue`/`unparsedCount`.

- [ ] **Step 3: Implement** — in `src/hooks/useHourlyPatternFactory.ts`:

Add to `HourlyPatternConfig` (after `excludePeakHour0`):

```ts
  /** Replaces `date_extract_hh(dateField)` in the $select. Oakland citations
   *  passes OAK_HOUR_EXPR (the dialect's mixed-format bucket expression). */
  hourExpr?: string
  /** Maps the raw grouped hour value → 0–23, or null → unparsedCount.
   *  `string | undefined` is load-bearing: Socrata OMITS the aliased field
   *  for a NULL-expression group, so the residual arrives as a missing key. */
  mapHourValue?: (raw: string | undefined) => number | null
  /** $limit for the GROUP BY (default 200). Oakland citations needs 800 —
   *  ~58 buckets × 7 days ≈ 406 rows would silently truncate at 200. */
  limit?: number
```

Replace `hourlySelect` and `computeHourlyResult`; add `HourlyPatternResult.unparsedCount: number`:

```ts
export function hourlySelect(dateField: string, countExpr?: string, hourExpr?: string): string {
  return `${hourExpr ?? `date_extract_hh(${dateField})`} as hour, date_extract_dow(${dateField}) as dow, ${countExpr ?? 'count(*)'} as call_count`
}

function defaultMapHour(raw: string | undefined): number | null {
  if (raw == null) return null
  const h = parseInt(raw, 10)
  return Number.isNaN(h) ? null : h
}

/** Pure core — node-testable. `+=` (not `=`) so several buckets can fold
 *  into one hour; SF's GROUP BY makes (hour,dow) unique, so this is
 *  behavior-identical there. */
export function computeHourlyResult(
  rows: HourlyAggRow[],
  excludePeakHour0 = false,
  mapHourValue: (raw: string | undefined) => number | null = defaultMapHour
): { grid: number[][]; hourTotals: number[]; peakHour: number; quietestHour: number; unparsedCount: number } {
  const grid: number[][] = Array.from({ length: 7 }, () => Array(24).fill(0))
  const hourTotals = Array(24).fill(0) as number[]
  let unparsedCount = 0
  for (const row of rows) {
    const dow = parseInt(row.dow, 10)
    const count = parseInt(row.call_count, 10)
    if (isNaN(dow) || isNaN(count) || dow < 0 || dow >= 7) continue
    const hour = mapHourValue(row.hour)
    if (hour === null || hour < 0 || hour >= 24) {
      unparsedCount += count
      continue
    }
    grid[dow][hour] += count
    hourTotals[hour] += count
  }
  const firstCandidate = excludePeakHour0 ? 1 : 0
  let peakHour = firstCandidate
  let quietestHour = 0
  for (let h = 1; h < 24; h++) {
    if (h > firstCandidate && hourTotals[h] > hourTotals[peakHour]) peakHour = h
    if (hourTotals[h] < hourTotals[quietestHour]) quietestHour = h
  }
  return { grid, hourTotals, peakHour, quietestHour, unparsedCount }
}
```

In the hook body inside `createHourlyPatternHook`: `$select: hourlySelect(dateField, config.countExpr, config.hourExpr)`, `$limit: config.limit ?? 200`, and `computeHourlyResult(rows, config.excludePeakHour0 ?? false, config.mapHourValue)` (add `HourlyPatternResult` field `unparsedCount: number` to the interface — the spread already carries it).

- [ ] **Step 4: Run the full hourly suite + types**

Run: `npx vitest run src/hooks/hourlyPattern.test.ts && npx tsc -b`
Expected: PASS / clean. The pre-existing pins (SF `hourlySelect` output, crime excludePeakHour0) must be untouched-green.

- [ ] **Step 5: Commit**

```bash
git add src/hooks/useHourlyPatternFactory.ts src/hooks/hourlyPattern.test.ts
git commit -m "feat(hourly): hourExpr/mapHourValue/limit config + bucket folding + unparsedCount"
```

---

### Task 3: Election cycles — `cycles` parameter + `OAKLAND_ELECTIONS`

**Files:**
- Modify: `src/utils/electionCycles.ts`
- Create: `src/utils/electionCycles.test.ts`

**Interfaces:**
- Produces: `OAKLAND_ELECTIONS: ElectionCycle[]`; `cityElections(cityId: CityId): ElectionCycle[]`; `findPriorCycle(current, cycles = SF_ELECTIONS)`, `getDefaultCycle(cycles = SF_ELECTIONS)`, `findCycleForRange(start, end, cycles = SF_ELECTIONS)` — trailing param, zero churn for SF callers.

- [ ] **Step 1: Failing test** — `src/utils/electionCycles.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import {
  SF_ELECTIONS, OAKLAND_ELECTIONS, cityElections,
  findPriorCycle, getDefaultCycle, findCycleForRange,
} from './electionCycles'

describe('OAKLAND_ELECTIONS', () => {
  it('tiles: every cycle starts the day after the next-older election', () => {
    for (let i = 0; i < OAKLAND_ELECTIONS.length - 1; i++) {
      const younger = OAKLAND_ELECTIONS[i]
      const older = OAKLAND_ELECTIONS[i + 1]
      const dayAfter = new Date(older.date + 'T12:00:00Z')
      dayAfter.setUTCDate(dayAfter.getUTCDate() + 1)
      expect(younger.start, younger.label).toBe(dayAfter.toISOString().slice(0, 10))
    }
    // oldest row anchors at the dataset's onset month
    expect(OAKLAND_ELECTIONS[OAKLAND_ELECTIONS.length - 1].start).toBe('2010-10-01')
  })
  it('is newest-first with start < end everywhere', () => {
    for (const c of OAKLAND_ELECTIONS) expect(c.start < c.end, c.label).toBe(true)
    for (let i = 0; i < OAKLAND_ELECTIONS.length - 1; i++) {
      expect(OAKLAND_ELECTIONS[i].date > OAKLAND_ELECTIONS[i + 1].date).toBe(true)
    }
  })
  it('prior-cycle: Nov 2024 → Nov 2022; the Apr 2025 special has no prior', () => {
    const nov24 = OAKLAND_ELECTIONS.find((c) => c.label === 'Nov 2024')!
    expect(findPriorCycle(nov24, OAKLAND_ELECTIONS)?.label).toBe('Nov 2022')
    const apr25 = OAKLAND_ELECTIONS.find((c) => c.label === 'Apr 2025')!
    expect(findPriorCycle(apr25, OAKLAND_ELECTIONS)).toBeNull()
  })
  it('findCycleForRange + cityElections resolve per city', () => {
    const apr25 = OAKLAND_ELECTIONS.find((c) => c.label === 'Apr 2025')!
    expect(findCycleForRange(apr25.start, apr25.end, OAKLAND_ELECTIONS)?.label).toBe('Apr 2025')
    expect(findCycleForRange(apr25.start, apr25.end)).toBeNull() // SF table: no such window
    expect(cityElections('sf')).toBe(SF_ELECTIONS)
    expect(cityElections('oakland')).toBe(OAKLAND_ELECTIONS)
  })
  it('SF defaults untouched: no-arg calls still read SF_ELECTIONS', () => {
    expect(getDefaultCycle().label).toBe(getDefaultCycle(SF_ELECTIONS).label)
    const nov24sf = SF_ELECTIONS.find((c) => c.label === 'Nov 2024')!
    expect(findPriorCycle(nov24sf)?.label).toBe('Nov 2022')
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/utils/electionCycles.test.ts` → FAIL (`OAKLAND_ELECTIONS` not exported).

- [ ] **Step 3: Implement** — in `src/utils/electionCycles.ts`:

Add after `SF_ELECTIONS` (and `import type { CityId } from '@/cities/routing'` at top):

```ts
/**
 * Oakland cycles TILE — each starts the day after the previous election —
 * because pre-window fundraising is the NORM (Taylor raised $50,665 in
 * Nov–Dec 2024, before any Jan-1 window; 2024 candidates show sustained 2023
 * fundraising). Tiling means no dollar falls between windows and no candidate
 * is asymmetrically clipped. Windows are deliberately UNEVEN (the Apr 2025
 * special's is 5 months; a regular's ~24) — cycle totals are cycle totals.
 * Oldest row anchors at the dataset's onset month (Sch A begins 2010-10).
 */
export const OAKLAND_ELECTIONS: ElectionCycle[] = [
  { label: 'Nov 2026', date: '2026-11-03', start: '2025-04-16', end: '2026-11-03' },
  { label: 'Apr 2025', date: '2025-04-15', start: '2024-11-06', end: '2025-04-15' },
  { label: 'Nov 2024', date: '2024-11-05', start: '2022-11-09', end: '2024-11-05' },
  { label: 'Nov 2022', date: '2022-11-08', start: '2020-11-04', end: '2022-11-08' },
  { label: 'Nov 2020', date: '2020-11-03', start: '2018-11-07', end: '2020-11-03' },
  { label: 'Nov 2018', date: '2018-11-06', start: '2016-11-09', end: '2018-11-06' },
  { label: 'Nov 2016', date: '2016-11-08', start: '2014-11-05', end: '2016-11-08' },
  { label: 'Nov 2014', date: '2014-11-04', start: '2012-11-07', end: '2014-11-04' },
  { label: 'Nov 2012', date: '2012-11-06', start: '2010-10-01', end: '2012-11-06' },
]

export function cityElections(cityId: CityId): ElectionCycle[] {
  return cityId === 'oakland' ? OAKLAND_ELECTIONS : SF_ELECTIONS
}
```

Then give the three utils a trailing `cycles: ElectionCycle[] = SF_ELECTIONS` param and replace every internal `SF_ELECTIONS` reference with `cycles` (in `findPriorCycle` this includes `cycles.indexOf(current)` and the loop bound — indexing the PASSED array is the point).

- [ ] **Step 4: Run** — `npx vitest run src/utils/electionCycles.test.ts && npx tsc -b` → PASS/clean.

- [ ] **Step 5: Commit**

```bash
git add src/utils/electionCycles.ts src/utils/electionCycles.test.ts
git commit -m "feat(cycles): parameterize utils + OAKLAND_ELECTIONS tiling table"
```

---

### Task 4: FPPC ledger dialect + byte-pin tests

**Files:**
- Create: `src/views/CampaignFinance/fppcDialect.ts`
- Create: `src/views/CampaignFinance/fppcDialect.test.ts`

**Interfaces:**
- Consumes: nothing (zero-import leaf; the SoQL escape is inlined).
- Produces: `FppcQuerySpec { datasetKey: string; params: Record<string, string | number> }`; `FppcQueryBuilders` (shape below); `fppcBuildersFor(cityId: 'sf' | 'oakland'): FppcQueryBuilders`.

```ts
export interface FppcQuerySpec {
  datasetKey: string
  params: Record<string, string | number>
}
export interface FppcQueryBuilders {
  /** 'entity' → SF's entity-detail IE panels; 'view' → Oakland's LateFilingsSection. ONE fact gates both. */
  lateIEScope: 'entity' | 'view'
  freshness: { datasetKey: string; dateField: string }
  totals(start: string, end: string): FppcQuerySpec
  uniqueDonors(start: string, end: string): FppcQuerySpec
  smallDonorCount(start: string, end: string): FppcQuerySpec
  contributionCount(start: string, end: string): FppcQuerySpec
  selfFunding(start: string, end: string): FppcQuerySpec  // OAK uses tran_self='y' (text, NOT =true which 400s)
  topRecipients(start: string, end: string): FppcQuerySpec
  timeline(start: string, end: string): FppcQuerySpec
  fundingSources(start: string, end: string): FppcQuerySpec
  donorGeo(start: string, end: string): FppcQuerySpec | null
  filerWhere(filerNid: string): string
  sourceBreakdown(filerNid: string, start: string, end: string): FppcQuerySpec
  topDonors(filerNid: string, start: string, end: string): FppcQuerySpec
  entityTimeline(filerNid: string, start: string, end: string): FppcQuerySpec
  spendingCategories(filerNid: string, start: string, end: string): FppcQuerySpec
  entityDonorGeo(filerNid: string, start: string, end: string): FppcQuerySpec | null
  ballotNumberLookup(filerNid: string, start: string, end: string): FppcQuerySpec | null
  ieQueries(matchWhere: string, start: string, end: string): { support: FppcQuerySpec; oppose: FppcQuerySpec } | null
  lateIEByTarget(start: string, end: string): FppcQuerySpec | null
  lateContribsSummary(start: string, end: string): FppcQuerySpec | null
  nullDateDisclosure(): FppcQuerySpec | null
}
```

- [ ] **Step 1: Failing test** — `src/views/CampaignFinance/fppcDialect.test.ts`. The SF half pins EVERY builder's output byte-identical to the literals currently inline in `useCampaignFinance.ts` / `useCampaignDetail.ts` (copy the expected values below EXACTLY):

```ts
import { describe, it, expect } from 'vitest'
import { fppcBuildersFor } from './fppcDialect'
import { OAKLAND_DATASETS_RAW } from '@/cities/oakland/datasets'

const S = '2024-01-01', E = '2024-11-05'
const DW = "calculated_date >= '2024-01-01T00:00:00' AND calculated_date <= '2024-11-05T23:59:59'"
const CW = `form_type='A' AND calculated_amount > 0 AND ${DW}`

describe('SF builders — byte-pins against the pre-dialect hook literals', () => {
  const b = fppcBuildersFor('sf')
  it('scope + freshness', () => {
    expect(b.lateIEScope).toBe('entity')
    expect(b.freshness).toEqual({ datasetKey: 'campaignFinance', dateField: 'calculated_date' })
  })
  it('overview queries', () => {
    expect(b.totals(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt', $where: CW } })
    expect(b.uniqueDonors(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'transaction_last_name, COUNT(*) as cnt',
      $where: `form_type='A' AND ${DW} AND transaction_last_name IS NOT NULL`,
      $group: 'transaction_last_name', $limit: 50000 } })
    expect(b.smallDonorCount(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'COUNT(*) as cnt', $where: `${CW} AND calculated_amount < 100` } })
    expect(b.contributionCount(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'COUNT(*) as cnt', $where: CW } })
    expect(b.selfFunding(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'SUM(calculated_amount) as total',
      $where: `form_type='A' AND transaction_self=true AND ${DW}` } })
    expect(b.topRecipients(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'filer_nid, filer_name, filer_type, SUM(calculated_amount) as total',
      $where: `form_type='A' AND ${DW}`, $group: 'filer_nid, filer_name, filer_type',
      $order: 'total DESC', $limit: 50 } })
    expect(b.timeline(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
      $where: `form_type='A' AND ${DW}`, $group: 'period', $order: 'period' } })
    expect(b.fundingSources(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'entity_code, SUM(calculated_amount) as total',
      $where: `form_type='A' AND ${DW}`, $group: 'entity_code', $order: 'total DESC' } })
    expect(b.donorGeo(S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
      $where: `form_type='A' AND ${DW} AND transaction_zip IS NOT NULL`,
      $group: 'transaction_zip', $order: 'total DESC', $limit: 50 } })
  })
  it('detail queries incl. escaping', () => {
    const FW = "filer_nid='O''Brien'"
    expect(b.filerWhere("O'Brien")).toBe(FW)
    expect(b.sourceBreakdown("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'entity_code, SUM(calculated_amount) as total, COUNT(*) as cnt',
      $where: `form_type='A' AND ${FW} AND ${DW}`, $group: 'entity_code' } })
    expect(b.topDonors("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'transaction_last_name, SUM(calculated_amount) as total',
      $where: `form_type='A' AND ${FW} AND ${DW}`, $group: 'transaction_last_name',
      $order: 'total DESC', $limit: 10 } })
    expect(b.entityTimeline("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
      $where: `form_type='A' AND ${FW} AND ${DW}`, $group: 'period', $order: 'period' } })
    expect(b.spendingCategories("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'transaction_code, SUM(calculated_amount) as total',
      $where: `form_type='E' AND ${FW} AND ${DW}`, $group: 'transaction_code',
      $order: 'total DESC', $limit: 50 } })
    expect(b.entityDonorGeo("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
      $where: `form_type='A' AND ${FW} AND ${DW} AND transaction_zip IS NOT NULL`,
      $group: 'transaction_zip', $order: 'total DESC', $limit: 50 } })
    expect(b.ballotNumberLookup("O'Brien", S, E)).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'ballot_number', $where: `${FW} AND ballot_number IS NOT NULL AND ${DW}`, $limit: 1 } })
    const ie = b.ieQueries("candidate_last_name='Lurie'", S, E)!
    expect(ie.support).toEqual({ datasetKey: 'campaignFinance', params: {
      $select: 'filer_name, SUM(calculated_amount) as total',
      $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='S' AND candidate_last_name='Lurie' AND ${DW}`,
      $group: 'filer_name', $order: 'total DESC', $limit: 10 } })
    expect(ie.oppose.params.$where).toContain("support_oppose_code='O'")
    expect(b.lateIEByTarget(S, E)).toBeNull()
    expect(b.lateContribsSummary(S, E)).toBeNull()
    expect(b.nullDateDisclosure()).toBeNull()
  })
})

describe('Oakland builders', () => {
  const b = fppcBuildersFor('oakland')
  const ODW = "tran_date >= '2024-01-01T00:00:00' AND tran_date <= '2024-11-05T23:59:59'"
  it('scope, freshness, and registry-real dataset keys', () => {
    expect(b.lateIEScope).toBe('view')
    expect(b.freshness).toEqual({ datasetKey: 'fppcSchA', dateField: 'tran_date' })
    const keys = [
      b.totals(S, E), b.topRecipients(S, E), b.spendingCategories('X', S, E),
      b.lateIEByTarget(S, E)!, b.lateContribsSummary(S, E)!, b.nullDateDisclosure()!,
    ].map((q) => q.datasetKey)
    for (const k of keys) expect(OAKLAND_DATASETS_RAW[k], k).toBeTruthy()
  })
  it('overview routes on Sch A fields (tran_amt1/tran_date; self via text y)', () => {
    expect(b.totals(S, E)).toEqual({ datasetKey: 'fppcSchA', params: {
      $select: 'SUM(tran_amt1) as total, AVG(tran_amt1) as avg_amt',
      $where: `tran_amt1 > 0 AND ${ODW}` } })
    expect(b.selfFunding(S, E).params.$where).toBe(`tran_self='y' AND ${ODW}`)
    expect(b.topRecipients(S, E)).toEqual({ datasetKey: 'fppcSchA', params: {
      $select: 'filer_id as filer_nid, filer_naml as filer_name, SUM(tran_amt1) as total',
      $where: ODW, $group: 'filer_nid, filer_name', $order: 'total DESC', $limit: 50 } })
    expect(b.fundingSources(S, E).params.$select).toBe('entity_cd as entity_code, SUM(tran_amt1) as total')
    expect(b.donorGeo(S, E)).toBeNull()
  })
  it('detail routes: Sch A by filer_id, spending on Sch E with the alias', () => {
    expect(b.filerWhere('123')).toBe("filer_id='123'")
    expect(b.spendingCategories('123', S, E)).toEqual({ datasetKey: 'fppcSchE', params: {
      $select: 'expn_code as transaction_code, SUM(amount) as total',
      $where: "filer_id='123' AND expn_date >= '2024-01-01T00:00:00' AND expn_date <= '2024-11-05T23:59:59'",
      $group: 'transaction_code', $order: 'total DESC', $limit: 50 } })
    expect(b.ieQueries('x', S, E)).toBeNull()
    expect(b.ballotNumberLookup('123', S, E)).toBeNull()
    expect(b.entityDonorGeo('123', S, E)).toBeNull()
  })
  it('late-filings routes: 496 uses exp_date (no n!), 497 ctrib_date, Sch E null-date disclosure', () => {
    expect(b.lateIEByTarget(S, E)).toEqual({ datasetKey: 'fppc496', params: {
      $select: 'cand_naml, bal_name, sup_opp_cd, SUM(amount) as total',
      $where: "exp_date >= '2024-01-01T00:00:00' AND exp_date <= '2024-11-05T23:59:59'",
      $group: 'cand_naml, bal_name, sup_opp_cd', $order: 'total DESC', $limit: 200 } })
    expect(b.lateContribsSummary(S, E)).toEqual({ datasetKey: 'fppc497', params: {
      $select: 'SUM(amount) as total, COUNT(*) as cnt',
      $where: "ctrib_date >= '2024-01-01T00:00:00' AND ctrib_date <= '2024-11-05T23:59:59'" } })
    expect(b.nullDateDisclosure()).toEqual({ datasetKey: 'fppcSchE', params: {
      $select: 'COUNT(*) as cnt, SUM(amount) as total', $where: 'expn_date IS NULL' } })
  })
})
```

- [ ] **Step 2: Run to verify failure** — `npx vitest run src/views/CampaignFinance/fppcDialect.test.ts` → FAIL (module not found).

- [ ] **Step 3: Implement** — `src/views/CampaignFinance/fppcDialect.ts`: the two interfaces from the Interfaces block above, then:

```ts
function esc(v: string): string {
  return v.replace(/'/g, "''")
}
function dw(field: string, start: string, end: string): string {
  return `${field} >= '${start}T00:00:00' AND ${field} <= '${end}T23:59:59'`
}

const CF = 'campaignFinance'

const SF_BUILDERS: FppcQueryBuilders = {
  lateIEScope: 'entity',
  freshness: { datasetKey: CF, dateField: 'calculated_date' },
  totals: (s, e) => ({ datasetKey: CF, params: {
    $select: 'SUM(calculated_amount) as total, AVG(calculated_amount) as avg_amt',
    $where: `form_type='A' AND calculated_amount > 0 AND ${dw('calculated_date', s, e)}` } }),
  uniqueDonors: (s, e) => ({ datasetKey: CF, params: {
    $select: 'transaction_last_name, COUNT(*) as cnt',
    $where: `form_type='A' AND ${dw('calculated_date', s, e)} AND transaction_last_name IS NOT NULL`,
    $group: 'transaction_last_name', $limit: 50000 } }),
  smallDonorCount: (s, e) => ({ datasetKey: CF, params: {
    $select: 'COUNT(*) as cnt',
    $where: `form_type='A' AND calculated_amount > 0 AND ${dw('calculated_date', s, e)} AND calculated_amount < 100` } }),
  contributionCount: (s, e) => ({ datasetKey: CF, params: {
    $select: 'COUNT(*) as cnt',
    $where: `form_type='A' AND calculated_amount > 0 AND ${dw('calculated_date', s, e)}` } }),
  selfFunding: (s, e) => ({ datasetKey: CF, params: {
    $select: 'SUM(calculated_amount) as total',
    $where: `form_type='A' AND transaction_self=true AND ${dw('calculated_date', s, e)}` } }),
  topRecipients: (s, e) => ({ datasetKey: CF, params: {
    $select: 'filer_nid, filer_name, filer_type, SUM(calculated_amount) as total',
    $where: `form_type='A' AND ${dw('calculated_date', s, e)}`,
    $group: 'filer_nid, filer_name, filer_type', $order: 'total DESC', $limit: 50 } }),
  timeline: (s, e) => ({ datasetKey: CF, params: {
    $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
    $where: `form_type='A' AND ${dw('calculated_date', s, e)}`, $group: 'period', $order: 'period' } }),
  fundingSources: (s, e) => ({ datasetKey: CF, params: {
    $select: 'entity_code, SUM(calculated_amount) as total',
    $where: `form_type='A' AND ${dw('calculated_date', s, e)}`, $group: 'entity_code', $order: 'total DESC' } }),
  donorGeo: (s, e) => ({ datasetKey: CF, params: {
    $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
    $where: `form_type='A' AND ${dw('calculated_date', s, e)} AND transaction_zip IS NOT NULL`,
    $group: 'transaction_zip', $order: 'total DESC', $limit: 50 } }),
  filerWhere: (nid) => `filer_nid='${esc(nid)}'`,
  sourceBreakdown: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'entity_code, SUM(calculated_amount) as total, COUNT(*) as cnt',
    $where: `form_type='A' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)}`,
    $group: 'entity_code' } }),
  topDonors: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'transaction_last_name, SUM(calculated_amount) as total',
    $where: `form_type='A' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)}`,
    $group: 'transaction_last_name', $order: 'total DESC', $limit: 10 } }),
  entityTimeline: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'date_trunc_ym(calculated_date) as period, SUM(calculated_amount) as total',
    $where: `form_type='A' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)}`,
    $group: 'period', $order: 'period' } }),
  spendingCategories: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'transaction_code, SUM(calculated_amount) as total',
    $where: `form_type='E' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)}`,
    $group: 'transaction_code', $order: 'total DESC', $limit: 50 } }),
  entityDonorGeo: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'transaction_zip, SUM(calculated_amount) as total, COUNT(*) as cnt',
    $where: `form_type='A' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)} AND transaction_zip IS NOT NULL`,
    $group: 'transaction_zip', $order: 'total DESC', $limit: 50 } }),
  ballotNumberLookup: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: 'ballot_number',
    $where: `${SF_BUILDERS.filerWhere(nid)} AND ballot_number IS NOT NULL AND ${dw('calculated_date', s, e)}`,
    $limit: 1 } }),
  ieQueries: (matchWhere, s, e) => ({
    support: { datasetKey: CF, params: {
      $select: 'filer_name, SUM(calculated_amount) as total',
      $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='S' AND ${matchWhere} AND ${dw('calculated_date', s, e)}`,
      $group: 'filer_name', $order: 'total DESC', $limit: 10 } },
    oppose: { datasetKey: CF, params: {
      $select: 'filer_name, SUM(calculated_amount) as total',
      $where: `(form_type='F496' OR form_type='F496P3' OR form_type='F465P3') AND support_oppose_code='O' AND ${matchWhere} AND ${dw('calculated_date', s, e)}`,
      $group: 'filer_name', $order: 'total DESC', $limit: 10 } },
  }),
  lateIEByTarget: () => null,
  lateContribsSummary: () => null,
  nullDateDisclosure: () => null,
}

const OAK_BUILDERS: FppcQueryBuilders = {
  lateIEScope: 'view',
  freshness: { datasetKey: 'fppcSchA', dateField: 'tran_date' },
  totals: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'SUM(tran_amt1) as total, AVG(tran_amt1) as avg_amt',
    $where: `tran_amt1 > 0 AND ${dw('tran_date', s, e)}` } }),
  uniqueDonors: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'tran_naml, COUNT(*) as cnt',
    $where: `${dw('tran_date', s, e)} AND tran_naml IS NOT NULL`,
    $group: 'tran_naml', $limit: 50000 } }),
  smallDonorCount: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'COUNT(*) as cnt',
    $where: `tran_amt1 > 0 AND ${dw('tran_date', s, e)} AND tran_amt1 < 100` } }),
  contributionCount: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'COUNT(*) as cnt', $where: `tran_amt1 > 0 AND ${dw('tran_date', s, e)}` } }),
  // tran_self is lowercase TEXT 'y'/'n' — `=true` is a live 400 (type-mismatch).
  selfFunding: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'SUM(tran_amt1) as total', $where: `tran_self='y' AND ${dw('tran_date', s, e)}` } }),
  topRecipients: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'filer_id as filer_nid, filer_naml as filer_name, SUM(tran_amt1) as total',
    $where: dw('tran_date', s, e), $group: 'filer_nid, filer_name', $order: 'total DESC', $limit: 50 } }),
  timeline: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'date_trunc_ym(tran_date) as period, SUM(tran_amt1) as total',
    $where: dw('tran_date', s, e), $group: 'period', $order: 'period' } }),
  fundingSources: (s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'entity_cd as entity_code, SUM(tran_amt1) as total',
    $where: dw('tran_date', s, e), $group: 'entity_code', $order: 'total DESC' } }),
  donorGeo: () => null,
  filerWhere: (id) => `filer_id='${esc(id)}'`,
  sourceBreakdown: (id, s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'entity_cd as entity_code, SUM(tran_amt1) as total, COUNT(*) as cnt',
    $where: `${OAK_BUILDERS.filerWhere(id)} AND ${dw('tran_date', s, e)}`, $group: 'entity_code' } }),
  topDonors: (id, s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'tran_naml as transaction_last_name, SUM(tran_amt1) as total',
    $where: `${OAK_BUILDERS.filerWhere(id)} AND ${dw('tran_date', s, e)}`,
    $group: 'transaction_last_name', $order: 'total DESC', $limit: 10 } }),
  entityTimeline: (id, s, e) => ({ datasetKey: 'fppcSchA', params: {
    $select: 'date_trunc_ym(tran_date) as period, SUM(tran_amt1) as total',
    $where: `${OAK_BUILDERS.filerWhere(id)} AND ${dw('tran_date', s, e)}`,
    $group: 'period', $order: 'period' } }),
  spendingCategories: (id, s, e) => ({ datasetKey: 'fppcSchE', params: {
    $select: 'expn_code as transaction_code, SUM(amount) as total',
    $where: `${OAK_BUILDERS.filerWhere(id)} AND ${dw('expn_date', s, e)}`,
    $group: 'transaction_code', $order: 'total DESC', $limit: 50 } }),
  entityDonorGeo: () => null,
  ballotNumberLookup: () => null,
  ieQueries: () => null,
  lateIEByTarget: (s, e) => ({ datasetKey: 'fppc496', params: {
    // exp_date, NOT expn_date — this schedule's sibling-divergent field name.
    $select: 'cand_naml, bal_name, sup_opp_cd, SUM(amount) as total',
    $where: dw('exp_date', s, e),
    $group: 'cand_naml, bal_name, sup_opp_cd', $order: 'total DESC', $limit: 200 } }),
  lateContribsSummary: (s, e) => ({ datasetKey: 'fppc497', params: {
    $select: 'SUM(amount) as total, COUNT(*) as cnt', $where: dw('ctrib_date', s, e) } }),
  // 1,553 Sch E rows (5.3%, $3.39M) have NULL expn_date — invisible to every
  // date-filtered query. This feeds the mandatory disclosure line.
  nullDateDisclosure: () => ({ datasetKey: 'fppcSchE', params: {
    $select: 'COUNT(*) as cnt, SUM(amount) as total', $where: 'expn_date IS NULL' } }),
}

export function fppcBuildersFor(cityId: 'sf' | 'oakland'): FppcQueryBuilders {
  return cityId === 'oakland' ? OAK_BUILDERS : SF_BUILDERS
}
```

- [ ] **Step 4: Run** — `npx vitest run src/views/CampaignFinance/fppcDialect.test.ts && npx tsc -b` → PASS/clean. Verify zero imports: `grep -c "^import" src/views/CampaignFinance/fppcDialect.ts` → `0` (type-only `import type` lines are also absent — the test imports the registry, the dialect imports nothing).

- [ ] **Step 5: Commit**

```bash
git add src/views/CampaignFinance/fppcDialect.ts src/views/CampaignFinance/fppcDialect.test.ts
git commit -m "feat(oakland): FPPC ledger dialect — SF byte-pinned builders + Oakland routes"
```

---

### Task 5: Parameterize the two campaign-finance hooks over the dialect

**Files:**
- Modify: `src/hooks/useCampaignFinance.ts`
- Modify: `src/hooks/useCampaignDetail.ts`

**Interfaces:**
- Consumes: `fppcBuildersFor` (Task 4), `cityElections`/`findCycleForRange`/`findPriorCycle` (Task 3).
- Produces: `useCampaignFinance(dateRange, cityId: CityId = 'sf')`, `useCampaignDetail(entity, dateRange, cityId: CityId = 'sf')` — same result shapes as today. All existing SF call sites compile unchanged (trailing default).

There is no new unit test in this task — Task 4's byte-pins ARE the proof the SF query surface is unchanged; this task's gate is `npx tsc -b` + the full existing suite staying green + a diff review that every `fetchDataset` literal was REPLACED by a builder call (none left behind).

- [ ] **Step 1: Rework `useCampaignFinance.ts`**

```ts
import type { CityId } from '@/cities/routing'
import { fppcBuildersFor, type FppcQuerySpec } from '@/views/CampaignFinance/fppcDialect'
import { cityElections, findCycleForRange, findPriorCycle } from '@/utils/electionCycles'
```

Signature: `export function useCampaignFinance(dateRange: { start: string; end: string }, cityId: CityId = 'sf'): UseCampaignFinanceResult`.

Inside the effect (replacing the inline `dateWhere`/`contribWhere` and all 9 query literals):

```ts
    const { start, end } = dateRange
    const b = fppcBuildersFor(cityId)
    const run = <T,>(spec: FppcQuerySpec) =>
      fetchDataset<T>(spec.datasetKey, spec.params, { cityId })

    const donorGeoSpec = b.donorGeo(start, end)
    const queries = [
      run<CampaignStatTotals>(b.totals(start, end)),
      run<CampaignUniqueDonorRow>(b.uniqueDonors(start, end)),
      run<CampaignCountRow>(b.smallDonorCount(start, end)),
      run<CampaignCountRow>(b.contributionCount(start, end)),
      run<CampaignSelfFundRow>(b.selfFunding(start, end)),
      run<CampaignFilerAggRow>(b.topRecipients(start, end)),
      run<CampaignTimelineRow>(b.timeline(start, end)),
      run<CampaignSourceAggRow>(b.fundingSources(start, end)),
      donorGeoSpec ? run<CampaignDonorGeoRow>(donorGeoSpec) : Promise.resolve([] as CampaignDonorGeoRow[]),
    ] as const

    const cycles = cityElections(cityId)
    const currentCycle = findCycleForRange(start, end, cycles)
    const priorCycle = currentCycle ? findPriorCycle(currentCycle, cycles) : null
```

In the `.then(...)`: `setTopRecipients(recipients.map((r) => ({ ...r, filer_type: r.filer_type ?? '' })))` — Oakland's aliased rows carry no `filer_type`; SF rows are unchanged by the spread. (This is a data normalization, not a query change — byte-parity is untouched.) The YoY block replaces its three literals with `run(b.totals(priorCycle.start, priorCycle.end))`, `run(b.smallDonorCount(...))`, `run(b.contributionCount(...))`. Effect deps gain `cityId`. Everything else (state, ordering, parseFloat handling) stays byte-identical.

- [ ] **Step 2: Rework `useCampaignDetail.ts`**

Signature: `export function useCampaignDetail(entity: SelectedEntity | null, dateRange: { start: string; end: string }, cityId: CityId = 'sf'): UseCampaignDetailResult`. Same `b`/`run` helpers. Replace the 5 base queries with `b.sourceBreakdown(entity.filerNid, start, end)`, `b.topDonors(...)`, `b.entityTimeline(...)`, `b.spendingCategories(...)`, and `const geoSpec = b.entityDonorGeo(...)` (null → `Promise.resolve([])`).

`resolveIeMatchWhere` gains an early exit — the ONE authored fact gates it:

```ts
    async function resolveIeMatchWhere(): Promise<string | null> {
      if (b.lateIEScope !== 'entity') return null // Oakland: entity IE withheld (no reliable filer→candidate join)
      ...existing body, with the secondary lookup replaced by:
      const spec = b.ballotNumberLookup(entity!.filerNid, start, end)
      if (spec) {
        const rows = await run<{ ballot_number: string }>(spec)
        ...
      }
    }
```

The IE fire block becomes:

```ts
        const ieSpecs = ieMatchWhere ? b.ieQueries(ieMatchWhere, start, end) : null
        if (ieSpecs) {
          const [supportRows, opposeRows] = await Promise.all([
            run<CampaignIERow>(ieSpecs.support),
            run<CampaignIERow>(ieSpecs.oppose),
          ])
          ...
        } else { ...existing empty-sets branch... }
```

Effect deps gain `cityId`. The SF match-clause literals (`ballot_number='...'`, `candidate_last_name='...'`, the filer-name regex fallback) stay in the hook verbatim — they are SF-only strings behind the `lateIEScope` gate.

- [ ] **Step 3: Verify**

Run: `npx tsc -b && npx vitest run src/views/CampaignFinance/fppcDialect.test.ts src/utils/electionCycles.test.ts`
Expected: clean/PASS. Then `grep -n "form_type\|calculated_" src/hooks/useCampaignFinance.ts src/hooks/useCampaignDetail.ts` — the ONLY remaining matches are the SF match-clause literals inside `resolveIeMatchWhere` (no query `$where`/`$select` literals survive in either hook).

- [ ] **Step 4: Commit**

```bash
git add src/hooks/useCampaignFinance.ts src/hooks/useCampaignDetail.ts
git commit -m "refactor(cf): route both campaign-finance hooks through the FPPC dialect (cityId param)"
```

---

### Task 6: Oakland citation support hooks

**Files:**
- Create: `src/views/ParkingCitations/oakCitationHooks.ts`
- Modify: `src/hooks/useComparisonDataFactory.ts`

**Interfaces:**
- Consumes: `createHourlyPatternHook` (Task 2 config fields), `OAK_HOUR_EXPR`/`bucketToHour`/`OakCitationRecord` (Task 1), `ComparisonStatsCitations` (existing).
- Produces: `useOaklandCitationHourlyPattern(dateRange, extraWhere?, enabled?)` (HourlyPatternResult incl. `unparsedCount`); `useOaklandCitationComparisonData(dateRange, statsWhere, compStart, currentRecords, hitLimit)` with deltas `{ total, avgFine, outOfStatePct }`.

- [ ] **Step 1: Create `src/views/ParkingCitations/oakCitationHooks.ts`**

```ts
import { createHourlyPatternHook } from '@/hooks/useHourlyPatternFactory'
import { OAK_HOUR_EXPR, bucketToHour } from './citationsDialect'

/** Lives in the VIEW layer (not the factory file) because it consumes real
 *  dialect values — the factory must stay dialect-import-free. NEW placement,
 *  not the crime precedent (crime's countExpr is a literal string). */
export const useOaklandCitationHourlyPattern = createHourlyPatternHook(
  {
    datasetKey: 'parkingCitations',
    dateField: 'ticket_iss',
    cityId: 'oakland',
    hourExpr: OAK_HOUR_EXPR,
    mapHourValue: bucketToHour,
    // ~58 buckets × 7 days ≈ 406 group rows — the default 200 would silently truncate.
    limit: 800,
  },
  'useOaklandCitationHourlyPattern'
)
```

- [ ] **Step 2: Add the comparison hook** — in `src/hooks/useComparisonDataFactory.ts`, after `useCitationComparisonData` (type-only dialect import is cycle-safe; the file already imports `isOakCaseOpen` from dialect311 as value precedent):

```ts
import type { OakCitationRecord } from '@/views/ParkingCitations/citationsDialect'
```

```ts
export const useOaklandCitationComparisonData = createComparisonDataHook<
  OakCitationRecord,
  ComparisonStatsCitations,
  { total: number; avgFine: number; outOfStatePct: number }
>(
  {
    datasetKey: 'parkingCitations',
    dateField: 'ticket_iss',
    selectFields: 'ticket_num,ticket_iss,fine_amount',
    cityId: 'oakland',
    computeStats(records) {
      let totalFines = 0
      let fineCount = 0
      for (const r of records) {
        const fine = parseFloat(r.fine_amount)
        if (!isNaN(fine) && fine > 0) {
          totalFines += fine
          fineCount++
        }
      }
      return {
        total: records.length,
        avgFine: fineCount > 0 ? totalFines / fineCount : 0,
        outOfStatePct: 0, // no plate-state column exists — the OOS card is withheld for Oakland
        totalFines,
      }
    },
    computeDeltas(current, comparison) {
      return {
        total: pctDelta(current.total, comparison.total),
        avgFine: pctDelta(current.avgFine, comparison.avgFine),
        outOfStatePct: 0,
      }
    },
    buildTrendPoint(day, recs) {
      let totalFines = 0
      for (const r of recs) {
        const f = parseFloat(r.fine_amount)
        if (!isNaN(f)) totalFines += f
      }
      return {
        day,
        callCount: recs.length,
        avgResponseTime: recs.length > 0 ? totalFines / recs.length : 0,
        medianResponseTime: 0,
      }
    },
    extractDate: (r) => r.ticket_iss,
  },
  'useOaklandCitationComparisonData'
)
```

Note the string-replace contract: this hook receives the Oakland `statsWhere`, whose Task-1 builder opens with the exact `ticket_iss >= '<start>T00:00:00' AND ticket_iss <= '<end>T23:59:59'` pair the factory's `.replace()` targets.

- [ ] **Step 3: Verify** — `npx tsc -b && npx vitest run src/hooks/hourlyPattern.test.ts src/views/ParkingCitations/citationsDialect.test.ts` → clean/PASS.

- [ ] **Step 4: Commit**

```bash
git add src/views/ParkingCitations/oakCitationHooks.ts src/hooks/useComparisonDataFactory.ts
git commit -m "feat(oakland): citation hourly + comparison hooks (dialect-fed, view-layer placement)"
```

---

### Task 7: ParkingCitations view surgery (+ ViolationTypeFilter props, + CitationDetailPanel branch)

**Files:**
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx` (site-by-site below)
- Modify: `src/components/filters/ViolationTypeFilter.tsx`
- Modify: `src/components/ui/CitationDetailPanel.tsx`

**Interfaces:**
- Consumes: everything Tasks 1/2/6 produced. `useRouteView` from `@/cities/useActiveCity`; `useActiveCity` for `areas.formatLabel`.
- Produces: the SF branch renders byte-identically; the Oakland branch is fully live. No new exports.

**7a — `ViolationTypeFilter.tsx`:** add two optional props, default = today's behavior:

```ts
interface ViolationTypeFilterProps {
  categories: ViolationTypeEntry[]
  selected: Set<string>
  onChange: (selected: Set<string>) => void
  sortByRevenue?: boolean
  /** Quick-group definitions over entry KEYS. Default: the SF description groups. */
  groups?: Record<string, string[]>
  /** Display transform for entry keys (Oakland passes code→label). Default: identity. */
  formatLabel?: (key: string) => string
}
```

In the component: `const { groups = VIOLATION_GROUPS, formatLabel = (k: string) => k } = props`-style destructure (keep the existing param list, add the two). Replace both `VIOLATION_GROUPS[groupName]` reads (`handleGroup`, `isGroupActive`) with `groups[groupName]`, and the group-button render loop `Object.keys(VIOLATION_GROUPS)` with `Object.keys(groups)`. Wherever a row renders the raw name (`{cat.violationDesc}` and any `title` attr), render `{formatLabel(cat.violationDesc)}`. Selection keys stay RAW (`cat.violationDesc`) — only display goes through `formatLabel`.

**7b — `CitationDetailPanel.tsx`:** city branch. Add imports:

```ts
import { useRouteView } from '@/cities/useActiveCity'
import { oakViolationLabel, regionToBeat, OAK_CITATION_SELECT, type OakCitationRecord } from '@/views/ParkingCitations/citationsDialect'
```

Inside the component: `const { cityId } = useRouteView()`; `const isSF = cityId === 'sf'`. Extend `CitationDetail` with `issuedTimeRaw: string`. The fetch effect branches (deps gain `cityId`):

```ts
    if (isSF) {
      fetchDataset<ParkingCitationRecord>('parkingCitations', {
        $where: `citation_number = '${selectedCitation}'`,
        $limit: 1,
      })
        .then(...) // existing handling, buildDetail unchanged (issuedTimeRaw: '')
    } else {
      // ticket_num is a NUMBER column — unquoted, and only after a strict
      // numeric gate (the requestid idiom from stage 3's CaseDetailPanel).
      if (!/^\d+$/.test(selectedCitation)) { setDetail(null); setIsLoading(false); return }
      fetchDataset<OakCitationRecord>('parkingCitations', {
        $select: OAK_CITATION_SELECT,
        $where: `ticket_num = ${selectedCitation}`,
        $limit: 1,
      }, { cityId })
        .then((records) => {
          if (!cancelled && records.length > 0) {
            const r = records[0]
            setDetail({
              citationNumber: r.ticket_num,
              violation: r.violation || '',
              violationDesc: oakViolationLabel(r.violation, r.violatio_1),
              fineAmount: parseFloat(r.fine_amount) || 0,
              location: r.location || 'Unknown',
              neighborhood: regionToBeat(r[':@computed_region_fus4_casw']),
              district: '',
              issuedDatetime: r.ticket_iss || '',
              issuedTimeRaw: r.ticket_i_1 || '',
              plateState: '',
            })
          }
        })
        ...same catch/finally
    }
```

Render changes, all keyed on data-absence (withheld, not faked):
- The `District {detail.district}` clause renders only when `detail.district` is truthy (`{detail.neighborhood}{detail.district ? <> · District {detail.district}</> : null}` — note the literal `·`, never a `\u` escape in bare JSX).
- The issued TIME line branches: when `detail.issuedTimeRaw` is truthy render it VERBATIM (`<p ...>{detail.issuedTimeRaw}</p>`); the existing `new Date(...).toLocaleTimeString(...)` line renders only when `issuedTimeRaw` is empty AND `isSF` (Oakland's date-only value would fabricate "12:00 AM").
- The whole Plate State block renders only when `detail.plateState` is truthy.
- The eyebrow renders "Citation #" for SF, "Ticket #" for Oakland (`{isSF ? 'Citation' : 'Ticket'} #{detail.citationNumber}`).

**7c — `ParkingCitations.tsx` surgery, site by site.** Add imports:

```ts
import { useRouteView, useActiveCity } from '@/cities/useActiveCity'
import {
  OAK_BEAT_REGION_FIELD, OAK_CITATION_SELECT, OAK_VIOLATION_GROUPS,
  oakViolationClause, oakTodClause, oakStatsWhere, oakDateOnlyClause,
  sfViolationClause, sfTodFragment, sfStatsWhere, sfDateOnlyClause,
  oakViolationLabel, regionToBeat, OAK_VIOLATION_LABELS,
  type OakCitationRecord,
} from './citationsDialect'
import { useOaklandCitationHourlyPattern } from './oakCitationHooks'
import { useOaklandCitationComparisonData } from '@/hooks/useComparisonDataFactory'
```

Top of component: `const { cityId } = useRouteView()`; `const isSF = cityId === 'sf'`; `const city = useActiveCity()`; `const areaLabel = (name: string) => city.areas.formatLabel ? city.areas.formatLabel(name) : name`.

1. **WHERE memos** — replace the four memo BODIES with dialect calls (SF byte-parity is Task 1's pins):
```ts
  const violationClause = useMemo(
    () => (isSF ? sfViolationClause(selectedViolations) : oakViolationClause(selectedViolations)),
    [isSF, selectedViolations]
  )
  const todFragment = useMemo(
    () => (isSF ? sfTodFragment(timeOfDayFilter) : oakTodClause(timeOfDayFilter)),
    [isSF, timeOfDayFilter]
  )
  const statsWhere = useMemo(
    () => (isSF
      ? sfStatsWhere({ dateRange, violationClause, selectedNeighborhood, todFragment })
      : oakStatsWhere({ dateRange, violationClause, selectedBeat: selectedNeighborhood, todClause: todFragment })),
    [isSF, dateRange, violationClause, selectedNeighborhood, todFragment]
  )
  const mapWhere = useMemo(() => statsWhere + ' AND the_geom IS NOT NULL', [statsWhere])
  const dateOnlyClause = useMemo(
    () => (isSF ? sfDateOnlyClause(dateRange, todFragment) : oakDateOnlyClause(dateRange, todFragment)),
    [isSF, dateRange, todFragment]
  )
```
(`selectedNeighborhood` — the URL param — canonically holds the beat CODE for Oakland; only the builder converts.)

2. **Freshness:** `useDataFreshness('parkingCitations', isSF ? 'citation_issued_datetime' : 'ticket_iss', dateRange, isSF ? { geoField: 'the_geom' } : { cityId })` — Oakland has 100% geo coverage, so no `geoField` (the geo-gap alert machinery stands down naturally: `hasGeoInRange` stays undefined-safe as for other geoField-less callers).

3. **Trend config:**
```ts
  const trendConfig = useMemo((): TrendConfig => ({
    datasetKey: 'parkingCitations',
    dateField: isSF ? 'citation_issued_datetime' : 'ticket_iss',
    neighborhoodField: isSF ? 'analysis_neighborhood' : OAK_BEAT_REGION_FIELD,
    cityId,
    metrics: [ ...unchanged two metric objects... ],
  }), [isSF, cityId])
```

4. **Map query:** `$select: isSF ? SELECT_FIELDS : OAK_CITATION_SELECT` (typed `useDataset<ParkingCitationRecord | OakCitationRecord>` — the adapter memo narrows per branch).

5. **OOS count query:** gate OFF for Oakland with the `enabled` option (no request fires):
```ts
  const { data: oosCountRows } = useDataset<{ count: string }>(
    'parkingCitations',
    { $select: 'count(*) as count', $where: `${statsWhere} AND vehicle_plate_state IS NOT NULL AND vehicle_plate_state != 'CA'` },
    [statsWhere],
    { enabled: isSF }
  )
```

6. **Violation aggregation** — group the CODE for Oakland:
```ts
  const { data: violationRows } = useDataset<ViolationTypeAggRow>(
    'parkingCitations',
    isSF
      ? { ...existing SF params unchanged... }
      : {
          $select: 'violation, count(*) as citation_count, SUM(fine_amount) as total_fines, AVG(fine_amount) as avg_fine',
          $group: 'violation',
          $where: dateOnlyClause,
          $order: 'citation_count DESC',
          $limit: 50,
        },
    [isSF, dateOnlyClause]
  )
```
`violationEntries` maps `violationDesc: isSF ? r.violation_desc : (r as { violation?: string }).violation ?? ''` (filter out empty keys — the NULL-code bucket). `topViolationBars` labels through `isSF ? v.violationDesc : (OAK_VIOLATION_LABELS[v.violationDesc] ?? v.violationDesc)` — the fallback is the CODE ITSELF, never `oakViolationLabel(code, null)`, which would collapse every tail code into one 'Unknown' label.

7. **Neighborhood aggregation** — region field + the $limit lesson + null-bucket capture:
```ts
  const { data: neighborhoodRows } = useDataset<Record<string, string>>(
    'parkingCitations',
    isSF
      ? { ...existing SF params unchanged ($limit: 50)... }
      : {
          $select: `${OAK_BEAT_REGION_FIELD} as region, count(*) as citation_count, SUM(fine_amount) as total_fines, AVG(fine_amount) as avg_fine`,
          $group: 'region',
          $where: statsWhere,
          $order: 'citation_count DESC',
          $limit: 200,
        },
    [isSF, statsWhere]
  )
```
```ts
  const neighborhoodEntries = useMemo(() => {
    return neighborhoodRows
      .map((r) => ({
        neighborhood: isSF ? r.analysis_neighborhood : regionToBeat(r.region),
        citationCount: parseInt(r.citation_count, 10) || 0,
        totalFines: parseFloat(r.total_fines) || 0,
      }))
      .filter((r) => r.neighborhood && r.neighborhood !== 'Unknown')
  }, [neighborhoodRows, isSF])

  // Oakland disclosure: rows whose beat region is NULL/unmapped (~5.2%)
  const unmappedShare = useMemo(() => {
    if (isSF || totalCount === null || totalCount === 0) return null
    const mapped = neighborhoodEntries.reduce((s, n) => s + n.citationCount, 0)
    const unmapped = totalCount - mapped
    return unmapped > 0 ? (unmapped / totalCount) * 100 : null
  }, [isSF, totalCount, neighborhoodEntries])
```

8. **Hourly + comparison** — inert dual instances (stage-3 idiom; hooks are called unconditionally, the inactive one disabled/empty):
```ts
  const extraWhere = useMemo(() => {
    const parts: string[] = []
    if (violationClause) parts.push(violationClause)
    if (selectedNeighborhood) {
      parts.push(isSF
        ? `analysis_neighborhood = '${selectedNeighborhood.replace(/'/g, "''")}'`
        : `${OAK_BEAT_REGION_FIELD} = ${beatToRegionId(selectedNeighborhood) ?? -1}`)
    }
    return parts.length > 0 ? parts.join(' AND ') : undefined
  }, [isSF, violationClause, selectedNeighborhood])
```
(add `beatToRegionId` to the dialect import list)
```ts
  const sfHourly = useCitationHourlyPattern(dateRange, extraWhere, isSF)
  const oakHourly = useOaklandCitationHourlyPattern(dateRange, extraWhere, !isSF)
  const hourlyPattern = isSF ? sfHourly : oakHourly

  const sfComparison = useCitationComparisonData(dateRange, statsWhere, isSF ? compStart : null, rawData as ParkingCitationRecord[], hitLimit)
  const oakComparison = useOaklandCitationComparisonData(dateRange, statsWhere, isSF ? null : compStart, rawData as never, hitLimit)
  const comparison = isSF ? sfComparison : oakComparison
```

9. **`citationData` adapter branch** (the memo body):
```ts
  const citationData = useMemo(() => {
    if (isSF) {
      return (rawData as ParkingCitationRecord[]).map((record) => {
        ...existing SF body UNCHANGED, plus issuedTimeRaw: '' in the returned object...
      }).filter(...)
    }
    return (rawData as OakCitationRecord[])
      .map((r) => {
        const coords = extractCoordinates(r.the_geom)
        if (!coords) return null
        return {
          citationNumber: r.ticket_num,
          issuedAt: r.ticket_iss,
          issuedTimeRaw: r.ticket_i_1 || '',
          violation: r.violation || '',
          violationDesc: oakViolationLabel(r.violation, r.violatio_1),
          location: r.location || 'Unknown',
          fineAmount: parseFloat(r.fine_amount) || 0,
          plateState: 'Unknown',
          neighborhood: regionToBeat(r[':@computed_region_fus4_casw']),
          lat: coords.lat,
          lng: coords.lng,
        }
      })
      .filter((r): r is NonNullable<typeof r> => r !== null)
  }, [rawData, isSF])
```

10. **GeoJSON properties + tooltip** — carry `issuedTimeRaw` into `heatmapGeojson`'s `properties`, and branch the point tooltip's time rendering:
```ts
    const issuedTime = props.issuedTimeRaw
      ? String(props.issuedTimeRaw) // Oakland: published string VERBATIM — parsing the date-only column fabricates "12:00 AM"
      : props.issuedAt
        ? new Date(parseSfLocal(String(props.issuedAt))).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', timeZone: 'America/Los_Angeles' })
        : null
```
(the issuedDate line is UNCHANGED — the date half of the midnight-stamped value renders the correct calendar day in LA time; also swap the tooltip's `Neighborhood` label line to `{isSF ? 'Neighborhood' : 'Beat'}` and its value through `areaLabel(...)` for Oakland — since the tooltip returns an HTML string, render `${isSF ? props.neighborhood : areaLabel(String(props.neighborhood))}`).

11. **Anomaly fill:** no query/join change — `useNeighborhoodBoundaries()` already serves the active city's GeoJSON and Oakland `neighborhood` values ARE beat codes matching `nhood`. Branch only the anomaly tooltip's label ("Beat" + `areaLabel`).

12. **Stats + cards:** `stats` keeps its shape (Oakland `outOfStatePct` computes 0 from 'Unknown' plates and is never rendered). Card defs: build the array then `const cards = isSF ? cardDefs : cardDefs.filter((c) => c.id !== 'out-of-state')`. Total Citations card gains an Oakland subtitle disclosure: on the `total-citations` def, `subtitle: !isSF && unmappedShare !== null ? `${unmappedShare.toFixed(1)}% of citations have no beat` : undefined`.

13. **Chrome gates:** CivicTicker — two-part gate like crime: `const civicIndicators = useCivicIndicators({ enabled: isSF })` if the hook supports options, else keep the call and gate the RENDER `{isSF && (<div ...><CivicTicker .../></div>)}` (check the hook signature; stage 3 added an enabled option for crime — reuse whatever CrimeIncidents.tsx does, exactly). Header subtitle: `{isSF ? 'SFMTA · Citation Patterns & Fines' : 'OakDOT · Citation Patterns & Fines'}`. `NeighborhoodCensusContext` renders only when `isSF` (census null already empties its data; the explicit gate is authored). `ScannerFeedChips` renders only when `isSF`.

14. **Sidebar:** tab label `{isSF ? 'Neighborhoods' : 'Beats'}` (the `sidebarTab` KEY stays `'neighborhoods'` — URL/state stability); section header "By Neighborhood" → `{isSF ? 'By Neighborhood' : 'By Beat'}`; ranking rows + clear-filter button render names through `isSF ? ns.neighborhood : areaLabel(ns.neighborhood)`; below the section header add the Oakland disclosure line when `unmappedShare !== null`:
```tsx
  <p className="text-nano font-mono text-slate-400/70 dark:text-slate-600 mb-2">
    {unmappedShare.toFixed(1)}% of citations in range have no beat and are excluded from this ranking
  </p>
```
Heatgrid residual disclosure, after the Peak/Quiet line:
```tsx
  {hourlyPattern.unparsedCount > 0 && (
    <p className="text-nano font-mono text-slate-400/70 dark:text-slate-600 mt-1">
      {hourlyPattern.unparsedCount.toLocaleString()} citations carry unparseable times — excluded here
    </p>
  )}
```
`ViolationTypeFilter` call gains: `groups={isSF ? undefined : OAK_VIOLATION_GROUPS}` and `formatLabel={isSF ? undefined : (code: string) => OAK_VIOLATION_LABELS[code] ?? code}` — tail codes display as their raw code (distinct, honest), NOT via `oakViolationLabel(code, null)` which would label every unmapped row 'Unknown'.

- [ ] **Verify:** `npx tsc -b` clean; `npx vitest run src/views/ParkingCitations src/hooks/hourlyPattern.test.ts` PASS; `grep -n "date_extract_hh(citation_issued_datetime)" src/views/ParkingCitations/ParkingCitations.tsx` → ZERO hits (all four WHERE memos route through the dialect).

- [ ] **Commit**

```bash
git add src/views/ParkingCitations src/components/filters/ViolationTypeFilter.tsx src/components/ui/CitationDetailPanel.tsx src/hooks/useComparisonDataFactory.ts
git commit -m "feat(oakland): Parking Citations live on the 59 beats — full view dialect surgery"
```

---

### Task 8: CampaignFinance view surgery + LateFilingsSection + PTY label

**Files:**
- Create: `src/hooks/useLateFilings.ts`
- Create: `src/views/CampaignFinance/LateFilingsSection.tsx`
- Modify: `src/views/CampaignFinance/CampaignFinance.tsx`
- Modify: `src/components/charts/FundingSourcesChart.tsx`

**Interfaces:**
- Consumes: `fppcBuildersFor` (Task 4), `cityElections`/`getDefaultCycle`/`findCycleForRange` (Task 3), parameterized hooks (Task 5).
- Produces: `useLateFilings(dateRange, cityId): LateFilingsResult`; `<LateFilingsSection data={...} />`.

**8a — `src/hooks/useLateFilings.ts`** (complete file):

```ts
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '@/api/client'
import type { CityId } from '@/cities/routing'
import { fppcBuildersFor } from '@/views/CampaignFinance/fppcDialect'

interface LateIERow {
  cand_naml?: string
  bal_name?: string
  sup_opp_cd?: string
  total: string
}

export interface LateIETarget {
  target: string
  kind: 'candidate' | 'measure' | 'unattributed'
  support: number
  oppose: number
}

export interface LateFilingsResult {
  /** null when this city has no view-level late section (SF). */
  targets: LateIETarget[] | null
  lateContribTotal: number
  lateContribCount: number
  nullDateCount: number
  nullDateTotal: number
  isLoading: boolean
}

/** Pure — node-testable if ever needed. Folds the 496 GROUP BY rows into
 *  per-target support/oppose splits, sorted by combined money. */
export function foldLateIE(rows: LateIERow[]): LateIETarget[] {
  const byTarget = new Map<string, LateIETarget>()
  for (const r of rows) {
    const name = (r.cand_naml || '').trim() || (r.bal_name || '').trim()
    const kind: LateIETarget['kind'] = (r.cand_naml || '').trim()
      ? 'candidate'
      : (r.bal_name || '').trim() ? 'measure' : 'unattributed'
    const key = name || 'Unattributed'
    const entry = byTarget.get(key) ?? { target: key, kind, support: 0, oppose: 0 }
    const amt = parseFloat(r.total) || 0
    if (r.sup_opp_cd === 'O') entry.oppose += amt
    else entry.support += amt // 'S' and blank both count as support-side money
    byTarget.set(key, entry)
  }
  return Array.from(byTarget.values()).sort(
    (a, b) => (b.support + b.oppose) - (a.support + a.oppose)
  )
}

export function useLateFilings(
  dateRange: { start: string; end: string },
  cityId: CityId
): LateFilingsResult {
  const [result, setResult] = useState<Omit<LateFilingsResult, 'isLoading'>>({
    targets: null, lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0,
  })
  const [isLoading, setIsLoading] = useState(false)
  const abortRef = useRef(0)

  useEffect(() => {
    const b = fppcBuildersFor(cityId)
    const ieSpec = b.lateIEByTarget(dateRange.start, dateRange.end)
    if (!ieSpec) {
      setResult({ targets: null, lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0 })
      return
    }
    const id = ++abortRef.current
    setIsLoading(true)
    const contribSpec = b.lateContribsSummary(dateRange.start, dateRange.end)
    const nullSpec = b.nullDateDisclosure()
    Promise.all([
      fetchDataset<LateIERow>(ieSpec.datasetKey, ieSpec.params, { cityId }),
      contribSpec
        ? fetchDataset<{ total: string; cnt: string }>(contribSpec.datasetKey, contribSpec.params, { cityId })
        : Promise.resolve([]),
      nullSpec
        ? fetchDataset<{ cnt: string; total: string }>(nullSpec.datasetKey, nullSpec.params, { cityId })
        : Promise.resolve([]),
    ])
      .then(([ieRows, contribRows, nullRows]) => {
        if (id !== abortRef.current) return
        setResult({
          targets: foldLateIE(ieRows),
          lateContribTotal: parseFloat(contribRows[0]?.total || '0') || 0,
          lateContribCount: parseInt(contribRows[0]?.cnt || '0', 10) || 0,
          nullDateCount: parseInt(nullRows[0]?.cnt || '0', 10) || 0,
          nullDateTotal: parseFloat(nullRows[0]?.total || '0') || 0,
        })
      })
      .catch(() => {
        if (id === abortRef.current) {
          setResult({ targets: [], lateContribTotal: 0, lateContribCount: 0, nullDateCount: 0, nullDateTotal: 0 })
        }
      })
      .finally(() => {
        if (id === abortRef.current) setIsLoading(false)
      })
  }, [dateRange.start, dateRange.end, cityId])

  return { ...result, isLoading }
}
```

**8b — `src/views/CampaignFinance/LateFilingsSection.tsx`** (complete file):

```tsx
import type { LateFilingsResult } from '@/hooks/useLateFilings'
import { formatCurrency } from '@/components/charts/TopRecipientsChart'

/**
 * Oakland-only view-level surface for the dedicated late-window FPPC sets
 * (496 independent expenditures w/ support/oppose, 497 late contributions).
 * Renders only when the city's ledger has lateIEScope === 'view'.
 */
export default function LateFilingsSection({ data }: { data: LateFilingsResult }) {
  if (data.targets === null) return null
  const top = data.targets.filter((t) => t.kind !== 'unattributed').slice(0, 5)
  const maxTotal = Math.max(...top.map((t) => t.support + t.oppose), 1)

  return (
    <div className="glass-card rounded-xl p-4">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-1">
        Late Filings — Independent Expenditures
      </p>
      <p className="text-micro text-slate-400 dark:text-slate-500 mb-3">
        Money disclosed in the late-filing windows before an election (FPPC 496/497) — not the full ledger.
      </p>

      {top.length === 0 && !data.isLoading && (
        <p className="text-micro text-slate-500">No late independent expenditures in this cycle.</p>
      )}

      <div className="space-y-2">
        {top.map((t) => {
          const total = t.support + t.oppose
          return (
            <div key={t.target}>
              <div className="flex justify-between items-baseline mb-0.5">
                <span className="text-label text-slate-700 dark:text-slate-200 font-medium truncate max-w-[70%]">
                  {t.target}
                  <span className="text-nano font-mono text-slate-400 ml-1.5 uppercase">{t.kind}</span>
                </span>
                <span className="text-micro font-mono text-slate-400">{formatCurrency(total)}</span>
              </div>
              <div className="flex w-full h-2 rounded-full overflow-hidden bg-slate-200/50 dark:bg-slate-800/50">
                <div className="h-full" style={{ width: `${(t.support / maxTotal) * 100}%`, backgroundColor: '#7a9954' }} />
                <div className="h-full" style={{ width: `${(t.oppose / maxTotal) * 100}%`, backgroundColor: '#963e30' }} />
              </div>
              <div className="flex justify-between text-nano font-mono mt-0.5">
                <span className="text-moss-500">for {formatCurrency(t.support)}</span>
                {t.oppose > 0 && <span className="text-brick-500">against {formatCurrency(t.oppose)}</span>}
              </div>
            </div>
          )
        })}
      </div>

      {data.lateContribCount > 0 && (
        <p className="text-micro font-mono text-slate-500 mt-3">
          Late contributions (497): {formatCurrency(data.lateContribTotal)} across {data.lateContribCount.toLocaleString()} filings
        </p>
      )}
      {data.nullDateCount > 0 && (
        <p className="text-nano text-slate-400/70 dark:text-slate-600 mt-2">
          Note: {data.nullDateCount.toLocaleString()} campaign payments totaling {formatCurrency(data.nullDateTotal)} carry
          no date in the source data and are excluded from all date-filtered figures on this page.
        </p>
      )}
    </div>
  )
}
```

**8c — `FundingSourcesChart.tsx`:** add to `SOURCE_LABELS`: `PTY: 'Political Party',` and to `SOURCE_COLORS`: `'Political Party': '#616a96',` (indigo — the rare-cool reservation; without the label, Oakland's 24 PTY rows render as a raw "PTY" bar in the same gray as Other).

**8d — `CampaignFinance.tsx` surgery.** Imports: replace the `SF_ELECTIONS, getDefaultCycle, findCycleForRange` import with `{ cityElections, getDefaultCycle, findCycleForRange }`; add `import { useRouteView } from '@/cities/useActiveCity'`, `import { fppcBuildersFor } from './fppcDialect'`, `import { useLateFilings } from '@/hooks/useLateFilings'`, `import LateFilingsSection from './LateFilingsSection'`.

Component top:
```ts
  const { cityId } = useRouteView()
  const isSF = cityId === 'sf'
  const cycles = cityElections(cityId)
  const builders = fppcBuildersFor(cityId)
```
Then, site by site:
1. `effectiveRange` memo: both util calls pass `cycles` (`findCycleForRange(dateRange.start, dateRange.end, cycles)`, `getDefaultCycle(cycles)`); deps gain `cycles`. Same for the `currentCycle` line.
2. Freshness: `useDataFreshness(builders.freshness.datasetKey, builders.freshness.dateField, effectiveRange, { cityId })`.
3. Data hooks: `useCampaignFinance(effectiveRange, cityId)`, `useCampaignDetail(selectedEntity, effectiveRange, cityId)`, and `const late = useLateFilings(effectiveRange, cityId)`.
4. Header subtitle: `{isSF ? 'SF Ethics Commission' : 'City of Oakland FPPC filings'} · {cycleName}`.
5. Cycle pills: `{cycles.slice(0, 4).map((e) => (...unchanged button...))}`.
6. Entity detail: wrap `<ForAgainstSplit .../>` in `{builders.lateIEScope === 'entity' ? (<ForAgainstSplit .../>) : (`
```tsx
                        detail.topDonors.length > 0 && (
                          <div className="glass-card rounded-xl p-4">
                            <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                              Top Donors
                            </p>
                            <div className="space-y-1">
                              {detail.topDonors.map((d, i) => (
                                <div key={i} className="flex justify-between text-micro">
                                  <span className="text-slate-600 dark:text-slate-300 truncate max-w-[70%]">{d.transaction_last_name}</span>
                                  <span className="font-mono text-slate-400">{formatCurrency(parseFloat(d.total) || 0)}</span>
                                </div>
                              ))}
                            </div>
                          </div>
                        )
```
`)}` — Oakland withholds the IE split (no join) but keeps the donors the split used to carry. Also the entity header's `{selectedEntity.filerType} · ` prefix renders only when `selectedEntity.filerType` is truthy.
7. Overview level: after the Timeline + Funding Sources grid, add `{!selectedEntity && <LateFilingsSection data={late} />}` (the component self-hides for SF via `targets === null`).
8. Sidebar fallback (the verify-pass Important): compute `const ungrouped = !isSF` and render:
```tsx
                {ungrouped ? (
                  <>
                    <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-400/60 mb-2">
                      Filers ({(searchFilter ? cfData.topRecipients.filter((r) => r.filer_name.toLowerCase().includes(searchFilter.toLowerCase())) : cfData.topRecipients).length})
                    </p>
                    <div className="space-y-0.5 mb-4">
                      {(searchFilter ? cfData.topRecipients.filter((r) => r.filer_name.toLowerCase().includes(searchFilter.toLowerCase())) : cfData.topRecipients).map((r) => (
                        <FilerRow key={r.filer_nid} filer={r} maxTotal={maxFilerTotal}
                          isSelected={selectedEntity?.filerNid === r.filer_nid}
                          onSelect={() => handleSelectFiler(r)} />
                      ))}
                    </div>
                  </>
                ) : (
                  <> ...the existing three Candidates/Measures/Committees sections, unchanged... </>
                )}
```
(Extract the filtered list into a `const filteredFilers = useMemo(...)` if the duplication reads poorly — implementer's choice, both acceptable.)
9. Footer attribution:
```tsx
        {isSF
          ? <>Source: SF Ethics Commission via data.sfgov.org (dataset pitq-e56w). Local filings only — state-level FPPC/CAL-ACCESS filings not included. Figures may differ from statewide totals reported by news organizations.</>
          : <>Source: City of Oakland FPPC filings via data.oaklandca.gov (view reads Sch A, Sch E, 496, 497 of 16 published sets). Local filings only — state CAL-ACCESS filings not included.</>}
```

- [ ] **Verify:** `npx tsc -b` clean; `npx vitest run src/views/CampaignFinance` PASS; `grep -n "SF_ELECTIONS" src/views/CampaignFinance/CampaignFinance.tsx` → zero hits.

- [ ] **Commit**

```bash
git add src/hooks/useLateFilings.ts src/views/CampaignFinance src/components/charts/FundingSourcesChart.tsx
git commit -m "feat(oakland): Campaign Finance live — city cycles, sidebar fallback, LateFilingsSection, PTY label"
```

---

### Task 9: Liveness flip + ⌘K correction + re-pins

**Files:**
- Modify: `src/cities/oakland/manifest.ts`
- Modify: `src/components/search/useOmniSearch.test.ts`

**Interfaces:**
- Consumes: nothing new — the stage-3 liveness machinery (`liveManifest`/`isViewLive`) does all the work.
- Produces: both Oakland views publicly routable (URL-only — nav/⌘K appear on `/oakland/*` routes; SF chrome unchanged).

- [ ] **Step 1: Re-pin the omni test FIRST (failing)** — in `src/components/search/useOmniSearch.test.ts`, rewrite the oakland block (title + counts):

```ts
  it('oakland index: 4 LIVE view rows + 59 beat places landing on the crime view + 7 live-claimed datasets', () => {
    const oak = buildSearchIndex('oakland')
    // ...existing byCat helper usage unchanged...
    expect(byCat('view')).toHaveLength(4)
    expect(byCat('place')).toHaveLength(59)
    // dataset rows: crime 1 + 311 1 + citations 1 + campaign-finance 4
    expect(byCat('dataset')).toHaveLength(7)
    expect(oak).toHaveLength(70)
    for (const r of oak) expect(r.path.startsWith('/oakland'), r.id).toBe(true)
  })
```
(Keep the existing place-row assertion for `'01X'` → `/oakland/crime-incidents` exactly as it is — beat places still land on crime.)

Run: `npx vitest run src/components/search/useOmniSearch.test.ts` → FAIL (still 2 views / 63 rows).

- [ ] **Step 2: Flip the manifest** — in `src/cities/oakland/manifest.ts`:
  - Delete the `dormant: true,` line from BOTH the `parking-citations` and `campaign-finance` entries.
  - Change campaign-finance's keys line to `omniDatasetKeys: ['fppcSchA', 'fppcSchE', 'fppc496', 'fppc497'],` and replace its comment with: `// ⌘K claims the four sets the view READS. fppc460Summary is deliberately absent — its amount_a is cumulative-ish (10–20× transaction sums; summing it fabricates money).`
  - Update the file-header comment: all four entries are now live; stage-4 note (homeCard/underlayPreset absent until the Home doorway) stays.

- [ ] **Step 3: Verify no stale redirect row** — `grep -n "parking-citations\|campaign-finance" src/cities/oakland/index.ts` → confirm `redirects` contains NO row for either slug (their pre-flip protection was the `entry.dormant` skipSync clause, now correctly gone).

- [ ] **Step 4: Full suite + types**

Run: `npx vitest run && npx tsc -b`
Expected: ALL suites green — the per-city iterating suites (era integrity, registry, manifest) accept the flip as authored; the omni re-pin from Step 1 now passes.

- [ ] **Step 5: Commit**

```bash
git add src/cities/oakland/manifest.ts src/components/search/useOmniSearch.test.ts
git commit -m "feat(oakland): flip parking-citations + campaign-finance LIVE; correct CF omni keys to the read set"
```

---

### Task 10: Docs — data-insights Oakland additions + spec as-built sync

**Files:**
- Modify: `docs/data-insights.md` (the `## Oakland` section from stage 3)
- Modify: `docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md` (as-built deltas only, if any emerged)

- [ ] **Step 1: Append to data-insights → Oakland** two subsections (adapt heading levels to the section's existing style):

**Parking citations (58em-y96b):** the beat column is a computed REGION (integer ids → crosswalk `OAK_CITATION_BEAT_REGIONS`, regenerable from `fus4-casw`; 94.8% coverage, unmatched share disclosed in-view); `violatio_1` carries a 10-char truncation era (~2M rows — "NON DISPLA" = "NON DISP PKG RECEIPT"), so the view groups/filters the clean `violation` CODE with authored labels; `ticket_i_1` mixes three time formats + 18,856 NULLs (lexicographic hour ranges INVALID — `OAK_HOUR_EXPR` buckets + `bucketToHour`, residual counted and disclosed; NULL group arrives from Socrata as a MISSING key, not a null string); `the_geom` is 100% populated (no SF-style geo gap) but publishing lags ~11 weeks; no plate-state column (OOS card withheld); 51,977 zero-dollar fines (~1.9%) are ordinary voided/dismissed citations.

**Campaign finance (FPPC sets):** the view reads Sch A + Sch E + 496 + 497 of the 16 registered sets. `fppc496` uses `exp_date` (sibling-divergent — `expn_date` 400s). Sch E has 1,553 NULL-date rows ($3.39M, 5.3%) invisible to date filters — disclosed in-view. `tran_self` is lowercase text `'y'`/`'n'` (`=true` is a 400). 460 summaries' `amount_a` is cumulative-ish (10–20× transaction sums) — never sum it as money. No `filer_type` column exists (SF's sidebar categorization is withheld; single Filers list). Oakland cycles TILE (each starts the day after the prior election) because pre-window fundraising is the norm — a Jan-1 convention undercut Taylor ~$50K vs Lee in the Apr 2025 special.

- [ ] **Step 2: Spec as-built pass** — re-read the spec against what shipped; append an "As-built deltas" note only where implementation diverged (target: none).

- [ ] **Step 3: Commit**

```bash
git add docs/data-insights.md docs/superpowers/specs/2026-08-06-oakland-stage3b-views-design.md
git commit -m "docs(oakland): stage-3b data traps — citations vocab/time/beats, FPPC field quirks, tiling cycles"
```

---

## Whole-branch verification gate (controller runs after all tasks; two-sided, spec §5)

1. `caffeinate -i ~/dev/devman/tools/devman-build.mjs pnpm build` — clean (tsc -b strict + vite).
2. `npx vitest run` — entire suite green.
3. `vite preview` walk — **SF zero-visible-change:** `/parking-citations` + `/campaign-finance` render identically (cards, cycle pills, sidebar sections); **Oakland live:** `/oakland/parking-citations` (dots render, ~11-week freshness alert, beat ranking labeled "Beat NNX", violation filter shows authored labels + 5 groups, heatgrid/Peak Hour/TOD agree, disclosures present) and `/oakland/campaign-finance` (Apr 2025 default cycle, recognizable filers, single Filers sidebar with working search, LateFilingsSection shows for AND against money, null-date note).
4. Whole-lifetime network assertion on both Oakland routes: zero SF-resolved requests (DEV tripwire console + devtools network filter `sfgov`).
5. Controller live spot-checks (≥3): one beat's citation count vs a direct SoQL curl; one Sch A cycle total; the 496 oppose total for a top target.

## Self-review notes (writing-plans checklist, applied)

- **Spec coverage:** every spec §1/§2 item maps to Tasks 1–8; §3 → Task 9; §4 tests → Tasks 1/2/3/4/9; §5 → the gate above; the three pinned plan-probe values are inlined (Task 1 literals, Task 4 `tran_self`, Task 8 PTY).
- **Type consistency:** `bucketToHour(bucket: string | undefined): number | null` is identical in Tasks 1/2/6; `FppcQuerySpec`/`FppcQueryBuilders` identical in Tasks 4/5/8; `selectedNeighborhood` holds the beat CODE everywhere (Tasks 1/7); `HourlyPatternResult.unparsedCount` produced in Task 2, consumed in Task 7.
- **Known judgment calls carried into dispatches:** the `useCivicIndicators` gate in Task 7 site 13 says "reuse whatever CrimeIncidents.tsx does, exactly" — the implementer must READ that file first; same for the `byCat` helper name in Task 9 Step 1 (match the test file's actual helper).






