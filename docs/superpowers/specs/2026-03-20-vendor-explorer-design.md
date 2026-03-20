# Vendor Explorer v2 — Centerpiece Financial Intelligence View

**Date:** 2026-03-20
**Status:** Draft
**Parent:** City Budget & Spending Analysis

## Vision

The Vendor Explorer is the investigative heart of DataDiver's financial transparency suite. It transforms 7.9 million payment records into an interactive social graph of public money — where every edge connects a city department to a vendor, and every node tells a story about how San Francisco spends.

This isn't a table with a search box. It's a visual investigative surface where a journalist can follow the money from a department's budget to an individual vendor's payment history, see who's growing and who's declining, spot concentration patterns, and share a specific finding via URL — all without writing a single query.

## Design Language: The Flow of Money

### Visual Vocabulary

The vendor view needs a consistent visual language for financial movement and change:

| Concept | Visual Treatment | Animation |
|---------|-----------------|-----------|
| **Money flowing in** | Green pulse, upward arrow, expanding bar | Bars grow left-to-right with easing |
| **Money flowing out / declining** | Red fade, downward arrow, contracting bar | Bars shrink with slight bounce |
| **New vendor** (first appearance) | Green glow badge "NEW", fade-in from transparent | Entrance animation: scale from 0 + opacity fade |
| **Departed vendor** (no payments this FY) | Red strikethrough, ghost bar (dashed outline) | Exit animation: bar collapses, text fades to 30% |
| **YoY growth** | Green delta badge "+23%" | Number counts up from 0 |
| **YoY decline** | Red delta badge "−15%" | Number counts down from 0 |
| **Concentration warning** | Amber ring around vendor bar | Pulse animation on the ring |
| **Active selection** | Bright accent glow, expanded state | Smooth expand transition |
| **Drill-down available** | Right chevron, hover glow | Chevron slides right on hover |

### Transitions Between States

When switching fiscal years, departments, or filters:
- Bars that persist should **animate** from old width to new width (D3 transition)
- New vendors should **enter** from the left with a scale-up
- Departing vendors should **exit** by collapsing to zero width then fading
- The list should **reorder** smoothly (D3 key-based enter/update/exit)

This creates a living, breathing visualization where you can literally watch the money shift as you change the year or filter — the same "press play" energy as the Elections Time Machine.

## Architecture: Three Levels of Depth

### Level 1: Vendor Landscape

**Route:** `/city-budget?tab=search` (default view when no vendor selected)

