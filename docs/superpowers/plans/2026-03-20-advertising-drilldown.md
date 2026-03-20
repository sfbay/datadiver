# Advertising & Media — Drill-Down Enhancement Plan

**Spec:** `docs/superpowers/specs/2026-03-20-spending-drilldown-architecture.md`
**Branch:** `feature/ad-drilldown`
**Scope:** Transform the static Advertising tab into a fully interactive drill-down view

## Current State

The Advertising tab has:
- Inline stat cards (total ad spend, top dept, P-card spend, vendor count)
- Media mix breakdown (bars by category)
- Top vendor chart (HorizontalBarChart, 25 bars)
- P-card transparency section (department P-card breakdown)
- Department ad spend sidebar (right column)
- CSV export

Everything is flat — no clicking through to deeper levels.

## Goal

Three drill-down entry points, all converging on the same pattern:

1. **Media category drill-down**: Click "Community & Ethnic Press" → see all vendors in that category
2. **Department drill-down**: Click "DPH Public Health" in sidebar → see all ad vendors for that department
3. **Vendor drill-down**: Click any vendor → see their full profile (reuse VendorProfile)

Plus breadcrumb navigation showing the audit trail, and URL encoding for shareable state.

## Implementation

### Task 1: Add drill-down state management

In `AdvertisingTab`, add URL-synced state for:
- `adCategory` — selected media category (e.g., "community-ethnic")
- `adDept` — selected department (e.g., "DPH")
- `adVendor` — selected vendor (e.g., "SING TAO DAILY")

These accumulate as filters. When `adCategory` is set, show vendors in that category. When `adVendor` is also set, show the vendor profile.

Use `useSearchParams` to sync all state to URL, same pattern as VendorExplorer.

### Task 2: Breadcrumb navigation

Add a breadcrumb bar at the top of the Advertising content area:

```
Advertising & Media > Community & Ethnic Press > Sing Tao Daily
```

Each segment is clickable to navigate back to that level. Uses the drill-down state:
- No filters: "Advertising & Media" (top level)
- `adCategory` set: "Advertising & Media > Community & Ethnic Press"
- `adCategory` + `adVendor`: "Advertising & Media > Community & Ethnic Press > Sing Tao Daily"
- `adDept` set: "Advertising & Media > DPH Public Health"
- `adDept` + `adVendor`: "Advertising & Media > DPH Public Health > Civic Edge Consulting"

### Task 3: Make media mix categories clickable

Each media category row in the Media Mix section becomes a button. Clicking it:
1. Sets `adCategory` in URL params
2. Transitions the main content area to show a filtered vendor list for that category
3. Updates the stat cards to reflect the filtered subset
4. Shows breadcrumb: "Advertising & Media > [Category Name]"

The filtered view shows:
- Stat cards: total for this category, vendor count, top vendor, YoY change
- Full vendor list for this category (not top 20 — show all, using the ad.vendors data filtered client-side)
- Each vendor row: name, amount, department(s), payment count, media classification badge
- Click vendor → drill to vendor profile (Task 5)

### Task 4: Make department sidebar clickable

Each department in the right sidebar becomes clickable. Clicking it:
1. Sets `adDept` in URL params
2. Transitions the main content to show all ad vendors for that department
3. Shows the department's ad spend breakdown by media category
4. Breadcrumb: "Advertising & Media > [Department Name]"

The filtered view shows:
- Stat cards: department's total ad spend, P-card %, vendor count
- Media mix chart filtered to this department
- Vendor list for this department's ad spend
- Click vendor → drill to vendor profile (Task 5)

### Task 5: Vendor profile integration

When `adVendor` is set (from either media category or department drill-down):
1. Show the VendorProfile component (inline, not overlay)
2. Pre-filtered context preserved in breadcrumb
3. Back button returns to the previous drill-down level
4. URL: `?tab=advertising&adCategory=community-ethnic&adVendor=SING+TAO+DAILY`

Reuse the existing `VendorProfile` component from `src/views/CityBudget/VendorProfile.tsx`.

### Task 6: Filtered vendor list component

Create a reusable `FilteredVendorList` sub-component used by both the category and department drill-down views:

```tsx
interface FilteredVendorListProps {
  vendors: AdVendorRow[]  // from useAdvertisingData, pre-filtered
  onSelectVendor: (vendor: string) => void
  title: string
}
```

Renders:
- Vendor rows with: rank, name (full, not truncated), media category badge (colored dot), amount, payment count, department(s) served
- Sort: by amount (default), by name, by payment count
- Sentence case vendor names
- Click → onSelectVendor

### Task 7: Animated transitions between drill-down levels

When transitioning between levels:
- Content area cross-fades (opacity transition, 200ms)
- Stat cards update with number count-up animation
- Breadcrumb segments animate in (slide from left)

### Verification

- `npx tsc -b` passes
- All three drill-down paths work: category → vendor, department → vendor, direct vendor click
- URL params encode full drill-down state
- Back button / breadcrumb navigation returns to correct parent level
- Stat cards update to reflect filtered context at each level

## Build order

Tasks 1-2 first (state + breadcrumb), then 3-4 in parallel (media + dept clickable), then 5-6 (vendor profile + list component), then 7 (animations).

Commit after Tasks 1-2, then after 3-4, then after 5-7.
