# DataDiver Audit Trail Standard

**Date:** 2026-03-21
**Status:** Active standard — applies to all budget/spending views
**Context:** Required for Resolution 240210 compliance monitoring and general investigative credibility

## Principle

**Every number displayed in DataDiver must be traceable to the source records that produced it.** No black boxes. No aggregated totals without drill-down. No classifications without visible methodology. A journalist, supervisor, or auditor should be able to follow any number from a dashboard metric down to individual payment vouchers, export the underlying records, and verify the math independently.

## The Audit Trail Chain

Every metric follows this chain:

```
Dashboard metric (e.g., "42% ethnic media compliance")
  ↓ click
Aggregated breakdown (e.g., "by department: DPH 67%, HRD 31%...")
  ↓ click
Vendor list (e.g., "DPH → Sing Tao $45K, El Mensajero $28K...")
  ↓ click
Payment records (e.g., "FY2025, Mar 15, Voucher V1234567, $12,500")
  ↓ export
CSV file with every record, timestamped, reproducible
```

## Requirements at Every Level

### 1. Export Button
Every aggregated view MUST have a CSV export button that downloads the exact records shown. The CSV must include:
- All visible columns plus any hidden detail columns (voucher numbers, PO numbers, dates)
- A header row with human-readable column names
- The applied filters as a comment or filename suffix (e.g., `advertising-dph-ethnic-fy2025.csv`)
- Timestamp of data freshness (`data_as_of` from Socrata)

### 2. Methodology Disclosure
Every classification or computation must be inspectable:

| Classification | How to disclose |
|---------------|----------------|
| Media category (e.g., "Community & Ethnic Press") | Show the vendor → category mapping. Link to `mediaClassification.ts` registry. "Why is this vendor classified this way?" tooltip. |
| "Discretionary" vs "mandatory" advertising | Show which vendors are excluded as legal notices (Daily Journal Corp, CA Newspaper Service Bureau) and why. |
| Anomaly flags (spending spike, split purchase) | Show the formula: "Flagged because FY2025 spend ($720K) is 3.2σ above the 5-year average ($210K)." |
| Compliance percentage | Show: numerator (ethnic/community media spend), denominator (total discretionary ad spend), exclusions (legal notices). |

### 3. Source Attribution
Every view must display:
- Dataset name and Socrata ID (e.g., "Vendor Payments · n9pm-xkyq")
- Data freshness timestamp ("Data as of: Mar 20, 2026")
- Any known limitations (e.g., "P-card purchases do not identify the specific media outlet")

### 4. Filter State in URL
Every drill-down state must be encoded in the URL so that:
- A journalist can bookmark a specific finding
- A link can be shared in an article, email, or BOS hearing
- Returning to the URL reproduces the exact same view
- The URL serves as a citation (e.g., `datadiver.vercel.app/city-budget?tab=advertising&adCategory=community-ethnic&fy=2025`)

### 5. Record Count
Every aggregated view must show:
- How many records produced the aggregation ("Based on 847 payment records")
- Whether the count is complete or truncated ("Showing top 500 of 12,453 vendors")
- Whether any records were excluded and why

## Compliance Dashboard Specific Requirements

For Resolution 240210 monitoring:

### Numerator: Ethnic/Community Media Spend
- Sum of `vouchers_paid` for vendors classified as `community-ethnic` in `mediaClassification.ts`
- Exportable: full list of vendors in this category with per-vendor totals
- Each vendor clickable → vendor profile with payment history

### Denominator: Total Discretionary Advertising Spend
- Sum of `vouchers_paid` where `sub_object = 'Advertising'`
- MINUS vendors classified as `legal-notices` (Daily Journal Corp, CA Newspaper Service Bureau, and any others identified as mandatory legal publication vendors)
- Exportable: full list of all advertising vendors with classification tags showing what's included/excluded

### Exclusions (transparent)
- Legal notice vendors: listed by name with total spend, clearly marked as "excluded from discretionary total"
- Agency pass-through: flagged but included in denominator (agency-placed ads in ethnic media count toward the numerator if the ultimate outlet is ethnic/community)
- P-card: included in denominator but flagged as "outlet unknown — may or may not be ethnic/community media"

### Department Report Card
- Per-department: ethnic media spend / discretionary ad spend = compliance %
- Visual: ✓ green (≥50%), ⚠ amber (30-49%), ✗ red (<30%), — gray (no ad spend)
- Each department row is clickable → shows the department's ethnic media vendors
- Each department row has export button → CSV of that department's ad spend records
- YoY trend sparkline per department

### Historical Tracking
- Compliance % by fiscal year (FY2018–present, as far back as data allows)
- Trend chart: is the city making progress since the resolution?
- Outlet count by fiscal year: how many ethnic/community outlets receive city dollars?

## Implementation Notes

### What Already Exists
- `exportToCSV()` utility in `src/utils/csvExport.ts`
- Media classification registry in `src/utils/mediaClassification.ts`
- Three-layer detection in `useAdvertisingData.ts`
- Vendor profile with payment table + CSV export
- Department sidebar with ad spend breakdown
- URL param sync via `useSearchParams`

### What Needs to Be Built
- Compliance percentage computation (numerator / denominator with exclusions)
- Department report card component
- Legal notice exclusion logic (identify mandatory legal publication vendors)
- Methodology disclosure tooltips/panels
- Record count indicators on all aggregated views
- Data freshness timestamp display (query `data_as_of` from Socrata metadata)
- Historical compliance trend chart (multi-year)

### Legal Notice Vendor Identification
Initial list of vendors to classify as `legal-notices` (mandatory, not discretionary):
- DAILY JOURNAL CORPORATION ($7.75M lifetime)
- CALIFORNIA NEWSPAPER SERVICE BUREAU ($2.08M lifetime)
- Additional vendors TBD — may need manual review of `sub_object = 'Advertising'` vendors whose contracts reference "legal notices", "public hearing notices", "bid advertisements"

This list should be maintained in `mediaClassification.ts` as a distinct category so it's auditable and updatable.
