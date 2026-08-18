/**
 * build-consultant-recon.ts
 *
 * Generator for the committed SF campaign-consultant reconciliation artifact
 * (`public/data/consultants/reconciliation.json`) — the data groundwork behind a
 * future Consultants lens inside CampaignFinance.
 *
 * WHAT IT DOES. Pulls the SFEC campaign-consultant e-filing family live from
 * DataSF, enforces the recon memo's structural invariants as gates that refuse
 * to write on failure, applies the two committed hand-authored crosswalks
 * (`src/cities/sf/consultants/`), and reconciles each consultant's self-reported
 * client receipts against the recipient committee's OWN Schedule E in
 * `pitq-e56w`. Both sides are published ledgers; neither is the referee. The
 * point of the artifact is the DISAGREEMENT — where a committee reports paying a
 * consultant money the consultant never reported receiving, and vice versa.
 *
 * GATES (any failure → exit 1, nothing written):
 *   G1 join integrity      0 child rows whose envelope_id is not in the parent
 *   G2 dedupe              latestPerSeries(parent).length === distinct(filingseries)
 *   G3 conservation        Σ child amount === parent declared total, per envelope
 *   G4 identity            every raw consultant name resolves; every distinct
 *                          clientlist_clientname has exactly one crosswalk entry
 *   G5 exclusion           the two junk envelopes exist, are removed BEFORE any
 *                          receipt or rollup is computed, and appear nowhere in
 *                          the computed output
 *
 * REDACTION IS STRUCTURAL, not a filter applied at the end: `PROJECTION` (the
 * parent `$select`) omits every phone, street-address and full-address column,
 * the contributions projection omits the contributor address block, and the
 * employees table `gjyg-9whd` — 75 named private individuals — is never fetched
 * at all. Consultant location is kept at city + state only, and authored
 * `reason`/`evidence` strings describe a junk filer's address rather than
 * reproducing it. `src/lib/consultants/reconciliation.test.ts` pins this by
 * walking every key AND every string value in the emitted JSON.
 *
 * The claim is about what THIS artifact carries, and stops there. Each filing's
 * `docusignUrl` points at the signed PDF on SFEC's own storage, which does
 * contain the filer's contact details — that document is the city's publication,
 * linked here exactly as SFEC publishes it, not redacted by us and not copied
 * into the artifact.
 *
 * DATE HANDLING. DataSF datetimes are floating SF-local strings with no offset.
 * Every comparison and every deadline in this file is done on the 'YYYY-MM-DD'
 * prefix as a STRING, or with `Date.UTC` arithmetic on the parsed parts — never
 * `Date.parse` on the raw value, which would read the host timezone and shift
 * a signature across midnight on a non-Pacific machine (the cron runs TZ=UTC).
 *
 * Module scope stays side-effect-free: the test imports `ARTIFACT_PATH` and
 * `PROJECTION` from here; `main()` only runs under the CLI entry guard.
 *
 * Run:  pnpm build:consultants        (needs network; ~2 min, ~60 SODA requests)
 *       VITE_SOCRATA_APP_TOKEN is read from the environment if present.
 */

import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { pathToFileURL } from 'node:url'
import {
  amt,
  collapseRestatements,
  latestPerSeries,
  normalizeName,
} from '../src/lib/consultants/normalize.js'
import { matchContributions, reconcile } from '../src/lib/consultants/reconcile.js'
import type {
  ClientRow,
  ContributionMatch,
  ContributionRow,
  ParentRow,
  PitqExpRow,
  PitqRcptRow,
  Receipt,
  ReconPair,
  Restatement,
} from '../src/lib/consultants/types.js'
import {
  CONSULTANT_ALIASES,
  EXCLUDED_ENVELOPES,
} from '../src/cities/sf/consultants/consultantAliases.js'
import type { ConsultantAlias } from '../src/cities/sf/consultants/consultantAliases.js'
import {
  DUPLICATE_ENVELOPES,
  PERIOD_OVERRIDES,
} from '../src/cities/sf/consultants/overrides.js'
import { CLIENT_CROSSWALK } from '../src/cities/sf/consultants/clientCrosswalk.js'
import type { ClientConfidence, ClientEntry } from '../src/cities/sf/consultants/clientCrosswalk.js'

// ── Constants the test imports ──────────────────────────────────────────────

/** Repo-relative path of the committed artifact. */
export const ARTIFACT_PATH = 'public/data/consultants/reconciliation.json'

/**
 * The parent `$select` projection. Every phone / streetaddress / fulladdress /
 * employertelephone column of `iv34-5p9x` is absent BY CONSTRUCTION — this list
 * is the redaction rule, not a downstream filter. Unprojected, the parent is 45
 * columns of addresses and phone numbers for 56 Person-type filers whose
 * "business address" is usually a home address.
 */
export const PROJECTION: string[] = [
  'envelope_id',
  'filingseries',
  'datesigned',
  'filinginformation_reporttype',
  'filinginformation_filingtype',
  'filinginformation_originalfilingdate',
  'filinginformation_descriptionofamendment',
  'filinginformation_reportingperiod_reportingperiodstartdate',
  'filinginformation_reportingperiod_reportingperiodenddate',
  'campaignconsultantname',
  'typeofcampaignconsultant',
  'campaignconsultantbusinessaddress_city',
  'campaignconsultantbusinessaddress_state',
  'clientinformation_hasclients',
  'clientinformation_total',
  'politicalcontributions_subtotalofitemizedcontributions',
  'politicalcontributions_totalunitemizedcontributions',
  'politicalcontributions_totalcontributions',
  'giftsmadetolocalofficeholders_total',
  'vendorsandsubvendors_total',
  'citycontracts_hascitycontracts',
  'cityappointments_hascityappointments',
  'employmentoflocalofficeholdersandcityemployees',
  'docusign_filing',
  ':created_at',
]

/** Client child table `m75g-xpci` — the whole table is five columns, none of them PII. */
const CLIENT_PROJECTION = [
  'envelope_id',
  'entry_id',
  'filingseries',
  'clientlist_clientname',
  'clientlist_economicconsiderationreceived',
]

/**
 * Contributions child `7gkm-68qf`, with the six-column contributor address block
 * (`contributionlist_addressofcontributor_*`) deliberately omitted.
 */
const CONTRIBUTION_PROJECTION = [
  'envelope_id',
  'entry_id',
  'filingseries',
  'contributionlist_contrecipientname',
  'contributionlist_nameofcontributororclient',
  'contributionlist_amountofcontribution',
  'contributionlist_dateofcontribution',
  'contributionlist_sourceofthecontribution',
  'contributionlist_nameofcandidateormeasure',
]

/** `pitq-e56w` expenditure projection — payee name parts, amounts, dates, keys. */
const PITQ_EXP_PROJECTION = [
  'filer_nid',
  'filer_name',
  'form_type',
  'record_type',
  'transaction_code',
  'transaction_amount_1',
  'calculated_amount',
  'transaction_date',
  'filing_date',
  'start_date',
  'end_date',
  'filing_nid',
  'transaction_id',
  'g_from_ef',
  'transaction_last_name',
  'transaction_first_name',
]

const HOST = 'https://data.sfgov.org'
const DS = {
  parent: 'iv34-5p9x',
  clients: 'm75g-xpci',
  contributions: '7gkm-68qf',
  pitq: 'pitq-e56w',
  filers: '4c8t-ngau',
} as const

/** The family's first real reporting quarter; also the pitq `filing_date` floor. */
const ERA_START = '2024-09-01'

/**
 * Alternative names to try when a consultant's own political contribution is
 * itemized in the recipient's ledger under a name that is not the registered
 * one. `matchContributions` tries the contributor name first and these second,
 * and every hit still has to agree to the cent and to within 30 days — the
 * names below only decide WHICH rows are eligible, never whether they match.
 *
 * Two kinds, each with its evidence:
 *   principal      the firm's money is itemized under the person who signs the
 *                  cheque. The first four are transcribed VERBATIM from the
 *                  recon memo §4 ("4 on the firm's principal rather than the
 *                  firm (Julie Edwards/MJE, Dan Newman/The Media Company, Noah
 *                  Finneburgh/The Message Department, Chak Hang Li/Proverb)").
 *                  Anderson Political is the memo's story #3 ("Anderson →
 *                  McCoy, Gee"), which counted those rows as found.
 *   filed-name     the same person, spelled differently on the two forms
 *                  (a nickname). NOT a fuzzy rule — one authored row per
 *                  observed pair, because a bare-surname rule would happily
 *                  match a different contributor with the same surname (the
 *                  'Josh Kelly vs Margaux Kelly' trap the alias table warns
 *                  about).
 *
 * `matched: 'principal'` is the artifact's label for both kinds; the union is
 * fixed by src/lib/consultants/types.ts.
 */
const CONTRIBUTOR_NAME_VARIANTS: { consultant: string; kind: 'principal' | 'filed-name'; names: string[]; evidence: string }[] = [
  {
    consultant: 'MJE Strategies LLC',
    kind: 'principal',
    names: ['Julie Edwards'],
    evidence: 'Recon memo §4 — Stephen Torres for Supervisor 2024 itemizes the $500 under Julie Edwards.',
  },
  {
    consultant: 'The Media Company LLC',
    kind: 'principal',
    names: ['Dan Newman'],
    evidence: 'Recon memo §4 — Theo Ellington for Supervisor 2026 itemizes the $500 under Dan Newman.',
  },
  {
    consultant: 'The Message Department, LLC',
    kind: 'principal',
    names: ['Noah Finneburgh'],
    evidence: 'Recon memo §4 — Theo Ellington for Supervisor 2026 itemizes the $100 under Noah Finneburgh.',
  },
  {
    consultant: 'Proverb Strategy Advisors',
    kind: 'principal',
    names: ['Chak Hang Li'],
    evidence: 'Recon memo §4 — Natalie Gee for Supervisor 2026 itemizes the $100 under Chak Hang Li.',
  },
  {
    consultant: 'Anderson Political',
    kind: 'principal',
    names: ['Daniel Anderson'],
    evidence:
      "Recon memo §6 story 3 counts 'Anderson → McCoy, Gee' among the corroborated self-dealing rows. pitq-e56w carries 'Daniel Anderson' for each of the three: Aaron Peskin for Mayor 2024 $350 on 2024-10-27, Gary Mc Coy for Supervisor 2026 $500 on 2025-12-10, Natalie Gee for Supervisor 2026 $500 on 2025-12-14 — same day, same cent as the consultant's own report. Two other Andersons (Lisa, Paul) give $500 to the same committees on OTHER dates, which is why this is an authored row and not a surname rule.",
  },
  {
    consultant: 'Margaret Heisler',
    kind: 'filed-name',
    names: ['Meg Heisler'],
    evidence:
      "Nickname, same person: Aaron Peskin for Mayor 2024 itemizes 'Meg Heisler' $250 on 2024-10-27, the date and cent this registrant reports. Counted among the recon memo §4 exact matches.",
  },
  {
    consultant: 'Zach Lipton',
    kind: 'filed-name',
    names: ['Zachary Lipton'],
    evidence:
      "Nickname, same person: Fair Housing itemizes 'Zachary Lipton' $300 on 2026-06-24, the date and cent this registrant reports.",
  },
]

// ── Artifact shape ──────────────────────────────────────────────────────────

