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