The full vendor universe for the selected fiscal year. Not a static top-20 chart — a scrollable, filterable, sortable, animated list of every vendor with visual weight proportional to spend.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ [Search box — full width, prominent]                             │
│ [Filters: Department ▾] [Category ▾] [Size tier ▾] [Sort ▾]    │
├─────────────────────────────────────────────────────────────────┤
│ ┌─ Vendor Bars (scrollable, virtualized) ─────────────────────┐ │
│ │                                                               │ │
│ │  ████████████████████████████████████░░░ $2.1B  RECOLOGY  ↗  │ │
│ │  ████████████████████████████████░░░░░░ $1.8B  PG&E      ↗  │ │
│ │  ██████████████░░░░░░░░░░░░░░░░░░░░░░ $892M  UCSF       →  │ │
│ │  ████████████░░░░░░░░░░░░░░░░░░░░░░░░ $743M  KAISER     ↘  │ │
│ │  ···                                                          │ │
│ │  █░ $2.3K  SMALL VENDOR LLC                              NEW │ │
│ └───────────────────────────────────────────────────────────────┘ │
│ Showing 847 of 12,453 vendors · $14.1B total                    │
└─────────────────────────────────────────────────────────────────┘
```

**Bar design:**
- Each bar = one vendor
- Width proportional to spend (with scale-break for mega-vendors)
- Ghost outline bar = prior year spend (same pattern as DepartmentBars budget ghost)
- Color = spending category or department (toggleable)
- Right side: dollar amount, YoY delta badge, drill-down chevron
- Click → navigates to Level 2 (vendor profile)

**Filters:**
- **Department:** dropdown or multi-select — filter to vendors serving specific departments
- **Spending category:** character/object/sub_object hierarchy — e.g., "Professional Services", "Advertising"
- **Size tier:** Mega ($100M+), Large ($10M-$100M), Mid ($1M-$10M), Small ($100K-$1M), Micro (<$100K)
- **Sort:** Total spend, YoY growth %, payment count, department count, alphabetical
- **Show departed:** toggle to show vendors from prior year with zero current-year spend (ghost bars)

**Fiscal year scrubber (animated):**
- Same timeline control pattern as Elections Time Machine
- Scrub between fiscal years and watch bars animate: grow, shrink, enter, exit
- "Press play" to watch the vendor landscape evolve from FY2007 to present
- This is the centerpiece animation — watching Recology grow over 18 years, seeing COVID-era health spending spike, watching tech vendors appear and disappear

**Virtual scrolling:**
- 12K+ vendors can't render as DOM — use virtualized list (react-window or custom)
- Only render visible rows + buffer
- Search results ranked by relevance, not just top-N

### Level 2: Vendor Profile

**Route:** `/city-budget?tab=search&vendor=RECOLOGY+OF+SF` (shareable deep link)

Full intelligence dossier on a single vendor. This is where a journalist spends time.

**Layout:**
```
┌─────────────────────────────────────────────────────────────────┐
│ ← Back to list          RECOLOGY OF SF              ☐ Share URL │
│ $2.1B lifetime · 18 fiscal years · 4 departments                │
├──────────────────────────┬──────────────────────────────────────┤
│                          │                                      │
│  SPENDING TIMELINE       │  DEPARTMENT BREAKDOWN                │
│  ┌──────────────────┐    │  ┌──────────────────────────┐        │
│  │    ╱─╲            │    │  │ DPW Public Works    78%  │        │
│  │  ╱    ╲  ╱──╲     │    │  │ ENV Environment     15%  │        │
│  │╱        ╱    ╲    │    │  │ AIR Airport          5%  │        │
│  │              ╲──  │    │  │ PUC Utilities        2%  │        │
│  └──────────────────┘    │  └──────────────────────────┘        │
│  FY07 ···· FY15 ···· FY25│                                      │
│                          │  SPENDING CATEGORIES                 │
│  KEY METRICS             │  ┌──────────────────────────┐        │
│  ┌──────────────────┐    │  │ Waste Collection    62%  │        │
│  │ Avg Annual  $117M │    │  │ Professional Svcs   21%  │        │
│  │ Peak Year   FY22  │    │  │ Equipment Rental    12%  │        │
│  │ YoY Change  +8.3% │    │  │ Other               5%  │        │
│  │ Contracts    12    │    │  └──────────────────────────┘        │
│  │ Nonprofit?   No   │    │                                      │
│  └──────────────────┘    │  CONTRACT INVENTORY                  │
│                          │  ┌──────────────────────────┐        │
│  PAYMENT PATTERN         │  │ 1000025922 Marketing     │        │
│  ┌──────────────────┐    │  │ ████████░░ $6.5M/$8.0M  │        │
│  │ Mon─by─month     │    │  │ Expires: Jun 2026       │        │
│  │ spending heatgrid │    │  │ ─────────────────────── │        │
│  │ (7x12 like TOD)  │    │  │ 1000013569 Outreach     │        │
│  └──────────────────┘    │  │ ██████████ $5.0M/$5.0M  │        │
│                          │  │ ⚠ Fully consumed        │        │
│                          │  └──────────────────────────┘        │
├──────────────────────────┴──────────────────────────────────────┤
│  RECENT PAYMENTS (scrollable table)                              │
│  FY2025 · DPW · Waste Collection · Voucher #V1234567 · $1.2M   │
│  FY2025 · DPW · Waste Collection · Voucher #V1234568 · $1.1M   │
│  ···                                                             │
│  [Export CSV]                                                    │
└─────────────────────────────────────────────────────────────────┘
```

**Components:**

1. **Spending Timeline** — D3 area/line chart, FY2007-present. Ghost prior-year line for comparison. Highlight peak year. Animate on load (line draws left-to-right).

2. **Department Breakdown** — Donut or horizontal bars showing which departments pay this vendor. Click a department → filter the payments table below.

3. **Spending Categories** — What the money is FOR (character/object hierarchy). Reveals whether a vendor does one thing or many things for the city.

4. **Key Metrics** — Glass cards: average annual, peak year, YoY change, contract count, nonprofit status.

5. **Contract Inventory** — Every contract with this vendor, showing utilization bars (consumed/awarded). Flags: ⚠ fully consumed, ⚠ sole source, ⚠ expired but still receiving payments.

6. **Payment Pattern Heatgrid** — Monthly spending intensity (same visual as TimeOfDayFilter). Reveals seasonality — do payments cluster at fiscal year end? (A procurement red flag.)

7. **Recent Payments** — Scrollable table of individual vouchers. Filterable by FY, department, category. CSV exportable.

### Level 3: Payment Detail (future)

Individual payment / voucher view. Probably a modal or expandable row rather than a separate route. Shows: voucher number, date, amount, PO reference, contract linkage.

## Shareable URLs

Every state is URL-encoded:

| URL | What it shows |
|-----|--------------|
| `/city-budget?tab=search` | Vendor landscape, default FY |
| `/city-budget?tab=search&fy=2025` | Vendor landscape, FY2025 |
| `/city-budget?tab=search&q=consulting` | Search results for "consulting" |
| `/city-budget?tab=search&vendor=RECOLOGY+OF+SF` | Vendor profile |
| `/city-budget?tab=search&vendor=RECOLOGY+OF+SF&dept=DPW` | Vendor profile filtered to DPW |
| `/city-budget?tab=search&sort=yoy&tier=mega` | Mega vendors sorted by YoY growth |

## Anomaly Flags on Vendor Profiles

Each vendor profile surfaces automated flags (from the sensitivity slider system):

| Flag | Logic | Visual |
|------|-------|--------|
| **Spending spike** | YoY increase > 2σ above vendor's own baseline | 🔴 Red badge with sigma value |
| **New mega-vendor** | First year with payments > $1M | 🟢 Green "NEW" badge |
| **Departed vendor** | Had payments last year, zero this year | ⚫ Ghost badge "DEPARTED" |
| **Sole source concentration** | >50% of payments via sole-source contracts | 🟡 Amber warning |
| **Fiscal year-end clustering** | >40% of annual payments in May-June | 🟡 Amber "End-of-year clustering" |
| **Split purchase pattern** | Multiple payments just below $10K/$75K thresholds | 🔴 Red "Potential split purchases" |
| **Contract overrun** | Payments exceed contract award amount | 🔴 Red "Over-contract" |

## Animation System

### Enter/Exit/Update Pattern (D3-inspired)

Every list in the vendor view (bars, payment rows, department breakdowns) follows the same animation lifecycle:

```
ENTER:  opacity 0 → 1, scaleX 0 → 1, translateX -20 → 0 (slide in from left)
UPDATE: width transitions smoothly, position reorders with translateY
EXIT:   opacity 1 → 0, scaleX 1 → 0, translateX 0 → 20 (slide out right)
```

Duration: 500ms for bar transitions, 300ms for badge transitions, 800ms for chart redraws.

### "Press Play" Fiscal Year Animation

The headline feature for the vendor landscape:

1. User clicks play on the FY scrubber
2. Starting from FY2007, the view advances one year every 1.5 seconds
3. Each transition:
   - Existing vendors: bars animate to new width (grow = green flash, shrink = red flash)
   - New vendors: enter from the left with scale-up animation
   - Departed vendors: bars collapse to zero, row fades out
   - List reorders by new sort (smooth position transitions)
   - Delta badges count up/down from zero
   - Year counter prominently displayed

This creates a cinematic "18 years of city spending in 27 seconds" experience.

## Data Queries

### Vendor Landscape (Level 1)

```sql
-- Main vendor list with YoY comparison
SELECT vendor, SUM(vouchers_paid) as total, COUNT(*) as payments
FROM n9pm-xkyq
WHERE fiscal_year = '{fy}' AND revenue_or_spending = 'Spending'
GROUP BY vendor
ORDER BY total DESC
LIMIT 500

