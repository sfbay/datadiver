/** Budget data hooks — server-side aggregation via Socrata for accurate totals */

import { useMemo } from 'react'
import { useDataset } from '@/hooks/useDataset'
import type { FiscalYear, DepartmentAggRow, BudgetVsActualRow, SpendingTrendRow } from '@/types/budget'

/** Aggregated budget by department for a given fiscal year */
export function useDepartmentBudget(fiscalYear: FiscalYear) {
  const where = `fiscal_year = '${fiscalYear}' AND revenue_or_spending = 'Spending'`
  return useDataset<DepartmentAggRow>(
    'budget',
    {
      $select: 'department, SUM(budget) as total',
      $where: where,
      $group: 'department',
      $order: 'total DESC',
      $limit: 200,
    },
    [fiscalYear]
  )
}

/** Aggregated actual spending by department for a given fiscal year */
export function useDepartmentSpending(fiscalYear: FiscalYear) {
  const where = `fiscal_year = '${fiscalYear}' AND revenue_or_spending = 'Spending'`
  return useDataset<DepartmentAggRow>(
    'spendingRevenue',
    {
      $select: 'department, SUM(amount) as total',
      $where: where,
      $group: 'department',
      $order: 'total DESC',
      $limit: 200,
    },
    [fiscalYear]
  )
}

/** Budget vs actual spending with variance calculation — joined client-side from two server-side aggregations */
export function useBudgetVsActual(fiscalYear: FiscalYear) {
  const budgetQuery = useDepartmentBudget(fiscalYear)
  const spendingQuery = useDepartmentSpending(fiscalYear)

  const data = useMemo((): BudgetVsActualRow[] => {
    if (budgetQuery.data.length === 0 || spendingQuery.data.length === 0) return []

    const spendingMap = new Map(
      spendingQuery.data.map((r) => [r.department, parseFloat(r.total) || 0])
    )

    return budgetQuery.data
      .map((r) => {
        const budgetTotal = parseFloat(r.total) || 0
        const spendingTotal = spendingMap.get(r.department) || 0
        const variance = spendingTotal - budgetTotal
        const variancePct = budgetTotal > 0 ? (variance / budgetTotal) * 100 : 0
        return {
          department: r.department,
          budget_total: budgetTotal,
          spending_total: spendingTotal,
          variance,
          variance_pct: variancePct,
        }
      })
      .sort((a, b) => b.spending_total - a.spending_total)
  }, [budgetQuery.data, spendingQuery.data])

  return {
    data,
    isLoading: budgetQuery.isLoading || spendingQuery.isLoading,
    error: budgetQuery.error || spendingQuery.error,
  }
}

/** Multi-year spending trend, optionally filtered by department and/or character */
export function useSpendingTrend(department?: string, character?: string) {
  const where = useMemo(() => {
    const conditions = ["revenue_or_spending = 'Spending'"]
    if (department) conditions.push(`department = '${department.replace(/'/g, "''")}'`)
    if (character) conditions.push(`character = '${character.replace(/'/g, "''")}'`)
    return conditions.join(' AND ')
  }, [department, character])

  return useDataset<SpendingTrendRow>(
    'spendingRevenue',
    {
      $select: 'fiscal_year, department, SUM(amount) as total',
      $where: where,
      $group: 'fiscal_year, department',
      $order: 'fiscal_year ASC',
      $limit: 5000,
    },
    [where]
  )
}

/** Total budget and total spending for a fiscal year (single-row aggregations) */
export function useBudgetTotals(fiscalYear: FiscalYear) {
  const budgetTotal = useDataset<{ total: string }>(
    'budget',
    {
      $select: 'SUM(budget) as total',
      $where: `fiscal_year = '${fiscalYear}' AND revenue_or_spending = 'Spending'`,
    },
    [fiscalYear]
  )

  const spendingTotal = useDataset<{ total: string }>(
    'spendingRevenue',
    {
      $select: 'SUM(amount) as total',
      $where: `fiscal_year = '${fiscalYear}' AND revenue_or_spending = 'Spending'`,
    },
    [fiscalYear]
  )

  const priorSpendingTotal = useDataset<{ total: string }>(
    'spendingRevenue',
    {
      $select: 'SUM(amount) as total',
      $where: `fiscal_year = '${fiscalYear - 1}' AND revenue_or_spending = 'Spending'`,
    },
    [fiscalYear]
  )

  return useMemo(() => {
    const budget = parseFloat(budgetTotal.data[0]?.total) || 0
    const spending = parseFloat(spendingTotal.data[0]?.total) || 0
    const priorSpending = parseFloat(priorSpendingTotal.data[0]?.total) || 0
    const spendingPct = budget > 0 ? (spending / budget) * 100 : 0
    const yoyGrowth = priorSpending > 0 ? ((spending - priorSpending) / priorSpending) * 100 : 0

    return {
      budget,
      spending,
      spendingPct,
      yoyGrowth,
      priorSpending,
      isLoading: budgetTotal.isLoading || spendingTotal.isLoading || priorSpendingTotal.isLoading,
      error: budgetTotal.error || spendingTotal.error || priorSpendingTotal.error,
    }
  }, [budgetTotal, spendingTotal, priorSpendingTotal])
}
