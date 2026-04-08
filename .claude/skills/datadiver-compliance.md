---
name: datadiver-compliance
description: Use when working on the Resolution 240210 compliance dashboard, the Advertising & Media tab, the three-layer ad detection model (tagged/agency/p-card), compliance card stepped bars with trapezoid connectors, AdSpendCompositionChart, department/category/vendor drill-down pages, SpendingTimeline components, or anything touching the compliance data model for SF Board of Supervisors File 240210. Trigger on terms like "compliance," "Resolution 240210," "Maya," "bar 1/2/3," "trapezoid," "discretionary," "agency layer," "ethnic media spend," "advertising dashboard," "department drill-down."
---

# DataDiver Compliance Dashboard — Institutional Knowledge

This is the densest knowledge cluster in the DataDiver project. The Resolution 240210 compliance dashboard has been through many design iterations and has accumulated specific architectural, visual, editorial, and stakeholder patterns that are not fully captured in code comments or CLAUDE.md. Read this before touching anything compliance-related.

## Stakeholder context

- **Maya** is the primary stakeholder for this dashboard. The compliance report was delivered to her on **2026-04-08** for review.
- Maya's presentation claims "$1.6M" in direct departmental ad spending and a "26% → 52% doubling" of coalition media spend across 2024-25.
- These numbers **don't reconcile with our dashboard**, which shows ~$1.5M direct placements and 9.1% compliance in FY2025-26. The gap is almost certainly a denominator / scope difference (Maya may be measuring a narrower coalition outlet list, a different time window, or newly-awarded contracts rather than payment records). **Do not restructure the dashboard to match Maya's numbers without methodology confirmation.** When she returns with her definitions, the move is to add a second compliance metric side-by-side with our own rather than replacing either.
- **Distribution chain for the compliance report**: Maya → Scott (BAR) → broader coalition (Joe Ellen, Lisa R.) → city via Chan's office. See `memory/project_compliance_report_distribution.md`.

## The three-layer ad detection model (CRITICAL)

All ad-related city spending falls into one of three layers. **Every compliance-relevant calculation, query, and visualization must query all three layers** or it will be misleading.

