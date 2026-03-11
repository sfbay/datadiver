# Data Transformation Hook Extraction Plan

> **For agentic workers:** REQUIRED: Use superpowers:executing-plans to implement this plan.

**Goal:** Extract inline data transformation logic (useMemo blocks, filtering, aggregation) from 3 large view files into dedicated custom hooks, reducing ~419 LOC from views and improving testability.

**Architecture:** Each view gets a companion hook that encapsulates its data transformation pipeline. The view passes raw data + filters in, gets processed/derived data out.

---

### Task 1: Extract BusinessActivity data transformations

**Files:**
- Read: `src/views/BusinessActivity/BusinessActivity.tsx` (1217 LOC)
- Create: `src/views/BusinessActivity/useBusinessActivityData.ts`

- [ ] **Step 1:** Read BusinessActivity.tsx. Identify data transformation blocks (~181 LOC):
  - `useMemo` blocks that transform raw records into map-ready GeoJSON
  - Point-in-polygon calculations for neighborhood assignment
  - Z-score computations for sector anomalies
  - Filtering logic (by sector, by date)
  - Any `useMemo` that derives stat values, chart data, or sidebar data from raw records

- [ ] **Step 2:** Create `useBusinessActivityData.ts` hook. It should accept the raw data + filter state as parameters and return all derived data. The hook contains the `useMemo` blocks extracted from the view.

Interface pattern:
```typescript
function useBusinessActivityData(
  rawRecords: BusinessLocationRecord[],
  filters: { selectedSectors: Set<string>, dateRange: { start: string, end: string } },
  // ... other inputs the memos depend on
) {
  // All the useMemo transformations move here
  return { mapPoints, sectorEntries, neighborhoodStats, chartData, ... }
}
```

- [ ] **Step 3:** Update BusinessActivity.tsx to import and call the hook, removing the inline useMemo blocks.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 2: Extract TrafficSafety data transformations

**Files:**
- Read: `src/views/TrafficSafety/TrafficSafety.tsx` (1156 LOC)
- Create: `src/views/TrafficSafety/useTrafficSafetyData.ts`

- [ ] **Step 1:** Read TrafficSafety.tsx. Identify data transformations (~151 LOC):
  - Severity aggregation, mode breakdown
  - Neighborhood crash stats
  - Anomaly z-score calculations
  - Filtering by crash type, severity

- [ ] **Step 2:** Create the hook with appropriate inputs/outputs.

- [ ] **Step 3:** Update the view.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 3: Extract EmergencyResponse data transformations

**Files:**
- Read: `src/views/EmergencyResponse/EmergencyResponse.tsx` (1063 LOC)
- Create: `src/views/EmergencyResponse/useEmergencyResponseData.ts`

- [ ] **Step 1:** Read EmergencyResponse.tsx. Identify data transformations (~87 LOC):
  - Response time calculations
  - Neighborhood grouping
  - Priority breakdown

- [ ] **Step 2:** Create the hook.

- [ ] **Step 3:** Update the view.

- [ ] **Step 4:** Verify: `npx tsc --noEmit`

### Task 4: Final verification and commit

- [ ] **Step 1:** Run `pnpm build` — must pass
- [ ] **Step 2:** Commit:
```bash
git add -A
git commit -m "refactor: extract data transformation hooks from 3 largest views"
```
