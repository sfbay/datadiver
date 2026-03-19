# City Budget & Spending Analysis — Design Spec

**Date:** 2026-03-19
**Status:** Draft — pending scope confirmation

## Vision

A financial transparency tool that makes San Francisco's $14B+ annual budget explorable, comparable, and accountable. Budget vs actual spending by department, vendor payment drill-down, and algorithmic anomaly detection that flags spending patterns worthy of journalistic investigation.

The advertising/media tracking layer serves as the template for a broader "watchdog" capability — any spending category can be isolated, trended, and flagged.

## Data Sources (Socrata, all confirmed queryable)

| Dataset | Socrata ID | Rows | Coverage | Update | Purpose |
|---------|-----------|------|----------|--------|---------|
| Budget | `xdgd-c79v` | ~200K | FY2010+ | Annual | Planned appropriations |
| Spending & Revenue | `bpnb-jwfb` | 759K | FY2000+ | Weekly | Actual spending/revenue |
| Vendor Payments (Vouchers) | `n9pm-xkyq` | 7.9M | FY2007+ | Weekly | Individual payments to vendors |
| Supplier Contracts | `cqi5-hm2d` | 47K | FY2018+ | Weekly | Contract awards & utilization |
| Employee Compensation | `88g8-5mnd` | ~1M | FY2013+ | Bi-annual | Salary/benefits by position |
| Budget - FTE | `xak5-5wkb` | ~100K | FY2010+ | Annual | Budgeted staffing |
| Spending - FTE | `6tbi-wfnm` | ~50K | FY2003+ | Weekly | Actual staffing |

**Retired/404:** Purchasing Commodity Data (`gk2q-kkbs`) — may need alternate source for commodity-level detail.

### Shared Field Hierarchy (all financial datasets)

```
organization_group → department → program → character → object → sub_object
```

This taxonomy is consistent across Budget, Spending, and Vendor Payments, enabling joins and comparisons.

## Feature Architecture

### View 1: Budget Overview (route: `/city-budget`)

**Layout:** Chart-centric (like Dispatch911) — no map, since budget data isn't geospatial.

**Hero metrics (CardTray):**
- Total Budget (current FY)
- Total Actual Spending (current FY, % of budget)
- Largest Department
- YoY Budget Growth %
- Workforce (total FTE)

**Main panel — three tabs:**

#### Tab 1: Department Breakdown
- Treemap or horizontal bar chart: departments sized by budget
- Color: over-budget (red) vs under-budget (green) vs on-track (neutral)
- Click department → drill into programs → character → object
- Ghost bars showing prior year for comparison

#### Tab 2: Spending Trends
- Multi-line chart: top N departments over time (FY2000-present)
- Toggle: absolute dollars vs % of total budget vs per-capita
- Highlight anomaly years (z-score > 2σ)

#### Tab 3: Budget vs Actual
- Paired bars: budget (outline) vs actual (filled) by department
- Sort by: largest variance, largest absolute, alphabetical
- Drill-down into character/object level

**Sidebar:**
- Department list with spend bars
- Fiscal year selector
- Fund type filter (General Fund, Enterprise, Special Revenue)
- Revenue/Spending toggle

### View 2: Vendor & Spending Search (route: `/city-budget/search` or tab within)

**The "big search box" — search-first interaction model.**

Unlike other DataDiver views that start with a map/chart and drill down, this tab leads with a prominent search input. The user types a question — a vendor name, a spending category, a department, a keyword — and the data assembles around the answer. This is the Bloomberg Terminal model: query first, visualization second.

**Search box behavior:**
- Full-width, prominent placement at top of the view
- Searches across: vendor names, department names, sub_object descriptions, contract titles, program names
- Autocomplete suggestions as you type (top vendors, departments, categories)
- Results grouped by type: Vendors, Departments, Spending Categories, Contracts
- Each result card shows: total amount, fiscal year range, sparkline trend, click to expand

**Example queries a journalist would type:**
- "advertising" → all advertising spending across all layers
- "Most Likely To" → vendor profile with payment history
- "DPH consulting" → Department of Public Health consulting spend
- "police overtime" → SFPD overtime spending trend
- "airport marketing" → SFO marketing contracts and payments
- "homeless" → all homeless services spending across agencies

**Hero metrics (update based on search context):**
- Total matching spend
- # Vendors / # Departments involved
- Time range of results
- Largest single payment

**Results panel:**
- Searchable/filterable vendor table with sparkline trends
- Click vendor → payment history, departments served, contract links
- Vendor concentration chart: top 20 vendors = X% of all spend
- Toggle: table view vs chart view vs timeline view

**Anomaly sidebar:**
- Flagged vendors (see Anomaly Detection below)
- New vendors receiving large first payments
- Vendors with sole-source contracts above threshold

### View 3: Advertising & Media Tracker (route: `/city-budget/advertising` or tab)

**This is the watchdog layer.**

**Data strategy — three-layer detection:**

