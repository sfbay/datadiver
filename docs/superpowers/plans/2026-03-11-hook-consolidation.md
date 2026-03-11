# Hook Consolidation Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Consolidate 12 duplicated hooks (6 hourly pattern + 6 comparison data) into 2 factory-based files with named exports, eliminating ~1,000 LOC of duplication.

**Architecture:** Factory functions (`createHourlyPatternHook`, `createComparisonHook`) that accept dataset config and return typed hooks. Hourly hooks are pure config swaps. Comparison hooks use strategy injection for dataset-specific `computeStats`/`computeDeltas`/`buildTrendPoint` logic.

**Tech Stack:** React 18, TypeScript, Socrata SODA API via `useDataset` hook

**Spec:** `docs/superpowers/specs/2026-03-11-hook-consolidation-design.md`

---

## Chunk 1: Hourly Pattern Hook Consolidation

### Task 1: Read all 6 hourly pattern hooks and extract the shared logic

**Files:**
- Read: `src/hooks/useHourlyPattern.ts` (base — Fire/EMS)
- Read: `src/hooks/useDispatchHourlyPattern.ts`
- Read: `src/hooks/use311HourlyPattern.ts`
- Read: `src/hooks/usePoliceHourlyPattern.ts`
- Read: `src/hooks/useCrashHourlyPattern.ts`
- Read: `src/hooks/useCitationHourlyPattern.ts`

- [ ] **Step 1: Read all 6 files and confirm they are structurally identical**

Verify each hook:
1. Calls `useDataset` with a `$select` of `date_extract_hh(DATEFIELD) as hour, date_extract_dow(DATEFIELD) as dow, count(*) as call_count`
2. Groups by `hour, dow`
3. Has identical `computeStats` logic (grid initialization, hour/dow parsing, peak/quietest)
4. Returns `{ grid, hourTotals, peakHour, quietestHour, isLoading, error }`

Note the exact config differences:

| Export Name | Dataset Key | Date Field |
|------------|-------------|------------|
| useFireHourlyPattern | fireEMSDispatch | received_dttm |
| useDispatchHourlyPattern | dispatch911Historical | received_datetime |
| use311HourlyPattern | cases311 | requested_datetime |
| usePoliceHourlyPattern | policeIncidents | incident_datetime |
| useCrashHourlyPattern | trafficCrashes | collision_datetime |
| useCitationHourlyPattern | parkingCitations | citation_issued_datetime |

### Task 2: Rewrite `useHourlyPattern.ts` as a factory with 6 named exports

**Files:**
- Rewrite: `src/hooks/useHourlyPattern.ts`

- [ ] **Step 1: Rewrite the file**

The file should contain:
1. `HourlyPatternConfig` interface: `{ dataset: DatasetKey, dateField: string }`
2. `HourlyPatternResult` interface (the shared return type)
3. `createHourlyPatternHook(name, config)` factory function that:
   - Returns an arrow function that calls `useDataset` with the config's dataset/dateField
   - Uses `Object.defineProperty(hook, 'name', { value: name })` to set the function name for React linter and stack traces
   - Contains the shared `computeStats` logic inline
4. Six named exports, one per dataset:
   ```typescript
   export const useFireHourlyPattern = createHourlyPatternHook('useFireHourlyPattern', { dataset: 'fireEMSDispatch', dateField: 'received_dttm' })
   export const useDispatchHourlyPattern = createHourlyPatternHook('useDispatchHourlyPattern', { dataset: 'dispatch911Historical', dateField: 'received_datetime' })
   export const use311HourlyPattern = createHourlyPatternHook('use311HourlyPattern', { dataset: 'cases311', dateField: 'requested_datetime' })
   export const usePoliceHourlyPattern = createHourlyPatternHook('usePoliceHourlyPattern', { dataset: 'policeIncidents', dateField: 'incident_datetime' })
   export const useCrashHourlyPattern = createHourlyPatternHook('useCrashHourlyPattern', { dataset: 'trafficCrashes', dateField: 'collision_datetime' })
   export const useCitationHourlyPattern = createHourlyPatternHook('useCitationHourlyPattern', { dataset: 'parkingCitations', dateField: 'citation_issued_datetime' })
   ```
5. Also export `HourlyPatternResult` type for consumers

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: May show errors in view files still importing from old paths — that's expected, fixed in Task 3.

### Task 3: Update view imports to use new exports

**Files:**
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx`
- Modify: `src/views/Dispatch911/Dispatch911.tsx`
- Modify: `src/views/Cases311/Cases311.tsx`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx`

- [ ] **Step 1: Update each view's import**

For each view, find the current import (e.g., `import { useDispatchHourlyPattern } from '@/hooks/useDispatchHourlyPattern'`) and change it to import from `'@/hooks/useHourlyPattern'`.

