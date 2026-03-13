# Census Data Integration — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Integrate ACS Census data into DataDiver as a shared demographic layer — a standalone Demographics Explorer view, per-view demographic underlays on all 7 map-based views, and neighborhood Census context panels in sidebars.

**Architecture:** Census infrastructure is ported from `../social/resonate/src/lib/census/`. Static JSON ships with the build for instant rendering; background API refresh is optional. A `useCensusData` hook provides data at 3 resolution levels (neighborhood, tract, block group). The `DemographicUnderlay` component is a reusable Mapbox choropleth mountable by any view. The Explorer view uses a 50/50 map+scatter layout with modular demographic cards.

**Tech Stack:** React 18, TypeScript, Mapbox GL JS v3, D3.js, Tailwind v4, Census Bureau ACS API, existing Socrata infrastructure

**Spec:** `docs/superpowers/specs/2026-03-12-census-integration-design.md`

---

## File Structure

### New Files

| File | Responsibility |
|------|---------------|
| `src/types/census.ts` | `CensusVariable` union, `CensusVariableConfig`, `CensusData`, `NeighborhoodCensusData`, `TractMapping` types |
| `src/api/censusClient.ts` | Fetch ACS 5-year data from Census Bureau API, parse array-of-arrays response |
| `src/utils/tractMapping.ts` | Census tract → neighborhood weighted allocation crosswalk (~200 tracts → 41 neighborhoods) |
| `src/utils/censusAggregator.ts` | Population-weighted rollup functions: `weightedAvg()`, `weightedSum()`, `aggregateToNeighborhoods()` |
| `src/utils/censusVariables.ts` | `CENSUS_VARIABLES` config registry mapping each `CensusVariable` to ACS table, label, format, color ramp |
| `src/data/census-neighborhoods.json` | Pre-computed Census data for 41 neighborhoods (~5KB) |
| `src/data/census-tracts.json` | Pre-computed Census data for ~200 tracts (~25KB) |
| `src/data/census-blockgroups.json` | Pre-computed Census data for ~580 block groups (~50KB) |
| `src/data/sf-tracts.geojson` | Census tract boundary polygons for SF (~200KB) |
| `src/data/sf-blockgroups.geojson` | Block group boundary polygons for SF (~500KB-1MB) |
| `src/hooks/useCensusData.ts` | Hook: loads static JSON immediately, optional background API refresh with 24hr cache |
| `src/hooks/useCivicMetrics.ts` | Hook: fetches pre-computed civic metrics (crime count, 311 count, etc.) by neighborhood for scatter Y-axis |
| `src/hooks/useCensusResolution.ts` | Hook: zoom-adaptive resolution switching (neighborhood → tract → block group) |
| `src/components/maps/DemographicUnderlay.ts` | Mapbox choropleth layer for Census data, mountable by any view |
| `src/components/maps/UnderlayPicker.tsx` | Glass-card dropdown for selecting demographic underlay variable |
| `src/components/ui/NeighborhoodCensusContext.tsx` | Sidebar section showing Census stats for a selected neighborhood |
| `src/components/ui/DataSourceLine.tsx` | Reusable source attribution component |
| `src/components/charts/CorrelationScatter.tsx` | D3 scatter plot with OLS trend line and Pearson r |
| `src/components/charts/DorlingCartogram.tsx` | D3 force-layout Dorling cartogram (Explorer only) |
| `src/components/charts/DemographicCard.tsx` | Expandable card with citywide stat + sparkbar distribution |
| `src/views/Demographics/Demographics.tsx` | Main Explorer view — map+scatter+cards layout |
| `src/views/Demographics/useDemographicsData.ts` | Data transformation hook for Explorer view |
| `scripts/generate-census-static.ts` | One-time script to fetch Census data and generate static JSON files |

### Modified Files

| File | Change |
|------|--------|
| `src/types/datasets.ts` | Add `'demographics'` to `ViewId` union |
| `src/api/datasets.ts` | No change needed (Census uses its own client, not Socrata) |
| `src/App.tsx` | Add `/demographics` route |
| `src/components/layout/AppShell.tsx` | Add Demographics nav item at bottom |
| `src/views/CrimeIncidents/CrimeIncidents.tsx` | Add `UnderlayPicker` + `DemographicUnderlay` + `NeighborhoodCensusContext` |
| `src/views/Cases311/Cases311.tsx` | Add underlay + context panel |
| `src/views/TrafficSafety/TrafficSafety.tsx` | Add underlay + context panel |
| `src/views/EmergencyResponse/EmergencyResponse.tsx` | Add underlay + context panel |
| `src/views/ParkingCitations/ParkingCitations.tsx` | Add underlay + context panel |
| `src/views/ParkingRevenue/ParkingRevenue.tsx` | Add underlay + context panel |
| `src/views/BusinessActivity/BusinessActivity.tsx` | Add underlay + context panel |
| `src/views/Home/Home.tsx` | Add Demographics exploration card |

---

## Chunk 1: Census Infrastructure (Foundation)

### Task 1: Census Types

**Files:**
- Create: `src/types/census.ts`

- [ ] **Step 1: Create CensusVariable union type**

```typescript
// src/types/census.ts

/** All demographic variables available in the Census integration */
export type CensusVariable =
  // Population
  | 'totalPopulation' | 'populationDensity'
  // Income & Housing Stress
  | 'medianIncome' | 'incomeDistribution' | 'povertyRate'
  | 'rentBurden' | 'renterPct' | 'medianRent' | 'medianHomeValue'
  // Race/Ethnicity
  | 'pctWhite' | 'pctBlack' | 'pctAsian' | 'pctHispanic'
  | 'pctPacificIslander' | 'pctMultiracial' | 'pctOther'
  // Language
  | 'lepRate' | 'pctChinese' | 'pctSpanish' | 'pctTagalog'
  | 'pctVietnamese' | 'pctKorean' | 'pctRussian'
  // Age
  | 'medianAge' | 'pctUnder18' | 'pctOver65' | 'pctWorkingAge'
  // Education
  | 'pctBachelorsPlus' | 'pctNoHighSchool'
  // Employment & Commute
  | 'unemploymentRate' | 'pctWFH' | 'pctDriveAlone'
  | 'pctTransit' | 'pctBikeWalk'

/** Category groupings for the variable picker UI */
export type CensusCategory = 'population' | 'income' | 'race' | 'language' | 'age' | 'education' | 'employment'

/** Configuration for a single Census variable — maps to ACS tables and UI display */
export interface CensusVariableConfig {
  key: CensusVariable
  label: string
  shortLabel: string          // for compact displays (cards, legends)
  category: CensusCategory
  acsTable: string            // e.g., 'B19013'
  acsVariables: string[]      // e.g., ['B19013_001E', 'B19013_001M']
  format: 'currency' | 'percent' | 'number' | 'density'
  colorScale: 'sequential' | 'diverging'
  colorRamp: string[]
  availableAt: ('neighborhood' | 'tract' | 'blockgroup')[]
  isSubPicker?: boolean       // true for race/ethnicity, language
  parentGroup?: string        // e.g., 'raceEthnicity' groups pctWhite, pctBlack, etc.
}

/** Census data for a single geographic unit (tract, block group, or neighborhood) */
export type CensusData = {
  geoId: string
  geoType: 'tract' | 'blockgroup' | 'neighborhood'
  name: string
  population: number
} & Partial<Record<CensusVariable, number>>

/** Neighborhood-level Census data with aggregation metadata */
export interface NeighborhoodCensusData extends CensusData {
  geoType: 'neighborhood'
  tractCount: number
  tracts: string[]
}

/** A single entry in the tract-to-neighborhood crosswalk */
export interface TractMapping {
  tractId: string             // 6-digit code, e.g., '010700'
  neighborhoods: { name: string; weight: number }[]
}

/** Return type for the useCensusData hook */
export interface CensusDataResult {
  neighborhoods: NeighborhoodCensusData[]
  tracts: CensusData[]
  blockGroups: CensusData[]
  isLive: boolean
  isLoading: boolean
  error: string | null
}

/** Civic metric option for scatter Y-axis */
export interface CivicMetricConfig {
  key: string
  label: string
  datasetKey: string  // Must match a key in DATASETS (src/api/datasets.ts)
  neighborhoodField: string
  selectClause: string
  isClientSide?: boolean      // true for response time (needs raw record fetch)
  sourceView: string          // which DataDiver view this comes from
}
```

- [ ] **Step 2: Add 'demographics' to ViewId**

Modify `src/types/datasets.ts` line 592:

```typescript
export type ViewId = 'home' | 'emergency-response' | 'parking-revenue' | 'dispatch-911' | '311-cases' | 'crime-incidents' | 'parking-citations' | 'traffic-safety' | 'business-activity' | 'campaign-finance' | 'demographics'
```

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`
Expected: Clean build, no type errors

- [ ] **Step 4: Commit**

```bash
git add src/types/census.ts src/types/datasets.ts
git commit -m "feat(census): add Census types — CensusVariable, CensusData, TractMapping"
```

---

### Task 2: Census Variable Registry

**Files:**
- Create: `src/utils/censusVariables.ts`

- [ ] **Step 1: Create the CENSUS_VARIABLES config array**

This file defines all ~35 Census variables with their ACS table mappings, display labels, color ramps, and availability per resolution level. Port ACS variable codes from `../social/resonate/src/lib/census/census-api.ts` (lines defining `ACS_VARIABLES`).

```typescript
// src/utils/censusVariables.ts
import type { CensusVariableConfig, CensusVariable, CensusCategory, CivicMetricConfig, ViewId } from '../types/census'