-- Prior year for delta calculation
SELECT vendor, SUM(vouchers_paid) as total
FROM n9pm-xkyq
WHERE fiscal_year = '{fy - 1}' AND revenue_or_spending = 'Spending'
GROUP BY vendor
ORDER BY total DESC
LIMIT 500
```

### Vendor Profile (Level 2)

```sql
-- Annual spending history
SELECT fiscal_year, SUM(vouchers_paid) as total, COUNT(*) as payments
FROM n9pm-xkyq
WHERE vendor = '{name}'
GROUP BY fiscal_year
ORDER BY fiscal_year

-- Department breakdown
SELECT department, SUM(vouchers_paid) as total, COUNT(*) as payments
FROM n9pm-xkyq
WHERE vendor = '{name}' AND fiscal_year = '{fy}'
GROUP BY department
ORDER BY total DESC

-- Category breakdown
SELECT character, object, sub_object, SUM(vouchers_paid) as total
FROM n9pm-xkyq
WHERE vendor = '{name}' AND fiscal_year = '{fy}'
GROUP BY character, object, sub_object
ORDER BY total DESC

-- Contracts
SELECT contract_number, contract_title, department, agreed_amt, pmt_amt, remaining_amt, sole_source_flg, term_end_date
FROM cqi5-hm2d
WHERE prime_contractor LIKE '%{name}%'
ORDER BY pmt_amt DESC