Specific mappings:
- EmergencyResponse: `import { useHourlyPattern }` → `import { useFireHourlyPattern }` from `'@/hooks/useHourlyPattern'`. Also update the call site from `useHourlyPattern(...)` to `useFireHourlyPattern(...)`.
- Dispatch911: `import { useDispatchHourlyPattern }` → same name, just change path to `'@/hooks/useHourlyPattern'`
- Cases311: `import { use311HourlyPattern }` → same name, just change path
- CrimeIncidents: `import { usePoliceHourlyPattern }` → same name, just change path
- TrafficSafety: `import { useCrashHourlyPattern }` → same name, just change path
- ParkingCitations: `import { useCitationHourlyPattern }` → same name, just change path

**Note:** EmergencyResponse is the only view where the hook name changes (`useHourlyPattern` → `useFireHourlyPattern`). Update the call site too.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS (no errors)

### Task 4: Delete old hourly pattern hook files

**Files:**
- Delete: `src/hooks/useDispatchHourlyPattern.ts`
- Delete: `src/hooks/use311HourlyPattern.ts`
- Delete: `src/hooks/usePoliceHourlyPattern.ts`
- Delete: `src/hooks/useCrashHourlyPattern.ts`
- Delete: `src/hooks/useCitationHourlyPattern.ts`

- [ ] **Step 1: Delete the 5 files**

```bash
rm src/hooks/useDispatchHourlyPattern.ts src/hooks/use311HourlyPattern.ts src/hooks/usePoliceHourlyPattern.ts src/hooks/useCrashHourlyPattern.ts src/hooks/useCitationHourlyPattern.ts
```

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

- [ ] **Step 3: Verify build**

Run: `pnpm build`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "refactor: consolidate 6 hourly pattern hooks into single factory"
```

---

## Chunk 2: Comparison Data Hook Consolidation

### Task 5: Read all 6 comparison hooks and catalog their strategy differences

**Files:**
- Read: `src/hooks/useComparisonData.ts` (base — Fire/EMS)
- Read: `src/hooks/useDispatchComparisonData.ts`
- Read: `src/hooks/use311ComparisonData.ts`
- Read: `src/hooks/usePoliceComparisonData.ts`
- Read: `src/hooks/useCrashComparisonData.ts`
- Read: `src/hooks/useCitationComparisonData.ts`

- [ ] **Step 1: Read all 6 files and identify the shared scaffolding vs per-dataset strategies**

The shared scaffolding (identical in all 6):
1. `useState` for currentStats, comparisonStats, deltas, trends, isLoading
2. `useEffect` that: calculates comparison period dates via `daysBeforeDate()`, fetches comparison period data via `useDataset`, computes stats for both periods, computes deltas, builds daily trend arrays
3. `useMemo` for trend computation from currentRecords
4. Early return when `comparisonDays === null`

The per-dataset strategies (DIFFERENT in each):
1. **`computeStats(records)`** — extracts dataset-specific metrics
2. **`computeDeltas(current, prior)`** — calculates percentage changes
3. **`buildTrendPoint(dayRecords, date)`** — aggregates one day's records into a trend point
4. **`SELECT_FIELDS`** — the Socrata `$select` clause for the comparison query
5. **Stats type** — different interface per dataset
6. **Deltas type** — different keys per dataset

Record the exact `computeStats`, `computeDeltas`, `buildTrendPoint`, and `SELECT_FIELDS` for each of the 6 hooks — these become the strategy configs.

### Task 6: Rewrite `useComparisonData.ts` as a generic factory

**Files:**
- Rewrite: `src/hooks/useComparisonData.ts`

- [ ] **Step 1: Write the generic factory infrastructure**

The file should contain:
1. Import types: `DatasetKey` from datasets, `DailyTrendPoint` (define locally or import), `daysBeforeDate`/`yearAgo` from time utils, `useDataset` from hooks
2. `ComparisonConfig<TRecord, TStats, TDeltas>` interface with: dataset, dateField, selectFields, computeStats, computeDeltas, buildTrendPoint
3. `ComparisonResult<TStats, TDeltas>` interface with: currentStats, comparisonStats, deltas, currentTrend, comparisonTrend, isLoading
4. `createComparisonHook(name, config)` factory that:
   - Returns a hook function accepting `(dateRange, whereClause, comparisonDays: number | null, currentRecords: TRecord[])`
   - Handles the `comparisonDays === null` early-return path (returns empty state, `isLoading: false`)
   - Fetches comparison period data via `useDataset`
   - Calls `config.computeStats` on both current and comparison records
   - Calls `config.computeDeltas` for delta computation
   - Builds daily trends via `config.buildTrendPoint`
   - Uses `Object.defineProperty(hook, 'name', { value: name })` for React linter compliance

- [ ] **Step 2: Add the 6 dataset-specific strategy configs and exports**

For each dataset, define a config object with the exact `computeStats`, `computeDeltas`, `buildTrendPoint`, and `selectFields` extracted from the original hook file (Task 5). Create the named export:

```typescript
// Stats types
interface ResponseTimeStats { avg: number; median: number; p90: number; total: number }
interface ResponseTimeDeltas { avg: number; median: number; p90: number; total: number }

