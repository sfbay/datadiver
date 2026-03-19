/** City Budget & Spending type definitions */

/** SF fiscal year — integer representing the ending calendar year (e.g., 2025 = FY2024-25) */
export type FiscalYear = number

/** Shared field hierarchy across Budget, Spending, and Vendor Payments datasets */
interface BudgetHierarchy {
  organization_group: string
  organization_group_code: string
  department: string
  department_code: string
  program: string
  program_code: string
  character: string
  character_code: string
  object: string
  object_code: string
  sub_object: string
  sub_object_code: string
  fund: string
  fund_code: string
  fund_type: string
  fund_type_code: string
}

/** Budget dataset (xdgd-c79v) — planned appropriations */
export interface BudgetRecord extends BudgetHierarchy {
  fiscal_year: string
  revenue_or_spending: string
  budget: string // dollar amount as string from API
}

/** Spending & Revenue dataset (bpnb-jwfb) — actual spending/revenue */
export interface SpendingRecord extends BudgetHierarchy {
  fiscal_year: string
  revenue_or_spending: string
  amount: string
}

/** Vendor Payments dataset (n9pm-xkyq) — individual payments to vendors */
export interface VendorPaymentRecord extends BudgetHierarchy {
  fiscal_year: string
  revenue_or_spending: string
  vendor: string
  purchase_order: string
  vouchers_paid: string
  vouchers_pending: string
  voucher: string
  contract_number: string
  contract_title: string
  non_profit_indicator: string
}

/** Supplier Contracts dataset (cqi5-hm2d) */
export interface SupplierContractRecord {
  contract_no: string
  contract_title: string
  term_start_date: string
  term_end_date: string
  department: string
  prime_contractor: string
  scope_of_work: string
  agreed_amt: string
  consumed_amt: string
  pmt_amt: string
  remaining_amt: string
  sole_source_flg: string
}

// ── Server-side aggregation row types ──────────────────────

/** Department budget/spending aggregation */
export interface DepartmentAggRow {
  department: string
  total: string
}

/** Department budget vs actual spending (joined) */
export interface BudgetVsActualRow {
  department: string
  budget_total: number
  spending_total: number
  variance: number
  variance_pct: number
}

/** Multi-year spending trend per department */
export interface SpendingTrendRow {
  fiscal_year: string
  department: string
  total: string
}

/** Vendor payment aggregation */
export interface VendorAggRow {
  vendor: string
  total_paid: string
  payment_count: string
}

/** Vendor payment with department breakdown */
export interface VendorDepartmentRow {
  vendor: string
  department: string
  total_paid: string
}

/** Sub-object aggregation (for advertising layer) */
export interface SubObjectAggRow {
  sub_object: string
  total: string
  count: string
}

/** Department × sub_object aggregation for anomaly detection */
export interface DeptSubObjectAggRow {
  department: string
  sub_object: string
  fiscal_year: string
  total: string
}
