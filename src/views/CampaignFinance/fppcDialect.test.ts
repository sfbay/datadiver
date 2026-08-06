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
      $select: 'cand_naml, cand_namf, bal_name, sup_opp_cd, SUM(amount) as total',
      $where: "exp_date >= '2024-01-01T00:00:00' AND exp_date <= '2024-11-05T23:59:59'",
      $group: 'cand_naml, cand_namf, bal_name, sup_opp_cd', $order: 'total DESC', $limit: 200 } })
    expect(b.lateContribsSummary(S, E)).toEqual({ datasetKey: 'fppc497', params: {
      $select: 'SUM(amount) as total, COUNT(*) as cnt',
      $where: "ctrib_date >= '2024-01-01T00:00:00' AND ctrib_date <= '2024-11-05T23:59:59'" } })
    expect(b.nullDateDisclosure()).toEqual({ datasetKey: 'fppcSchE', params: {
      $select: 'COUNT(*) as cnt, SUM(amount) as total', $where: 'expn_date IS NULL' } })
  })
})