interface ResolutionStats { avgResolution: number; medianResolution: number; total: number; openCount: number; openPct: number }
interface ResolutionDeltas { avgResolution: number; total: number; openPct: number }

interface PoliceStats { total: number; linkedPct: number }
interface PoliceDeltas { total: number; linkedPct: number }

interface CrashStats { total: number; fatalities: number; injuries: number; pedBikePct: number }
interface CrashDeltas { total: number; injuries: number; pedBikePct: number }

interface CitationStats { total: number; avgFine: number; outOfStatePct: number; totalFines: number }
interface CitationDeltas { total: number; avgFine: number; outOfStatePct: number }

// Named exports
export const useFireComparisonData = createComparisonHook<FireEMSDispatch, ResponseTimeStats, ResponseTimeDeltas>('useFireComparisonData', { ... })
export const useDispatchComparisonData = createComparisonHook<DispatchCall, ResponseTimeStats, ResponseTimeDeltas>('useDispatchComparisonData', { ... })
export const use311ComparisonData = createComparisonHook<Cases311Record, ResolutionStats, ResolutionDeltas>('use311ComparisonData', { ... })
export const usePoliceComparisonData = createComparisonHook<PoliceIncident, PoliceStats, PoliceDeltas>('usePoliceComparisonData', { ... })
export const useCrashComparisonData = createComparisonHook<TrafficCrash, CrashStats, CrashDeltas>('useCrashComparisonData', { ... })
export const useCitationComparisonData = createComparisonHook<ParkingCitation, CitationStats, CitationDeltas>('useCitationComparisonData', { ... })
```

**Critical:** Copy each `computeStats`, `computeDeltas`, and `buildTrendPoint` function body EXACTLY from the original hook files. These contain dataset-specific logic (different field names, different formulas, different filter thresholds). Do NOT generalize them — they are intentionally different per dataset.

Also export all Stats and Deltas types, plus `DailyTrendPoint` and `ComparisonResult`, for view consumers.

- [ ] **Step 3: Verify compilation of the new file in isolation**

Run: `npx tsc --noEmit`
Expected: May show errors in views still importing from old paths — that's expected.

### Task 7: Update view imports for comparison hooks

**Files:**
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx`
- Modify: `src/views/Dispatch911/Dispatch911.tsx`
- Modify: `src/views/Cases311/Cases311.tsx`
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx`

- [ ] **Step 1: Update each view's import**

Specific mappings:
- EmergencyResponse: `import { useComparisonData } from '@/hooks/useComparisonData'` → `import { useFireComparisonData } from '@/hooks/useComparisonData'`. **Also rename the call site** from `useComparisonData(...)` to `useFireComparisonData(...)`. Check for any type imports (`ComparisonStats`, `ComparisonResult`) and update them too.
- Dispatch911: `import { useDispatchComparisonData }` → same name, change path to `'@/hooks/useComparisonData'`
- Cases311: `import { use311ComparisonData }` → same name, change path. Check for `ComparisonStats311` type import — it becomes `ResolutionStats`.
- CrimeIncidents: `import { usePoliceComparisonData }` → same name, change path
- TrafficSafety: `import { useCrashComparisonData }` → same name, change path
- ParkingCitations: `import { useCitationComparisonData }` → same name, change path

**Important:** Some views import type interfaces (e.g., `ComparisonStats`, `ComparisonStats311`, `DailyTrendPoint`). These must also be updated to import from the new consolidated file with their new names.

- [ ] **Step 2: Verify compilation**

Run: `npx tsc --noEmit`
Expected: PASS

### Task 8: Delete old comparison hook files

**Files:**
- Delete: `src/hooks/useDispatchComparisonData.ts`
- Delete: `src/hooks/use311ComparisonData.ts`
- Delete: `src/hooks/usePoliceComparisonData.ts`
- Delete: `src/hooks/useCrashComparisonData.ts`
- Delete: `src/hooks/useCitationComparisonData.ts`

- [ ] **Step 1: Delete the 5 files**

```bash
rm src/hooks/useDispatchComparisonData.ts src/hooks/use311ComparisonData.ts src/hooks/usePoliceComparisonData.ts src/hooks/useCrashComparisonData.ts src/hooks/useCitationComparisonData.ts
```

- [ ] **Step 2: Verify compilation and build**

Run: `npx tsc --noEmit && pnpm build`
Expected: PASS

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "refactor: consolidate 6 comparison data hooks into single generic factory"
```