export interface ArtifactSource {
  id: string
  name: string
  rowsUpdatedAt: string
  rowCount: number
}

export interface ArtifactProvenance {
  generatedAt: string
  generator: string
  sources: ArtifactSource[]
  /** The parent `$select` list — the redaction rule, published as evidence. */
  projection: string[]
  redaction: string
  recipes: {
    latestRule: string
    restatement: string
    schE: string
    undated: string
    pitqFloor: string
    contributions: string
    exclusion: string
    overrides: string
  }
  /** filer_nid → MAX(filing_date) in pitq-e56w: how far the committee side is filed. */
  committeeCompleteThrough: Record<string, string>
}

export interface ArtifactGates {
  orphans: number
  latestCount: number
  distinctSeries: number
  conservationMismatches: number
  unmappedConsultants: string[]
  unmappedClients: string[]
  /**
   * Envelopes that DECLARE client money on the parent and publish zero child
   * rows. Disclosed, never a failure — SGR's $403,889.62 Sep–Nov 2024 filing is
   * a real published gap in SFEC's own data, and hiding it would be the lie.
   */
  parentOnlyEnvelopes: {
    envelope: string
    consultant: string
    declaredTotal: number
    reportType: string
    periodStart: string
  }[]
  /** Consultant ids absent from the previously committed artifact — new filers, or a crosswalk drift. */
  newConsultantIds: string[]
  supersededEnvelopes: number
  restatementsCollapsed: number
  blankClientRows: number
  excludedEnvelopes: number
  duplicateEnvelopes: number
  periodOverrides: number
  uncorrectablePeriods: number
  /** Same consultant, report type and period filed under >1 envelope; each must be authored. */
  duplicateGroupsDetected: number
  /** Advisory only: same consultant + report type signed the same day. Legitimate for catch-up filers. */
  sameDayFilings: { consultantId: string; reportType: string; datesigned: string; envelopes: string[] }[]
}

export interface ArtifactRegistration {
  year: string
  reportType: string
  datesigned: string
  envelope: string
  docusignUrl?: string
}

export interface ArtifactQuarterly {
  periodStart: string
  periodEnd: string
  /** Present when an authored PERIOD_OVERRIDE moved this filing's impossible period. */
  periodCorrected?: true
  originalPeriodStart?: string
  originalPeriodEnd?: string
  /** Present when the period is impossible as filed and NO correction was determinate. */
  periodImpossible?: true
  datesigned: string
  /** Statutory due date (weekend roll-forward only), or null when the period is off-calendar. */
  deadline: string | null
  /** Calendar days between deadline and signature; negative = filed early. */
  daysLate: number | null
  envelope: string
  docusignUrl?: string
}

export interface ArtifactReceipt {
  clientString: string
  clientClass: string
  clientConfidence: ClientConfidence
  filerNid: string | null
  filerName?: string
  periodStart: string
  periodEnd: string
  /** Present when this receipt's reporting window came from an authored PERIOD_OVERRIDE. */
  periodCorrected?: true
  /** Present when the window is impossible as filed and no correction was determinate. */
  periodImpossible?: true
  reportType: string
  envelope: string
  reported: number
}

export type ArtifactPair = ReconPair & {
  clientStrings: string[]
  clientConfidence: ClientConfidence
}

export interface ArtifactConsultant {
  id: string
  displayName: string
  resolvedBy: 'alias' | 'mechanical'
  rawNames: string[]
  kind?: 'hand' | 'inferred-dba'
  payeePatterns: string[]
  payeeScope?: 'own-clients'
  city?: string
  state?: string
  registrations: ArtifactRegistration[]
  quarterlies: ArtifactQuarterly[]
  receipts: ArtifactReceipt[]
  reconciliation: ArtifactPair[]
  contributions: ContributionMatch[]
  restatementsCollapsed: Restatement[]
  totals: { reported: number; reconciledReported: number; schE: number; schG: number }
}

/** Authored envelope-level corrections, published alongside the figures they change. */
export interface ArtifactOverrides {
  duplicates: {
    envelope: string
    duplicateOf: string
    reason: string
    /** Parent-declared total on the dropped envelope. */
    droppedTotal: number
    /** Child-row money actually removed — the figure the subtraction chain uses. */
    droppedChildSum: number
  }[]
  periods: {
    envelope: string
    consultantId: string
    displayName: string
    originalStart: string
    originalEnd: string
    correctedStart: string
    correctedEnd: string
    datesigned: string
    reported: number
    reason: string
  }[]
  /** Impossible periods left exactly as filed because no correction is determinate. */
  uncorrectable: {
    envelope: string
    consultantId: string
    displayName: string
    periodStart: string
    periodEnd: string
    datesigned: string
    reported: number
    reason: string
  }[]
}

export interface ReconciliationArtifact {
  provenance: ArtifactProvenance
  gates: ArtifactGates
  overrides: ArtifactOverrides
  consultants: ArtifactConsultant[]
  committees: {
    filerNid: string
    filerName?: string
    /** MAX(filing_date) over this committee's Schedule E filings only. */
    completeThrough?: string
    /** False when the committee files no Schedule E at all — there is no payee ledger to compare. */
    hasScheduleE: boolean
    consultants: { id: string; reported: number; schE: number; schG: number }[]
  }[]
  /** Client strings that carry money but resolve to no SF Ethics filer_nid. */
  unresolvedClients: { clientString: string; class: string; reported: number }[]
  excluded: { envelope: string; reason: string; reportedTotal: number }[]
  totals: {
    /**
     * Sum of EVERY child client row as published, before any exclusion, duplicate
     * drop or restatement collapse. Publishing it makes the whole subtraction
     * chain checkable from the artifact alone:
     *   childReportedRaw
     *     − Σ excluded[].reportedTotal
     *     − Σ overrides.duplicates[].droppedChildSum
     *     − Σ consultants[].restatementsCollapsed[].droppedChildSum
     *   === reportedAll
     */
    childReportedRaw: number
    reportedAll: number
    reportedReconcilable: number
    schE: number
    schG: number
    receipts: number
    pairs: number
    contributionsMatched: number
    contributionsTotal: number
  }
  calendar: {
    quarterlyDue: string[]
    periodStarts: string[]
    rollForward: string
    reregistrationDue: string
    authorizationDays: number
    terminationDays: number
  }
}

// ── Small helpers ───────────────────────────────────────────────────────────

const round2 = (n: number): number => Math.round(n * 100) / 100
const pad2 = (n: number): string => String(n).padStart(2, '0')
/** 'YYYY-MM-DD' prefix of a floating DataSF datetime. Never `Date.parse`. */
const dpx = (s: string | undefined | null): string => (s ? s.slice(0, 10) : '')
const money = (n: number): string =>
  n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })

function sqlQuote(s: string): string {
  return `'${s.replace(/'/g, "''")}'`
}

/**
 * Loose key used for RECIPIENT lookup ONLY: upper-case with every non-alphanumeric
 * run folded to one space. A consultant types the recipient committee's name by
 * hand into their own form, so it arrives punctuated differently from the
 * registry — 'Term Limits Now, Yes on B' against the registered 'Term Limits Now
 * - Yes on B!' — and `normalizeName` keeps hyphens, exclamation marks and curly
 * apostrophes. Mechanical only, never token fuzz, and a hit is merely a
 * CANDIDATE: it still has to survive the amount-to-the-cent, ±30-day and
 * contributor-name tests inside `matchContributions` before anything counts.
 */
function looseName(raw: string): string {
  return (raw ?? '').toUpperCase().replace(/[^A-Z0-9]+/g, ' ').trim()
}

/** SoQL LIKE → RegExp, mirrored client-side so per-pattern attribution needs no extra requests. */
function likeToRegex(pattern: string): RegExp {
  const escaped = pattern.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  return new RegExp(`^${escaped.replace(/%/g, '.*').replace(/_/g, '.')}$`)
}

/**
 * Whether a pitq row matches a payee pattern the way the server does: the
 * pattern is applied to `upper(transaction_last_name)` AND to
 * `upper(transaction_first_name || ' ' || transaction_last_name)`. The second
 * form is load-bearing — Margaux Kelly's 80 rows carry 'Kelly' in the last-name
 * column with 'Margaux' in the first-name column, which a last-name-only query
 * can only reach through a bare '%KELLY%' that also drags in an unrelated Josh
 * Kelly. SQL `||` yields NULL if either side is NULL, so the concatenated form
 * is only a candidate when both parts are present.
 */
function payeeRowMatches(re: RegExp, row: { transaction_last_name?: string; transaction_first_name?: string }): boolean {
  const last = (row.transaction_last_name ?? '').toUpperCase()
  if (row.transaction_last_name != null && re.test(last)) return true
  if (row.transaction_first_name != null && row.transaction_last_name != null) {
    if (re.test(`${row.transaction_first_name} ${row.transaction_last_name}`.toUpperCase())) return true
  }
  return false
}

/** The SoQL disjunction for one consultant's payee patterns, over both name forms. */
function payeeWhereClause(patterns: string[]): string {
  const clauses: string[] = []
  for (const p of patterns) {
    clauses.push(`upper(transaction_last_name) like ${sqlQuote(p)}`)
    clauses.push(`upper(transaction_first_name || ' ' || transaction_last_name) like ${sqlQuote(p)}`)
  }
  return `(${clauses.join(' OR ')})`
}

/**
 * Statutory quarterly deadline for a reporting period start, with weekend
 * roll-forward only (SF holidays are a later refinement, disclosed in the
 * artifact's `calendar.rollForward`). Periods start Dec 1 / Mar 1 / Jun 1 /
 * Sep 1 and are due Mar 15 / Jun 15 / Sep 15 / Dec 15 respectively; returns null
 * for any other period start.
 *
 * It does NOT — and must not — judge whether the period is plausible. A period
 * mis-keyed a year forward is still a valid Dec 1 start and gets a real (future)
 * deadline here. That whole class belongs to the PERIOD_OVERRIDES pass, which
 * either corrects the dates before this function ever sees them or marks the
 * filing `periodImpossible`, in which case the caller suppresses the deadline
 * entirely rather than publishing "362 days early".
 */
export function quarterlyDeadline(periodStart: string): string | null {
  const p = dpx(periodStart)
  if (!/^\d{4}-\d{2}-\d{2}$/.test(p)) return null
  const [y, m, d] = p.split('-').map(Number)
  if (d !== 1) return null
  const table: Record<number, [number, number]> = {
    12: [y + 1, 3],
    3: [y, 6],
    6: [y, 9],
    9: [y, 12],
  }
  const target = table[m]
  if (!target) return null
  const [dy, dm] = target
  const dow = new Date(Date.UTC(dy, dm - 1, 15)).getUTCDay()
  const day = dow === 6 ? 17 : dow === 0 ? 16 : 15
  return `${dy}-${pad2(dm)}-${pad2(day)}`
}

/** Same day and month, one year earlier ('YYYY-MM-DD'). Feb 29 falls back to Feb 28. */
export function shiftYearBack(day: string): string {
  const [y, m, d] = day.split('-').map(Number)
  const target = new Date(Date.UTC(y - 1, m - 1, Math.min(d, m === 2 ? 28 : d)))
  return `${target.getUTCFullYear()}-${pad2(target.getUTCMonth() + 1)}-${pad2(target.getUTCDate())}`
}

