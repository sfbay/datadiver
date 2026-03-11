# Hook Consolidation — Hourly Pattern & Comparison Data

**Date:** 2026-03-11
**Scope:** Internal refactor — no user-facing changes
**Estimated reduction:** ~1,000 LOC across 11 hook files → 2 consolidated files + thin re-exports

## Problem

Six hourly pattern hooks and six comparison data hooks exist with 90-95% duplicated code. Each was created when its view was built, copying the previous version and changing dataset/field names. This creates maintenance burden — any bug fix or improvement must be applied N times.

## Design

### Part 1: Hourly Pattern Hooks

**Current state:** 6 hooks with identical logic, differing only in config:

| Hook | Dataset | Date Field |
|------|---------|------------|
| useHourlyPattern | fireEMSDispatch | received_dttm |
| useDispatchHourlyPattern | dispatch911Historical | received_datetime |
| use311HourlyPattern | cases311 | requested_datetime |
| usePoliceHourlyPattern | policeIncidents | incident_datetime |
| useCrashHourlyPattern | trafficCrashes | collision_datetime |
| useCitationHourlyPattern | parkingCitations | citation_issued_datetime |

**Approach:** Single factory function in `src/hooks/useHourlyPattern.ts`:

```typescript
interface HourlyPatternConfig {
  dataset: DatasetKey
  dateField: string
}

interface HourlyPatternResult {
  grid: number[][]        // 7x24: grid[dow][hour] = count
  hourTotals: number[]    // 24-element totals
  peakHour: number
  quietestHour: number
  isLoading: boolean
  error: string | null
}

function createHourlyPatternHook(name: string, config: HourlyPatternConfig) {
  // Inner function MUST have a unique use-prefixed name for React linter compliance.
  // Object.defineProperty sets the .name property to match the export name.
  const hook = (
    dateRange: { start: string; end: string },
    extraWhereClause?: string
  ): HourlyPatternResult => { ... }
  Object.defineProperty(hook, 'name', { value: name })
  return hook
}
```

**Exports from `useHourlyPattern.ts`:**
```typescript
export const useFireHourlyPattern = createHourlyPatternHook('useFireHourlyPattern', { dataset: 'fireEMSDispatch', dateField: 'received_dttm' })
export const useDispatchHourlyPattern = createHourlyPatternHook('useDispatchHourlyPattern', { dataset: 'dispatch911Historical', dateField: 'received_datetime' })
export const use311HourlyPattern = createHourlyPatternHook('use311HourlyPattern', { dataset: 'cases311', dateField: 'requested_datetime' })
export const usePoliceHourlyPattern = createHourlyPatternHook('usePoliceHourlyPattern', { dataset: 'policeIncidents', dateField: 'incident_datetime' })
export const useCrashHourlyPattern = createHourlyPatternHook('useCrashHourlyPattern', { dataset: 'trafficCrashes', dateField: 'collision_datetime' })
export const useCitationHourlyPattern = createHourlyPatternHook('useCitationHourlyPattern', { dataset: 'parkingCitations', dateField: 'citation_issued_datetime' })
```

**Migration:** Update imports in 5 view files. Delete 5 separate hook files.

### Part 2: Comparison Data Hooks

**Current state:** 6 hooks sharing the same scaffolding (fetch current + prior period, compute deltas, build daily trend) but with dataset-specific `computeStats` and `buildTrend` logic:

| Hook | Key Metric | Stats Shape |
|------|-----------|-------------|
| useComparisonData (Fire) | Response time (minutes) | avg, median, p90, total |
| useDispatchComparisonData | Response time (minutes) | avg, median, p90, total |
| use311ComparisonData | Resolution time (hours) | avgResolution, medianResolution, total, openCount, openPct |
| usePoliceComparisonData | Incident volume + dispatch linkage | total, linkedPct |
| useCrashComparisonData | Severity (fatalities, injuries) | total, fatalities, injuries, pedBikePct |
| useCitationComparisonData | Revenue (fines) | total, avgFine, outOfStatePct, totalFines |

**Approach:** Generic hook with strategy injection in `src/hooks/useComparisonData.ts`:

