# Unified Spending Drill-Down Architecture

**Date:** 2026-03-20
**Status:** Draft
**Context:** Emerged from Vendor Explorer v2 review — the same drill-down pattern recurs across Budget Overview, Vendor Search, and Advertising tabs.

## Core Insight

Every view in the City Budget tool is a **filtered aggregation of the same underlying dataset** (Vendor Payments `n9pm-xkyq`). The only differences are:
- **What's filtered** (department, category, vendor, media type)
- **What's grouped** (department, vendor, sub_object, contract)
- **Where you entered** (Budget tab, Search tab, Advertising tab)

This means one unified drill-down system can power all of them.

## The Spending Hierarchy

```
Organization Group
  └── Department
        └── Character (spending type)
              └── Object
                    └── Sub-Object (e.g., "Advertising")
                          └── Vendor
                                └── Contract
                                      └── Individual Payment (voucher)
```

Every node in this tree is both:
1. A **summary** of everything below it (total spend, payment count, YoY delta)
2. A **link** to drill into the next level

## Entry Points (all converge to the same drill-down)

| Entry Point | Starting Level | Pre-applied Filter |
|-------------|---------------|-------------------|
| Budget Overview → click department | Department | `department = 'DPH'` |
| Budget Overview → click dept → click category | Sub-Object | `department = 'DPH' AND sub_object = 'Advertising'` |
| Vendor Search → click vendor | Vendor | `vendor = 'RECOLOGY'` |
| Advertising tab → click media category | Vendor (filtered) | `sub_object = 'Advertising' AND media_category = 'Community & Ethnic Press'` |
| Advertising tab → click vendor | Contract/Payment | `vendor = 'SING TAO' AND sub_object = 'Advertising'` |
| Any anomaly flag → click | Context-dependent | Flag determines the filter |

## The Universal Drill-Down Component

### `SpendingDrilldown` — reusable at every level

```tsx
interface SpendingDrilldownProps {
  /** Current filter context (accumulated from parent drill-downs) */
  filter: SpendingFilter
  /** What to group by at this level */
  groupBy: 'department' | 'vendor' | 'sub_object' | 'character' | 'contract'
  /** Fiscal year */
  fiscalYear: number
  /** What happens when user clicks an item to drill deeper */
  onDrillDown: (item: DrilldownItem) => void
  /** Optional: custom label renderer (e.g., media category badges for advertising) */
  renderLabel?: (item: DrilldownItem) => ReactNode
  /** Optional: custom secondary info (e.g., contract utilization bar) */
  renderDetail?: (item: DrilldownItem) => ReactNode
}

interface SpendingFilter {
  department?: string
  character?: string
  object?: string
  sub_object?: string
  vendor?: string
  contract?: string
  mediaCategory?: string  // virtual filter for advertising classification
}

interface DrilldownItem {
  key: string           // the grouped value (dept name, vendor name, etc.)
  total: number         // total spend
  count: number         // payment count
  priorTotal?: number   // prior FY for delta
  children?: string     // what to group by next when drilling into this item
}
```

### What it renders:

```
┌────────────────────────────────────────────────────┐
│ [Breadcrumb: Department > Sub-Object > Vendor]      │
│ [Filter: FY2025 ▾] [Sort: Total ▾]                 │
├────────────────────────────────────────────────────┤
│ ███████████████████░░░ $1.6M  Civic Edge  +23% ▸  │
│ █████████░░░░░░░░░░░░ $529K  Most Likely  −8%  ▸  │
│ ███████░░░░░░░░░░░░░░ $328K  Daily Journal NEW ▸  │
│ ···                                                 │
├────────────────────────────────────────────────────┤
│ 47 items · $3.0M total · ↑12% vs FY2024            │
└────────────────────────────────────────────────────┘
```

### Breadcrumb navigation

Every drill-down level adds to a breadcrumb trail. Clicking any breadcrumb segment navigates back to that level:

```
All Departments > DPH Public Health > Advertising > Community & Ethnic Press
                  ↑ click = back     ↑ click = back  ↑ current level
```

The breadcrumb IS the audit trail. The URL encodes the full path:
```
/city-budget?tab=search&dept=DPH&sub=Advertising&media=community-ethnic
```

## How Advertising & Media Becomes a Preset Filter

