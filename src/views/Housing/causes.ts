// Eviction Notices (5cei-gny5) is WIDE: one boolean column per just-cause ground.
// Groups follow the Rent Board's no-fault / at-fault taxonomy.

export const NO_FAULT_CAUSES = [
  'owner_move_in', 'ellis_act_withdrawal', 'demolition', 'capital_improvement',
  'substantial_rehab', 'condo_conversion', 'development', 'lead_remediation',
  'good_samaritan_ends',
] as const

export const AT_FAULT_CAUSES = [
  'non_payment', 'breach', 'nuisance', 'illegal_use', 'late_payments',
  'failure_to_sign_renewal', 'access_denial', 'unapproved_subtenant',
  'roommate_same_unit',
] as const

export const OTHER_CAUSES = ['other_cause'] as const

export const ALL_CAUSES = [...NO_FAULT_CAUSES, ...AT_FAULT_CAUSES, ...OTHER_CAUSES]
export type CauseColumn = (typeof ALL_CAUSES)[number]

export const CAUSE_GROUPS: Record<string, readonly CauseColumn[]> = {
  'No-fault': NO_FAULT_CAUSES,
  'At-fault': AT_FAULT_CAUSES,
  Other: OTHER_CAUSES,
}

export const CAUSE_LABELS: Record<CauseColumn, string> = {
  owner_move_in: 'Owner move-in', ellis_act_withdrawal: 'Ellis Act withdrawal',
  demolition: 'Demolition', capital_improvement: 'Capital improvement',
  substantial_rehab: 'Substantial rehab', condo_conversion: 'Condo conversion',
  development: 'Development', lead_remediation: 'Lead remediation',
  good_samaritan_ends: 'Good Samaritan ends', non_payment: 'Non-payment of rent',
  breach: 'Breach of lease', nuisance: 'Nuisance', illegal_use: 'Illegal use',
  late_payments: 'Habitual late payments', failure_to_sign_renewal: 'Failure to sign renewal',
  access_denial: 'Denial of access', unapproved_subtenant: 'Unapproved subtenant',
  roommate_same_unit: 'Roommate in same unit', other_cause: 'Other cause',
}

/** Empty or complete selection means "all" → no clause. Unknown values dropped. */
export function buildCauseClause(selected: Set<string>): string {
  const valid = ALL_CAUSES.filter((c) => selected.has(c))
  if (valid.length === 0 || valid.length === ALL_CAUSES.length) return ''
  return `(${valid.map((c) => `${c} = true`).join(' OR ')})`
}

/** One wide aggregate row: sum(case(col = true, 1, true, 0)) per cause (live-verified syntax). */
export function causeBreakdownSelect(): string {
  return ALL_CAUSES.map((c) => `sum(case(${c} = true, 1, true, 0)) as ${c}`).join(', ')
}

export function noFaultClause(): string {
  return `(${NO_FAULT_CAUSES.map((c) => `${c} = true`).join(' OR ')})`
}