| Layer | Method | What it catches | Est. coverage |
|-------|--------|----------------|---------------|
| **Tagged** | `sub_object = 'Advertising'` from Vendor Payments | All classified ad spend | 18,801 vouchers, $29.2M |
| **Agency registry** | Known vendor list (see below) | Agency-managed campaigns incl. digital/social | ~$6M+ via top 10 agencies |
| **P-card flagging** | Vendor contains "P-CARD" + advertising sub_object | Hidden social media buys via procurement cards | ~$215K+ (DPH alone) |

**Why three layers?** Social media platforms are nearly invisible as direct city vendors:
- **LinkedIn** is the only platform appearing directly ($207K, 34 txns — mostly SFPD/MTA recruitment ads)
- **Zero** direct payments to Facebook/Meta, Google Ads, Twitter/X, TikTok, or Nextdoor
- **P-cards** (procurement credit cards via US Bank) are used for small digital ad buys — shows up as the bank, not the platform, making social media spend nearly untraceable in voucher data
- **Agencies** bundle digital campaign costs (including platform ad buys) into their invoices

**Media classification taxonomy:**

Vendors in the advertising space need classification into tiers for meaningful analysis. A journalist needs to distinguish major metro dailies from community ethnic press from digital agencies from hidden P-card buys.

| Category | Examples | Why it matters |
|----------|---------|----------------|
| **Major metro print** | SF Chronicle, SF Examiner, Daily Journal Corp | Largest traditional spend; legal notice monopoly |
| **Community & ethnic press** | Sing Tao, El Mensajero, Bay Area Reporter, World Journal, El Tecolote, SF Neighborhood Newspaper Assoc | Equity lens — how much reaches non-English communities? |
| **Radio & TV** | Univision, Comcast/Effectv, iHeart, KTSF, Entercom, Audacy | Broadcast reach |
| **Out-of-home / transit** | CBS Outdoor, Clear Channel, Titan Outdoor, Intersection Media | Physical public space advertising |
| **Full-service agencies** | Zeba Consulting, Most Likely To, O'Rorke, Great Kolor, Civic Edge | May include digital/social — spend is opaque |
| **Digital/interactive agencies** | CKR Interactive, Better World Advertising | Likely running platform campaigns |
| **Recruitment advertising** | Advance Recruitment Solutions, LinkedIn Corp | Job listings, not public comms |
| **Direct social platforms** | LinkedIn Corporation | Only confirmed direct platform vendor |
| **P-card (untraceable digital)** | P-CARD ONLY US BANK N.A. | Almost certainly direct-to-platform social/digital — no agency invoices, no newspaper invoices, no billboard buys use P-cards. The purchase method reveals the purchase type. |
| **Production / print** | A&A Flag & Banner, Art Sign & Banner, Epic Productions | Physical production, not media placement |

This taxonomy enables:
- Media mix pie chart (where does the ad money actually go?)
- Equity analysis (what % reaches ethnic/community media vs major dailies?)
- Transparency score per department (high P-card % = low transparency)
- Digital shift tracking (is agency + P-card share growing over time?)

**Known advertising/marketing agency registry:**

| Vendor | Total Ad Spend | Primary Clients | Type |
|--------|---------------|----------------|------|
| Daily Journal Corporation | $7.75M | BOS, City Planning, Tax Collector | Legal notices / print |
| California Newspaper Service Bureau | $2.08M | Multiple departments | Legal notices / print |
| Zeba Consulting Inc | $1.43M | DPH (COVID campaigns) | Full-service agency |
| CKR Interactive | $1.19M (combined) | Multiple departments | Digital/interactive |
| Most Likely To Inc | $961K | Elections, Environment, Library | Full-service agency |
| Promotion Marketing | $938K | Multiple departments | Agency |
| CBS Outdoor / Clear Channel / Titan | $1.60M (combined) | MTA, DPH | Out-of-home / transit |
| Intersection Media LLC | $746K | DPH | Out-of-home / digital |
| Advance Recruitment Solutions | $780K | HRD | Recruitment advertising |
| Comcast Spotlight / Effectv | $1.03M (combined) | Multiple departments | Cable TV advertising |
| SF Chronicle / Examiner / ethnic press | $1.50M+ (combined) | Multiple departments | Newspaper advertising |
| O'Rorke Inc | $422K | Multiple departments | Agency |
| Great Kolor LLC | $386K | HRD | Agency |
| LinkedIn Corporation | $207K | SFPD, MTA | Direct social platform |
| P-CARD (US Bank N.A.) | $215K+ (DPH only) | DPH + unknown others | Hidden digital/social buys |

**Key insight — media mix evolution:** The top vendors are overwhelmingly traditional media (newspapers, outdoor, radio, cable TV). This either means (a) the city's advertising hasn't shifted to digital like the private sector, or (b) digital spend is hidden inside agency contracts and P-card purchases. Both stories are journalistically significant.

**Hero metrics:**
- Total Ad Spend (FY) — tagged + agency + P-card layers combined
- YoY Change
- Top Department (ad spend)
- Top Agency
- P-Card Ad Spend (flagged as low-transparency)
- # Contracts flagged