/**
 * The consultant quarter that had already closed on `signed` — the period a filer
 * signing that day is due to report. Quarters run Dec–Feb / Mar–May / Jun–Aug /
 * Sep–Nov. Used only to judge whether a one-year shift is the DETERMINATE
 * correction for an impossible period, never to rewrite dates on its own.
 */
export function lastClosedQuarter(signed: string): { start: string; end: string } | null {
  const y = Number(signed.slice(0, 4))
  const isLeap = (yy: number): boolean => (yy % 4 === 0 && yy % 100 !== 0) || yy % 400 === 0
  const candidates: { start: string; end: string }[] = []
  for (let yy = y - 2; yy <= y + 1; yy += 1) {
    candidates.push({ start: `${yy - 1}-12-01`, end: `${yy}-02-${isLeap(yy) ? 29 : 28}` })
    candidates.push({ start: `${yy}-03-01`, end: `${yy}-05-31` })
    candidates.push({ start: `${yy}-06-01`, end: `${yy}-08-31` })
    candidates.push({ start: `${yy}-09-01`, end: `${yy}-11-30` })
  }
  const closed = candidates.filter((c) => c.end < signed).sort((a, b) => a.end.localeCompare(b.end))
  return closed.length > 0 ? closed[closed.length - 1] : null
}

/** Calendar days from `from` to `to` ('YYYY-MM-DD' parts, UTC arithmetic). Positive = later. */
export function daysBetween(from: string, to: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(from) || !/^\d{4}-\d{2}-\d{2}$/.test(to)) return null
  const [ay, am, ad] = from.split('-').map(Number)
  const [by, bm, bd] = to.split('-').map(Number)
  return (Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86_400_000
}

function docusignUrl(v: ParentRow['docusign_filing']): string | undefined {
  if (!v) return undefined
  if (typeof v === 'string') return v
  return v.url
}

// ── SODA fetch ──────────────────────────────────────────────────────────────

const APP_TOKEN = process.env.VITE_SOCRATA_APP_TOKEN
let requestCount = 0

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms))

async function soda<T>(dataset: string, params: Record<string, string>, label: string): Promise<T[]> {
  const url = new URL(`${HOST}/resource/${dataset}.json`)
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v)

  const headers: Record<string, string> = { Accept: 'application/json' }
  if (APP_TOKEN) headers['X-App-Token'] = APP_TOKEN

  for (let attempt = 0; attempt < 2; attempt += 1) {
    await sleep(150)
    requestCount += 1
    const res = await fetch(url, { headers })
    if (res.ok) {
      const rows = (await res.json()) as T[]
      // A silently truncated page is the worst failure mode here: every total
      // downstream would be quietly low and every gate would still pass.
      const limit = params.$limit ? Number(params.$limit) : null
      if (limit !== null && rows.length >= limit) {
        throw new Error(
          `SODA ${dataset} [${label}] returned ${rows.length} rows at $limit=${limit} — the page is truncated; raise the limit or paginate`
        )
      }
      return rows
    }
    const retryable = res.status === 429 || res.status >= 500
    const body = await res.text().catch(() => '')
    if (!retryable || attempt === 1) {
      throw new Error(`SODA ${dataset} [${label}] ${res.status}: ${body.slice(0, 400)}`)
    }
    console.warn(`  retrying ${label} after ${res.status}`)
    await sleep(1500)
  }
  throw new Error(`unreachable: ${label}`)
}

/** Dataset metadata: `rowsUpdatedAt` (epoch seconds → ISO) plus a live `count(*)`. */
async function sourceMeta(id: string, name: string): Promise<ArtifactSource> {
  await sleep(150)
  requestCount += 1
  const metaRes = await fetch(`${HOST}/api/views/${id}.json`, {
    headers: APP_TOKEN ? { 'X-App-Token': APP_TOKEN } : {},
  })
  if (!metaRes.ok) throw new Error(`views/${id}.json ${metaRes.status}`)
  const meta = (await metaRes.json()) as { rowsUpdatedAt?: number }
  const counted = await soda<{ n: string }>(id, { $select: 'count(*) as n' }, `count ${id}`)
  return {
    id,
    name,
    rowsUpdatedAt: new Date((meta.rowsUpdatedAt ?? 0) * 1000).toISOString(),
    rowCount: Number(counted[0]?.n ?? 0),
  }
}

// ── Gates ───────────────────────────────────────────────────────────────────

