// src/api/censusClient.ts
// Census Bureau API client — fetches ACS 5-year data for SF census tracts and block groups

import type { CensusData, CensusVariable } from '../types/census'
import { CENSUS_VARIABLES } from '../utils/censusVariables'

const API_BASE = 'https://api.census.gov/data'
const SF_STATE = '06'
const SF_COUNTY = '075'
const DEFAULT_YEAR = 2023 // latest ACS 5-year available as of early 2026
const DEFAULT_DATASET = 'acs5'
const MAX_VARS_PER_REQUEST = 48 // Census allows 50 max; leave room for NAME + geo fields

export interface CensusApiConfig {
  year?: number
  dataset?: 'acs5' | 'acs1'
}

// ---------------------------------------------------------------------------
// Collect all unique ACS variable codes needed
// ---------------------------------------------------------------------------

/** Gather every ACS variable code referenced by the variable registry */
function collectAllAcsVariables(geoLevel: 'tract' | 'blockgroup'): string[] {
  const vars = new Set<string>()
  for (const config of CENSUS_VARIABLES) {
    // Skip variables not available at this geo level
    if (!config.availableAt.includes(geoLevel)) continue
    for (const v of config.acsVariables) {
      vars.add(v)
    }
  }
  return Array.from(vars)
}

// ---------------------------------------------------------------------------
// Batched fetch
// ---------------------------------------------------------------------------

/**
 * Split variable codes into batches of MAX_VARS_PER_REQUEST and fetch each.
 * Returns a Map<geoId, Map<variableCode, number|undefined>> merging all batches.
 */