```typescript
interface ComparisonConfig<TRecord, TStats, TDeltas extends Record<string, number>> {
  dataset: DatasetKey
  dateField: string
  selectFields: string
  computeStats: (records: TRecord[]) => TStats
  computeDeltas: (current: TStats, prior: TStats) => TDeltas
  buildTrendPoint: (dayRecords: TRecord[], date: string) => DailyTrendPoint
}

function createComparisonHook<TRecord, TStats, TDeltas extends Record<string, number>>(
  name: string,
  config: ComparisonConfig<TRecord, TStats, TDeltas>
) {
  // Inner function named via Object.defineProperty for React linter + stack traces.
  const hook = (
    dateRange: { start: string; end: string },
    whereClause: string,
    comparisonDays: number | null,  // null = disabled (skip fetch, return empty state)
    currentRecords: TRecord[]
  ): ComparisonResult<TStats, TDeltas> => { ... }
  Object.defineProperty(hook, 'name', { value: name })
  return hook
}
```

**Generic result type:**
```typescript
interface ComparisonResult<TStats, TDeltas extends Record<string, number>> {
  currentStats: TStats | null
  comparisonStats: TStats | null
  deltas: TDeltas | null          // Typed per-dataset (preserves compile-time key checking)
  currentTrend: DailyTrendPoint[]
  comparisonTrend: DailyTrendPoint[]
  isLoading: boolean
}
```

Each dataset provides its own `computeStats`, `computeDeltas`, and `buildTrendPoint` functions as config. The generic hook handles: period offset calculation, parallel data fetching, delta computation, trend aggregation.

**Exports from `useComparisonData.ts`:**
```typescript
export const useFireComparisonData = createComparisonHook<FireEMSDispatch, ResponseTimeStats>({ ... })
export const useDispatchComparisonData = createComparisonHook<DispatchCall, ResponseTimeStats>({ ... })
export const use311ComparisonData = createComparisonHook<Cases311Record, ResolutionStats>({ ... })
export const usePoliceComparisonData = createComparisonHook<PoliceIncident, PoliceStats>({ ... })
export const useCrashComparisonData = createComparisonHook<TrafficCrash, CrashStats>({ ... })
export const useCitationComparisonData = createComparisonHook<ParkingCitation, CitationStats>({ ... })
```

**Migration:** Update imports in 6 view files. Delete 5 separate comparison hook files (base file gets rewritten).

## Files Changed

**New/rewritten (2):**
- `src/hooks/useHourlyPattern.ts` — rewritten as factory + 6 named exports
- `src/hooks/useComparisonData.ts` — rewritten as generic + 6 named exports

**Deleted (10):**
- `src/hooks/useDispatchHourlyPattern.ts`
- `src/hooks/use311HourlyPattern.ts`
- `src/hooks/usePoliceHourlyPattern.ts`
- `src/hooks/useCrashHourlyPattern.ts`
- `src/hooks/useCitationHourlyPattern.ts`
- `src/hooks/useDispatchComparisonData.ts`
- `src/hooks/use311ComparisonData.ts`
- `src/hooks/usePoliceComparisonData.ts`
- `src/hooks/useCrashComparisonData.ts`
- `src/hooks/useCitationComparisonData.ts`

**Updated imports (6 views):**
- `src/views/EmergencyResponse/EmergencyResponse.tsx`
- `src/views/Dispatch911/Dispatch911.tsx`
- `src/views/Cases311/Cases311.tsx`
- `src/views/CrimeIncidents/CrimeIncidents.tsx`
- `src/views/TrafficSafety/TrafficSafety.tsx`
- `src/views/ParkingCitations/ParkingCitations.tsx`

## Verification

- `npx tsc --noEmit` passes
- `pnpm build` succeeds
- Each view loads and renders data correctly (manual spot-check)
- Named exports preserve existing hook names → minimal diff at call sites
- **Exception:** `EmergencyResponse.tsx` must rename `useComparisonData` → `useFireComparisonData` (the only call site where the export name changes). Also export `useComparisonData` as a deprecated alias if needed.

## Out of Scope

- Detail panel consolidation (Tier 2)
- Filter component consolidation (Tier 2)
- View file decomposition (Tier 3)
- UI/icon inconsistency fixes (Tier 2)