| Layer | Socrata WHERE clause | What it represents |
|---|---|---|
| **Tagged** | `sub_object = 'Advertising'` | Direct ad placements by departments to specific publishers |
| **Agency** | vendor matches agency registry AND `sub_object != 'Advertising'` | Agency-managed media buying (Zeba, Most Likely To, O'Rorke, etc.) — opaque, can't tell which outlets the money reaches |
| **P-card** | vendor matches `%P-CARD%` AND `sub_object = 'Advertising'` | Procurement card ad purchases — untraceable to specific outlet |

**Deduplication rule**: p-card rows have `sub_object = 'Advertising'`, so they appear in BOTH the tagged query AND the p-card query. Always exclude `UPPER(vendor) NOT LIKE '%P-CARD%'` from the tagged query OR deduplicate by `vendor + fiscal_year` keys after fetching. See `useEntityTimeline.ts` and `useComplianceData.ts::useTrendData` for the canonical pattern.

**Agency vendor registry** (duplicated in three files — flagged for cleanup):
```
UPPER(vendor) LIKE '%ZEBA CONSULTING%'
OR UPPER(vendor) LIKE '%MOST LIKELY TO%'
OR UPPER(vendor) LIKE '%CKR INTERACTIVE%'
OR UPPER(vendor) LIKE '%O''RORKE%'
OR UPPER(vendor) LIKE '%GREAT KOLOR%'
OR UPPER(vendor) LIKE '%CIVIC EDGE%'
OR UPPER(vendor) LIKE '%BETTER WORLD ADVERTISING%'
OR UPPER(vendor) LIKE '%PROMOTION MARKETING%'
```
Locations: `src/hooks/useAdvertisingData.ts`, `src/hooks/useComplianceData.ts`, `src/hooks/useEntityTimeline.ts`. **TODO**: lift into `src/utils/mediaClassification.ts` as an exported constant named `AGENCY_VENDOR_LIKE`.

## Compliance math

**Discretionary** = tagged (direct) minus legal notices. This is the compliance basis per Resolution 240210.
- Legal notices (`category === 'legal-notices'`) are mandatory publications that departments have no real discretion over, so they're excluded from the denominator.
- Agencies and p-card are NOT part of the compliance basis — they're tracked separately for context.

**Compliance percentage** = `ethnicMediaSpend / discretionary × 100`
- `ethnicMediaSpend` comes from the tagged layer only (`category === 'community-ethnic-press'`).
- Target: 50% of discretionary spend should reach ethnic & community outlets.

**Resolution effective year**: FY2024-25 = `fiscalYear = 2025` in our internal convention. Compliance targets should be drawn **prominently** for FY2025+ and **faintly** (advisory-only) for earlier years. See `AdSpendCompositionChart.tsx::RESOLUTION_EFFECTIVE_FY`.

## The color palette (reserved semantics)

**Same concept = same color everywhere.** This was enforced through multiple passes of color unification. Violating it is the single most confusing thing you can do on this dashboard.

| Concept | Color | Hex |
|---|---|---|
| Agencies (full-service-agency) | Purple | `#a855f7` |
| Direct ad placements | Sky | `#0ea5e9` |
| Discretionary (compliance basis) | Teal | `#2dd4bf` |
| Community media (goal + actual + target line) | Emerald | `#10b981` |
| Legal notices (excluded) | Slate | `#64748b` / `#94a3b8` |
| P-card (untraceable) | Red | `#ef4444` |
| Warning / below-target | Amber | `#f59e0b` |

**The visual progression purple → sky → teal → emerald** is the narrative of narrowing scope: all agencies → direct placements → the subset subject to compliance → the goal. Each color appears in multiple places and must stay consistent:
- **Compliance card bars** (bar 1/2/3, inline segment fills, trapezoid gradients)
- **AdSpendCompositionChart** (stacked bar segments by fiscal year)
- **Top stat tiles** (Total / Agencies / P-Card / Discretionary / Community Media)
- **Department rail bars** (composition segments per dept)
- **Media Mix category rows** (full-service-agency must be purple, NOT pink)

**Reserved uses**:
- **Emerald is reserved exclusively for community media** — the goal, the actual, the 50% target dashed line. Nothing else may use emerald.
- **Amber is reserved for the "below target" warning state** (compliance % labels when <50%).
- **Slate appears in two shades**: `#64748b` (compliance card hatched legal) and `#94a3b8` (Media Mix legal-notices row). These are intentionally similar.

## Compliance card structure: three aligned stepped bars + trapezoid connectors

The main compliance card (`ComplianceDashboard` function in `CityBudget.tsx`) uses a two-column CSS Grid:
- **Left column (200px)**: bar metadata (title, subtitle, total dollar amount)
- **Right column**: the three bars and two trapezoid connectors, rendered as siblings so the trapezoids flow contiguously between bars without header rows interrupting

**Bar 1 — "All city ad-related spending"**:
- Segments: `[Agencies (purple)][P-card bumper][Direct (sky)]`
- **P-card is intentionally between agencies and direct** so Direct's right edge lines up with 100% of the bar. This is a cosmetic choice that makes trapezoid 1's apex reach the full right edge of the bar.
- Rounded top only (`rounded-t-md`), flat bottom

**Trapezoid 1 — sky gradient**:
- SVG path: `M conn1Left,0 L 100,0 L 100,44 L 0,44 Z` where `conn1Left = agencyPct + pcardPct`
- Fill: linear gradient `0% → 0 alpha, 5% → 0.22 alpha, 100% → 0 alpha` (plateau-to-fade shape)
- Three `↓ ↓ ↓` arrows riding the centerline at `top: 42%`

**Bar 2 — "Direct ad placements"**:
- Segments: `[Legal hatched (slate)][Discretionary (TEAL, not sky)]`
- **Discretionary MUST be teal**, not sky. Sky is reserved for the top-level direct concept; teal is the narrower compliance-basis subset. This distinction was the single biggest color clarification of the session.
- No rounding (flat top AND bottom)

**Trapezoid 2 — teal gradient**:
- Same structure as trapezoid 1 but teal color
- Connects bar 2's discretionary segment down to bar 3's full width

**Bar 3 — "Discretionary / Community media share"**:
- Teal container (`rgba(45,212,191,0.1)` background + `border-teal-400/25`)
- Green community fill from the left (`bg-emerald-500/60`)
- Green dashed 50% target marker at `left: 50%`
- Label in the container: `$XX,XXX community` (full dollars, emerald text)
- The label floats to the RIGHT of the fill when community share is <85% (so it doesn't get clipped inside a thin sliver)
- Rounded bottom only (`rounded-b-md`), flat top

## SVG gradient technique for trapezoids (hard-won)

The trapezoid gradients went through many iterations. The current shape is the correct one — **do not revert without understanding why**.

**The problem**: two semi-transparent shapes meeting at a 1-pixel boundary produce a brighter line via alpha compositing. If bar 2's discretionary fill is at 22% alpha and trapezoid 2's top stop is also at 22% alpha with `-my-px` overlap (which we need to prevent sub-pixel gaps), the overlap pixel composites to `0.22 + 0.22*(1-0.22) = 0.39` — a visible bright band.

**The solution — plateau gradient with zero-alpha at edges**:
```
0%   → rgba(color, 0)     // overlap pixel, transparent, no compound
5%   → rgba(color, 0.22)  // sharp rise in ~2 pixels
100% → rgba(color, 0)     // fades to zero over the remaining ~42 pixels
```

**Why this works**:
- The overlap pixel at `y=0` has 0 alpha → no compound at the top interface
- The rise from 0 to 22% happens in 2 pixels, below human perception threshold → still reads as a "sharp top"
- The linear fade from 22% → 0 over 95% of the height gives a long "dissolving into depth" bottom
- Linear interpolation ensures exact 0 alpha at `y=100%` → no compound at the bottom interface either

**Alpha-only fades for light/dark mode**: fade between two colors that share hue and only differ in alpha (e.g., `rgba(14,165,233,0.22)` → `rgba(14,165,233,0)`), NOT from a color to a different color like slate-950. Interpolating through a hue shift produces a visible smudge in light mode. Alpha-only fade dissolves cleanly into any background.

## Department detail page structure

Route: `/city-budget?tab=search&dept=<deptName>` (via drill-down from the rail)

**Render order (top to bottom)** after the eyebrow + H2 header:
1. **5 stat tiles**: Total Ad Spend / Agencies / Discretionary / Community Media / P-Card %
2. **SpendingTimeline** (year-by-year, all 3 layers summed) — NEW as of 2026-04-08
3. **Media Mix** section (categories with their colors)
4. **Compliance card** (mini version with per-dept bar) OR "no discretionary" placeholder
5. **Filtered vendor list**

**Editorial ordering principle**: facts before evaluation. Media Mix (what they spent on) comes BEFORE the compliance card (how well they complied). Reversing this order makes the page feel like compliance dominates the story instead of being a reading.

**No-discretionary placeholder**: for departments where `deptCard.status === 'none'` (AIR Airport Commission is the canonical example), do NOT hide the compliance section. Replace it with an explanatory message keyed on why there's no discretionary:
- If agency % ≥ 50: "This department routes X% of its ad spending through agencies. Agency-managed media buying is opaque..."
- If p-card % ≥ 50: "This department charges X% of its ad spending to a P-card. P-card purchases are untraceable..."
- Otherwise: generic "This department has no discretionary ad spending to measure."

Absence of compliance data is itself information — surface it, don't swallow it.

## Department rail — three tab lenses

Right sidebar has three tabs, each a different **lens** on the same 23 departments (not just a different sort — the scale and meaning change too):

1. **`$ Ad Spend`** (default): sorted by `dept.total` desc. Bar composition: `[green community][sky direct-residual][purple agencies][red p-card]`. 4 segments gated at 0.5% minimum width to avoid sub-pixel noise.
2. **`$ Community`**: sorted by `communitySpend` desc. Single emerald bar scaled to the top community spender (NOT top total spender — different scale). Small departments that spend meaningful community dollars rise to the top.
3. **`% Community`**: sorted by `communityPct` desc with **secondary sort by absolute community $** to break ties. Single emerald bar, 0-100% scale, dashed 50% target marker on every row. Small denominators (dept.total < $5K) are dimmed to 45% opacity with a tooltip explaining the small sample.

**Denominator semantics** (important for labels):
- The rail's `% Community` tab uses `community / total` ("share of total ad spend")
- The department detail page's compliance card uses `community / discretionary` ("compliance %")
- These give DIFFERENT percentages for most departments. Always label the denominator explicitly. The rail has an explanatory caption below the tab selector: "Community $ ÷ total ad spend. Detail pages show compliance % (÷ discretionary)."

**Tab labels** lead with the symbol: `$ Ad Spend`, `$ Community`, `% Community`. In monospace, trailing symbols get lost in uniform character width; leading symbols give each tab a distinguishing first glyph.

## Drill-down page headers (AdBreadcrumb)

Category / department / vendor detail pages use a page header with two parts:
- **Eyebrow**: `← Back to [parent]` in slate mono uppercase, clickable, with a hover arrow nudge animation
- **H2 title**: deepest drill-down subject in `font-display text-3xl italic text-ink dark:text-white`

**Back target is the IMMEDIATE parent**, not the root. On a vendor drilled into from a department, back goes to the department view; on a category drill-down from root, back goes to root. The top nav bar provides root access separately.

**The root view renders no page header at all** — the tab name in the top nav bar is sufficient. Adding a duplicate "Advertising & Media" header on the root would be redundant.

**Duplicate header gotcha**: `VendorProfile.tsx` used to have its own internal header with a back button and H2 title. This was removed to prevent doubling with the outer `AdBreadcrumb`. The `onBack` prop is still in the signature (renamed to `_onBack`) so existing callers don't break, but it's unused.

## Shared SpendingTimeline component

Location: `src/components/charts/SpendingTimeline.tsx`

**Used in three places**: vendor profile, department detail, category detail. All three query their own hook (`useVendorProfile`, `useDepartmentTimeline`, `useCategoryTimeline`) and pass the resulting year data to the shared component.

**Props**:
- `data: SpendingTimelineRow[]` — `{ fiscal_year, total_paid }` pairs
- `currentFY: FiscalYear` — highlights this year with a larger dot
- `color?: string` — optional fill/stroke color (defaults to sky)
- `height?: number` — defaults to 180

**Visual conventions**:
- Area fill at `${color}18` (12% alpha)
- Line at full color, 2px stroke
- Animated stroke-dashoffset draw-in over 800ms
- Current FY dot: 4.5px, colored, white/dark stroke
- Peak year dot (if different from current FY): 3px amber
- Y axis formatted via `formatBudgetAmount`
- X axis shows last two digits of each fiscal year (`'17`, `'18`...)

**Deliberately read-only**: no click handlers, no per-year detail popovers. Year filtering is handled by the existing top-right FY selector which updates the entire view consistently. Adding click-to-filter would create a second competing authority for FY choice.

## Tile-and-chart consistency as primary QA

**The most important self-check when adding or modifying any dashboard visualization**: does the chart's current-FY value match the corresponding stat tile's value?

This is how the AIR Airport Commission timeline bug was caught in Sept 2026. The tiles showed `Total Ad Spend: $863,471` but the timeline peaked at ~$100K because the hook was only querying the tagged layer. The tiles and chart each passed their own isolated correctness check; only the cross-reference caught the bug.

**Before committing any new chart**, verify:
1. The chart's current-FY value matches the tile above it
2. The chart's color language matches the palette established for related views
3. If the entity has 3-layer components, the chart covers all 3 layers (see "three-layer ad detection model" above)
4. `tsc -b` passes (not just `tsc --noEmit` — Vercel is stricter)

## Top stat tiles mirror bar 1

The top tile row on the Advertising & Media root view should always mirror the order of bar 1 in the compliance card:
1. Total Ad Spend · FY label (the time anchor)
2. Agencies (purple, % of ad spend subtitle)
3. P-Card Ad Spend (red, % of ad spend subtitle)
4. Discretionary (teal, % of ad spend subtitle)
5. Community Media (emerald, N outlets subtitle)

**The FY anchor belongs ONLY in the Total Ad Spend tile label** (`Total Ad Spend · FY2025-26`). Don't duplicate it across other tiles — one time-period anchor is enough.

**Tile value formatting**: use `formatBudgetFull` ($3,415,203) not `formatBudgetAmount` ($3.4M). Journalism precision — the exact dollar amount is sometimes the story.

## Related files (quick navigation map)

- **Views**: `src/views/CityBudget/CityBudget.tsx` — the main file, contains `AdvertisingTab`, `ComplianceDashboard`, `AdBreadcrumb`
- **Vendor profile**: `src/views/CityBudget/VendorProfile.tsx` — drill-down page for individual vendors
- **Data hooks**:
  - `src/hooks/useAdvertisingData.ts` — layer detection + dept summaries
  - `src/hooks/useComplianceData.ts` — compliance metrics + trend fetcher
  - `src/hooks/useEntityTimeline.ts` — department/category timeline hooks
  - `src/hooks/useVendorProfile.ts` — vendor-level multi-year data
- **Charts**:
  - `src/components/charts/SpendingTimeline.tsx` — shared area chart
  - `src/components/charts/AdSpendCompositionChart.tsx` — year-over-year stacked composition
- **Classification**:
  - `src/utils/mediaClassification.ts` — `MEDIA_CATEGORIES` + `classifyVendor()` + vendor registry
- **Memory**:
  - `memory/project_compliance_methodology.md` — full methodology
  - `memory/project_compliance_dashboard_delivered.md` — delivery state as of 2026-04-08
  - `memory/project_ethnic_media_resolution.md` — resolution text + context
