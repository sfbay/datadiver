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
  selfFunding(start: string, end: string): FppcQuerySpec
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

const SF_DONOR_GROUP = 'transaction_first_name, transaction_last_name, transaction_city, transaction_state, transaction_zip, entity_code'

function esc(v: string): string {
  return v.replace(/'/g, "''")
}

/** Inclusive date-window WHERE fragment: field >= 'sT00:00:00' AND field <= 'eT23:59:59'. */
export function dw(field: string, start: string, end: string): string {
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
  // Grouped on the whole identity. Grouping on last name alone merged every
  // "Chan" (and every "Jones") into one bar — a wrong ranking, not a thin one.
  topDonors: (nid, s, e) => ({ datasetKey: CF, params: {
    $select: `${SF_DONOR_GROUP}, MAX(transaction_employer) as employer, MAX(transaction_occupation) as occupation, COUNT(*) as gifts, MIN(calculated_date) as first_date, MAX(calculated_date) as last_date, SUM(calculated_amount) as total`,
    $where: `form_type='A' AND ${SF_BUILDERS.filerWhere(nid)} AND ${dw('calculated_date', s, e)}`,
    $group: SF_DONOR_GROUP, $order: 'total DESC', $limit: 10 } }),
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
    $select: 'tran_namf as transaction_first_name, tran_naml as transaction_last_name, tran_city as transaction_city, tran_state as transaction_state, tran_zip4 as transaction_zip, entity_cd as entity_code, MAX(tran_emp) as employer, MAX(tran_occ) as occupation, COUNT(*) as gifts, MIN(tran_date) as first_date, MAX(tran_date) as last_date, SUM(tran_amt1) as total',
    $where: `${OAK_BUILDERS.filerWhere(id)} AND ${dw('tran_date', s, e)}`,
    $group: 'tran_namf, tran_naml, tran_city, tran_state, tran_zip4, entity_cd', $order: 'total DESC', $limit: 10 } }),
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
    $select: 'cand_naml, cand_namf, bal_name, sup_opp_cd, SUM(amount) as total',
    $where: dw('exp_date', s, e),
    $group: 'cand_naml, cand_namf, bal_name, sup_opp_cd', $order: 'total DESC', $limit: 200 } }),
  lateContribsSummary: (s, e) => ({ datasetKey: 'fppc497', params: {
    $select: 'SUM(amount) as total, COUNT(*) as cnt', $where: dw('ctrib_date', s, e) } }),
  nullDateDisclosure: () => ({ datasetKey: 'fppcSchE', params: {
    $select: 'COUNT(*) as cnt, SUM(amount) as total', $where: 'expn_date IS NULL' } }),
}

export function fppcBuildersFor(cityId: 'sf' | 'oakland'): FppcQueryBuilders {
  return cityId === 'oakland' ? OAK_BUILDERS : SF_BUILDERS
}