**Main panel:**
- Timeline: advertising spend by department over time, stacked by detection layer
- Vendor breakdown: who gets the ad money, with agency/platform/P-card tagging
- Media mix chart: traditional (print, radio, TV, outdoor) vs digital (agencies, LinkedIn, P-card)
- Department comparison: who spends most on advertising relative to their total budget
- Contract explorer: marketing/comms contracts with award, consumed, remaining

**P-card transparency section:**
- Total P-card advertising spend by department
- Trend over time (is P-card ad spend growing as social media grows?)
- Callout: "These purchases are made via procurement cards and do not identify the specific platform or media outlet. They may include Facebook/Instagram boosts, Google Ads, and other digital advertising."

**Flagging algorithms:**
- Department ad spend spike (> 2σ above their own baseline)
- Election-year correlation (ad spend increases before elections)
- Agency concentration (single agency getting > X% of a department's ad budget)
- P-card advertising growth (departments shifting spend to less-transparent channels)
- Contract-to-payment ratio (contract awarded but minimal spend = shelf contract)
- Platform diversity: department using only one agency for all campaigns

### Anomaly Detection System (cross-cutting)

Applicable across all budget views.

**Sensitivity slider:** User-adjustable threshold (default 2σ, range 1σ–4σ). Lower = more flags (cast a wide net for investigation). Higher = fewer flags (only extreme outliers). Persisted in URL params for shareable views.

#### Algorithms:

1. **Spending Spike Detector**
   - Z-score by `department × sub_object × fiscal_year`
   - Baseline: 5-year rolling average
   - Flag threshold: user-adjustable via sensitivity slider (default > 2σ)
   - Example: "DPH advertising spend in FY2021 was 3.2σ above baseline" (COVID campaigns)

2. **Vendor Concentration Alert**
   - Per department: single vendor receiving > 40% of a sub_object category
   - Cross-department: vendor appearing in > 10 departments (indicates citywide contract vs anomaly)

3. **Split Purchase Detection**
   - Cluster payments to same vendor within 30 days that individually fall below approval thresholds
   - Common thresholds: $10K (micro-purchase), $75K (competitive bid), $250K (formal RFP)

4. **Year-over-Year Growth Outlier**
   - Department × character spending growing > 2σ faster than citywide average
   - Flags both spikes and unusual declines

5. **Sole Source Flag**
   - Contracts with `sole_source_flg = 'Y'` above $100K
   - Trend: is sole-source usage increasing for a department?

6. **Contract Utilization Anomaly**
   - Contracts with > 90% consumed (approaching limit, likely needs renewal)
   - Contracts with < 10% consumed after > 50% of term elapsed (shelf contracts)
   - Payment amounts exceeding contract award (over-spending on contract)

## UI Design Notes

- **No map** — budget data isn't geospatial. Chart-centric layout like Dispatch911.
- **Accent color:** `#0ea5e9` (sky blue) — financial/institutional feel, distinct from existing views
- **Progressive disclosure:** Department list → click for programs → click for objects → click for individual vouchers
- **Time controls:** Fiscal year picker (replaces date range picker for this view)
- **Export:** CSV export of any filtered view (journalists need raw data)

## Data Quality Considerations

- **Revenue vs Spending confusion:** The Spending & Revenue dataset contains both. MUST filter `revenue_or_spending = 'Spending'` — MTA transit advertising REVENUE is ~$15M/yr and would massively inflate "advertising spending" if included.
- **Transfer double-counting:** The Budget dataset documents "Transfer Adjustments (Citywide)" that net out inter-department transfers. Use net totals for department-level comparisons.
- **Agency pass-through for digital ads:** City digital advertising goes through agencies, not direct to Google/Meta. The `vendor` field shows the agency, not the platform. Contract `scope_of_work` may have more detail.
- **FY timing:** SF fiscal year is July 1 - June 30. "FY2025" = July 2024 - June 2025.
- **Enterprise departments:** Airport, PUC, Port have separate revenue streams and budget cycles. May need special handling.

## Implementation Approach

### Phase 1: Data Foundation
- Add 4 new Socrata dataset configs to `datasets.ts`
- Budget query hooks (fiscal year-based, not date range)
- Department aggregation + caching

### Phase 2: Budget Overview View
- Department treemap/bars
- Budget vs Actual comparison
- Spending trends over time
- CardTray with hero metrics

### Phase 3: Vendor Explorer
- Vendor search + payment history
- Concentration analysis
- Contract cross-reference

### Phase 4: Advertising & Media Tracker
- Sub-object + keyword filtering
- Agency identification
- Department ad spend trends

### Phase 5: Anomaly Detection
- Z-score baseline calculations
- Split purchase clustering
- Sole source correlation
- Flagging UI (badge system on vendors/departments)

## Open Questions

1. **Single view or multiple routes?** One `/city-budget` with tabs, or separate `/budget`, `/vendors`, `/advertising`?
2. **Fiscal year picker:** Replace date range picker, or add a separate control?
3. **Historical depth:** Show all years (FY2000+) or default to recent 5 with expand?
4. **Anomaly threshold:** 2σ is standard but may generate too many flags. User-adjustable?
5. **Export format:** CSV only, or also PDF report generation?
