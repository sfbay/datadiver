import type { RawDatasetConfig } from '../types'

/**
 * Oakland dataset registry — stage 2 of the Oakland expansion. Same
 * conventions as sf/datasets.ts: honesty caveats live in comment blocks
 * above entries; `name`/`description` are reader-facing Oakland voice.
 * Probe facts (row counts, spans, traps) measured 2026-08-04/05:
 * docs/superpowers/specs/2026-08-05-oakland-data-spine-design.md.
 */
export const OAKLAND_DATASETS_RAW: Record<string, RawDatasetConfig> = {
  // OPD's full incident history in ONE extract (no SF-style two-extract
  // seam). Publishes a ~1,400-row junk trickle 1950→2003 — real data
  // starts Aug 2004 (era clamp floor 2004, disclosed in About).
  // Geo `location` point: 95.4% all-time / 96.0% 2024+. Beat joins:
  // `policebeat` is zero-padded ('01X') and matches the beats asset's
  // `nhood`; the beats layer's OTHER id column (`cp_beat`, unpadded
  // '4X') silently loses ~32% of rows — never join through it. Even the
  // correct join leaves ~4.8% unmapped: '77X' (34,898 rows) and '99X'
  // (8,311) are out-of-beat codes with NO polygon, plus NULLs and a
  // malformed tail — beat rollups must disclose the unmapped share. The
  // separate 90-day view ym6k-rx7a is NOT a subset (81 exclusive rows)
  // — never union them.
  policeIncidents: {
    id: 'ppgh-7dqv',
    name: 'OPD Incident Reports',
    description: 'Oakland police incidents with crime type and police beat, 2004–present',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'location',
    defaultSort: 'datetime DESC',
    dateField: 'datetime',
    cacheTTL: 10 * 60_000, // 10 min — updated daily, ~3-day publish lag
  },
  // Same-day fresh; `datetimeclosed` supports resolution-time analytics.
  // COORDINATE TRAP: `reqaddress` is a location column whose lat/lng is
  // frequently junk (observed 30°N, −141°W); the authoritative coords
  // are `srx` (lng) / `sry` (lat) — numeric columns serialized as
  // strings over the JSON API, ~98% populated. hasGeo stays false —
  // there is no trustworthy Socrata point column; a stage-3 view must
  // assemble coords from srx/sry itself. Beat field `beat` ('26Y',
  // zero-padded).
  cases311: {
    id: 'quth-gb8e',
    name: '311 Service Requests',
    description: 'Oakland 311 requests — illegal dumping, blight, streets — with open and close times',
    category: 'other',
    hasGeo: false,
    defaultSort: 'datetimeinit DESC',
    dateField: 'datetimeinit',
    cacheTTL: 10 * 60_000, // 10 min — publishes continuously, same-day fresh
  },
  // Clean 2018→present span (the audit-era "junk 1951→2044" no longer
  // reproduces) but runs ~2.5 months behind. `ticket_iss` is DATE-ONLY;
  // time of day lives in `ticket_i_1` as 'HH:MM' text. The only Oakland
  // event set carrying a neighborhood computed region.
  parkingCitations: {
    id: '58em-y96b',
    name: 'Parking Citations',
    description: 'Oakland parking citations with violation, fine amount, and location',
    category: 'transportation',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'ticket_iss DESC',
    dateField: 'ticket_iss',
    cacheTTL: 30 * 60_000, // 30 min — publishes ~2.5 months behind
  },

  // ── FPPC campaign finance (16 sets) ──────────────────────────────────
  // All *updated* daily but the DATA moves in semi-annual filing lumps —
  // months-old max dates are NORMAL here, not staleness. Row counts sum
  // to 238,167 (2026-08-05). CAL-format date fields are inconsistent by
  // design: tran_date / expn_date / loan_date1 / ctrib_date — and
  // fppc496 alone uses `exp_date` (no n). fppcSchB2 is published EMPTY.
  fppc460Summary: {
    id: 'rsxe-vvuw',
    name: 'Campaign Filing Summaries (460)',
    description: 'FPPC Form 460 summary totals per filing — the roll-up over every schedule',
    category: 'other',
    hasGeo: false,
    defaultSort: 'rpt_date DESC',
    dateField: 'rpt_date', // summary grain — the filing date IS the event
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchA: {
    id: '3xq4-ermg',
    name: 'Campaign Contributions (Sch. A)',
    description: 'Itemized monetary contributions to Oakland committees — FPPC Form 460 Schedule A',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchB1: {
    id: 'qaa7-q29f',
    name: 'Campaign Loans Received (Sch. B1)',
    description: 'Loans received by Oakland committees — FPPC Form 460 Schedule B1',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  // Published EMPTY (0 rows as of Aug 2026) — registered for roster
  // completeness; a consumer should expect zero rows, not error.
  fppcSchB2: {
    id: '4fu2-d832',
    name: 'Campaign Loan Guarantors (Sch. B2)',
    description: 'Loan guarantors for Oakland committees — FPPC Form 460 Schedule B2',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchC: {
    id: 'ba44-jqtm',
    name: 'Non-Monetary Contributions (Sch. C)',
    description: 'In-kind contributions to Oakland committees — FPPC Form 460 Schedule C',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchD: {
    id: 'x5eg-xkea',
    name: 'Support/Oppose Expenditures (Sch. D)',
    description: 'Expenditures supporting or opposing other candidates and measures — FPPC Form 460 Schedule D',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchE: {
    id: 'bvfu-nq99',
    name: 'Campaign Payments (Sch. E)',
    description: 'Payments made by Oakland committees — FPPC Form 460 Schedule E',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchF: {
    id: '9gcg-vghr',
    name: 'Accrued Expenses (Sch. F)',
    description: 'Unpaid bills accrued by Oakland committees — FPPC Form 460 Schedule F',
    category: 'other',
    hasGeo: false,
    defaultSort: 'rpt_date DESC',
    dateField: 'rpt_date', // no event-grain date on this schedule
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchG: {
    id: 'xuui-k2nt',
    name: 'Payments by Agents (Sch. G)',
    description: 'Payments made by agents or contractors on behalf of Oakland committees — FPPC Form 460 Schedule G',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchH: {
    id: 'qunm-zyau',
    name: 'Loans Made to Others (Sch. H)',
    description: 'Loans made by Oakland committees to others — FPPC Form 460 Schedule H',
    category: 'other',
    hasGeo: false,
    defaultSort: 'loan_date1 DESC',
    dateField: 'loan_date1',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppcSchI: {
    id: 'jft9-u9bd',
    name: 'Misc. Cash Increases (Sch. I)',
    description: 'Miscellaneous increases to cash for Oakland committees — FPPC Form 460 Schedule I',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc461: {
    id: 'ub5g-m92u',
    name: 'Major Donor & IE Reports (461)',
    description: 'FPPC Form 461 — major donor and independent expenditure committee reports',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc465: {
    id: '6ejr-39gh',
    name: 'Supplemental IE Reports (465)',
    description: 'FPPC Form 465 — supplemental independent expenditure reports',
    category: 'other',
    hasGeo: false,
    defaultSort: 'expn_date DESC',
    dateField: 'expn_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  // NOTE: this schedule alone uses `exp_date` — NOT `expn_date` like its
  // siblings. A copy-pasted expn_date here 400s at query time.
  fppc496: {
    id: 'jkj3-8yq3',
    name: 'Late Independent Expenditures (496)',
    description: 'FPPC Form 496 — independent expenditures reported within 90 days of an election',
    category: 'other',
    hasGeo: false,
    defaultSort: 'exp_date DESC',
    dateField: 'exp_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc496Contribs: {
    id: 'eted-3m9d',
    name: 'Late IE Contributions (496 pt. 2)',
    description: 'FPPC Form 496 part 2 — contributions received by late-IE filers',
    category: 'other',
    hasGeo: false,
    defaultSort: 'tran_date DESC',
    dateField: 'tran_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
  fppc497: {
    id: 'qact-u8hq',
    name: 'Late Contributions (497)',
    description: 'FPPC Form 497 — contributions of $1,000+ reported within 90 days of an election',
    category: 'other',
    hasGeo: false,
    defaultSort: 'ctrib_date DESC',
    dateField: 'ctrib_date',
    cacheTTL: 60 * 60_000, // 60 min — daily update cadence, filing-lump data
  },
}
