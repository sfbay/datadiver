// Pure shared types for the campaign-consultant crosswalk + reconciliation pipeline.
// This module imports nothing from `src/` outside `src/lib/consultants/` — it must be
// importable from Node-only Vitest with no app/store/React dependency.

/** A row from the parent SFEC campaign-consultant filing dataset (`iv34-5p9x`). */
export interface ParentRow {
  envelope_id: string;
  filingseries: string;
  datesigned: string;
  filinginformation_reporttype:
    | 'Quarterly Report'
    | 'Initial Registration'
    | 'Termination Report'
    | 'Reregistration'
    | string;
  filinginformation_filingtype: string;
  filinginformation_originalfilingdate?: string;
  filinginformation_descriptionofamendment?: string;
  filinginformation_reportingperiod_reportingperiodstartdate?: string;
  filinginformation_reportingperiod_reportingperiodenddate?: string;
  campaignconsultantname: string;
  typeofcampaignconsultant?: string;
  campaignconsultantbusinessaddress_city?: string;
  campaignconsultantbusinessaddress_state?: string;
  clientinformation_hasclients?: boolean;
  clientinformation_total?: string | number;
  politicalcontributions_subtotalofitemizedcontributions?: string | number;
  politicalcontributions_totalunitemizedcontributions?: string | number;
  politicalcontributions_totalcontributions?: string | number;
  docusign_filing?: { url: string } | string;
  ':created_at'?: string;
}

/** A child row from the consultant's client list (`m75g-xpci`). */
export interface ClientRow {
  envelope_id: string;
  entry_id: string;
  filingseries: string;
  clientlist_clientname?: string;
  clientlist_economicconsiderationreceived?: string | number;
}

/** A child row from the consultant's political-contributions list (`7gkm-68qf`). */
export interface ContributionRow {
  envelope_id: string;
  entry_id: string;
  filingseries: string;
  contributionlist_contrecipientname?: string;
  contributionlist_nameofcontributororclient?: string;
  contributionlist_amountofcontribution?: string | number;
  contributionlist_dateofcontribution?: string;
  contributionlist_sourceofthecontribution?: string;
  contributionlist_nameofcandidateormeasure?: string;
}

/** Result of picking the latest (by `datesigned`) row per `filingseries`. */
export interface LatestSplit {
  latest: ParentRow[];
  superseded: ParentRow[];
}

/**
 * A collapsed restatement pair: a Termination Report restating a Quarterly Report
 * (or vice versa, whichever was signed later) for the same consultant + reporting period.
 */
export interface Restatement {
  keptEnvelope: string;
  droppedEnvelope: string;
  consultantKey: string;
  periodStart: string;
  keptTotal: number;
  droppedTotal: number;
  delta: number;
  exact: boolean;
}

/** Output of `collapseRestatements`: the surviving client rows + a log of what was collapsed. */
export interface CollapseResult {
  clientRows: ClientRow[];
  restatements: Restatement[];
}

// --- reconcile.ts types --------------------------------------------------

/** A collapsed consultant-reported receipt for one (consultant, client, reporting period). */
export interface Receipt {
  consultantId: string;
  clientString: string;
  filerNid: string | null;
  periodStart: string;
  periodEnd: string;
  reportType: string;
  envelope: string;
  reported: number;
}

/** An expenditure row from FPPC/Ethics `pitq-e56w` (Schedule E/F/G transactions). */
export interface PitqExpRow {
  filer_nid: string;
  filer_name?: string;
  form_type: string;
  record_type: string;
  transaction_code?: string;
  transaction_amount_1?: string | number;
  calculated_amount?: string | number;
  transaction_date?: string;
  filing_date?: string;
  start_date?: string;
  end_date?: string;
  filing_nid?: string;
  transaction_id?: string;
  g_from_ef?: string;
  transaction_last_name?: string;
  transaction_first_name?: string;
}

/** Reconciliation of one (consultant, filer, reporting period) against the committee's own Schedule E/G. */
export interface ReconPair {
  consultantId: string;
  filerNid: string;
  filerName?: string;
  periodStart: string;
  periodEnd: string;
  reported: number;
  schE: number;
  schEUndatedAssigned: number;
  schG: number;
  ratio: number | null;
  exactMatch: boolean;
  rowsE: number;
  committeeCompleteThrough?: string;
}

/** A receipt row from FPPC/Ethics `pitq-e56w` (Schedule RCPT/S497 transactions). */
export interface PitqRcptRow {
  filer_nid: string;
  filer_name?: string;
  record_type: string;
  form_type: string;
  transaction_last_name?: string;
  transaction_first_name?: string;
  transaction_amount_1?: string | number;
  transaction_date?: string;
}

/** Result of matching one consultant-reported political contribution against the recipient's own receipts. */
export interface ContributionMatch {
  envelope: string;
  entry_id: string;
  recipient: string;
  recipientNid: string | null;
  amount: number;
  date?: string;
  matched: 'exact' | 'principal' | 'below-threshold' | 'recipient-not-in-pitq' | 'unmatched';
  pitqTransactionDate?: string;
}