-- Recent payments (paginated)
SELECT fiscal_year, department, sub_object, vouchers_paid, voucher, purchase_order
FROM n9pm-xkyq
WHERE vendor = '{name}'
ORDER BY fiscal_year DESC, vouchers_paid DESC
LIMIT 50 OFFSET {page * 50}
```

## Implementation Phases

### Phase 1: Enhanced Vendor Landscape
- Virtual scrolling for full vendor list (not top-20)
- Scale-break for mega-vendors (reuse capPercentile)
- Ghost bars for prior-year comparison
- YoY delta badges (green/red)
- Filter controls: department, category, size tier, sort
- URL param encoding for all filter state

### Phase 2: Vendor Profile
- Full-width profile view triggered by vendor selection
- Spending timeline (D3 area chart)
- Department breakdown (horizontal bars or donut)
- Key metrics cards
- Contract inventory with utilization bars
- URL deep-link: `&vendor=NAME`

### Phase 3: Animation System
- Enter/exit/update transitions on vendor bars
- FY scrubber with "press play" animation
- Delta badge count-up animation
- Bar reordering animation

### Phase 4: Anomaly Flags
- Automated flag computation per vendor
- Flag badges on vendor bars and profiles
- Sensitivity slider integration
- "Flagged vendors" filter preset

### Phase 5: Payment Detail + Export
- Paginated payment table in vendor profile
- Payment pattern heatgrid
- CSV export of filtered payments
- Individual voucher expansion

## Open Questions

1. **Virtual scrolling library:** react-window vs custom IntersectionObserver? react-window is proven but adds a dependency.
2. **Vendor name normalization:** Same vendor may appear as "RECOLOGY OF SF" and "RECOLOGY OF SAN FRANCISCO INC." Should we merge? (Risky — could conflate different entities.)
3. **Cross-year vendor identity:** Vendor names can change (mergers, rebranding). Should the profile show the full history including name changes?
4. **Mobile layout:** The two-column vendor profile won't work on narrow screens. Stack vertically?
5. **Department-to-vendor view:** Should clicking a department in the Budget Overview drill into a vendor list for that department? (Cross-tab navigation.)