export const CENSUS_VARIABLES: CensusVariableConfig[] = [
  // --- Population ---
  {
    key: 'totalPopulation',
    label: 'Total Population',
    shortLabel: 'Population',
    category: 'population',
    acsTable: 'B01003',
    acsVariables: ['B01003_001E'],
    format: 'number',
    colorScale: 'sequential',
    colorRamp: ['#1e293b', '#475569', '#7c3aed', '#a78bfa'],
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'populationDensity',
    label: 'Population Density',
    shortLabel: 'Pop Density',
    category: 'population',
    acsTable: 'B01003',
    acsVariables: ['B01003_001E'],
    format: 'density',
    colorScale: 'sequential',
    colorRamp: ['#1e293b', '#475569', '#3b82f6', '#60a5fa'],
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  // --- Income & Housing Stress ---
  {
    key: 'medianIncome',
    label: 'Median Household Income',
    shortLabel: 'Med. Income',
    category: 'income',
    acsTable: 'B19013',
    acsVariables: ['B19013_001E'],
    format: 'currency',
    colorScale: 'sequential',
    colorRamp: ['#92400e', '#f59e0b', '#14b8a6', '#7c3aed'],
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  // ... (continue for all ~35 variables following same pattern)
  // Full list: medianIncome, incomeDistribution, povertyRate, rentBurden, renterPct,
  //   medianRent, medianHomeValue, pctWhite, pctBlack, pctAsian, pctHispanic,
  //   pctPacificIslander, pctMultiracial, pctOther, lepRate, pctChinese, pctSpanish,
  //   pctTagalog, pctVietnamese, pctKorean, pctRussian, medianAge, pctUnder18,
  //   pctOver65, pctWorkingAge, pctBachelorsPlus, pctNoHighSchool,
  //   unemploymentRate, pctWFH, pctDriveAlone, pctTransit, pctBikeWalk
  //
  // Race/ethnicity vars get: isSubPicker: false, parentGroup: 'raceEthnicity'
  // Language vars get: parentGroup: 'language'
  // Block group unavailable vars: detailed education, commute specifics, language breakdown
]

/** Lookup a variable config by key */
export function getVariableConfig(key: CensusVariable): CensusVariableConfig | undefined {
  return CENSUS_VARIABLES.find(v => v.key === key)
}

/** Get all variables in a category */
export function getVariablesByCategory(category: CensusCategory): CensusVariableConfig[] {
  return CENSUS_VARIABLES.filter(v => v.category === category)
}

/** Get sub-picker children for a parent group (e.g., 'raceEthnicity' → pctWhite, pctBlack, ...) */
export function getSubPickerVariables(parentGroup: string): CensusVariableConfig[] {
  return CENSUS_VARIABLES.filter(v => v.parentGroup === parentGroup)
}

/** Per-view underlay presets */
export const UNDERLAY_PRESETS: Partial<Record<ViewId, CensusVariable[]>> = {
  'crime-incidents': ['medianIncome', 'pctAsian', 'populationDensity'],
  '311-cases': ['rentBurden', 'lepRate', 'pctHispanic'],
  'traffic-safety': ['medianAge', 'populationDensity', 'pctTransit'],
  'emergency-response': ['rentBurden', 'pctOver65', 'pctBlack'],
  'parking-citations': ['medianIncome', 'renterPct', 'pctDriveAlone'],
  'parking-revenue': ['medianIncome', 'populationDensity'],
  'business-activity': ['medianIncome', 'pctBachelorsPlus', 'pctAsian'],
}

/** Pre-computed civic metrics for scatter Y-axis */
export const CIVIC_METRICS: CivicMetricConfig[] = [
  { key: 'crimeCount', label: 'Crime Incidents', datasetKey: 'policeIncidents', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, COUNT(*) as value', sourceView: 'Crime Incidents' },
  { key: 'cases311Count', label: '311 Cases', datasetKey: 'cases311', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, COUNT(*) as value', sourceView: '311 Cases' },
  { key: 'avgResponseTime', label: 'Avg Response Time', datasetKey: 'fireEMSDispatch', neighborhoodField: 'neighborhoods_analysis_boundaries', selectClause: '', isClientSide: true, sourceView: 'Emergency Response' },
  { key: 'fireCount', label: 'Fire Incidents', datasetKey: 'fireIncidents', neighborhoodField: 'neighborhood_district', selectClause: 'neighborhood_district, COUNT(*) as value', sourceView: 'Emergency Response' },
  { key: 'crashCount', label: 'Traffic Crashes', datasetKey: 'trafficCrashes', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, COUNT(*) as value', sourceView: 'Traffic Safety' },
  { key: 'crashInjuries', label: 'Crash Injuries', datasetKey: 'trafficCrashes', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, SUM(number_injured) as value', sourceView: 'Traffic Safety' },
  { key: 'citationCount', label: 'Parking Citations', datasetKey: 'parkingCitations', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, COUNT(*) as value', sourceView: 'Parking Citations' },
  { key: 'businessOpenings', label: 'Business Openings', datasetKey: 'businessLocations', neighborhoodField: 'analysis_neighborhood', selectClause: 'analysis_neighborhood, COUNT(*) as value', sourceView: 'Business Activity' },
]
```

The implementer must fill in all ~35 variable configs. Reference `../social/resonate/src/lib/census/census-api.ts` for the exact ACS variable codes. Each variable needs: key, label, shortLabel, category, acsTable, acsVariables (including MOE `_M` suffix), format, colorScale, colorRamp, availableAt array, and optional parentGroup/isSubPicker.

**Color ramp guidelines:**
- Income-type (sequential high=good): amber → teal → purple
- Stress-type (sequential high=bad): teal → amber → red
- Rate-type (diverging around city average): blue ← gray → red
- Race/ethnicity: each group gets a unique single-hue ramp

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: Clean build

- [ ] **Step 3: Commit**

```bash
git add src/utils/censusVariables.ts
git commit -m "feat(census): add Census variable registry — ACS table mappings, presets, civic metrics"
```

---

### Task 3: Tract-to-Neighborhood Crosswalk

**Files:**
- Create: `src/utils/tractMapping.ts`
- Reference: `../social/resonate/src/lib/census/tract-mapping.ts`

- [ ] **Step 1: Port the tract mapping from resonate**

Read `../social/resonate/src/lib/census/tract-mapping.ts` (323 lines). Port the `TRACT_TO_NEIGHBORHOOD` array and helper functions. Key adaptations:
- Resonate uses underscore IDs (`bayview_hunters_point`). DataDiver uses display names matching the `nhood` GeoJSON property (e.g., "Bayview Hunters Point"). Add a `NEIGHBORHOOD_ID_TO_NAME` map or convert during port.
- Keep the weighted allocations exactly as-is — they represent real geographic overlap.

```typescript
// src/utils/tractMapping.ts
import type { TractMapping } from '../types/census'

/**
 * Maps SF census tracts to Analysis Neighborhoods with weighted allocations.
 * Ported from ../social/resonate/src/lib/census/tract-mapping.ts
 *
 * Weighted allocation handles tracts that straddle neighborhood boundaries.
 * E.g., tract 011300 → Chinatown (0.7) + Nob Hill (0.3)
 */
export const TRACT_MAPPINGS: TractMapping[] = [
  // Port the full mapping array from resonate.
  // Each entry: { tractId: '010100', neighborhoods: [{ name: 'Chinatown', weight: 1.0 }] }
  // For split tracts: { tractId: '011300', neighborhoods: [{ name: 'Chinatown', weight: 0.7 }, { name: 'Nob Hill', weight: 0.3 }] }
  // ... (~200 entries)
]

/** Get neighborhood(s) for a given census tract */
export function getNeighborhoodsForTract(tractId: string): { name: string; weight: number }[] {
  const mapping = TRACT_MAPPINGS.find(m => m.tractId === tractId)
  return mapping?.neighborhoods ?? []
}

/** Get all tracts that contribute to a given neighborhood */
export function getTractsForNeighborhood(neighborhood: string): { tractId: string; weight: number }[] {
  const results: { tractId: string; weight: number }[] = []
  for (const mapping of TRACT_MAPPINGS) {
    const match = mapping.neighborhoods.find(n => n.name === neighborhood)
    if (match) results.push({ tractId: mapping.tractId, weight: match.weight })
  }
  return results
}

/** All unique neighborhood names in the mapping */
export function getAllMappedNeighborhoods(): string[] {
  const set = new Set<string>()
  for (const m of TRACT_MAPPINGS) {
    for (const n of m.neighborhoods) set.add(n.name)
  }
  return Array.from(set).sort()
}
```

The implementer must:
1. Read resonate's `tract-mapping.ts` and port the full `TRACT_TO_NEIGHBORHOOD` array
2. Convert neighborhood IDs from underscore format (`bayview_hunters_point`) to DataDiver's display name format (`Bayview Hunters Point`) matching the `nhood` property in the neighborhood boundaries GeoJSON
3. Verify all 41 neighborhoods in resonate's mapping match DataDiver's `SF_NEIGHBORHOODS` constant in `src/utils/geo.ts`

- [ ] **Step 2: Verify all 41 neighborhoods match**

Write a quick check: compare the output of `getAllMappedNeighborhoods()` against `SF_NEIGHBORHOODS` in `src/utils/geo.ts`. Any mismatches need to be resolved (usually spelling/capitalization differences).

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/utils/tractMapping.ts
git commit -m "feat(census): add tract-to-neighborhood crosswalk — ~200 tracts → 41 neighborhoods with weighted allocations"
```

---

### Task 4: Census API Client

**Files:**
- Create: `src/api/censusClient.ts`
- Reference: `../social/resonate/src/lib/census/census-api.ts`

- [ ] **Step 1: Port and adapt the Census API client**

Read `../social/resonate/src/lib/census/census-api.ts` (393 lines). Port the fetch logic with these adaptations:
- Use `import.meta.env.VITE_CENSUS_API_KEY` (Vite env var, not `process.env`)
- Remove any Supabase dependencies
- Add block group support (`for=block group:*&in=state:06+county:075+tract:*`)
- Return typed `CensusData[]` using our types

```typescript
// src/api/censusClient.ts
import type { CensusData, CensusVariable } from '../types/census'
import { CENSUS_VARIABLES } from '../utils/censusVariables'

const API_BASE = 'https://api.census.gov/data'
const SF_STATE = '06'
const SF_COUNTY = '075'
const DEFAULT_YEAR = 2024
const DEFAULT_DATASET = 'acs5'

interface CensusApiConfig {
  year?: number
  dataset?: 'acs5' | 'acs1'
}

/**
 * Fetch ACS data for all SF census tracts.
 * Returns one CensusData per tract with all available variables populated.
 */
export async function fetchSFTracts(config?: CensusApiConfig): Promise<CensusData[]> {
  const year = config?.year ?? DEFAULT_YEAR
  const dataset = config?.dataset ?? DEFAULT_DATASET
  const apiKey = import.meta.env.VITE_CENSUS_API_KEY

  // Build variable list from registry (max 50 per request — may need multiple calls)
  const allVars = collectAcsVariables()
  const chunks = chunkArray(allVars, 48) // leave room for NAME + geo fields

  const tractDataMap = new Map<string, Partial<Record<string, number>>>()

  for (const varChunk of chunks) {
    const varList = ['NAME', ...varChunk].join(',')
    const url = `${API_BASE}/${year}/acs/${dataset}?get=${varList}&for=tract:*&in=state:${SF_STATE}+county:${SF_COUNTY}${apiKey ? `&key=${apiKey}` : ''}`

    const response = await fetch(url)
    if (!response.ok) throw new Error(`Census API error: ${response.status}`)

    const raw: string[][] = await response.json()
    const headers = raw[0]

    for (let i = 1; i < raw.length; i++) {
      const row = raw[i]
      const tractCode = row[headers.indexOf('tract')]
      const existing = tractDataMap.get(tractCode) ?? {}

      for (const varName of varChunk) {
        const colIdx = headers.indexOf(varName)
        if (colIdx >= 0) {
          const val = row[colIdx]
          existing[varName] = val === null || val === '-' ? undefined : Number(val)
        }
      }

      // Store NAME if we have it
      const nameIdx = headers.indexOf('NAME')
      if (nameIdx >= 0 && !existing['_name']) {
        (existing as any)['_name'] = row[nameIdx]
      }

      tractDataMap.set(tractCode, existing)
    }
  }

  // Convert raw ACS variables to our CensusVariable keys
  return Array.from(tractDataMap.entries()).map(([tractCode, rawData]) =>
    convertToCensusData(tractCode, rawData as any)
  )
}

/**
 * Fetch ACS data for all SF block groups.
 * Same pattern as tracts but with block group geography and filtered variables.
 */
export async function fetchSFBlockGroups(config?: CensusApiConfig): Promise<CensusData[]> {
  // Implementer: extract the shared fetch logic from fetchSFTracts into a helper
  // like `fetchCensusGeography(geoLevel, geoQuery, variableFilter)` and call it
  // with geoLevel='blockgroup', geoQuery='block group:*&in=state:06+county:075+tract:*',
  // and filter CENSUS_VARIABLES to only those with 'blockgroup' in availableAt.
  // The response rows will have an additional 'block group' column in addition to 'tract'.
  // Set geoType to 'blockgroup' and geoId to state+county+tract+blockgroup.
  // This function MUST be fully implemented before the task is marked complete.
}

// --- Internal helpers ---

/** Collect all ACS variable codes from the registry */
function collectAcsVariables(): string[] {
  const vars = new Set<string>()
  for (const config of CENSUS_VARIABLES) {
    for (const v of config.acsVariables) vars.add(v)
  }
  return Array.from(vars)
}

/** Split array into chunks of size n */
function chunkArray<T>(arr: T[], n: number): T[][] {
  const chunks: T[][] = []
  for (let i = 0; i < arr.length; i += n) {
    chunks.push(arr.slice(i, i + n))
  }
  return chunks
}

/**
 * Convert raw ACS variable values to our CensusVariable keys.
 * E.g., B19013_001E → medianIncome
 * Handles derived stats (percentages computed from numerator/denominator).
 */
function convertToCensusData(tractCode: string, rawData: Record<string, number | undefined>): CensusData {
  const result: CensusData = {
    geoId: `${SF_STATE}${SF_COUNTY}${tractCode}`,
    geoType: 'tract',
    name: (rawData as any)['_name'] ?? `Tract ${tractCode}`,
    population: rawData['B01003_001E'] ?? 0,
  }

  // Map each CensusVariable to its computed value from raw ACS data.
  // Simple vars: direct mapping (e.g., medianIncome = B19013_001E)
  // Percentage vars: compute from numerator/denominator
  //   e.g., pctAsian = B03002_006E / B03002_001E * 100
  // Implementer: reference resonate's calculateDerivedStats() for the formulas

  for (const config of CENSUS_VARIABLES) {
    const value = computeVariableValue(config, rawData)
    if (value !== undefined) {
      ;(result as any)[config.key] = value
    }
  }

  return result
}

/**
 * Compute a single CensusVariable value from raw ACS data.
 * Reference: ../social/resonate/src/lib/census/census-api.ts calculateDerivedStats()
 *
 * This function MUST be fully implemented. Key patterns:
 *
 * Direct value vars (format: 'currency' | 'number' | 'density'):
 *   return rawData[config.acsVariables[0]]
 *   Examples: medianIncome → B19013_001E, totalPopulation → B01003_001E
 *
 * Percentage vars (format: 'percent'):
 *   return (numerator / denominator) * 100
 *   Examples:
 *     pctAsian → B03002_006E / B03002_001E * 100
 *     pctHispanic → B03002_012E / B03002_001E * 100
 *     pctWhite → B03002_003E / B03002_001E * 100
 *     pctBlack → B03002_004E / B03002_001E * 100
 *     rentBurden → (B25070_007E+B25070_008E+B25070_009E+B25070_010E) / B25070_001E * 100
 *     renterPct → B25003_003E / B25003_001E * 100
 *     lepRate → (total_pop_5plus - english_only - english_very_well) / total_pop_5plus * 100
 *     pctBachelorsPlus → (bachelors+masters+professional+doctorate) / B15003_001E * 100
 *
 * The registry's acsVariables array must contain ALL variable codes needed for the computation.
 * Reference resonate's calculateDerivedStats() for the exact formulas.
 */
function computeVariableValue(
  config: CensusVariableConfig,
  rawData: Record<string, number | undefined>
): number | undefined {
  // Implementer: implement the switch/lookup for all ~35 variables.
  // Do NOT leave this as a stub — all downstream data depends on it.
  return undefined
}
```

The implementer must:
1. Complete `computeVariableValue()` with the correct ACS variable math for each of the ~35 variables
2. Implement `fetchSFBlockGroups()` following the same pattern
3. Extract shared fetch logic between tracts and block groups
4. Reference resonate's `calculateDerivedStats()` for percentage formulas (e.g., `pctAsian = B03002_006E / B03002_001E * 100`)

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/api/censusClient.ts
git commit -m "feat(census): add Census API client — fetch ACS 5-year by tract and block group"
```

---

### Task 5: Census Aggregator

**Files:**
- Create: `src/utils/censusAggregator.ts`
- Reference: `../social/resonate/src/lib/census/census-aggregator.ts`

- [ ] **Step 1: Create the aggregation utilities**

Port from resonate's `census-aggregator.ts` (354 lines). Adapt to use our types.

```typescript
// src/utils/censusAggregator.ts
import type { CensusData, CensusVariable, NeighborhoodCensusData } from '../types/census'
import { CENSUS_VARIABLES } from '../utils/censusVariables'
import { TRACT_MAPPINGS, getNeighborhoodsForTract } from './tractMapping'

/**
 * Population-weighted average for rate/median variables.
 * Each tract contributes proportional to its population × weight.
 */
export function weightedAvg(
  values: { value: number; population: number; weight: number }[]
): number {
  let totalWeightedValue = 0
  let totalWeightedPop = 0
  for (const { value, population, weight } of values) {
    totalWeightedValue += value * population * weight
    totalWeightedPop += population * weight
  }
  return totalWeightedPop > 0 ? totalWeightedValue / totalWeightedPop : 0
}

/**
 * Weighted sum for count variables (population, total households, etc.).
 * Sums value × weight for each tract.
 */
export function weightedSum(
  values: { value: number; weight: number }[]
): number {
  return values.reduce((sum, { value, weight }) => sum + value * weight, 0)
}

/**
 * Aggregate tract-level Census data to neighborhood level.
 * Uses weighted allocation from tractMapping.ts.
 *
 * Rate variables (medianIncome, pctAsian, etc.) use population-weighted average.
 * Count variables (totalPopulation) use weighted sum.
 */
export function aggregateToNeighborhoods(
  tracts: CensusData[]
): NeighborhoodCensusData[] {
  // Build a map of tractId → CensusData for quick lookup
  const tractMap = new Map<string, CensusData>()
  for (const tract of tracts) {
    // Extract 6-digit tract code from full geoId (e.g., '06075010100' → '010100')
    const tractCode = tract.geoId.slice(-6)
    tractMap.set(tractCode, tract)
  }

  // Get all unique neighborhoods
  const neighborhoodNames = new Set<string>()
  for (const mapping of TRACT_MAPPINGS) {
    for (const n of mapping.neighborhoods) neighborhoodNames.add(n.name)
  }

  const results: NeighborhoodCensusData[] = []

  for (const neighborhoodName of neighborhoodNames) {
    // Find all tracts contributing to this neighborhood
    const contributing: { tract: CensusData; weight: number; tractId: string }[] = []
    for (const mapping of TRACT_MAPPINGS) {
      const match = mapping.neighborhoods.find(n => n.name === neighborhoodName)
      if (match) {
        const tract = tractMap.get(mapping.tractId)
        if (tract && tract.population > 0) {
          contributing.push({ tract, weight: match.weight, tractId: mapping.tractId })
        }
      }
    }

    if (contributing.length === 0) continue

    // Aggregate each variable
    const neighborhood: NeighborhoodCensusData = {
      geoId: neighborhoodName,
      geoType: 'neighborhood',
      name: neighborhoodName,
      population: Math.round(weightedSum(contributing.map(c => ({ value: c.tract.population, weight: c.weight })))),
      tractCount: contributing.length,
      tracts: contributing.map(c => c.tractId),
    }

    for (const varConfig of CENSUS_VARIABLES) {
      const values = contributing
        .filter(c => (c.tract as any)[varConfig.key] !== undefined)
        .map(c => ({
          value: (c.tract as any)[varConfig.key] as number,
          population: c.tract.population,
          weight: c.weight,
        }))

      if (values.length === 0) continue

      // Count variables (totalPopulation) use weighted sum; everything else uses weighted average
      const isCountVar = varConfig.key === 'totalPopulation'
      ;(neighborhood as any)[varConfig.key] = isCountVar
        ? Math.round(weightedSum(values))
        : Math.round(weightedAvg(values) * 100) / 100
    }

    results.push(neighborhood)
  }

  return results.sort((a, b) => a.name.localeCompare(b.name))
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/utils/censusAggregator.ts
git commit -m "feat(census): add Census aggregator — population-weighted tract-to-neighborhood rollup"
```

---

### Task 6: Static Census Data + Generation Script

**Files:**
- Create: `src/data/census-neighborhoods.json`
- Create: `src/data/census-tracts.json`
- Create: `src/data/census-blockgroups.json`
- Create: `scripts/generate-census-static.ts`

- [ ] **Step 1: Create the generation script**

This is a one-time Node script that fetches Census data and writes the 3 static JSON files. It runs locally with a Census API key, not in the browser.

```typescript
// scripts/generate-census-static.ts
// Run with: npx tsx scripts/generate-census-static.ts
// Requires: VITE_CENSUS_API_KEY in .env

// This script:
// 1. Fetches all SF tract data from Census API
// 2. Aggregates tracts to neighborhoods using censusAggregator
// 3. Writes 3 JSON files to src/data/
//
// Implementer: use the Census API client functions directly,
// but run them in Node context (may need to polyfill import.meta.env
// or read VITE_CENSUS_API_KEY from process.env)
```

- [ ] **Step 2: Run the generation script**

Run: `VITE_CENSUS_API_KEY=<key> npx tsx scripts/generate-census-static.ts`
Expected: Creates 3 JSON files in `src/data/`

- [ ] **Step 3: Verify the generated files**

Check:
- `src/data/census-neighborhoods.json`: 41 entries, each with population + all available variables
- `src/data/census-tracts.json`: ~200 entries
- `src/data/census-blockgroups.json`: ~580 entries
- All files are valid JSON and reasonably sized (<100KB total)

- [ ] **Step 4: Commit**

```bash
git add scripts/generate-census-static.ts src/data/census-neighborhoods.json src/data/census-tracts.json src/data/census-blockgroups.json
git commit -m "feat(census): add static Census JSON — 41 neighborhoods, ~200 tracts, ~580 block groups"
```

---

### Task 7: Boundary GeoJSON

**Files:**
- Create: `src/data/sf-tracts.geojson`
- Create: `src/data/sf-blockgroups.geojson`

- [ ] **Step 1: Acquire tract boundary GeoJSON**

Download SF census tract boundaries from Census TIGER/Line or DataSF. Simplify to reduce file size (target ~200KB). Each feature needs a `TRACTCE` or `GEOID` property matching our tract IDs.

Sources:
- Census TIGER/Line: `https://www2.census.gov/geo/tiger/TIGER2020/TRACT/tl_2020_06_tract.zip` (filter to county 075)
- DataSF: dataset `bwbp-wk3r` (Census 2020 Tracts)

Use `mapshaper` or `ogr2ogr` to filter to SF county and simplify:
```bash
# Example with mapshaper (if installed)
npx mapshaper tl_2020_06_tract.shp -filter 'COUNTYFP === "075"' -simplify 30% -o format=geojson src/data/sf-tracts.geojson
```

- [ ] **Step 2: Acquire block group boundary GeoJSON**

Same process for block groups:
- Census TIGER/Line: `https://www2.census.gov/geo/tiger/TIGER2020/BG/tl_2020_06_bg.zip`

```bash
npx mapshaper tl_2020_06_bg.shp -filter 'COUNTYFP === "075"' -simplify 30% -o format=geojson src/data/sf-blockgroups.geojson
```

- [ ] **Step 3: Verify files load and sizes are reasonable**

Check:
- `sf-tracts.geojson`: ~200 features, <300KB
- `sf-blockgroups.geojson`: ~580 features, <1MB
- Both are valid GeoJSON FeatureCollections
- Each feature has identifying properties (TRACTCE/GEOID for tracts, BLKGRPCE/GEOID for block groups)

- [ ] **Step 4: Commit**

```bash
git add src/data/sf-tracts.geojson src/data/sf-blockgroups.geojson
git commit -m "feat(census): add tract and block group boundary GeoJSON for SF"
```

---

### Task 8: useCensusData Hook

**Files:**
- Create: `src/hooks/useCensusData.ts`
- Reference: `../social/resonate/src/lib/census/use-census-data.ts`

- [ ] **Step 1: Create the hook**

```typescript
// src/hooks/useCensusData.ts
import { useState, useEffect, useRef } from 'react'
import type { CensusDataResult, CensusData, NeighborhoodCensusData } from '../types/census'
import { fetchSFTracts, fetchSFBlockGroups } from '../api/censusClient'
import { aggregateToNeighborhoods } from '../utils/censusAggregator'

// Static data imports (ship with build, instant load)
import neighborhoodData from '../data/census-neighborhoods.json'
import tractData from '../data/census-tracts.json'

// Module-level cache (like useNeighborhoodBoundaries)
let cachedNeighborhoods: NeighborhoodCensusData[] = neighborhoodData as NeighborhoodCensusData[]
let cachedTracts: CensusData[] = tractData as CensusData[]
let cachedBlockGroups: CensusData[] = []
let lastFetchTime = 0
let isLiveData = false
let blockGroupsLoaded = false
const CACHE_TTL = 24 * 60 * 60 * 1000 // 24 hours

/**
 * Provides Census data at 3 resolution levels.
 * Loads instantly from static JSON. Optional background refresh from Census API.
 * Block groups are lazy-loaded (not imported statically — loaded on demand).
 */
export function useCensusData(): CensusDataResult {
  const [isLoading, setIsLoading] = useState(false)
  const [isLive, setIsLive] = useState(isLiveData)
  const [error, setError] = useState<string | null>(null)
  const [, forceUpdate] = useState(0)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Background refresh from Census API (if API key is set and cache is stale)
  useEffect(() => {
    const apiKey = import.meta.env.VITE_CENSUS_API_KEY
    if (!apiKey) return
    if (Date.now() - lastFetchTime < CACHE_TTL) return

    setIsLoading(true)
    fetchSFTracts()
      .then(tracts => {
        if (!mountedRef.current) return
        cachedTracts = tracts
        cachedNeighborhoods = aggregateToNeighborhoods(tracts)
        isLiveData = true
        lastFetchTime = Date.now()
        setIsLive(true)
        setIsLoading(false)
        forceUpdate(n => n + 1)
      })
      .catch(err => {
        if (!mountedRef.current) return
        console.warn('Census API refresh failed, using static data:', err)
        setError(err.message)
        setIsLoading(false)
      })
  }, [])

  return {
    neighborhoods: cachedNeighborhoods,
    tracts: cachedTracts,
    blockGroups: cachedBlockGroups,
    isLive,
    isLoading,
    error,
  }
}

/**
 * Lazy-load block group data. Call when user zooms to z14+.
 * Loads from static JSON on first call, then from cache.
 */
export async function loadBlockGroups(): Promise<CensusData[]> {
  if (blockGroupsLoaded) return cachedBlockGroups

  // Dynamic import — not included in initial bundle
  const data = await import('../data/census-blockgroups.json')
  cachedBlockGroups = data.default as CensusData[]
  blockGroupsLoaded = true
  return cachedBlockGroups
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`
Expected: Clean build. Static JSON imports resolve correctly.

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCensusData.ts
git commit -m "feat(census): add useCensusData hook — static data + background API refresh + lazy block groups"
```

---

## Chunk 2: Demographics Explorer View

### Task 9: DataSourceLine Component

**Files:**
- Create: `src/components/ui/DataSourceLine.tsx`

- [ ] **Step 1: Create the component**

```typescript
// src/components/ui/DataSourceLine.tsx
import React from 'react'

interface DataSourceLineProps {
  dataset: string
  source: string
  id?: string
  caveats?: string[]
  vintage?: string
  className?: string
}

export default function DataSourceLine({ dataset, source, id, caveats, vintage, className = '' }: DataSourceLineProps) {
  return (
    <div className={`text-[10px] text-slate-500 dark:text-slate-500 ${className}`}>
      <span>{dataset}</span>
      {vintage && <span> ({vintage})</span>}
      <span> · {source}</span>
      {id && <span> · {id}</span>}
      {caveats && caveats.length > 0 && (
        <div className="mt-0.5 text-amber-600/70 dark:text-amber-500/50">
          {caveats.map((c, i) => <div key={i}>⚠ {c}</div>)}
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/DataSourceLine.tsx
git commit -m "feat(census): add DataSourceLine component — reusable source attribution"
```

---

### Task 10: DemographicCard Component

**Files:**
- Create: `src/components/charts/DemographicCard.tsx`

- [ ] **Step 1: Create the expandable demographic card**

This follows the existing `CardTray` / collapsible pattern. Each card shows a citywide aggregate, sparkbar distribution, and responds to click-to-promote.

```typescript
// src/components/charts/DemographicCard.tsx
import React from 'react'
import type { CensusVariable, NeighborhoodCensusData } from '../../types/census'
import { getVariableConfig } from '../../utils/censusVariables'
import SparkBars from './SparkBars'

interface DemographicCardProps {
  variable: CensusVariable
  neighborhoods: NeighborhoodCensusData[]
  isActive: boolean
  isExpanded: boolean
  onActivate: (variable: CensusVariable) => void
  onToggleExpand: (variable: CensusVariable) => void
}

export default function DemographicCard({
  variable, neighborhoods, isActive, isExpanded, onActivate, onToggleExpand
}: DemographicCardProps) {
  const config = getVariableConfig(variable)
  if (!config) return null

  // Compute citywide aggregate and neighborhood distribution
  const values = neighborhoods
    .map(n => ({ name: n.name, value: (n as any)[variable] as number | undefined }))
    .filter((v): v is { name: string; value: number } => v.value !== undefined)
    .sort((a, b) => b.value - a.value)

  const cityValue = computeCitywide(variable, neighborhoods)

  // Format the citywide value
  const formatted = formatValue(cityValue, config.format)

  // Sparkbar data: sorted values for the distribution
  const sparkValues = values.map(v => v.value)
  const topLabel = values[0]?.name ?? ''
  const bottomLabel = values[values.length - 1]?.name ?? ''

  if (!isExpanded) {
    return (
      <button
        onClick={() => onToggleExpand(variable)}
        className="bg-white/[0.03] dark:bg-white/[0.03] rounded-md px-3 py-1.5 text-[10px] text-slate-500 dark:text-slate-400 hover:bg-white/[0.06] dark:hover:bg-white/[0.06] border border-white/5 dark:border-white/5 transition-colors cursor-pointer"
      >
        {config.shortLabel} ▸
      </button>
    )
  }

  return (
    <div
      onClick={() => onActivate(variable)}
      className={`bg-white/5 dark:bg-white/5 rounded-lg p-2.5 cursor-pointer border transition-colors ${
        isActive
          ? 'border-purple-500/40 dark:border-purple-500/40'
          : 'border-white/5 dark:border-white/5 hover:border-white/10 dark:hover:border-white/10'
      }`}
    >
      <div className="flex justify-between items-center mb-1.5">
        <span className="text-[11px] text-slate-300 dark:text-slate-300 font-medium">{config.shortLabel}</span>
        {isActive && <span className="text-[9px] text-purple-400">● active</span>}
      </div>
      <div className="text-xl font-bold text-slate-100 dark:text-slate-100 font-mono">{formatted}</div>
      <div className="text-[10px] text-slate-500 dark:text-slate-500 mt-0.5">
        SF {config.format === 'currency' ? 'median' : 'overall'} · ACS 2024
      </div>
      {sparkValues.length > 0 && (
        <>
          <div className="mt-2">
            <SparkBars values={sparkValues} height={24} accentColor={config.colorRamp[config.colorRamp.length - 1]} />
          </div>
          <div className="flex justify-between text-[7px] text-slate-600 dark:text-slate-600 mt-0.5">
            <span>{topLabel}</span>
            <span>{bottomLabel}</span>
          </div>
        </>
      )}
    </div>
  )
}

function computeCitywide(variable: CensusVariable, neighborhoods: NeighborhoodCensusData[]): number {
  // For count vars (totalPopulation): sum all neighborhoods
  // For rate/median vars: population-weighted average across neighborhoods
  const values = neighborhoods
    .filter(n => (n as any)[variable] !== undefined)
    .map(n => ({ value: (n as any)[variable] as number, pop: n.population }))

  if (values.length === 0) return 0

  if (variable === 'totalPopulation') {
    return values.reduce((sum, v) => sum + v.value, 0)
  }

  const totalPop = values.reduce((sum, v) => sum + v.pop, 0)
  if (totalPop === 0) return 0
  return values.reduce((sum, v) => sum + v.value * v.pop, 0) / totalPop
}

function formatValue(value: number, format: string): string {
  switch (format) {
    case 'currency':
      return value >= 1000 ? `$${Math.round(value / 1000)}K` : `$${Math.round(value)}`
    case 'percent':
      return `${Math.round(value)}%`
    case 'density':
      return `${Math.round(value).toLocaleString()}/mi²`
    default:
      return value >= 1000 ? `${Math.round(value / 1000)}K` : Math.round(value).toLocaleString()
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/DemographicCard.tsx
git commit -m "feat(census): add DemographicCard — expandable card with sparkbar distribution"
```

---

### Task 11: CorrelationScatter Chart

**Files:**
- Create: `src/components/charts/CorrelationScatter.tsx`

- [ ] **Step 1: Create the D3 scatter plot**

Follow existing D3 chart patterns (see `ResponseHistogram.tsx`, `TopRecipientsChart.tsx` for reference). Use `useRef` + `useEffect` for D3 rendering, `isDark` from appStore for theme support.

The scatter plot renders:
- One dot per neighborhood (41 dots), sized by population, colored by the active map variable
- OLS trend line (dashed)
- Pearson r coefficient + significance
- Hover tooltip with neighborhood name + both axis values
- Click to select a neighborhood

Key D3 elements:
- `d3.scaleLinear()` for both axes
- `d3.axisBottom()` / `d3.axisLeft()` with formatted tick labels
- Trend line via simple linear regression (`slope = Σ((xi-x̄)(yi-ȳ)) / Σ((xi-x̄)²)`)
- Pearson r: `Σ((xi-x̄)(yi-ȳ)) / sqrt(Σ(xi-x̄)² × Σ(yi-ȳ)²)`

```typescript
// src/components/charts/CorrelationScatter.tsx
// Props interface:
interface CorrelationScatterProps {
  data: { name: string; x: number; y: number; population: number; color: string }[]
  xLabel: string
  yLabel: string
  width?: number
  height?: number
  onHover?: (name: string | null) => void
  onSelect?: (name: string) => void
}
```

Implementer: Build the full D3 scatter plot component. Reference existing chart components for:
- The `useRef(null)` + `useEffect` render pattern
- Dark mode axis colors: `isDark ? '#cbd5e1' : '#475569'`
- Grid lines at `#1e293b` (dark) / `#e2e8f0` (light)
- SVG cleanup on re-render (`d3.select(ref.current).selectAll('*').remove()`)

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/CorrelationScatter.tsx
git commit -m "feat(census): add CorrelationScatter — D3 scatter plot with OLS trend + Pearson r"
```

---

### Task 12: DorlingCartogram Chart

**Files:**
- Create: `src/components/charts/DorlingCartogram.tsx`

- [ ] **Step 1: Create the D3 force-layout cartogram**

Uses `d3.forceSimulation` with:
- `d3.forceX()` / `d3.forceY()` to position circles roughly geographically (using neighborhood center coordinates from `src/utils/geo.ts` or computed from boundary centroids)
- `d3.forceCollide()` to prevent overlap, with radius based on `sqrt(population)`
- `d3.scaleSqrt()` for radius (area proportional to population)
- Circles colored by active Census variable using the variable's color ramp

```typescript
// src/components/charts/DorlingCartogram.tsx
interface DorlingCartogramProps {
  data: { name: string; value: number; population: number; lat: number; lng: number }[]
  colorScale: (value: number) => string
  width?: number
  height?: number
  onHover?: (name: string | null) => void
  onSelect?: (name: string) => void
}
```

Implementer: Build the force simulation. Key considerations:
- Convert lat/lng to SVG coordinates (simple linear projection, not Mercator — we just need approximate positions)
- Run simulation for ~100 ticks on mount, then freeze
- On data change: restart simulation with new values
- Labels: show neighborhood name inside circles when radius > 15px, truncate or hide for smaller circles
- Population label below name in smaller font

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/charts/DorlingCartogram.tsx
git commit -m "feat(census): add DorlingCartogram — D3 force-layout population-weighted cartogram"
```

---

### Task 13: Civic Metrics Hook

**Files:**
- Create: `src/hooks/useCivicMetrics.ts`

- [ ] **Step 1: Create the hook**

Fetches pre-computed civic metrics by neighborhood for the scatter Y-axis. Uses `fetchDataset` from existing Socrata client.

```typescript
// src/hooks/useCivicMetrics.ts
import { useState, useEffect, useRef } from 'react'
import { fetchDataset } from '../api/client'
import type { CivicMetricConfig } from '../types/census'
import { CIVIC_METRICS } from '../utils/censusVariables'
import useAppStore from '../stores/appStore'

interface CivicMetricResult {
  /** Map of neighborhood name → metric value */
  data: Map<string, number>
  isLoading: boolean
  error: string | null
}

/**
 * Fetch a single civic metric aggregated by neighborhood for the current date range.
 * Uses Socrata GROUP BY queries (server-side aggregation).
 */
export function useCivicMetric(metricKey: string | null): CivicMetricResult {
  const [data, setData] = useState<Map<string, number>>(new Map())
  const [isLoading, setIsLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const { dateRange } = useAppStore()
  const abortRef = useRef(false)

  useEffect(() => {
    if (!metricKey) {
      setData(new Map())
      return
    }

    const config = CIVIC_METRICS.find(m => m.key === metricKey)
    if (!config) return

    // Skip client-side metrics (avgResponseTime) — deferred.
    // The avgResponseTime option is hidden from the UI until implemented in a follow-up.
    // It requires fetching ~5K raw records, computing diffMinutes(received_dttm, on_scene_dttm),
    // and averaging per neighborhood — significant scope beyond a simple GROUP BY.
    if (config.isClientSide) {
      setIsLoading(false)
      return
    }

    abortRef.current = false
    setIsLoading(true)
    setError(null)

    const dateField = getDateFieldForDataset(config.datasetKey)
    const dateWhere = `${dateField} >= '${dateRange.start}' AND ${dateField} <= '${dateRange.end}'`

    fetchDataset<{ [key: string]: string }>(config.datasetKey, {
      $select: config.selectClause,
      $where: dateWhere,
      $group: config.neighborhoodField,
      $limit: 50,
    })
      .then(rows => {
        if (abortRef.current) return
        const map = new Map<string, number>()
        for (const row of rows) {
          const neighborhood = row[config.neighborhoodField]
          const value = parseFloat(row.value)
          if (neighborhood && !isNaN(value)) {
            map.set(neighborhood, value)
          }
        }
        setData(map)
        setIsLoading(false)
      })
      .catch(err => {
        if (abortRef.current) return
        setError(err.message)
        setIsLoading(false)
      })

    return () => { abortRef.current = true }
  }, [metricKey, dateRange.start, dateRange.end])

  return { data, isLoading, error }
}

/** Get date field from the DATASETS registry — single source of truth */
function getDateFieldForDataset(key: string): string {
  // Import DATASETS from src/api/datasets.ts and use:
  //   return DATASETS[key]?.dateField ?? 'date'
  // This avoids maintaining a parallel mapping that can drift.
  // Implementer: add the import and use the registry directly.
  return 'date' // placeholder — replace with DATASETS lookup
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCivicMetrics.ts
git commit -m "feat(census): add useCivicMetric hook — Socrata GROUP BY for scatter Y-axis"
```

---

### Task 14: Demographics Explorer View

**Files:**
- Create: `src/views/Demographics/Demographics.tsx`
- Create: `src/views/Demographics/useDemographicsData.ts`
- Modify: `src/App.tsx` (add route)
- Modify: `src/components/layout/AppShell.tsx` (add nav item)
- Modify: `src/views/Home/Home.tsx` (add exploration card)

- [ ] **Step 1: Create the data transformation hook**

`useDemographicsData.ts` — extracts data transformation logic from the view (following the existing pattern of `useBusinessActivityData.ts`, `useTrafficSafetyData.ts`).

```typescript
// src/views/Demographics/useDemographicsData.ts
interface UseDemographicsDataParams {
  neighborhoods: NeighborhoodCensusData[]
  activeVariable: CensusVariable
  selectedNeighborhood: string | null
  scatterYData: Map<string, number>  // from useCivicMetric
}

interface UseDemographicsDataResult {
  /** Citywide averages for all variables (population-weighted) */
  cityAverages: NeighborhoodCensusData | undefined
  /** Scatter plot data: one point per neighborhood with x (demo var) and y (civic metric) */
  scatterData: { name: string; x: number; y: number; population: number; color: string }[]
  /** Pearson r coefficient for scatter */
  pearsonR: number | null
  /** Neighborhoods sorted by active variable value */
  rankedNeighborhoods: { name: string; value: number; population: number }[]
  /** Cartogram data with lat/lng centers */
  cartogramData: { name: string; value: number; population: number; lat: number; lng: number }[]
}
```

The hook computes:
- `cityAverages` via `useMemo` — population-weighted average of all neighborhoods
- `scatterData` via `useMemo` — joins Census x-values with civic y-values by neighborhood name
- `pearsonR` via `useMemo` — standard Pearson correlation formula
- `rankedNeighborhoods` via `useMemo` — sort by active variable value descending
- `cartogramData` via `useMemo` — enriches neighborhoods with center coordinates (compute centroids from neighborhood boundaries or use pre-defined centers)

- [ ] **Step 2: Create the Demographics view**

`Demographics.tsx` — the main Explorer view. This will be ~350-400 lines. Follow the structure below:

```tsx
// src/views/Demographics/Demographics.tsx — skeleton structure
export default function Demographics() {
  // --- State ---
  const [activeVariable, setActiveVariable] = useState<CensusVariable>('medianIncome')
  const [scatterYMetric, setScatterYMetric] = useState<string | null>('crimeCount')
  const [selectedNeighborhood, setSelectedNeighborhood] = useState<string | null>(null)
  const [mapMode, setMapMode] = useState<'choropleth' | 'cartogram'>('choropleth')
  const [expandedCards, setExpandedCards] = useState<Set<CensusVariable>>(
    new Set(['totalPopulation', 'medianIncome', 'rentBurden', 'lepRate'])
  )
  const mapRef = useRef<mapboxgl.Map | null>(null)

  // --- Data ---
  const { neighborhoods, tracts } = useCensusData()
  const { boundaries: neighborhoodBoundaries } = useNeighborhoodBoundaries()
  const { data: civicYData, isLoading: civicLoading } = useCivicMetric(scatterYMetric)
  const { cityAverages, scatterData, pearsonR, rankedNeighborhoods, cartogramData } =
    useDemographicsData({ neighborhoods, activeVariable, selectedNeighborhood, scatterYData: civicYData })

  // --- Map layer (higher opacity for Explorer) ---
  useDemographicUnderlay({
    map: mapRef.current, variable: activeVariable,
    censusData: neighborhoods, boundaries: neighborhoodBoundaries,
    geoIdProperty: 'nhood', opacity: 0.7, layerPrefix: 'census-explorer',
  })

  // --- Layout ---
  return (
    <div className="flex flex-col h-full">
      {/* Toolbar: variable pills + DataSourceLine */}
      <div className="flex items-center gap-3 px-4 py-2 ...">
        {/* Variable pills: quick-select for common variables */}
        {/* DataSourceLine: "ACS 2020-2024 · Census Bureau" */}
      </div>

      {/* Top half: Map + Scatter (50/50) */}
      <div className="flex flex-1 min-h-0">
        {/* Left: MapView or DorlingCartogram */}
        <div className="flex-1 relative">
          {mapMode === 'cartogram' ? (
            <DorlingCartogram data={cartogramData} ... />
          ) : (
            <MapView ref={mapRef} onMapReady={...} ... />
          )}
          {/* Map/Cartogram toggle pill (top-left, hidden at z12+) */}
        </div>

        {/* Right: CorrelationScatter */}
        <div className="flex-1 p-4">
          {/* Y-axis selector dropdown */}
          <CorrelationScatter data={scatterData} xLabel={...} yLabel={...} />
          {/* Pearson r display */}
        </div>
      </div>

      {/* Bottom: Demographic cards grid */}
      <div className="px-4 py-3 border-t border-white/10">
        <div className="grid grid-cols-4 gap-2.5">
          {/* Expanded DemographicCards */}
        </div>
        <div className="flex gap-2 mt-2 flex-wrap">
          {/* Collapsed cards as buttons */}
        </div>
      </div>
    </div>
  )
}
```

The view follows the existing pattern:
1. `useCensusData()` for demographic data
2. `useCivicMetric()` for scatter Y-axis (conditional on selected metric)
3. `useNeighborhoodBoundaries()` for map polygons
4. MapView with choropleth layer (at higher opacity ~0.7 for Explorer)

**Card interaction:** clicking a DemographicCard calls `setActiveVariable(variable)`, which updates the map choropleth and scatter X-axis simultaneously.

**Cartogram toggle:** hidden when zoom >= 12 (check via map.getZoom() on zoom event). If user zooms in while cartogram is active, auto-switch to choropleth.

**Scatter Y-axis dropdown:** shows `CIVIC_METRICS.filter(m => !m.isClientSide)` (hide avgResponseTime until implemented) + all Census variables as secondary options.

- [ ] **Step 3: Add route to App.tsx**

Add lazy import and route:
```typescript
const Demographics = lazy(() => import('./views/Demographics/Demographics'))
// In routes:
<Route path="/demographics" element={<Demographics />} />
```

- [ ] **Step 4: Add nav item to AppShell**

Add Demographics to the bottom of the sidebar nav with purple accent (`#7c3aed`), below Campaign Finance. Use a population/people icon.

- [ ] **Step 5: Add exploration card to Home.tsx**

Add a Demographics card to the home page grid, matching the existing card pattern.

- [ ] **Step 6: Verify the view loads**

Run: `pnpm dev`
Navigate to `/demographics`
Expected: View renders with static Census data, choropleth map, scatter plot, demographic cards

- [ ] **Step 7: Verify build passes**

Run: `pnpm build`

- [ ] **Step 8: Commit**

```bash
git add src/views/Demographics/ src/App.tsx src/components/layout/AppShell.tsx src/views/Home/Home.tsx
git commit -m "feat(census): add Demographics Explorer — map + scatter + demographic cards"
```

---

## Chunk 3: Underlay System

### Task 15: DemographicUnderlay Component

**Files:**
- Create: `src/components/maps/DemographicUnderlay.ts`

- [ ] **Step 1: Create the Mapbox choropleth layer hook**

This is an imperative hook (not a React component with JSX) that manages a Mapbox GeoJSON source + fill layer. It follows the `useMapLayer` pattern with try-catch + setTimeout retry.

**Important:** This hook does NOT handle zoom-adaptive resolution switching internally. The caller passes in the appropriate `censusData` + `boundaries` for the current resolution. A separate `useCensusResolution` hook (see below) handles zoom listening and resolution selection. This separation keeps the underlay hook simple and testable.

```typescript
// src/components/maps/DemographicUnderlay.ts
import { useEffect, useRef } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { CensusVariable, CensusData } from '../../types/census'
import { getVariableConfig } from '../../utils/censusVariables'

interface UseDemographicUnderlayOptions {
  map: MapboxMap | null
  variable: CensusVariable | null
  censusData: CensusData[]
  boundaries: GeoJSON.FeatureCollection | null  // tract or neighborhood polygons
  geoIdProperty: string  // property name in GeoJSON features matching census geoId
  opacity?: number  // default 0.2 for underlays, 0.7 for Explorer
  beforeLayerId?: string  // insert below this Mapbox layer for z-ordering
  layerPrefix?: string  // unique prefix for layer IDs (default: 'census-underlay')
}

// Use a prefix to avoid ID collisions if multiple instances ever mount
// (e.g., Explorer + underlay, though Router should unmount one)
function makeLayerIds(prefix = 'census-underlay') {
  return {
    source: `${prefix}-source`,
    fill: `${prefix}-fill`,
    line: `${prefix}-line`,
  }
}

/**
 * Manages a Census choropleth layer on a Mapbox map.
 * Adds GeoJSON source + fill layer beneath civic data layers.
 * Uses try-catch with setTimeout retry (the ONLY reliable pattern with Mapbox GL v3 + React).
 */
export function useDemographicUnderlay({
  map, variable, censusData, boundaries, geoIdProperty, opacity = 0.2, beforeLayerId
}: UseDemographicUnderlayOptions) {
  // Implementation:
  // 1. When variable/data/boundaries change, build GeoJSON with census values as feature properties
  // 2. Add/update source and fill layer on the map
  // 3. Use interpolate expression for fill-color based on variable's colorRamp
  // 4. Clean up on unmount or when variable becomes null
  //
  // Follow useMapLayer pattern: wrap all map.addSource/addLayer calls in try-catch,
  // retry with setTimeout(fn, 100) on "Style is not done mutating" errors.
  //
  // GeoJSON enrichment: for each feature in boundaries, find matching CensusData by geoId
  // and add the variable's value as a feature property.

  const retryRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    // Implementer: full Mapbox layer management here
    // See existing useMapLayer calls in CrimeIncidents, Cases311 for the retry pattern

    return () => {
      // Cleanup: remove layers and source from map
      if (retryRef.current) clearTimeout(retryRef.current)
      if (!map) return
      try {
        if (map.getLayer(FILL_LAYER_ID)) map.removeLayer(FILL_LAYER_ID)
        if (map.getLayer(LINE_LAYER_ID)) map.removeLayer(LINE_LAYER_ID)
        if (map.getSource(SOURCE_ID)) map.removeSource(SOURCE_ID)
      } catch { /* map may be destroyed */ }
    }
  }, [map, variable, censusData, boundaries, geoIdProperty, opacity, beforeLayerId])
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/maps/DemographicUnderlay.ts
git commit -m "feat(census): add DemographicUnderlay — Mapbox choropleth layer for Census data"
```

---

### Task 15b: useCensusResolution Hook

**Files:**
- Create: `src/hooks/useCensusResolution.ts`

- [ ] **Step 1: Create the zoom-adaptive resolution hook**

This hook listens to Mapbox zoom events and returns the appropriate Census data + boundary GeoJSON for the current zoom level.

```typescript
// src/hooks/useCensusResolution.ts
import { useState, useEffect } from 'react'
import type { Map as MapboxMap } from 'mapbox-gl'
import type { CensusData } from '../types/census'
import { useCensusData, loadBlockGroups } from './useCensusData'

type Resolution = 'neighborhood' | 'tract' | 'blockgroup'

interface CensusResolutionResult {
  resolution: Resolution
  censusData: CensusData[]
  boundaries: GeoJSON.FeatureCollection | null
  geoIdProperty: string  // property name in GeoJSON features matching census geoId
}

/**
 * Returns Census data + boundaries appropriate for the current map zoom level.
 * - z10-12: neighborhood polygons (41)
 * - z12-14: tract polygons (~200)
 * - z14+: block group polygons (~580, lazy-loaded)
 */
export function useCensusResolution(
  map: MapboxMap | null,
  neighborhoodBoundaries: GeoJSON.FeatureCollection | null,
  // Tract and block group GeoJSON loaded separately:
  tractBoundaries: GeoJSON.FeatureCollection | null,
  blockGroupBoundaries: GeoJSON.FeatureCollection | null,
): CensusResolutionResult {
  const { neighborhoods, tracts, blockGroups } = useCensusData()
  const [resolution, setResolution] = useState<Resolution>('neighborhood')

  useEffect(() => {
    if (!map) return

    function onZoom() {
      const zoom = map!.getZoom()
      if (zoom >= 14) setResolution('blockgroup')
      else if (zoom >= 12) setResolution('tract')
      else setResolution('neighborhood')
    }

    map.on('zoom', onZoom)
    onZoom() // set initial
    return () => { map.off('zoom', onZoom) }
  }, [map])

  // Lazy-load block groups when needed
  useEffect(() => {
    if (resolution === 'blockgroup' && blockGroups.length === 0) {
      loadBlockGroups()
    }
  }, [resolution, blockGroups.length])

  switch (resolution) {
    case 'blockgroup':
      return { resolution, censusData: blockGroups, boundaries: blockGroupBoundaries, geoIdProperty: 'GEOID' }
    case 'tract':
      return { resolution, censusData: tracts, boundaries: tractBoundaries, geoIdProperty: 'GEOID' }
    default:
      return { resolution, censusData: neighborhoods, boundaries: neighborhoodBoundaries, geoIdProperty: 'nhood' }
  }
}
```

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/hooks/useCensusResolution.ts
git commit -m "feat(census): add useCensusResolution — zoom-adaptive resolution switching"
```

---

### Task 16: UnderlayPicker Component

**Files:**
- Create: `src/components/maps/UnderlayPicker.tsx`

- [ ] **Step 1: Create the picker**

Glass-card dropdown positioned top-right of the map area. Shows 2-3 curated presets + "More variables ▾" expander.

```typescript
// src/components/maps/UnderlayPicker.tsx
interface UnderlayPickerProps {
  presets: CensusVariable[]
  activeVariable: CensusVariable | null
  onSelect: (variable: CensusVariable | null) => void
}
```

Implementer: Build the dropdown with:
- Glass-card styling (bg-slate-900/90 backdrop-blur-lg border border-white/10 rounded-lg)
- Preset items with color swatch + label
- Active item highlighted with checkmark
- Click active item again to deselect (toggle off)
- "More variables ▾" expands full catalog grouped by category
- Sub-picker for Race/Ethnicity and Language (show group options when parent selected)
- Close on outside click

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/maps/UnderlayPicker.tsx
git commit -m "feat(census): add UnderlayPicker — glass-card dropdown for demographic variable selection"
```

---

### Task 17: NeighborhoodCensusContext Component

**Files:**
- Create: `src/components/ui/NeighborhoodCensusContext.tsx`

- [ ] **Step 1: Create the sidebar context section**

Shows Census stats for a selected neighborhood below the civic stats. Includes population, per-capita rate (de-emphasized), key demographic values, and city comparison bars.

```typescript
// src/components/ui/NeighborhoodCensusContext.tsx
interface NeighborhoodCensusContextProps {
  neighborhood: string
  censusData: NeighborhoodCensusData | undefined
  cityAverages: NeighborhoodCensusData | undefined  // computed from all neighborhoods
  civicCount?: number
  civicLabel?: string  // e.g., "Incidents"
  className?: string
}
```

Implementer: Build the section with:
- Collapsible via a toggle (default expanded)
- "Census Context" header with purple icon
- Population row (bold)
- Per-capita row if civicCount is provided (gray text, smaller font — secondary)
- Key stats: Median Income, Rent Burden, LEP Rate, Renter % (colored when deviating from city average)
- "vs. City Average" comparison bars (center tick = median, fill shows position)
- DataSourceLine at bottom

- [ ] **Step 2: Verify build passes**

Run: `pnpm build`

- [ ] **Step 3: Commit**

```bash
git add src/components/ui/NeighborhoodCensusContext.tsx
git commit -m "feat(census): add NeighborhoodCensusContext — sidebar demographic stats with city comparison"
```

---

## Chunk 4: Wire Underlays + Context Into Existing Views

### Task 18: Wire underlays into CrimeIncidents

**Files:**
- Modify: `src/views/CrimeIncidents/CrimeIncidents.tsx`

- [ ] **Step 1: Add underlay state + components**

Add to the CrimeIncidents view:
1. `const [underlayVariable, setUnderlayVariable] = useState<CensusVariable | null>(null)`
2. `const { censusData, boundaries: censusBoundaries, geoIdProperty } = useCensusResolution(mapRef.current, neighborhoodBoundaries, tractBoundaries, blockGroupBoundaries)`
   - For v1, pass `null` for `tractBoundaries` and `blockGroupBoundaries` (neighborhood-only). Add tract/block group GeoJSON loading in a follow-up.
3. `useDemographicUnderlay({ map: mapRef.current, variable: underlayVariable, censusData, boundaries: censusBoundaries, geoIdProperty, opacity: 0.2, beforeLayerId: 'crime-heat' })`
   - `beforeLayerId` must be the ID of the view's first heatmap/data layer so the underlay renders beneath it. Check the view's `mapLayers.ts` or `useMapLayer` calls for the correct layer ID.
4. `<UnderlayPicker presets={UNDERLAY_PRESETS['crime-incidents'] ?? []} activeVariable={underlayVariable} onSelect={setUnderlayVariable} />` — position with `absolute top-4 right-4 z-20` in the map container. Check for conflicts with existing absolute-positioned elements.
5. `<NeighborhoodCensusContext>` in the sidebar below civic stats when a neighborhood is selected
6. Import `useCensusData` (for context panel data) and `useCensusResolution`

- [ ] **Step 2: Verify view works with underlay toggled on/off**

Run: `pnpm dev`, navigate to Crime Incidents, toggle an underlay. Verify choropleth appears beneath heatmap at ~0.2 opacity.

- [ ] **Step 3: Verify build passes**

Run: `pnpm build`

- [ ] **Step 4: Commit**

```bash
git add src/views/CrimeIncidents/CrimeIncidents.tsx
git commit -m "feat(census): wire demographic underlay + context into Crime Incidents view"
```

---

### Task 19: Wire underlays into remaining 6 map-based views

**Files:**
- Modify: `src/views/Cases311/Cases311.tsx`
- Modify: `src/views/TrafficSafety/TrafficSafety.tsx`
- Modify: `src/views/EmergencyResponse/EmergencyResponse.tsx`
- Modify: `src/views/ParkingCitations/ParkingCitations.tsx`
- Modify: `src/views/ParkingRevenue/ParkingRevenue.tsx`
- Modify: `src/views/BusinessActivity/BusinessActivity.tsx`

- [ ] **Step 1: Wire Cases311**

Presets: `UNDERLAY_PRESETS['311-cases']`. Layout note: has `absolute top-5 left-5 z-10` stat pill and `absolute bottom-6 right-5 z-10` legend. Place UnderlayPicker at `absolute top-4 right-4 z-20`. Underlay `beforeLayerId`: check `useMapLayer` calls for the heatmap layer ID (likely `'311-heat'`).

- [ ] **Step 2: Wire TrafficSafety**

Presets: `UNDERLAY_PRESETS['traffic-safety']`. Layout note: has `absolute bottom-6 right-5 z-10` legend. Place UnderlayPicker at `absolute top-4 right-4 z-20`. Check `mapLayers.ts` for layer IDs.

- [ ] **Step 3: Wire EmergencyResponse**

Presets: `UNDERLAY_PRESETS['emergency-response']`. Layout note: has `absolute top-5 left-5 z-10` and `absolute bottom-6 left-5 z-10` (legend on LEFT, different from other views). Place UnderlayPicker at `absolute top-4 right-4 z-20`. Check `mapLayers.ts` for layer IDs.

- [ ] **Step 4: Wire ParkingCitations**

Presets: `UNDERLAY_PRESETS['parking-citations']`. Layout note: similar to Cases311 layout. Place UnderlayPicker at `absolute top-4 right-4 z-20`. Check `mapLayers.ts` for layer IDs.

- [ ] **Step 5: Wire ParkingRevenue**

Presets: `UNDERLAY_PRESETS['parking-revenue']`. Layout note: no existing top-right elements. Place UnderlayPicker at `absolute top-4 right-4 z-20`. Check `useMapLayer` calls for layer IDs.

- [ ] **Step 6: Wire BusinessActivity**

Presets: `UNDERLAY_PRESETS['business-activity']`. Layout note: has `absolute bottom-6 right-5 z-10` legend and dual heatmap layers (openings + closures). Place UnderlayPicker at `absolute top-4 right-4 z-20`. Underlay must render below BOTH heatmap layers — use the first layer ID from `mapLayers.ts` as `beforeLayerId`.

- [ ] **Step 7: Verify all 7 views work with underlays**

Run: `pnpm dev`, navigate to each of the 7 map-based views, toggle an underlay on/off. Verify:
- Choropleth appears at ~0.2 opacity beneath civic data
- Underlay legend shows bottom-left
- Census context appears in sidebar when neighborhood selected
- No visual conflicts with existing heatmaps/anomaly layers

- [ ] **Step 8: Verify build passes**

Run: `pnpm build`

- [ ] **Step 9: Commit**

```bash
git add src/views/Cases311/ src/views/TrafficSafety/ src/views/EmergencyResponse/ src/views/ParkingCitations/ src/views/ParkingRevenue/ src/views/BusinessActivity/
git commit -m "feat(census): wire demographic underlays + context into all 6 remaining map views"
```

---

### Task 20: Final Verification

- [ ] **Step 1: Full build check**

Run: `pnpm build`
Expected: Clean build, no type errors, no warnings

- [ ] **Step 2: Full manual test**

Navigate through all views and verify:
1. Demographics Explorer: map + scatter + cards render from static data
2. Cartogram toggle works at neighborhood zoom, auto-switches at z12+
3. Click-to-promote on demographic cards changes map + scatter X-axis
4. Scatter Y-axis dropdown shows civic metrics and fires Socrata queries
5. All 7 map-based views: underlay picker appears, toggling shows/hides choropleth
6. Census context panel shows in sidebar when neighborhood selected
7. DataSourceLine attribution appears on all Census elements
8. Dark mode renders correctly across all new components

- [ ] **Step 3: Commit any final fixes**

```bash
git add -A
git commit -m "fix(census): final verification fixes"
```
