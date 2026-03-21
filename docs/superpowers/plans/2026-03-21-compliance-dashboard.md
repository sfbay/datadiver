# Resolution 240210 Compliance Dashboard — Implementation Plan

**Spec:** `docs/superpowers/specs/2026-03-21-audit-trail-standard.md` + `docs/superpowers/specs/2026-03-19-city-budget-design.md`
**Branch:** `feature/compliance-dashboard`
**Estimated chunks:** 3

## Chunk 1: Compliance Computation + Legal Notice Exclusion

### Task 1.1: Add legal-notices category to media classification
- File: `src/utils/mediaClassification.ts`
- Add `'legal-notices'` to `MediaCategory` type
- Classify: DAILY JOURNAL CORPORATION, CALIFORNIA NEWSPAPER SERVICE BUREAU, and any other mandatory legal publication vendors
- These are excluded from the "discretionary" denominator

### Task 1.2: Compliance computation hook
- File: `src/hooks/useComplianceData.ts` (new)
- `useComplianceData(fiscalYear)` returns:
  - `totalDiscretionary`: all advertising spend minus legal notices
  - `ethnicMediaSpend`: vendors classified as `community-ethnic`
  - `compliancePct`: ethnicMediaSpend / totalDiscretionary * 100
  - `outletCount`: distinct ethnic/community vendors receiving payments
  - `departmentCards`: per-department compliance % with status (compliant/below/none)
  - `exclusions`: legal notice vendors with amounts (for transparency)
  - `trend`: compliance % for each available fiscal year
- Uses existing `useAdvertisingData` output, filtered/computed client-side
- No new Socrata queries needed — all derived from existing ad vendor data

### Task 1.3: Historical compliance trend
- In the same hook, compute compliance % for FY2018–present
- Requires loading ad vendor data for multiple fiscal years
- Strategy: fire one query per FY with `sub_object = 'Advertising'` grouped by vendor
- Cache results to avoid re-fetching when scrubbing between years

### Verification: `npx tsc -b`, unit test the compliance computation

## Chunk 2: Compliance Dashboard UI

### Task 2.1: Compliance progress bar
- At top of Advertising tab (above media mix, below stat cards)
- Shows: target (50%), actual %, dollar amounts
- Visual: progress bar with green/amber/red coloring based on distance from target
- "Based on N payment records" count

### Task 2.2: Department report card
- Grid or list of departments with compliance status
- Each row: department name, ethnic media %, total ad spend, status badge (✓/⚠/✗)
- YoY trend sparkline per department
- Click → drill into that department's ethnic media vendors (existing drill-down)
- Export button → CSV of all departments' compliance data

### Task 2.3: Methodology disclosure panel
- Collapsible "How is this calculated?" section
- Shows: numerator definition, denominator definition, exclusions list with amounts
- Lists each legal notice vendor excluded and their total
- Explains P-card handling ("included in denominator, outlet unknown")
- Links to the resolution text or file number

### Task 2.4: Historical trend chart
- D3 line chart: compliance % by fiscal year
- Secondary line: outlet count receiving city dollars
- Annotations: "Resolution 240210 passed" marker at the appropriate FY
- Ghost 50% target line

### Task 2.5: Audit trail enhancements
- Add record count to all aggregated views ("Based on 847 records")
- Add data freshness indicator ("Data as of: Mar 20, 2026")
- Add export buttons to compliance dashboard components
- Ensure all filter state is in URL params

### Verification: Full build, visual testing, verify drill-down from compliance % → dept → vendor → payments

## Chunk 3: Audit Trail Standard (cross-cutting)

### Task 3.1: Source attribution component
- File: `src/components/ui/DataSourceLine.tsx` (already exists — enhance)
- Add `dataAsOf` prop showing freshness timestamp
- Add `recordCount` prop showing how many records produced the view
- Standardize across all budget views

### Task 3.2: Methodology tooltip component
- File: `src/components/ui/MethodologyTip.tsx` (new)
- Reusable disclosure component for any computed metric
- Shows: formula, inputs, exclusions
- Triggered by "How is this calculated?" link

### Task 3.3: Apply audit trail to existing views
- Budget Overview: add record counts to stat cards
- Vendor Explorer: add data freshness timestamp
- All drill-down levels: ensure export button present
- Advertising tab: ensure all methodology is disclosed

### Verification: All budget views have source attribution, record counts, and export buttons

## Build order
Chunks sequential: 1 → 2 → 3. Commit after each. Push after each.