const failures: string[] = []
function gate(ok: boolean, message: string): void {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${message}`)
  if (!ok) failures.push(message)
}

// ── Identity resolution ─────────────────────────────────────────────────────

interface ConsultantKey {
  id: string
  resolvedBy: 'alias' | 'mechanical'
  alias?: ConsultantAlias
}

function buildAliasIndex(): Map<string, ConsultantAlias> {
  const byNormalized = new Map<string, ConsultantAlias>()
  for (const alias of CONSULTANT_ALIASES) {
    for (const raw of alias.rawNames) {
      const key = normalizeName(raw)
      const existing = byNormalized.get(key)
      if (existing && existing.id !== alias.id) {
        throw new Error(
          `alias collision: normalized "${key}" claimed by both ${existing.id} and ${alias.id}`
        )
      }
      byNormalized.set(key, alias)
    }
  }
  return byNormalized
}

// ── main ────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const startedAt = Date.now()
  console.log('SFEC campaign-consultant reconciliation\n')

  // ---- 1. fetch the family ------------------------------------------------
  console.log('FETCH')
  const parentAll = await soda<ParentRow>(
    DS.parent,
    { $select: PROJECTION.join(','), $limit: '5000' },
    'parent'
  )
  const clientsAll = await soda<ClientRow>(
    DS.clients,
    { $select: CLIENT_PROJECTION.join(','), $limit: '5000' },
    'clients'
  )
  const contribsAll = await soda<ContributionRow>(
    DS.contributions,
    { $select: CONTRIBUTION_PROJECTION.join(','), $limit: '5000' },
    'contributions'
  )
  const filerRows = await soda<{ filer_nid: string; filer_name?: string }>(
    DS.filers,
    { $select: 'filer_nid,filer_name', $limit: '10000' },
    'filers'
  )
  console.log(
    `  ${parentAll.length} parent · ${clientsAll.length} client · ${contribsAll.length} contribution · ${filerRows.length} filer rows`
  )

  // ---- 2. gates G1–G3 over the RAW family ---------------------------------
  console.log('\nGATES')
  const parentIds = new Set(parentAll.map((r) => r.envelope_id))
  const orphans =
    clientsAll.filter((r) => !parentIds.has(r.envelope_id)).length +
    contribsAll.filter((r) => !parentIds.has(r.envelope_id)).length
  gate(orphans === 0, `G1 join integrity — ${orphans} orphan child rows`)

  const distinctSeries = new Set(parentAll.map((r) => r.filingseries)).size
  const split = latestPerSeries(parentAll)
  gate(
    split.latest.length === distinctSeries,
    `G2 dedupe — latest ${split.latest.length} === distinct filingseries ${distinctSeries} (${split.superseded.length} superseded)`
  )

  const parentById = new Map(parentAll.map((r) => [r.envelope_id, r]))
  let conservationMismatches = 0
  const conservationDetail: string[] = []
  const sumBy = <T>(rows: T[], key: (r: T) => string, value: (r: T) => number): Map<string, number> => {
    const m = new Map<string, number>()
    for (const r of rows) m.set(key(r), (m.get(key(r)) ?? 0) + value(r))
    return m
  }
  const clientSums = sumBy(
    clientsAll,
    (r) => r.envelope_id,
    (r) => amt(r.clientlist_economicconsiderationreceived)
  )
  for (const [env, sum] of clientSums) {
    const declared = amt(parentById.get(env)?.clientinformation_total)
    if (Math.abs(sum - declared) > 0.005) {
      conservationMismatches += 1
      conservationDetail.push(`clients ${env}: child ${sum} vs parent ${declared}`)
    }
  }
  const contribSums = sumBy(
    contribsAll,
    (r) => r.envelope_id,
    (r) => amt(r.contributionlist_amountofcontribution)
  )
  for (const [env, sum] of contribSums) {
    const declared = amt(parentById.get(env)?.politicalcontributions_subtotalofitemizedcontributions)
    if (Math.abs(sum - declared) > 0.005) {
      conservationMismatches += 1
      conservationDetail.push(`contributions ${env}: child ${sum} vs parent ${declared}`)
    }
  }
  gate(
    conservationMismatches === 0,
    `G3 conservation — ${conservationMismatches} envelope(s) where Σ child ≠ parent total`
  )
  for (const d of conservationDetail) console.log(`        ${d}`)

  // G3 only walks envelopes that HAVE child rows, so it is blind in one direction:
  // an envelope that declares money on the parent and publishes no client rows at
  // all reconciles vacuously. That is a real published gap, not a generator bug —
  // SGR Consulting's Sep–Nov 2024 filing declares $403,889.62 with nothing in
  // m75g-xpci — so it is DISCLOSED rather than failed.
  const parentOnlyEnvelopes = parentAll
    .filter((r) => !clientSums.has(r.envelope_id))
    .filter((r) => amt(r.clientinformation_total) > 0 || r.clientinformation_hasclients === true)
    .map((r) => ({
      envelope: r.envelope_id,
      consultant: r.campaignconsultantname,
      declaredTotal: round2(amt(r.clientinformation_total)),
      reportType: r.filinginformation_reporttype,
      periodStart: dpx(r.filinginformation_reportingperiod_reportingperiodstartdate),
    }))
    .sort((a, b) => b.declaredTotal - a.declaredTotal)

  // ---- 3. G5a exclusion (BEFORE any receipt or rollup) --------------------
  const excludedIds = new Set(EXCLUDED_ENVELOPES.map((e) => e.envelope))
  const missingExcluded = EXCLUDED_ENVELOPES.filter((e) => !parentIds.has(e.envelope)).map(
    (e) => e.envelope
  )
  gate(
    missingExcluded.length === 0,
    `G5 exclusion — both junk envelopes present in the parent${missingExcluded.length ? ` (missing: ${missingExcluded.join(', ')})` : ''}`
  )
  const excludedClientDollars = clientsAll
    .filter((r) => excludedIds.has(r.envelope_id))
    .reduce((s, r) => s + amt(r.clientlist_economicconsiderationreceived), 0)

  const aliasByNormalized = buildAliasIndex()
  const keyOfRaw = (raw: string): ConsultantKey => {
    const normalized = normalizeName(raw ?? '')
    const alias = aliasByNormalized.get(normalized)
    if (alias) return { id: alias.id, resolvedBy: 'alias', alias }
    return { id: normalized, resolvedBy: 'mechanical' }
  }

  // ---- 3b. authored overrides: duplicates first, then impossible periods ----
  // Both classes exist because the mechanical rules are deliberately narrow:
  // latestPerSeries dedupes only WITHIN a filingseries (which embeds the filer's
  // own spelling of the period start), and collapseRestatements requires an
  // identical period start. A filer typo defeats both. See overrides.ts.
  const duplicateIds = new Set(DUPLICATE_ENVELOPES.map((d) => d.envelope))
  gate(
    DUPLICATE_ENVELOPES.every((d) => parentIds.has(d.envelope) && parentIds.has(d.duplicateOf)),
    `G6a duplicate overrides — all ${DUPLICATE_ENVELOPES.length} envelope/duplicateOf pair(s) exist in the parent`
  )
  gate(
    !DUPLICATE_ENVELOPES.some((d) => duplicateIds.has(d.duplicateOf) || excludedIds.has(d.duplicateOf)),
    'G6b duplicate overrides — no chain: a survivor is never itself dropped'
  )
  const childSumByEnvelope = new Map<string, number>()
  for (const c of clientsAll) {
    childSumByEnvelope.set(
      c.envelope_id,
      (childSumByEnvelope.get(c.envelope_id) ?? 0) + amt(c.clientlist_economicconsiderationreceived)
    )
  }
  const duplicatesApplied = DUPLICATE_ENVELOPES.map((d) => ({
    ...d,
    droppedTotal: round2(amt(parentById.get(d.envelope)?.clientinformation_total)),
    droppedChildSum: round2(childSumByEnvelope.get(d.envelope) ?? 0),
  }))

  const survivedDuplicates = split.latest.filter(
    (r) => !excludedIds.has(r.envelope_id) && !duplicateIds.has(r.envelope_id)
  )
  const clients = clientsAll.filter(
    (r) => !excludedIds.has(r.envelope_id) && !duplicateIds.has(r.envelope_id)
  )
  const contribs = contribsAll.filter(
    (r) => !excludedIds.has(r.envelope_id) && !duplicateIds.has(r.envelope_id)
  )

  // Detection pass: a Quarterly Report whose period BEGINS after the filer signed
  // it is impossible — a quarter cannot be reported before it starts. Every hit is
  // printed; each is then either corrected by an authored row or left as filed.
  const impossiblePeriod = (r: ParentRow): boolean =>
    r.filinginformation_reporttype === 'Quarterly Report' &&
    dpx(r.filinginformation_reportingperiod_reportingperiodstartdate) > dpx(r.datesigned)
  const detected = survivedDuplicates.filter(impossiblePeriod)
  const periodById = new Map(PERIOD_OVERRIDES.map((o) => [o.envelope, o]))
  console.log(
    `\nIMPOSSIBLE REPORTING PERIODS (Quarterly Report signed before its period begins) — ${detected.length} detected`
  )
  for (const r of [...detected].sort((a, b) =>
    (a.filinginformation_reportingperiod_reportingperiodstartdate ?? '').localeCompare(
      b.filinginformation_reportingperiod_reportingperiodstartdate ?? ''
    )
  )) {
    const o = periodById.get(r.envelope_id)
    console.log(
      `  ${o ? 'corrected  ' : 'UNCORRECTED'} ${r.envelope_id} ${r.campaignconsultantname.slice(0, 30).padEnd(31)}` +
        `${dpx(r.filinginformation_reportingperiod_reportingperiodstartdate)}→${dpx(r.filinginformation_reportingperiod_reportingperiodenddate)}` +
        ` signed ${dpx(r.datesigned)} ${money(amt(r.clientinformation_total)).padStart(14)}` +
        (o ? `  ⇒ ${o.correctedStart}→${o.correctedEnd}` : '')
    )
  }

  const staleOverrides = [
    ...DUPLICATE_ENVELOPES.filter((d) => !parentIds.has(d.envelope)).map((d) => `duplicate ${d.envelope}`),
    ...PERIOD_OVERRIDES.filter((o) => !parentIds.has(o.envelope)).map((o) => `period ${o.envelope}`),
  ]
  if (staleOverrides.length > 0) {
    console.log(`  WARN  ${staleOverrides.length} override row(s) name an envelope absent from the parent:`)
    for (const s of staleOverrides) console.log(`        ${s}`)
  }

  // An authored row must describe the filing it claims to correct, or it is
  // silently rewriting the wrong dates.
  const misdescribed = PERIOD_OVERRIDES.filter((o) => {
    const row = parentById.get(o.envelope)
    if (!row) return false
    return (
      dpx(row.filinginformation_reportingperiod_reportingperiodstartdate) !== o.originalStart ||
      dpx(row.filinginformation_reportingperiod_reportingperiodenddate) !== o.originalEnd
    )
  })
  gate(
    misdescribed.length === 0,
    `G6c period overrides — all ${PERIOD_OVERRIDES.length} row(s) match the filed dates they correct${misdescribed.length ? ` (mismatched: ${misdescribed.map((o) => o.envelope).join(', ')})` : ''}`
  )

  const correctedById = new Map<string, { originalStart: string; originalEnd: string }>()
  const latest = survivedDuplicates.map((r) => {
    const o = periodById.get(r.envelope_id)
    if (!o) return r
    correctedById.set(r.envelope_id, { originalStart: o.originalStart, originalEnd: o.originalEnd })
    return {
      ...r,
      filinginformation_reportingperiod_reportingperiodstartdate: o.correctedStart,
      filinginformation_reportingperiod_reportingperiodenddate: o.correctedEnd,
    }
  })
  gate(
    latest.filter(impossiblePeriod).length === detected.length - correctedById.size,
    `G6d period overrides — ${correctedById.size} corrected, ${detected.length - correctedById.size} left as filed`
  )

  // I6: filings whose window stayed impossible. Everything downstream that would
  // otherwise publish a number ABOUT that window — a ratio, a days-late figure —
  // is suppressed rather than computed, because the window itself is not a fact.
  const impossibleIds = new Set(latest.filter(impossiblePeriod).map((r) => r.envelope_id))

  // Narrow the parent-only disclosure to filings that actually reach the figures:
  // a superseded, excluded or duplicate envelope is not a published gap.
  const liveEnvelopes = new Set(latest.map((r) => r.envelope_id))
  const parentOnlyLive = parentOnlyEnvelopes.filter((e) => liveEnvelopes.has(e.envelope))
  console.log(
    `\nPARENT-ONLY ENVELOPES — ${parentOnlyLive.length} live filing(s) declare clients and publish zero child rows` +
      ` (${parentOnlyEnvelopes.length} before dropping superseded/duplicate copies). Disclosed, not a failure:`
  )
  for (const e of parentOnlyLive) {
    console.log(
      `  ${e.envelope} ${e.consultant.slice(0, 28).padEnd(29)} ${money(e.declaredTotal).padStart(14)} ${e.reportType} ${e.periodStart}`
    )
  }

  // ---- 3c. C1 duplicate scan: one report filed twice under two spellings ----
  // latestPerSeries only dedupes WITHIN a filingseries, and that string embeds the
  // consultant's own spelling of its own name. A filer who retypes the name files
  // the same report into a NEW series, and the money doubles with nothing to catch
  // it. Grouping on the RESOLVED consultant identity is what makes the pair visible
  // — this is the alias table's second job, after payee patterns.
  const dupScan = new Map<string, ParentRow[]>()
  for (const r of latest) {
    const k = `${keyOfRaw(r.campaignconsultantname).id}::${r.filinginformation_reporttype}::${dpx(r.filinginformation_reportingperiod_reportingperiodstartdate)}`
    const arr = dupScan.get(k)
    if (arr) arr.push(r)
    else dupScan.set(k, [r])
  }
  const dupGroups = [...dupScan.entries()].filter(([, arr]) => arr.length > 1)
  console.log(
    `\nDUPLICATE SCAN (same consultant + report type + period, more than one envelope) — ${dupGroups.length} group(s)`
  )
  for (const [k, arr] of dupGroups.sort((a, b) => a[0].localeCompare(b[0]))) {
    console.log(`  ${k}`)
    for (const r of [...arr].sort((a, b) => a.datesigned.localeCompare(b.datesigned))) {
      console.log(
        `      ${r.envelope_id} | ${r.filingseries} | signed ${r.datesigned}` +
          ` | parent ${money(amt(r.clientinformation_total))} | child ${money(childSumByEnvelope.get(r.envelope_id) ?? 0)}`
      )
    }
  }
  gate(
    dupGroups.length === 0,
    `G7 duplicate scan — every same-report group is explained by an authored DUPLICATE_ENVELOPES row` +
      (dupGroups.length ? ` (unexplained: ${dupGroups.map(([k]) => k).join(' · ')})` : '')
  )

  // Advisory, deliberately NOT a gate: one consultant signing two filings of the
  // same report type on one day is often a catch-up filer clearing two different
  // quarters (The Outreach Team did exactly that on 2025-06-02, 30 seconds apart).
  // It is also how the Szabo re-submission hides — same day, two period starts —
  // so the class is printed and published, and judged by a human.
  const sameDayScan = new Map<string, ParentRow[]>()
  for (const r of latest) {
    const k = `${keyOfRaw(r.campaignconsultantname).id}::${r.filinginformation_reporttype}::${dpx(r.datesigned)}`
    const arr = sameDayScan.get(k)
    if (arr) arr.push(r)
    else sameDayScan.set(k, [r])
  }
  const sameDayFilings = [...sameDayScan.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([k, arr]) => {
      const [consultantId, reportType, datesigned] = k.split('::')
      return { consultantId, reportType, datesigned, envelopes: arr.map((r) => r.envelope_id).sort() }
    })
    .sort((a, b) => a.consultantId.localeCompare(b.consultantId))
  if (sameDayFilings.length > 0) {
    console.log(`  ADVISORY  ${sameDayFilings.length} same-day, same-report-type group(s) — read by eye, not gated:`)
    for (const g of sameDayFilings) {
      console.log(`        ${g.consultantId} ${g.reportType} ${g.datesigned}: ${g.envelopes.join(', ')}`)
    }
  }

  // ---- 4. G4 identity -----------------------------------------------------
  const unmappedConsultants = [
    ...new Set(
      parentAll
        .filter((r) => !excludedIds.has(r.envelope_id))
        .map((r) => r.campaignconsultantname)
        .filter((raw) => normalizeName(raw ?? '') === '')
    ),
  ].sort()
  gate(
    unmappedConsultants.length === 0,
    `G4a consultants — ${unmappedConsultants.length} raw name(s) resolve to nothing`
  )
  for (const u of unmappedConsultants) console.log(`        unmapped consultant: ${JSON.stringify(u)}`)

  const crosswalkByString = new Map<string, ClientEntry>()
  for (const e of CLIENT_CROSSWALK) {
    if (crosswalkByString.has(e.clientString)) {
      throw new Error(`CLIENT_CROSSWALK duplicate clientString: ${JSON.stringify(e.clientString)}`)
    }
    crosswalkByString.set(e.clientString, e)
  }
  const distinctClientStrings = [
    ...new Set(clientsAll.map((r) => r.clientlist_clientname ?? '').filter((s) => s.trim() !== '')),
  ].sort()
  const unmappedClients = distinctClientStrings.filter((s) => !crosswalkByString.has(s))
  gate(
    unmappedClients.length === 0,
    `G4b clients — ${distinctClientStrings.length} distinct non-null strings, ${unmappedClients.length} without a crosswalk entry`
  )
  if (unmappedClients.length > 0) {
    console.log('\n  UNMAPPED CLIENT STRINGS — author a CLIENT_CROSSWALK row for each')
    const filerNames = filerRows.map((f) => ({
      nid: f.filer_nid,
      name: f.filer_name ?? '',
      tokens: new Set(normalizeName(f.filer_name ?? '').split(' ').filter(Boolean)),
    }))
    for (const s of unmappedClients) {
      const want = normalizeName(s).split(' ').filter(Boolean)
      const scored = filerNames
        .map((f) => ({ f, score: want.filter((t) => f.tokens.has(t)).length }))
        .filter((x) => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)
      console.log(`    ${JSON.stringify(s)}`)
      for (const { f, score } of scored) console.log(`      ${score} tokens — ${f.nid} ${f.name}`)
    }
  }

  const staleAliasNames = CONSULTANT_ALIASES.flatMap((a) =>
    a.rawNames.filter(
      (raw) => !parentAll.some((p) => normalizeName(p.campaignconsultantname ?? '') === normalizeName(raw))
    ).map((raw) => `${a.id}: ${raw}`)
  )
  if (staleAliasNames.length > 0) {
    console.log(`  WARN  ${staleAliasNames.length} alias rawName(s) not present in the parent:`)
    for (const s of staleAliasNames) console.log(`        ${s}`)
  }

  if (failures.length > 0) {
    console.error(`\n${failures.length} gate failure(s) — nothing written.`)
    process.exitCode = 1
    return
  }

  // ---- 5. restatement collapse -------------------------------------------
  const collapse = collapseRestatements(latest, clients, (r) => keyOfRaw(r.campaignconsultantname).id)
  const droppedEnvelopes = new Set(collapse.restatements.map((r) => r.droppedEnvelope))
  const clientRows = collapse.clientRows
  // A restated Termination/Quarterly pair duplicates CHILD rows outside clients too
  // (Heisler's $250 Peskin contribution sits under both envelopes) — the same drop
  // applies, or the contribution cross-check double-counts it.
  const contribRows = contribs.filter((r) => !droppedEnvelopes.has(r.envelope_id))
  const latestKept = latest.filter((r) => !droppedEnvelopes.has(r.envelope_id))
  console.log(
    `\nCOLLAPSE\n  ${collapse.restatements.length} Quarterly/Termination restatement pair(s) collapsed ` +
      `(${collapse.restatements.filter((r) => r.exact).length} exact, ${collapse.restatements.filter((r) => !r.exact).length} inexact)`
  )
  for (const r of collapse.restatements) {
    console.log(
      `    ${r.consultantKey} ${dpx(r.periodStart)} kept ${money(r.keptTotal)} dropped ${money(r.droppedTotal)} delta ${money(r.delta)}`
    )
  }

  // ---- 6. consultant groups ----------------------------------------------
  interface Group {
    key: ConsultantKey
    rawNames: Set<string>
    filings: ParentRow[]
  }
  const groups = new Map<string, Group>()
  for (const row of latest) {
    const key = keyOfRaw(row.campaignconsultantname)
    let g = groups.get(key.id)
    if (!g) {
      g = { key, rawNames: new Set(), filings: [] }
      groups.set(key.id, g)
    }
    g.rawNames.add(row.campaignconsultantname)
    g.filings.push(row)
  }

  // ---- 7. receipts --------------------------------------------------------
  const latestById = new Map(latest.map((r) => [r.envelope_id, r]))
  let blankClientRows = 0
  let blankClientDollars = 0
  const receipts: (Receipt & {
    clientClass: string
    clientConfidence: ClientConfidence
    filerName?: string
    periodCorrected?: true
  })[] = []
  for (const row of clientRows) {
    const parent = latestById.get(row.envelope_id)
    if (!parent) continue // superseded envelope's rows (there are none today)
    const clientString = (row.clientlist_clientname ?? '').trim()
    const reported = round2(amt(row.clientlist_economicconsiderationreceived))
    if (clientString === '') {
      blankClientRows += 1
      blankClientDollars += reported
      continue
    }
    const entry = crosswalkByString.get(clientString)
    if (!entry) throw new Error(`unreachable: G4b passed but ${JSON.stringify(clientString)} has no entry`)
    // A `state` row's filerNid is a Secretary-of-State filer_id, NOT an SF
    // filer_nid — reconciling it against pitq would return zero rows and publish
    // a fabricated omission. Left null; surfaced under unresolvedClients instead.
    const reconcilable = entry.class === 'committee' || entry.class === 'resolved-by-money'
    receipts.push({
      consultantId: keyOfRaw(parent.campaignconsultantname).id,
      clientString,
      clientClass: entry.class,
      clientConfidence: entry.confidence ?? 'inferred',
      filerNid: reconcilable ? (entry.filerNid ?? null) : null,
      filerName: reconcilable ? entry.filerName : undefined,
      periodStart: dpx(parent.filinginformation_reportingperiod_reportingperiodstartdate),
      periodEnd: dpx(parent.filinginformation_reportingperiod_reportingperiodenddate),
      periodCorrected: correctedById.has(parent.envelope_id) ? (true as const) : undefined,
      periodImpossible: impossibleIds.has(parent.envelope_id) ? (true as const) : undefined,
      reportType: parent.filinginformation_reporttype,
      envelope: parent.envelope_id,
      reported,
    })
  }
  if (blankClientDollars !== 0) {
    throw new Error(`blank-name client rows carry ${blankClientDollars} — investigate before writing`)
  }
  console.log(
    `\nRECEIPTS\n  ${receipts.length} priced client row(s) across ${new Set(receipts.map((r) => r.consultantId)).size} consultant(s); ` +
      `${blankClientRows} blank-name row(s) skipped ($0)`
  )

  // ---- 7b. the overrides block, now that consultant identity is resolved ----
  const reportedByEnvelope = new Map<string, number>()
  for (const r of receipts) {
    reportedByEnvelope.set(r.envelope, (reportedByEnvelope.get(r.envelope) ?? 0) + r.reported)
  }
  const identify = (row: ParentRow): { consultantId: string; displayName: string } => {
    const key = keyOfRaw(row.campaignconsultantname)
    return { consultantId: key.id, displayName: key.alias?.displayName ?? row.campaignconsultantname }
  }
  const overrides: ArtifactOverrides = {
    duplicates: duplicatesApplied,
    periods: PERIOD_OVERRIDES.filter((o) => correctedById.has(o.envelope)).map((o) => {
      const row = latestById.get(o.envelope)
      return {
        envelope: o.envelope,
        ...identify(row as ParentRow),
        originalStart: o.originalStart,
        originalEnd: o.originalEnd,
        correctedStart: o.correctedStart,
        correctedEnd: o.correctedEnd,
        datesigned: row?.datesigned ?? '',
        reported: round2(reportedByEnvelope.get(o.envelope) ?? 0),
        reason: o.reason,
      }
    }),
    uncorrectable: detected
      .filter((r) => !periodById.has(r.envelope_id))
      .map((r) => {
        const start = dpx(r.filinginformation_reportingperiod_reportingperiodstartdate)
        const end = dpx(r.filinginformation_reportingperiod_reportingperiodenddate)
        const signed = dpx(r.datesigned)
        const shifted = { start: shiftYearBack(start), end: shiftYearBack(end) }
        const closed = lastClosedQuarter(signed)
        return {
          envelope: r.envelope_id,
          ...identify(r),
          periodStart: start,
          periodEnd: end,
          datesigned: r.datesigned,
          reported: round2(reportedByEnvelope.get(r.envelope_id) ?? 0),
          reason:
            `A quarter cannot be reported before it starts: the period as filed begins ${daysBetween(signed, start)} days after the signature. ` +
            `Shifting it back one year lands ${shifted.start}\u2192${shifted.end}, but the quarter that had already closed when this was signed is ` +
            `${closed ? `${closed.start}\u2192${closed.end}` : 'undetermined'}. The two disagree, so no correction is determinate and the dates are left exactly as filed \u2014 ` +
            'this filing reconciles against its window as typed.',
        }
      }),
  }
  console.log(
    `\nOVERRIDES\n  ${overrides.duplicates.length} duplicate envelope(s) dropped (${money(overrides.duplicates.reduce((s2, d) => s2 + d.droppedTotal, 0))}); ` +
      `${overrides.periods.length} period(s) corrected; ${overrides.uncorrectable.length} left as filed`
  )
  for (const d of overrides.duplicates) {
    console.log(`    duplicate    ${d.envelope} → kept ${d.duplicateOf} (${money(d.droppedTotal)})`)
  }
  for (const o of overrides.periods) {
    console.log(
      `    corrected    ${o.displayName.slice(0, 28).padEnd(29)} ${o.originalStart}→${o.originalEnd} ⇒ ${o.correctedStart}→${o.correctedEnd}  ${money(o.reported).padStart(12)}`
    )
  }
  for (const u of overrides.uncorrectable) {
    console.log(
      `    UNCORRECTED  ${u.displayName.slice(0, 28).padEnd(29)} ${u.periodStart}→${u.periodEnd} signed ${dpx(u.datesigned)}  ${money(u.reported).padStart(12)}`
    )
  }

  // ---- 8. committeeCompleteThrough ---------------------------------------
  const clientNids = [...new Set(receipts.map((r) => r.filerNid).filter((n): n is string => !!n))]
  // Scoped to Schedule E deliberately. Over ALL record types this reads "current"
  // for a committee that has never filed a Form 460 at all — California Alliance
  // of Family Owned Businesses PAC (216701453) files only F496 late-independent-
  // expenditure reports, so its 2026 filing_date made an empty payee ledger look
  // up to date, and the pair read as a 100% omission instead of "no ledger exists".
  const completeRows = await soda<{ filer_nid: string; m: string; n: string }>(
    DS.pitq,
    {
      $select: 'filer_nid,max(filing_date) as m,count(*) as n',
      $where: `filer_nid in (${clientNids.map(sqlQuote).join(',')}) AND record_type = 'EXPN' AND form_type = 'E'`,
      $group: 'filer_nid',
      $limit: '5000',
    },
    'committeeCompleteThrough'
  )
  const completeThrough: Record<string, string> = {}
  const hasScheduleE: Record<string, boolean> = {}
  for (const nid of clientNids) hasScheduleE[nid] = false
  for (const r of completeRows) {
    completeThrough[r.filer_nid] = dpx(r.m)
    hasScheduleE[r.filer_nid] = Number(r.n) > 0
  }
  const noLedger = clientNids.filter((n) => !hasScheduleE[n])
  console.log(
    `  ${clientNids.length - noLedger.length} of ${clientNids.length} client committees file a Schedule E; ` +
      `${noLedger.length} have no payee ledger at all${noLedger.length ? ` (${noLedger.join(', ')})` : ''}`
  )

  // ---- 9. per-consultant pitq expenditures -------------------------------
  console.log(`\nPITQ EXPENDITURES (record_type in ('EXPN','DEBT') AND filing_date >= '${ERA_START}')`)
  const receiptsByConsultant = new Map<string, typeof receipts>()
  for (const r of receipts) {
    const arr = receiptsByConsultant.get(r.consultantId)
    if (arr) arr.push(r)
    else receiptsByConsultant.set(r.consultantId, [r])
  }

  const expByConsultant = new Map<string, PitqExpRow[]>()
  const patternReport: { consultant: string; pattern: string; rows: number; dollars: number }[] = []
  const scopeDrops: { consultant: string; rows: number; dollars: number }[] = []

  const floorByConsultant: Record<string, string> = {}
  for (const [consultantId, rows] of [...receiptsByConsultant].sort((a, b) => a[0].localeCompare(b[0]))) {
    const group = groups.get(consultantId)
    if (!group) continue
    const patterns = group.key.alias?.payeePatterns ?? [`%${consultantId}%`]
    // A single fixed floor fabricates omissions on the family's pre-era edge. AST
    // Consulting's only filing is a Termination for Mar–Apr 2024; its client's
    // Schedule E row for that work was FILED on 2024-07-29, before the 2024-09-01
    // floor, so the consultant read as reporting $6,000 nobody paid. The floor is
    // therefore per consultant: six months before its own earliest reporting
    // period, never later than the era start.
    const earliest = rows.map((r) => r.periodStart).filter(Boolean).sort()[0]
    const floor = earliest ? minDate(shiftMonthsBack(earliest, 6), ERA_START) : ERA_START
    floorByConsultant[consultantId] = floor
    const where = `record_type in ('EXPN','DEBT') AND filing_date >= '${floor}' AND ${payeeWhereClause(patterns)}`
    const exp = await soda<PitqExpRow>(
      DS.pitq,
      { $select: PITQ_EXP_PROJECTION.join(','), $where: where, $limit: '50000' },
      `pitq ${consultantId}`
    )

    for (const p of patterns) {
      const re = likeToRegex(p)
      const hits = exp.filter((row) => payeeRowMatches(re, row))
      patternReport.push({
        consultant: consultantId,
        pattern: p,
        rows: hits.length,
        dollars: round2(hits.reduce((s, r) => s + amt(r.transaction_amount_1), 0)),
      })
    }

    // `payeeScope: 'own-clients'` (Stearns ↔ Rough House Productions) is a
    // reporting-basis reading, NOT an identity. Rough House is a shared vendor
    // paid by 10+ committees; applied globally it would flag Stearns as
    // under-reporting committees it never worked for. reconcile() already scopes
    // by filer_nid, but the drop is made explicit and counted here so the
    // constraint is visible rather than emergent.
    let scoped = exp
    if (group.key.alias?.payeeScope === 'own-clients') {
      const ownNids = new Set(rows.map((r) => r.filerNid).filter((n): n is string => !!n))
      scoped = exp.filter((r) => ownNids.has(r.filer_nid))
      const dropped = exp.filter((r) => !ownNids.has(r.filer_nid))
      scopeDrops.push({
        consultant: consultantId,
        rows: dropped.length,
        dollars: round2(dropped.reduce((s, r) => s + amt(r.transaction_amount_1), 0)),
      })
    }
    expByConsultant.set(consultantId, scoped)
  }

  // ---- 10. reconcile ------------------------------------------------------
  const pairsByConsultant = new Map<string, ArtifactPair[]>()
  const CONF_RANK: Record<ClientConfidence, number> = { uncertain: 0, inferred: 1, exact: 2 }
  for (const [consultantId, rows] of receiptsByConsultant) {
    const exp = expByConsultant.get(consultantId) ?? []
    const pairs = reconcile(rows, exp, completeThrough, hasScheduleE)
    const enriched: ArtifactPair[] = pairs.map((p) => {
      const contributing = rows.filter(
        (r) => r.filerNid === p.filerNid && r.periodStart === p.periodStart
      )
      const weakest = contributing.reduce<ClientConfidence>(
        (acc, r) => (CONF_RANK[r.clientConfidence] < CONF_RANK[acc] ? r.clientConfidence : acc),
        'exact'
      )
      return {
        ...p,
        reported: round2(p.reported),
        schE: round2(p.schE),
        schEUndatedAssigned: round2(p.schEUndatedAssigned),
        schG: round2(p.schG),
        ratio: p.ratio === null ? null : round2(p.ratio * 10000) / 10000,
        filerName: p.filerName ?? contributing[0]?.filerName,
        clientStrings: [...new Set(contributing.map((r) => r.clientString))].sort(),
        clientConfidence: weakest,
      }
    })
    enriched.sort(
      (a, b) => a.periodStart.localeCompare(b.periodStart) || a.filerNid.localeCompare(b.filerNid)
    )
    pairsByConsultant.set(consultantId, enriched)
  }

  // I1 gate: an undated Schedule E row must land in exactly ONE reporting period.
  // Before the exclusive assignment rule, Margaux Kelly's 49 undated rows from
  // Mark Farrell for Mayor 2024 ($48,600.16) were counted in BOTH her Sep–Nov 2024
  // and Dec 2024–Feb 2025 quarters, because the filing window overlapped both.
  const seenTx = new Map<string, string>()
  const doubleCounted: string[] = []
  for (const [consultantId, pairs] of pairsByConsultant) {
    for (const p of pairs) {
      for (const tx of p.undatedTransactionIds) {
        const k = `${consultantId}::${p.filerNid}::${tx}`
        const prior = seenTx.get(k)
        if (prior) doubleCounted.push(`${k} in ${prior} and ${p.periodStart}`)
        else seenTx.set(k, p.periodStart)
      }
    }
  }
  gate(
    doubleCounted.length === 0,
    `G8 undated exclusivity — ${seenTx.size} undated Schedule E row(s) assigned, each to exactly one period` +
      (doubleCounted.length ? ` (double-counted: ${doubleCounted.slice(0, 5).join(' · ')})` : '')
  )

  // ---- 11. contributions --------------------------------------------------
  console.log('\nCONTRIBUTIONS')
  const normalizedFilers = new Map<string, string[]>()
  for (const f of filerRows) {
    const key = normalizeName(f.filer_name ?? '')
    if (!key) continue
    const arr = normalizedFilers.get(key)
    if (arr) arr.push(f.filer_nid)
    else normalizedFilers.set(key, [f.filer_nid])
  }
  const crosswalkByNormalized = new Map<string, string>()
  for (const e of CLIENT_CROSSWALK) {
    if (e.class !== 'committee' && e.class !== 'resolved-by-money') continue
    if (!e.filerNid) continue
    const key = normalizeName(e.clientString)
    if (!crosswalkByNormalized.has(key)) crosswalkByNormalized.set(key, e.filerNid)
  }
  // Loose index over BOTH ledgers' spellings of a committee name (crosswalk
  // strings, their certified filer names, and every 4c8t-ngau filer name), used
  // only as the last two rungs of the recipient ladder below.
  const looseTargets = new Map<string, Set<string>>()
  const addLoose = (name: string | undefined, nid: string): void => {
    const k = looseName(name ?? '')
    if (!k) return
    const s = looseTargets.get(k)
    if (s) s.add(nid)
    else looseTargets.set(k, new Set([nid]))
  }
  for (const e of CLIENT_CROSSWALK) {
    if (e.class !== 'committee' && e.class !== 'resolved-by-money') continue
    if (!e.filerNid) continue
    addLoose(e.clientString, e.filerNid)
    addLoose(e.filerName, e.filerNid)
  }
  for (const f of filerRows) addLoose(f.filer_name, f.filer_nid)
  const looseKeys = [...looseTargets.keys()]

  /**
   * Recipient name → SF Ethics filer_nid, cheapest rung first. Every rung
   * demands a UNIQUE target: an ambiguous name resolves to nothing on purpose,
   * because picking one of a candidate's several committees would fabricate
   * precision. Nothing here decides that a contribution matched — it only
   * decides whose ledger gets searched.
   */
  const recipientNidOf = (name: string): string | null => {
    const direct = crosswalkByString.get(name)
    if (direct && (direct.class === 'committee' || direct.class === 'resolved-by-money') && direct.filerNid) {
      return direct.filerNid
    }
    const norm = normalizeName(name)
    if (norm) {
      const viaCrosswalk = crosswalkByNormalized.get(norm)
      if (viaCrosswalk) return viaCrosswalk
      const nids = normalizedFilers.get(norm)
      if (nids && nids.length === 1) return nids[0]
    }
    const key = looseName(name)
    if (!key) return null
    const exact = looseTargets.get(key)
    if (exact && exact.size === 1) return [...exact][0]
    // Committees are routinely named without their sponsor clause ('Yes on C,
    // No on D to Protect San Francisco's Small Businesses and Economic
    // Recovery' for a filer whose registered name continues ', Sponsored by
    // San Francisco Civic Organizations'). A prefix rung handles that, but only
    // for a long name and only when exactly one registered committee extends it.
    if (key.split(' ').length >= 6) {
      const extended = new Set<string>()
      for (const k of looseKeys) {
        if (!k.startsWith(`${key} `)) continue
        for (const n of looseTargets.get(k) ?? []) extended.add(n)
      }
      if (extended.size === 1) return [...extended][0]
    }
    return null
  }

  const principalOf = (contributor: string): string[] => {
    const key = normalizeName(contributor)
    if (!key) return []
    const out: string[] = []
    for (const { consultant, names } of CONTRIBUTOR_NAME_VARIANTS) {
      const consultantKey = normalizeName(consultant)
      if (key === consultantKey || key.includes(consultantKey) || consultantKey.includes(key)) {
        out.push(...names)
      }
    }
    return out
  }

  // The contributor field is populated ONLY where the consultant acted as an
  // intermediary ('SF Believes' on The Media Company's six 2026 rows). On a
  // direct consultant cheque the field is null and `sourceofthecontribution`
  // reads 'Campaign Consultant' — the contributor IS the registrant, so its
  // name is filled in from the parent filing before matching.
  const contribWithContributor: (ContributionRow & { consultantId: string })[] = contribRows.map((row) => {
    const parent = latestById.get(row.envelope_id)
    const filled = (row.contributionlist_nameofcontributororclient ?? '').trim()
    return {
      ...row,
      contributionlist_nameofcontributororclient:
        filled !== '' ? filled : (parent?.campaignconsultantname ?? ''),
      consultantId: parent ? keyOfRaw(parent.campaignconsultantname).id : '',
    }
  })

  const contribAmounts = [
    ...new Set(
      contribWithContributor
        .map((r) => amt(r.contributionlist_amountofcontribution))
        .filter((n) => n > 0)
    ),
  ]
  const contribDates = contribWithContributor
    .map((r) => dpx(r.contributionlist_dateofcontribution))
    .filter(Boolean)
    .sort()
  const recipientNids = [
    ...new Set(
      contribWithContributor
        .map((r) => recipientNidOf(r.contributionlist_contrecipientname ?? ''))
        .filter((n): n is string => !!n)
    ),
  ]
  let rcptRows: PitqRcptRow[] = []
  if (recipientNids.length > 0 && contribAmounts.length > 0 && contribDates.length > 0) {
    const lo = shiftDays(contribDates[0], -31)
    const hi = shiftDays(contribDates[contribDates.length - 1], 31)
    rcptRows = await soda<PitqRcptRow>(
      DS.pitq,
      {
        $select:
          'filer_nid,filer_name,record_type,form_type,transaction_last_name,transaction_first_name,transaction_amount_1,transaction_date',
        $where:
          `record_type in ('RCPT','S497') AND filer_nid in (${recipientNids.map(sqlQuote).join(',')}) ` +
          `AND transaction_amount_1 in (${contribAmounts.join(',')}) ` +
          `AND transaction_date >= '${lo}' AND transaction_date <= '${hi}'`,
        $limit: '50000',
      },
      'pitq receipts'
    )
  }
  console.log(
    `  ${contribWithContributor.length} priced/blank contribution row(s); ${recipientNids.length} recipient nid(s) resolved; ${rcptRows.length} candidate pitq receipt row(s)`
  )

  const contributionsByConsultant = new Map<string, ContributionMatch[]>()
  for (const consultantId of new Set(contribWithContributor.map((r) => r.consultantId))) {
    if (!consultantId) continue
    const rows = contribWithContributor.filter((r) => r.consultantId === consultantId)
    const matches = matchContributions(rows, recipientNidOf, rcptRows, principalOf)
    contributionsByConsultant.set(consultantId, matches)
  }
  const allMatches = [...contributionsByConsultant.values()].flat()
  const matchedCount = allMatches.filter((m) => m.matched === 'exact' || m.matched === 'principal').length
  const byOutcome = allMatches.reduce<Record<string, number>>((acc, m) => {
    acc[m.matched] = (acc[m.matched] ?? 0) + 1
    return acc
  }, {})
  console.log(`  outcomes: ${Object.entries(byOutcome).map(([k, v]) => `${k} ${v}`).join(' · ')}`)

  // ---- 12. assemble consultants ------------------------------------------
  const consultants: ArtifactConsultant[] = []
  for (const [id, group] of groups) {
    const filingsBySigned = [...group.filings].sort((a, b) => b.datesigned.localeCompare(a.datesigned))
    const newest = filingsBySigned[0]
    const rows = receiptsByConsultant.get(id) ?? []
    const pairs = pairsByConsultant.get(id) ?? []

    const registrations: ArtifactRegistration[] = filingsBySigned
      .filter((f) => f.filinginformation_reporttype !== 'Quarterly Report')
      .map((f) => ({
        year: (
          dpx(f.filinginformation_reportingperiod_reportingperiodstartdate) || dpx(f.datesigned)
        ).slice(0, 4),
        reportType: f.filinginformation_reporttype,
        datesigned: f.datesigned,
        envelope: f.envelope_id,
        docusignUrl: docusignUrl(f.docusign_filing),
      }))
      .filter((r) => !droppedEnvelopes.has(r.envelope))

    const quarterlies: ArtifactQuarterly[] = filingsBySigned
      .filter((f) => f.filinginformation_reporttype === 'Quarterly Report')
      .filter((f) => !droppedEnvelopes.has(f.envelope_id))
      .map((f) => {
        const periodStart = dpx(f.filinginformation_reportingperiod_reportingperiodstartdate)
        const deadline = quarterlyDeadline(periodStart)
        const corrected = correctedById.get(f.envelope_id)
        const impossible = impossibleIds.has(f.envelope_id)
        return {
          periodStart,
          periodEnd: dpx(f.filinginformation_reportingperiod_reportingperiodenddate),
          ...(corrected
            ? {
                periodCorrected: true as const,
                originalPeriodStart: corrected.originalStart,
                originalPeriodEnd: corrected.originalEnd,
              }
            : {}),
          ...(impossible ? { periodImpossible: true as const } : {}),
          datesigned: f.datesigned,
          // An impossible window yields no deadline and no days-late: the statutory
          // due date is derived FROM the period, so "172 days early" would be
          // measuring the typo, not the filer.
          deadline: impossible ? null : deadline,
          daysLate: impossible || !deadline ? null : daysBetween(deadline, dpx(f.datesigned)),
          envelope: f.envelope_id,
          docusignUrl: docusignUrl(f.docusign_filing),
        }
      })
      .sort((a, b) => a.periodStart.localeCompare(b.periodStart))

    const reported = round2(rows.reduce((s, r) => s + r.reported, 0))
    const reconciledReported = round2(pairs.reduce((s, p) => s + p.reported, 0))
    consultants.push({
      id,
      displayName: group.key.alias?.displayName ?? newest.campaignconsultantname,
      resolvedBy: group.key.resolvedBy,
      rawNames: [...group.rawNames].sort(),
      kind: group.key.alias?.kind,
      payeePatterns: group.key.alias?.payeePatterns ?? [`%${id}%`],
      payeeScope: group.key.alias?.payeeScope,
      city: newest.campaignconsultantbusinessaddress_city,
      state: newest.campaignconsultantbusinessaddress_state,
      registrations,
      quarterlies,
      receipts: rows
        .map((r) => ({
          clientString: r.clientString,
          clientClass: r.clientClass,
          clientConfidence: r.clientConfidence,
          filerNid: r.filerNid,
          filerName: r.filerName,
          periodStart: r.periodStart,
          periodEnd: r.periodEnd,
          ...(r.periodCorrected ? { periodCorrected: true as const } : {}),
          ...(r.periodImpossible ? { periodImpossible: true as const } : {}),
          reportType: r.reportType,
          envelope: r.envelope,
          reported: r.reported,
        }))
        .sort(
          (a, b) => a.periodStart.localeCompare(b.periodStart) || a.clientString.localeCompare(b.clientString)
        ),
      reconciliation: pairs,
      contributions: contributionsByConsultant.get(id) ?? [],
      restatementsCollapsed: collapse.restatements.filter((r) => r.consultantKey === id),
      totals: {
        reported,
        reconciledReported,
        schE: round2(pairs.reduce((s, p) => s + p.schE, 0)),
        schG: round2(pairs.reduce((s, p) => s + p.schG, 0)),
      },
    })
  }
  consultants.sort((a, b) => b.totals.reported - a.totals.reported || a.id.localeCompare(b.id))

  // ---- 12b. I7: identity drift the mechanical gate cannot see ---------------
  // G4a can only catch a name that resolves to NOTHING, which never happens —
  // normalizeName always returns something. A misspelling that resolves to a NEW
  // identity is the real failure mode, and it is invisible unless you compare
  // against what was published last time. "Last time" here is the artifact
  // currently ON DISK, read before this run overwrites it — so the comparison is
  // meaningful exactly once per checkout of a given artifact, which is the moment
  // a human is about to review the diff. A second run in a row reports nothing new.
  let newConsultantIds: string[] = []
  try {
    const priorRaw = readFileSync(join(process.cwd(), ARTIFACT_PATH), 'utf8')
    const prior = JSON.parse(priorRaw) as { consultants?: { id: string }[] }
    const priorIds = new Set((prior.consultants ?? []).map((c) => c.id))
    newConsultantIds = consultants.map((c) => c.id).filter((id) => !priorIds.has(id)).sort()
    console.log(
      `\nIDENTITY DRIFT (vs the artifact currently on disk)\n  ${newConsultantIds.length} consultant id(s) not in it` +
        (newConsultantIds.length ? ':' : ' — the roster is unchanged')
    )
    for (const id of newConsultantIds) {
      const c = consultants.find((x) => x.id === id)
      console.log(
        `    NEW  ${id}  (${c?.resolvedBy}, ${money(c?.totals.reported ?? 0)})  spellings: ${c?.rawNames.join(' | ')}`
      )
    }
    console.log('    Read each one: a genuinely new registrant is expected; a near-miss of an existing id is a crosswalk gap.')
  } catch {
    console.log('\nIDENTITY DRIFT\n  no previously committed artifact to compare against (first run)')
  }
  const aliasIds = new Set(CONSULTANT_ALIASES.map((a) => a.id))
  const orphanAliasIds = consultants.filter((c) => c.resolvedBy === 'alias' && !aliasIds.has(c.id)).map((c) => c.id)
  gate(
    orphanAliasIds.length === 0,
    `G4c alias identity — every alias-resolved consultant id exists in CONSULTANT_ALIASES${orphanAliasIds.length ? ` (orphans: ${orphanAliasIds.join(', ')})` : ''}`
  )

  // ---- 13. rollups --------------------------------------------------------
  const committeeMap = new Map<
    string,
    { filerNid: string; filerName?: string; consultants: Map<string, { reported: number; schE: number; schG: number }> }
  >()
  for (const c of consultants) {
    for (const p of c.reconciliation) {
      let entry = committeeMap.get(p.filerNid)
      if (!entry) {
        entry = { filerNid: p.filerNid, filerName: p.filerName, consultants: new Map() }
        committeeMap.set(p.filerNid, entry)
      }
      if (!entry.filerName && p.filerName) entry.filerName = p.filerName
      const cur = entry.consultants.get(c.id) ?? { reported: 0, schE: 0, schG: 0 }
      cur.reported += p.reported
      cur.schE += p.schE
      cur.schG += p.schG
      entry.consultants.set(c.id, cur)
    }
  }
  const committees = [...committeeMap.values()]
    .map((e) => ({
      filerNid: e.filerNid,
      filerName: e.filerName,
      completeThrough: completeThrough[e.filerNid],
      hasScheduleE: hasScheduleE[e.filerNid] ?? false,
      consultants: [...e.consultants]
        .map(([id, v]) => ({ id, reported: round2(v.reported), schE: round2(v.schE), schG: round2(v.schG) }))
        .sort((a, b) => b.reported - a.reported),
    }))
    .sort(
      (a, b) =>
        b.consultants.reduce((s, c) => s + c.reported, 0) - a.consultants.reduce((s, c) => s + c.reported, 0)
    )

  const unresolvedMap = new Map<string, { clientString: string; class: string; reported: number }>()
  for (const c of consultants) {
    for (const r of c.receipts) {
      if (r.filerNid) continue
      const cur = unresolvedMap.get(r.clientString) ?? {
        clientString: r.clientString,
        class: r.clientClass,
        reported: 0,
      }
      cur.reported += r.reported
      unresolvedMap.set(r.clientString, cur)
    }
  }
  const unresolvedClients = [...unresolvedMap.values()]
    .map((u) => ({ ...u, reported: round2(u.reported) }))
    .sort((a, b) => b.reported - a.reported)

  // ---- 13b. I5: the subtraction chain closes, or nothing is written --------
  // Every figure the artifact publishes is the published child ledger minus three
  // authored removals. If that arithmetic does not close to the cent, one of the
  // removals is double-counting or missing money, and no headline built on
  // `reportedAll` can be trusted.
  const childReportedRaw = round2(
    clientsAll.reduce((sum, c) => sum + amt(c.clientlist_economicconsiderationreceived), 0)
  )
  const excludedWithTotals = EXCLUDED_ENVELOPES.map((e) => ({
    envelope: e.envelope,
    reason: e.reason,
    reportedTotal: round2(childSumByEnvelope.get(e.envelope) ?? 0),
  }))
  const excludedSum = round2(excludedWithTotals.reduce((t, e) => t + e.reportedTotal, 0))
  const duplicateChildSum = round2(duplicatesApplied.reduce((t, d) => t + d.droppedChildSum, 0))
  const restatementChildSum = round2(
    collapse.restatements.reduce((t, r) => t + r.droppedChildSum, 0)
  )
  const reportedAll = round2(consultants.reduce((t, c) => t + c.totals.reported, 0))
  const chainResidual = round2(
    childReportedRaw - excludedSum - duplicateChildSum - restatementChildSum - reportedAll
  )
  console.log('\nSUBTRACTION CHAIN')
  console.log(`  child rows as published      ${money(childReportedRaw).padStart(16)}`)
  console.log(`  − excluded junk filings      ${money(excludedSum).padStart(16)}`)
  console.log(`  − duplicate envelopes        ${money(duplicateChildSum).padStart(16)}`)
  console.log(`  − restatements collapsed     ${money(restatementChildSum).padStart(16)}`)
  console.log(`  = reported (all)             ${money(reportedAll).padStart(16)}`)
  gate(
    Math.abs(chainResidual) < 0.005,
    `G9 subtraction chain — closes to the cent (residual ${money(chainResidual)})`
  )

  // ---- 14. G5b — the exclusion actually held ------------------------------
  console.log('\nG5 SUB-CHECKS')
  const emittedEnvelopes = new Set<string>()
  for (const c of consultants) {
    for (const r of c.receipts) emittedEnvelopes.add(r.envelope)
    for (const r of c.registrations) emittedEnvelopes.add(r.envelope)
    for (const q of c.quarterlies) emittedEnvelopes.add(q.envelope)
    for (const s of c.restatementsCollapsed) {
      emittedEnvelopes.add(s.keptEnvelope)
      emittedEnvelopes.add(s.droppedEnvelope)
    }
    for (const m of c.contributions) emittedEnvelopes.add(m.envelope)
  }
  const leaked = [...excludedIds].filter((id) => emittedEnvelopes.has(id))
  gate(leaked.length === 0, `G5a no excluded envelope in any emitted receipt/filing (${leaked.join(', ')})`)
  const caesar = consultants.flatMap((c) => c.receipts).filter((r) => r.clientString === 'Caesar Kamila')
  gate(
    caesar.length === 0,
    `G5b the junk filer's $152,000 'Caesar Kamila' client is in no receipt (found ${caesar.length})`
  )
  gate(
    !unresolvedClients.some((u) => u.clientString === 'Caesar Kamila'),
    "G5c 'Caesar Kamila' is not reported as an unresolved client either"
  )
  gate(
    Math.abs(excludedClientDollars - 152000) < 0.005,
    `G5d excluded envelopes carry ${money(excludedClientDollars)} of client receipts, all outside every total`
  )

  if (failures.length > 0) {
    console.error(`\n${failures.length} gate failure(s) — nothing written.`)
    process.exitCode = 1
    return
  }

  // ---- 15. provenance -----------------------------------------------------
  const sources: ArtifactSource[] = []
  sources.push(await sourceMeta(DS.parent, 'SFEC Campaign Consultant Report (Forms 1/2/3/6)'))
  sources.push(await sourceMeta(DS.clients, 'SFEC Campaign Consultant Report — Clients'))
  sources.push(await sourceMeta(DS.contributions, 'SFEC Campaign Consultant Report — Political Contributions'))
  sources.push(await sourceMeta(DS.pitq, 'Campaign Finance — Transactions (pitq-e56w)'))
  sources.push(await sourceMeta(DS.filers, 'Campaign Finance — Filers (4c8t-ngau)'))

  const artifact: ReconciliationArtifact = {
    provenance: {
      generatedAt: new Date().toISOString(),
      generator: 'scripts/build-consultant-recon.ts',
      sources,
      projection: PROJECTION,
      redaction:
        'Structural: the parent $select omits every phone / streetaddress / fulladdress / employertelephone column, the contributions projection omits the contributor address block, and the employees table gjyg-9whd is never fetched. Consultant location is city + state only — for the 56 Person-type filings the "business address" is usually a home address.',
      recipes: {
        latestRule: 'MAX(datesigned) per filingseries (floating SF-local strings compared as text)',
        restatement:
          'Same consultant identity + same reportingperiodstartdate with exactly one Quarterly and one Termination among the latest rows: keep the LATER-signed report\'s client rows, drop the other\'s (contributions too), record { keptEnvelope, droppedEnvelope, delta } for exact and inexact pairs alike',
        pitqFloor:
          "The pitq-e56w filing_date floor is per consultant: six months before that consultant's own earliest reporting period, never later than 2024-09-01. A single fixed floor hid a committee's Schedule E row filed before the era started and published the consultant as reporting money nobody paid.",
        schE:
          "pitq-e56w form_type 'E' rows for the client's filer_nid whose transaction_date falls inside the consultant's own reporting period. Schedule G is summed separately and NEVER folded into schE; Schedule F is ignored entirely.",
        undated:
          "A Schedule E row with no transaction_date is assigned to EXACTLY ONE reporting period — the one whose overlap with the FILING's own [start_date, end_date] is longest, ties to the earlier period. The amount is included in schE and reported separately as schEUndatedAssigned, and the row's transaction_id is published under the pair's undatedTransactionIds so the exclusivity is checkable.",
        contributions:
          "Each priced 7gkm-68qf row is searched in the recipient's own pitq RCPT/S497 rows for the same amount to the cent within ±30 days, matching the contributor name, then the firm's principal. Where sourceofthecontribution is 'Campaign Consultant' the contributor is the registrant itself (the contributor column is null on those rows).",
        exclusion:
          'EXCLUDED_ENVELOPES are removed before any receipt, pair, or rollup is computed, so their dollars appear only under `excluded`.',
        overrides:
          'Authored, envelope-keyed, applied after latest-per-series and before the restatement collapse. DUPLICATE_ENVELOPES drops a second copy of one report that landed in a different filingseries; PERIOD_OVERRIDES corrects a Quarterly Report whose period begins after the filer signed it, but only where a one-year shift back is the determinate correction. Both original and corrected values are published under `overrides`, and every corrected quarterly carries periodCorrected + its original dates.',
      },
      committeeCompleteThrough: completeThrough,
    },
    gates: {
      orphans,
      latestCount: split.latest.length,
      distinctSeries,
      conservationMismatches,
      unmappedConsultants,
      unmappedClients,
      parentOnlyEnvelopes: parentOnlyLive,
      newConsultantIds,
      supersededEnvelopes: split.superseded.length,
      restatementsCollapsed: collapse.restatements.length,
      blankClientRows,
      excludedEnvelopes: EXCLUDED_ENVELOPES.length,
      duplicateEnvelopes: overrides.duplicates.length,
      periodOverrides: overrides.periods.length,
      uncorrectablePeriods: overrides.uncorrectable.length,
      duplicateGroupsDetected: dupGroups.length,
      sameDayFilings,
    },
    overrides,
    consultants,
    committees,
    unresolvedClients,
    excluded: excludedWithTotals,
    totals: {
      childReportedRaw,
      reportedAll,
      reportedReconcilable: round2(consultants.reduce((s, c) => s + c.totals.reconciledReported, 0)),
      schE: round2(consultants.reduce((s, c) => s + c.totals.schE, 0)),
      schG: round2(consultants.reduce((s, c) => s + c.totals.schG, 0)),
      receipts: receipts.length,
      pairs: consultants.reduce((s, c) => s + c.reconciliation.length, 0),
      contributionsMatched: matchedCount,
      contributionsTotal: allMatches.length,
    },
    calendar: {
      quarterlyDue: ['03-15', '06-15', '09-15', '12-15'],
      periodStarts: ['12-01', '03-01', '06-01', '09-01'],
      rollForward:
        'next business day, weekends only — SF holidays are a later refinement and are NOT applied here',
      reregistrationDue: '01-01',
      authorizationDays: 15,
      terminationDays: 30,
    },
  }

  // ---- 16. stdout report --------------------------------------------------
  console.log('\nPER-PATTERN ROW COUNTS (over-match visibility — read the big ones by eye)')
  for (const p of patternReport.filter((p) => p.rows > 0).sort((a, b) => b.dollars - a.dollars)) {
    console.log(
      `  ${p.consultant.padEnd(26)} ${p.pattern.padEnd(30)} ${String(p.rows).padStart(5)} rows  ${money(p.dollars).padStart(16)}`
    )
  }
  const zeroPatterns = patternReport.filter((p) => p.rows === 0)
  if (zeroPatterns.length > 0) {
    console.log(`  (${zeroPatterns.length} pattern(s) returned zero rows: ${zeroPatterns.map((p) => `${p.consultant} ${p.pattern}`).join(' · ')})`)
  }
  for (const d of scopeDrops) {
    console.log(
      `  SCOPED  ${d.consultant}: dropped ${d.rows} row(s) / ${money(d.dollars)} from committees this consultant never reported (payeeScope: own-clients)`
    )
  }

  console.log('\nTOP 10 BY REPORTED RECEIPTS — consultant-reported vs committee Schedule E')
  console.log(
    `  ${'consultant'.padEnd(30)}${'reported'.padStart(16)}${'schE (in window)'.padStart(18)}${'ratio'.padStart(8)}${'schG'.padStart(16)}`
  )
  for (const c of consultants.slice(0, 10)) {
    const ratio = c.totals.reported > 0 ? (c.totals.schE / c.totals.reported).toFixed(3) : '—'
    console.log(
      `  ${c.displayName.slice(0, 29).padEnd(30)}${money(c.totals.reported).padStart(16)}${money(c.totals.schE).padStart(18)}${ratio.padStart(8)}${money(c.totals.schG).padStart(16)}`
    )
  }
  const top10 = consultants.slice(0, 10)
  const topReported = top10.reduce((s, c) => s + c.totals.reported, 0)
  const topSchE = top10.reduce((s, c) => s + c.totals.schE, 0)
  console.log(
    `  ${'TOP-10 TOTAL'.padEnd(30)}${money(topReported).padStart(16)}${money(topSchE).padStart(18)}${(topSchE / topReported).toFixed(3).padStart(8)}`
  )

  console.log('\nCOUNTS')
  console.log(`  consultants          ${consultants.length}`)
  console.log(`  latest filings       ${latestKept.length} (of ${parentAll.length} raw)`)
  console.log(`  receipts             ${artifact.totals.receipts}`)
  console.log(`  reconciliation pairs ${artifact.totals.pairs}`)
  console.log(`  exact-match pairs    ${consultants.flatMap((c) => c.reconciliation).filter((p) => p.exactMatch).length}`)
  console.log(`  committees           ${committees.length}`)
  console.log(`  unresolved clients   ${unresolvedClients.length} (${money(unresolvedClients.reduce((s, u) => s + u.reported, 0))})`)
  console.log(`  reported (all)       ${money(artifact.totals.reportedAll)}`)
  console.log(`  reported (nid-resolved) ${money(artifact.totals.reportedReconcilable)}`)
  console.log(`  schedule E           ${money(artifact.totals.schE)}`)
  console.log(`  schedule G (separate) ${money(artifact.totals.schG)}`)
  console.log(`  contributions        ${matchedCount} corroborated of ${allMatches.length}`)
  console.log(`  SODA requests        ${requestCount}`)

  // ---- 17. write ----------------------------------------------------------
  const out = join(process.cwd(), ARTIFACT_PATH)
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, `${JSON.stringify(artifact, null, 2)}\n`)
  console.log(`\nwrote ${ARTIFACT_PATH} in ${((Date.now() - startedAt) / 1000).toFixed(1)}s`)
}

/** Shift a 'YYYY-MM-DD' string back by whole months using UTC arithmetic (day clamped). */
function shiftMonthsBack(day: string, months: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1 - months, 1))
  const lastDay = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate()
  t.setUTCDate(Math.min(d, lastDay))
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

/** The earlier of two 'YYYY-MM-DD' strings. */
function minDate(a: string, b: string): string {
  return a < b ? a : b
}

/** Shift a 'YYYY-MM-DD' string by whole days using UTC arithmetic. */
function shiftDays(day: string, delta: number): string {
  const [y, m, d] = day.split('-').map(Number)
  const t = new Date(Date.UTC(y, m - 1, d + delta))
  return `${t.getUTCFullYear()}-${pad2(t.getUTCMonth() + 1)}-${pad2(t.getUTCDate())}`
}

// CLI entry guard — module scope must stay side-effect-free (the artifact test
// imports ARTIFACT_PATH and PROJECTION from this file).
const isCliEntry = (() => {
  if (!process.argv[1]) return false
  try {
    return pathToFileURL(process.argv[1]).href === import.meta.url
  } catch {
    return false
  }
})()
if (isCliEntry) {
  main().catch((err) => {
    console.error(err)
    process.exitCode = 1
  })
}