The current Advertising tab is a standalone implementation. Under the unified model, it becomes:

1. **Media Mix chart** → Each media category is a clickable segment
2. **Click "Community & Ethnic Press"** → SpendingDrilldown with filter `{ sub_object: 'Advertising', mediaCategory: 'community-ethnic' }`
3. **Shows:** Sing Tao, El Mensajero, Bay Area Reporter, etc. with spend bars
4. **Click "Sing Tao"** → SpendingDrilldown with filter `{ vendor: 'SING TAO DAILY', sub_object: 'Advertising' }`
5. **Shows:** Contracts + individual payments
6. **Breadcrumb:** Advertising > Community & Ethnic Press > Sing Tao Daily

Same component, same interaction, same URL pattern. The advertising-specific parts (media classification badges, P-card transparency callout) are passed as `renderLabel` and `renderDetail` overrides.

## How Department View Uses the Same Pattern

From Budget Overview:

1. **Click "DPH Public Health"** → SpendingDrilldown grouped by `character` (Materials, Services, Personnel, etc.)
2. **Click "Professional Services"** → SpendingDrilldown grouped by `vendor`
3. **Click "Zeba Consulting"** → Vendor Profile (reuse existing)
4. **Breadcrumb:** DPH > Professional Services > Zeba Consulting

## URL Schema (unified)

All drill-down state in one URL pattern:

```
/city-budget?tab=search
  &fy=2025                    # fiscal year
  &dept=DPH                   # department filter
  &char=Professional+Services # character filter
  &obj=Consulting             # object filter
  &sub=Advertising            # sub_object filter
  &vendor=ZEBA+CONSULTING     # vendor filter
  &media=community-ethnic     # media category (advertising only)
  &sort=total                 # sort order
  &sensitivity=65             # anomaly sensitivity
```

Each parameter is optional. The presence of parameters determines the drill-down depth. Removing a parameter navigates "up" to a broader view.

## Visual Language (consistent across all levels)

Every level of the drill-down uses the same visual treatments from the Vendor Explorer spec:

| Element | Treatment |
|---------|-----------|
| Bars | Width = spend, ghost outline = prior year |
| Growth | Green delta badge, green bar growth animation |
| Decline | Red delta badge, red bar shrink animation |
| New item | Green "NEW" badge, slide-in entrance |
| Departed | Ghost row (dashed, 25% opacity) |
| Anomaly flag | Colored badge (red/amber) with icon |
| Drill-down available | Right chevron, hover glow |
| Breadcrumb | Top of panel, clickable segments |

## Implementation Plan

### Phase 1: SpendingDrilldown Component
- Shared component with filter/groupBy/onDrillDown props
- Breadcrumb navigation
- Bar rendering with ghost bars, deltas, flags
- URL param sync

### Phase 2: Wire Budget Overview
- Department click → SpendingDrilldown(groupBy: 'character')
- Category click → SpendingDrilldown(groupBy: 'vendor')
- Vendor click → Vendor Profile

### Phase 3: Wire Advertising Tab
- Media category click → SpendingDrilldown(filter: mediaCategory, groupBy: 'vendor')
- Vendor click → contracts/payments
- P-card transparency as a special "category" in the drilldown

### Phase 4: Wire Vendor Explorer
- Vendor landscape uses SpendingDrilldown(groupBy: 'vendor')
- Vendor click → Vendor Profile (already exists)
- Department tab in profile uses SpendingDrilldown(filter: vendor, groupBy: 'department')

## What This Means for Code

The current codebase has:
- `VendorExplorer.tsx` — custom bar rendering for vendors
- `VendorProfile.tsx` — custom detail view
- `AdvertisingTab` in `CityBudget.tsx` — custom bar rendering for ad vendors
- `BudgetOverview` in `CityBudget.tsx` — DepartmentBars component

Under the unified model, these converge:
- `SpendingDrilldown.tsx` — replaces all custom bar lists
- `VendorProfile.tsx` — stays (it's the terminal detail view)
- `AdvertisingTab` — becomes a preset filter + media classification overlay
- `BudgetOverview` — keeps its summary charts, but department click → SpendingDrilldown

This is a refactor of the drill-down interaction, not a rewrite. The charts, cards, and profile view stay. The bar lists unify.