async function fetchBatched(
  variables: string[],
  geoLevel: 'tract' | 'blockgroup',
  year: number,
  dataset: string,
): Promise<{ headers: string[]; rows: Map<string, Record<string, string | null>> }> {
  const batches: string[][] = []
  for (let i = 0; i < variables.length; i += MAX_VARS_PER_REQUEST) {
    batches.push(variables.slice(i, i + MAX_VARS_PER_REQUEST))
  }

  const apiKey = import.meta.env.VITE_CENSUS_API_KEY as string | undefined

  // Merged row data keyed by geoId
  const merged = new Map<string, Record<string, string | null>>()
  const allHeaders = new Set<string>()

  await Promise.all(
    batches.map(async (batch) => {
      const getParam = ['NAME', ...batch].join(',')

      let forClause: string
      let inClause: string
      if (geoLevel === 'tract') {
        forClause = 'tract:*'
        inClause = `state:${SF_STATE}+county:${SF_COUNTY}`
      } else {
        forClause = 'block group:*'
        inClause = `state:${SF_STATE}+county:${SF_COUNTY}+tract:*`
      }

      const params = new URLSearchParams({
        get: getParam,
        for: forClause,
        in: inClause,
      })
      if (apiKey) {
        params.set('key', apiKey)
      }

      const url = `${API_BASE}/${year}/${dataset}?${params.toString()}`
      const response = await fetch(url)
      if (!response.ok) {
        throw new Error(`Census API error ${response.status}: ${response.statusText} (${url})`)
      }

      const data: (string | null)[][] = await response.json()
      if (!data || data.length < 2) return

      const headers = data[0] as string[]
      headers.forEach((h) => allHeaders.add(h))

      // Build geoId from the geo columns
      const stateIdx = headers.indexOf('state')
      const countyIdx = headers.indexOf('county')
      const tractIdx = headers.indexOf('tract')
      const blockGroupIdx = headers.indexOf('block group')

      for (let r = 1; r < data.length; r++) {
        const row = data[r]
        let geoId: string
        if (geoLevel === 'blockgroup') {
          geoId = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}${row[blockGroupIdx]}`
        } else {
          geoId = `${row[stateIdx]}${row[countyIdx]}${row[tractIdx]}`
        }

        if (!merged.has(geoId)) {
          merged.set(geoId, {})
        }
        const existing = merged.get(geoId)!
        for (let c = 0; c < headers.length; c++) {
          existing[headers[c]] = row[c]
        }
      }
    }),
  )

  return { headers: Array.from(allHeaders), rows: merged }
}

// ---------------------------------------------------------------------------
// Parse raw Census value
// ---------------------------------------------------------------------------

function parseRawValue(raw: string | null | undefined): number | undefined {
  if (raw == null || raw === '-' || raw === '' || raw === '(X)' || raw === 'null') {
    return undefined
  }
  const n = Number(raw)
  return isNaN(n) || n < 0 ? undefined : n
}

/** Safely sum multiple raw values; returns undefined if ALL are undefined */
function sumRaw(row: Record<string, string | null>, codes: string[]): number | undefined {
  let total = 0
  let anyValid = false
  for (const code of codes) {
    const v = parseRawValue(row[code])
    if (v !== undefined) {
      total += v
      anyValid = true
    }
  }
  return anyValid ? total : undefined
}

/** Safely compute (numerator / denominator) * 100, returning undefined if either is missing or denominator is 0 */
function pctSafe(numerator: number | undefined, denominator: number | undefined): number | undefined {
  if (numerator === undefined || denominator === undefined || denominator === 0) return undefined
  return (numerator / denominator) * 100
}

// ---------------------------------------------------------------------------
// Compute all CensusVariable values from a single row of raw ACS data
// ---------------------------------------------------------------------------

function computeVariables(
  row: Record<string, string | null>,
  geoLevel: 'tract' | 'blockgroup',
): Partial<Record<CensusVariable, number>> {
  const result: Partial<Record<CensusVariable, number>> = {}

  const val = (code: string) => parseRawValue(row[code])

  // Helper: only compute if variable is available at this geo level
  const available = (key: CensusVariable): boolean => {
    const config = CENSUS_VARIABLES.find((v) => v.key === key)
    return config ? config.availableAt.includes(geoLevel) : false
  }

  // ── Direct values ────────────────────────────────────────────────────
  const totalPop = val('B01003_001E')
  if (totalPop !== undefined) result.totalPopulation = totalPop

  const medIncome = val('B19013_001E')
  if (medIncome !== undefined) result.medianIncome = medIncome

  const medAge = val('B01002_001E')
  if (medAge !== undefined) result.medianAge = medAge

  const medRent = val('B25064_001E')
  if (medRent !== undefined) result.medianRent = medRent

  const medHome = val('B25077_001E')
  if (medHome !== undefined) result.medianHomeValue = medHome

  // populationDensity → needs area from GeoJSON; set undefined (omit)
  // incomeDistribution → not a single number; omit

  // ── Poverty rate ─────────────────────────────────────────────────────
  result.povertyRate = pctSafe(val('B17001_002E'), val('B17001_001E'))

  // ── Race/Ethnicity (B03002) ──────────────────────────────────────────
  const raceDenom = val('B03002_001E')
  result.pctWhite = pctSafe(val('B03002_003E'), raceDenom)
  result.pctBlack = pctSafe(val('B03002_004E'), raceDenom)
  result.pctAsian = pctSafe(val('B03002_006E'), raceDenom)
  result.pctHispanic = pctSafe(val('B03002_012E'), raceDenom)
  result.pctPacificIslander = pctSafe(val('B03002_007E'), raceDenom)
  result.pctMultiracial = pctSafe(val('B03002_009E'), raceDenom)
  result.pctOther = pctSafe(val('B03002_008E'), raceDenom)

  // ── Housing ──────────────────────────────────────────────────────────
  result.renterPct = pctSafe(val('B25003_003E'), val('B25003_001E'))

  const rentBurdenNum = sumRaw(row, ['B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E'])
  result.rentBurden = pctSafe(rentBurdenNum, val('B25070_001E'))

  // ── Age (B01001) ─────────────────────────────────────────────────────
  const ageDenom = val('B01001_001E')

  const under18Codes = [
    'B01001_003E', 'B01001_004E', 'B01001_005E', 'B01001_006E', // male under 5 through 15-17
    'B01001_027E', 'B01001_028E', 'B01001_029E', 'B01001_030E', // female equiv
  ]
  const under18 = sumRaw(row, under18Codes)
  result.pctUnder18 = pctSafe(under18, ageDenom)

  const over65Codes = [
    'B01001_020E', 'B01001_021E', 'B01001_022E', 'B01001_023E', 'B01001_024E', 'B01001_025E', // male 65+
    'B01001_044E', 'B01001_045E', 'B01001_046E', 'B01001_047E', 'B01001_048E', 'B01001_049E', // female 65+
  ]
  const over65 = sumRaw(row, over65Codes)
  result.pctOver65 = pctSafe(over65, ageDenom)

  // pctWorkingAge = 100 - pctUnder18 - pctOver65
  if (result.pctUnder18 !== undefined && result.pctOver65 !== undefined) {
    result.pctWorkingAge = 100 - result.pctUnder18 - result.pctOver65
  }

  // ── Education (B15003) ───────────────────────────────────────────────
  const eduDenom = val('B15003_001E')

  const noHsCodes = [
    'B15003_002E', 'B15003_003E', 'B15003_004E', 'B15003_005E', 'B15003_006E',
    'B15003_007E', 'B15003_008E', 'B15003_009E', 'B15003_010E', 'B15003_011E',
    'B15003_012E', 'B15003_013E', 'B15003_014E', 'B15003_015E', 'B15003_016E',
  ]
  result.pctNoHighSchool = pctSafe(sumRaw(row, noHsCodes), eduDenom)

  const bachPlusCodes = ['B15003_022E', 'B15003_023E', 'B15003_024E', 'B15003_025E']
  result.pctBachelorsPlus = pctSafe(sumRaw(row, bachPlusCodes), eduDenom)

  // ── Employment (B23025) — tract only ─────────────────────────────────
  if (available('unemploymentRate')) {
    // unemployed (B23025_005E) / civilian labor force (B23025_003E)
    // Note: the registry lists _003E, _005E, _007E but the formula is _005E / _003E
    // B23025_007E is "not in labor force" — not needed for rate but fetched for completeness
    result.unemploymentRate = pctSafe(val('B23025_005E'), val('B23025_003E'))
  }

  // ── Commute (C08301) — tract only ────────────────────────────────────
  if (available('pctDriveAlone')) {
    const commuteDenom = val('C08301_001E')
    result.pctDriveAlone = pctSafe(val('C08301_003E'), commuteDenom)
    result.pctTransit = pctSafe(val('C08301_010E'), commuteDenom)
    result.pctWFH = pctSafe(val('C08301_021E'), commuteDenom)

    // Bike (C08301_018E) + Walk (C08301_019E)
    const bikeWalk = sumRaw(row, ['C08301_018E', 'C08301_019E'])
    result.pctBikeWalk = pctSafe(bikeWalk, commuteDenom)
  }

  // ── Language (B16001) — tract only ───────────────────────────────────
  if (available('lepRate')) {
    const langDenom = val('B16001_001E')

    // LEP = sum of all "speak English less than very well" sub-codes
    const lepCodes = [
      'B16001_005E', 'B16001_008E', 'B16001_011E',
      'B16001_014E', 'B16001_017E', 'B16001_020E',
    ]
    result.lepRate = pctSafe(sumRaw(row, lepCodes), langDenom)

    // Individual language shares (all speakers of that language, not just LEP)
    result.pctSpanish = pctSafe(val('B16001_003E'), langDenom)
    result.pctChinese = pctSafe(val('B16001_006E'), langDenom)
    result.pctVietnamese = pctSafe(val('B16001_009E'), langDenom)
    result.pctTagalog = pctSafe(val('B16001_012E'), langDenom)
    result.pctKorean = pctSafe(val('B16001_015E'), langDenom)
    result.pctRussian = pctSafe(val('B16001_018E'), langDenom)
  }

  // Strip undefined entries so they don't appear as keys
  for (const key of Object.keys(result) as CensusVariable[]) {
    if (result[key] === undefined) {
      delete result[key]
    }
  }

  return result
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Fetch all SF census tract data from the ACS 5-year dataset.
 * Returns one CensusData object per tract with all computable variables.
 */
export async function fetchSFTracts(config?: CensusApiConfig): Promise<CensusData[]> {
  return fetchGeoLevel('tract', config)
}

/**
 * Fetch all SF block group data from the ACS 5-year dataset.
 * Only includes variables whose CensusVariableConfig has 'blockgroup' in availableAt.
 */
export async function fetchSFBlockGroups(config?: CensusApiConfig): Promise<CensusData[]> {
  return fetchGeoLevel('blockgroup', config)
}

/**
 * Shared implementation for both tract and block group fetches.
 */
async function fetchGeoLevel(
  geoLevel: 'tract' | 'blockgroup',
  config?: CensusApiConfig,
): Promise<CensusData[]> {
  const year = config?.year ?? DEFAULT_YEAR
  const dataset = config?.dataset ?? DEFAULT_DATASET

  const variables = collectAllAcsVariables(geoLevel)
  const { rows } = await fetchBatched(variables, geoLevel, year, dataset)

  const results: CensusData[] = []

  for (const [geoId, row] of rows) {
    const name = row['NAME'] ?? geoId
    const population = parseRawValue(row['B01003_001E']) ?? 0
    const computed = computeVariables(row, geoLevel)

    results.push({
      geoId,
      geoType: geoLevel,
      name,
      population,
      ...computed,
    })
  }

  // Sort by geoId for deterministic output
  results.sort((a, b) => a.geoId.localeCompare(b.geoId))

  return results
}
