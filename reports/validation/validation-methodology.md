# Validation Methodology — Resolution 240210 Compliance Report

**Generated:** 2026-04-07T15:08:00.773Z
**Report Date:** 2026-03-23
**Data Source:** SF Open Data, Vendor Payments dataset `n9pm-xkyq`

---

## Purpose

This validation workbook verifies the data pipeline behind the Resolution 240210 compliance report. It provides:

1. **Claim Registry** — Every quantitative assertion in the report, recomputed from live Socrata data and compared to the report's published values.
2. **Validation Sample** — A stratified sample of vendor classification decisions for human review.
3. **Full Classification Audit** — The complete vendor dataset with automated classifications.

## Claim Registry Results

- **Total claims:** 90
- **Matching live data:** 84 (93.3%)
- **Mismatches:** 6

Tolerances applied:
- Dollar amounts: within $50 (data updates weekly; small changes expected)
- Percentages: within 0.15 percentage points
- Counts: exact match required

**Note:** Mismatches may reflect data updates since the report was generated on 2026-03-23. Review each mismatch in claim-registry.csv to determine if it represents a data update or a computation error.

## Validation Sample Design

**Sample size:** 75 records (from 179 total vendor-department-FY aggregations)

### Stratification

| Stratum | Records | Purpose |
|---------|--------:|---------|
| ethnic-media-named | 35 | All ethnic media vendors named in the report — most consequential classifications |
| category-fill | 19 | Ensure ≥5 records per major category for coverage |
| top-spend | 10 | Top 10 vendors by dollar amount — dominate the denominator |
| random | 6 | Random fill to reach target sample size for statistical confidence |
| dept-fill | 5 | Ensure every report-named department has at least one sampled record |

### Category Coverage in Sample

| Category | Records |
|----------|--------:|
| community-ethnic-press | 35 |
| unknown | 10 |
| legal-notices | 7 |
| radio-tv | 7 |
| p-card | 6 |
| full-service-agency | 5 |
| out-of-home | 4 |
| digital-agency | 1 |

## Instructions for Reviewers

### Step 1: Open `validation-sample.csv`

For each row:

1. **Read the vendor name** and the `automated_category` assigned by the classification pipeline.
2. **Assess independently:** Based on your knowledge, what category should this vendor be in? Enter your answer in the `reviewer_category` column.
3. **Mark agreement:** Set `agree` to `Y` if your category matches the automated one, `N` if it differs.
4. **Add notes** explaining any disagreement — especially for vendors you believe are miscategorized.

### Step 2: Pay special attention to `in_report = Y` rows

These vendors appear by name in the published report. A misclassification here directly affects the headline compliance numbers. Flag any concerns.

### Step 3: Check for missing outlets

Review the `full-classification-audit.csv` for vendors classified as `unknown`. Are any of these actually ethnic or community media outlets that should be in the registry?

## How to Interpret Results

- **Agreement rate = count(agree=Y) / total sampled**
- **≥95% agreement:** The classification pipeline is reliable. Proceed with report finalization.
- **90–95% agreement:** Review disagreements. If corrections change the compliance percentage by <0.5pp, the report stands. If >0.5pp, recompute and update the report.
- **<90% agreement:** The classification registry needs significant revision before the report is presented to the city. Convene a registry review session with coalition members.

### If corrections are needed:

1. Update the classification in `validation-sample.csv`
2. For each correction, note whether it affects the **numerator** (ethnic media) or **denominator** (legal notices) or neither
3. Recompute the compliance figures with corrections applied
4. Document the correction in the report's methodology section

## Data Pipeline Reference

```
Socrata API (n9pm-xkyq)
  → WHERE sub_object = 'Advertising'
  → GROUP BY vendor, department, fiscal_year
  → SUM(vouchers_paid)
    ↓
classifyVendor() — 87 pattern rules in VENDOR_REGISTRY
  → First substring match wins, default 'unknown'
    ↓
Compliance computation:
  → discretionary = total_ad_spend - legal_notice_spend
  → compliance_pct = ethnic_media_spend / discretionary × 100
```

Classification source: `src/utils/mediaClassification.ts`
Compliance computation: `src/hooks/useComplianceData.ts`
Report: `reports/resolution-240210-compliance-report.md`

## Files in This Directory

| File | Purpose |
|------|---------|
| `claim-registry.csv` | Every numeric claim → source query → live recomputation |
| `validation-sample.csv` | Stratified sample for human classification review |
| `full-classification-audit.csv` | Complete vendor list with automated categories |
| `validation-methodology.md` | This document |
