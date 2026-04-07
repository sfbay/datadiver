// src/utils/censusVariables.ts
// Census variable registry — ACS table mappings, color ramps, presets, and civic metrics

import type { CensusVariable, CensusCategory, CensusVariableConfig, CivicMetricConfig } from '../types/census'

// ---------------------------------------------------------------------------
// Color ramp palettes
// ---------------------------------------------------------------------------
const INCOME_RAMP    = ['#92400e', '#f59e0b', '#14b8a6', '#7c3aed'] // amber → teal → purple (high=good)
const STRESS_RAMP    = ['#14b8a6', '#f59e0b', '#ef4444', '#7f1d1d'] // teal → amber → red (high=bad)
const POPULATION_RAMP = ['#1e293b', '#475569', '#7c3aed', '#a78bfa'] // slate → purple

// Race/ethnicity — unified purple sequential ramp (neutral, no chromatic bias per group)
const RACE_RAMP = ['#1e1b2e', '#4c1d95', '#7c3aed', '#c4b5fd']

// Language — cyan-based ramps
const LANG_RAMP = ['#ecfeff', '#67e8f9', '#0891b2', '#164e63']

// ---------------------------------------------------------------------------
// CENSUS_VARIABLES — all 35 variable configs
// ---------------------------------------------------------------------------
export const CENSUS_VARIABLES: CensusVariableConfig[] = [
  // ── Population ──────────────────────────────────────────────────────────
  {
    key: 'totalPopulation',
    label: 'Total Population',
    shortLabel: 'Population',
    category: 'population',
    acsTable: 'B01003',
    acsVariables: ['B01003_001E'],
    format: 'number',
    colorScale: 'sequential',
    colorRamp: POPULATION_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'populationDensity',
    label: 'Population Density (per sq mi)',
    shortLabel: 'Pop Density',
    category: 'population',
    acsTable: 'B01003',
    acsVariables: ['B01003_001E'],
    format: 'density',
    colorScale: 'sequential',
    colorRamp: POPULATION_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },

  // ── Income & Housing Stress ──────────────────────────────────────────────
  {
    key: 'medianIncome',
    label: 'Median Household Income',
    shortLabel: 'Med. Income',
    category: 'income',
    acsTable: 'B19013',
    acsVariables: ['B19013_001E'],
    format: 'currency',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'incomeDistribution',
    label: 'Income Distribution by Bracket',
    shortLabel: 'Income Dist.',
    category: 'income',
    acsTable: 'B19001',
    acsVariables: [
      'B19001_001E', 'B19001_002E', 'B19001_003E', 'B19001_004E',
      'B19001_005E', 'B19001_006E', 'B19001_007E', 'B19001_008E',
      'B19001_009E', 'B19001_010E', 'B19001_011E', 'B19001_012E',
      'B19001_013E', 'B19001_014E', 'B19001_015E', 'B19001_016E',
      'B19001_017E',
    ],
    format: 'number',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'povertyRate',
    label: 'Poverty Rate',
    shortLabel: 'Poverty Rate',
    category: 'income',
    acsTable: 'B17001',
    acsVariables: ['B17001_001E', 'B17001_002E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'rentBurden',
    label: 'Rent Burden (30%+ of Income on Rent)',
    shortLabel: 'Rent Burden',
    category: 'income',
    acsTable: 'B25070',
    acsVariables: [
      'B25070_001E', 'B25070_007E', 'B25070_008E', 'B25070_009E', 'B25070_010E',
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'renterPct',
    label: 'Renter-Occupied Housing',
    shortLabel: 'Renter %',
    category: 'income',
    acsTable: 'B25003',
    acsVariables: ['B25003_001E', 'B25003_002E', 'B25003_003E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'medianRent',
    label: 'Median Gross Rent',
    shortLabel: 'Med. Rent',
    category: 'income',
    acsTable: 'B25064',
    acsVariables: ['B25064_001E'],
    format: 'currency',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'medianHomeValue',
    label: 'Median Home Value',
    shortLabel: 'Home Value',
    category: 'income',
    acsTable: 'B25077',
    acsVariables: ['B25077_001E'],
    format: 'currency',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },

  // ── Race / Ethnicity (B03002) ────────────────────────────────────────────
  {
    key: 'pctWhite',
    label: 'White (Non-Hispanic)',
    shortLabel: '% White',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_003E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctBlack',
    label: 'Black or African American (Non-Hispanic)',
    shortLabel: '% Black',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_004E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctAsian',
    label: 'Asian (Non-Hispanic)',
    shortLabel: '% Asian',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_006E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctHispanic',
    label: 'Hispanic or Latino',
    shortLabel: '% Hispanic',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_012E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctPacificIslander',
    label: 'Native Hawaiian / Pacific Islander (Non-Hispanic)',
    shortLabel: '% Pacific Islander',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_007E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctMultiracial',
    label: 'Two or More Races (Non-Hispanic)',
    shortLabel: '% Multiracial',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_009E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },
  {
    key: 'pctOther',
    label: 'Some Other Race (Non-Hispanic)',
    shortLabel: '% Other Race',
    category: 'race',
    acsTable: 'B03002',
    acsVariables: ['B03002_001E', 'B03002_008E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: RACE_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
    parentGroup: 'raceEthnicity',
  },

  // ── Language (B16001) ────────────────────────────────────────────────────
  {
    key: 'lepRate',
    label: 'Limited English Proficiency Rate',
    shortLabel: 'Limited English',
    description: 'Share of residents who speak English less than "very well" (Census self-reported)',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: [
      'B16001_001E',
      'B16001_005E', // Spanish LEP
      'B16001_008E', // Chinese LEP
      'B16001_011E', // Vietnamese LEP
      'B16001_014E', // Tagalog LEP
      'B16001_017E', // Korean LEP
      'B16001_020E', // Russian LEP
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },
  {
    key: 'pctSpanish',
    label: 'Spanish Speakers',
    shortLabel: '% Spanish',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_003E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },
  {
    key: 'pctChinese',
    label: 'Chinese Speakers',
    shortLabel: '% Chinese',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_006E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },
  {
    key: 'pctVietnamese',
    label: 'Vietnamese Speakers',
    shortLabel: '% Vietnamese',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_009E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },
  {
    key: 'pctTagalog',
    label: 'Tagalog / Filipino Speakers',
    shortLabel: '% Tagalog',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_012E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },
  {
    key: 'pctKorean',
    label: 'Korean Speakers',
    shortLabel: '% Korean',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_015E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },
  {
    key: 'pctRussian',
    label: 'Russian Speakers',
    shortLabel: '% Russian',
    category: 'language',
    acsTable: 'B16001',
    acsVariables: ['B16001_001E', 'B16001_018E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: LANG_RAMP,
    availableAt: ['neighborhood', 'tract'],
    parentGroup: 'language',
  },

  // ── Age (B01001) ──────────────────────────────────────────────────────────
  {
    key: 'medianAge',
    label: 'Median Age',
    shortLabel: 'Median Age',
    category: 'age',
    acsTable: 'B01002',
    acsVariables: ['B01002_001E'],
    format: 'number',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'pctUnder18',
    label: 'Population Under 18',
    shortLabel: '% Under 18',
    category: 'age',
    acsTable: 'B01001',
    acsVariables: [
      'B01001_001E',
      // Male: under 5, 5-9, 10-14, 15-17
      'B01001_003E', 'B01001_004E', 'B01001_005E', 'B01001_006E',
      // Female: under 5, 5-9, 10-14, 15-17
      'B01001_027E', 'B01001_028E', 'B01001_029E', 'B01001_030E',
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: POPULATION_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'pctOver65',
    label: 'Population 65 and Older',
    shortLabel: '% Over 65',
    category: 'age',
    acsTable: 'B01001',
    acsVariables: [
      'B01001_001E',
      // Male: 65-66, 67-69, 70-74, 75-79, 80-84, 85+
      'B01001_020E', 'B01001_021E', 'B01001_022E', 'B01001_023E', 'B01001_024E', 'B01001_025E',
      // Female: 65-66, 67-69, 70-74, 75-79, 80-84, 85+
      'B01001_044E', 'B01001_045E', 'B01001_046E', 'B01001_047E', 'B01001_048E', 'B01001_049E',
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'pctWorkingAge',
    label: 'Working-Age Population (18–64)',
    shortLabel: '% Working Age',
    category: 'age',
    acsTable: 'B01001',
    acsVariables: [
      'B01001_001E',
      // Male 18-64: 18-19, 20, 21, 22-24, 25-29, 30-34, 35-39, 40-44, 45-49, 50-54, 55-59, 60-61, 62-64
      'B01001_007E', 'B01001_008E', 'B01001_009E', 'B01001_010E', 'B01001_011E',
      'B01001_012E', 'B01001_013E', 'B01001_014E', 'B01001_015E', 'B01001_016E',
      'B01001_017E', 'B01001_018E', 'B01001_019E',
      // Female 18-64
      'B01001_031E', 'B01001_032E', 'B01001_033E', 'B01001_034E', 'B01001_035E',
      'B01001_036E', 'B01001_037E', 'B01001_038E', 'B01001_039E', 'B01001_040E',
      'B01001_041E', 'B01001_042E', 'B01001_043E',
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },

  // ── Education (B15003) ───────────────────────────────────────────────────
  {
    key: 'pctBachelorsPlus',
    label: "Bachelor's Degree or Higher",
    shortLabel: "% Bachelor's+",
    category: 'education',
    acsTable: 'B15003',
    acsVariables: [
      'B15003_001E',
      'B15003_022E', // bachelor's
      'B15003_023E', // master's
      'B15003_024E', // professional
      'B15003_025E', // doctorate
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },
  {
    key: 'pctNoHighSchool',
    label: 'No High School Diploma',
    shortLabel: '% No HS Diploma',
    category: 'education',
    acsTable: 'B15003',
    acsVariables: [
      'B15003_001E',
      // B15003_002E through B15003_016E = no HS diploma (nursery through 12th grade no diploma)
      'B15003_002E', 'B15003_003E', 'B15003_004E', 'B15003_005E', 'B15003_006E',
      'B15003_007E', 'B15003_008E', 'B15003_009E', 'B15003_010E', 'B15003_011E',
      'B15003_012E', 'B15003_013E', 'B15003_014E', 'B15003_015E', 'B15003_016E',
    ],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract', 'blockgroup'],
  },

  // ── Employment (B23025) — NOT available at block group ───────────────────
  {
    key: 'unemploymentRate',
    label: 'Unemployment Rate',
    shortLabel: 'Unemployment',
    category: 'employment',
    acsTable: 'B23025',
    acsVariables: ['B23025_003E', 'B23025_005E', 'B23025_007E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },

  // ── Commute (B08301) — NOT available at block group ─────────────────────
  {
    key: 'pctWFH',
    label: 'Worked From Home',
    shortLabel: '% WFH',
    category: 'employment',
    acsTable: 'B08301',
    acsVariables: ['B08301_001E', 'B08301_021E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },
  {
    key: 'pctDriveAlone',
    label: 'Drove Alone to Work',
    shortLabel: '% Drive Alone',
    category: 'employment',
    acsTable: 'B08301',
    acsVariables: ['B08301_001E', 'B08301_003E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: STRESS_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },
  {
    key: 'pctTransit',
    label: 'Public Transit Commuters',
    shortLabel: '% Transit',
    category: 'employment',
    acsTable: 'B08301',
    acsVariables: ['B08301_001E', 'B08301_010E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },
  {
    key: 'pctBikeWalk',
    label: 'Biked or Walked to Work',
    shortLabel: '% Bike/Walk',
    category: 'employment',
    acsTable: 'B08301',
    // B08301_018E = bicycle, B08301_019E = walked (use _019E as the combined walk estimate;
    // for bike we use _018E; together these approximate the bike+walk share)
    acsVariables: ['B08301_001E', 'B08301_018E', 'B08301_019E'],
    format: 'percent',
    colorScale: 'sequential',
    colorRamp: INCOME_RAMP,
    availableAt: ['neighborhood', 'tract'],
  },
]

// ---------------------------------------------------------------------------
// Helper functions
// ---------------------------------------------------------------------------

/** Look up a variable config by its key. Returns undefined if not found. */
export function getVariableConfig(key: CensusVariable): CensusVariableConfig | undefined {
  return CENSUS_VARIABLES.find(v => v.key === key)
}

/** Return all variable configs belonging to a given category. */
export function getVariablesByCategory(category: CensusCategory): CensusVariableConfig[] {
  return CENSUS_VARIABLES.filter(v => v.category === category)
}

/**
 * Return all variable configs that belong to a named sub-picker group.
 * Used to populate race/ethnicity or language sub-pickers in the UI.
 * e.g. getSubPickerVariables('raceEthnicity') returns all race variables.
 */
export function getSubPickerVariables(parentGroup: string): CensusVariableConfig[] {
  return CENSUS_VARIABLES.filter(v => v.parentGroup === parentGroup)
}

// ---------------------------------------------------------------------------
// UNDERLAY_PRESETS — per-view suggested variables
// Keys are ViewId strings; typed as Partial<Record<string, ...>> to avoid
// a circular import with datasets.ts.
// ---------------------------------------------------------------------------
export const UNDERLAY_PRESETS: Partial<Record<string, CensusVariable[]>> = {
  'crime-incidents':    ['medianIncome', 'pctAsian', 'populationDensity'],
  '311-cases':          ['rentBurden', 'lepRate', 'pctHispanic'],
  'traffic-safety':     ['medianAge', 'populationDensity', 'pctTransit'],
  'emergency-response': ['rentBurden', 'pctOver65', 'pctBlack'],
  'parking-citations':  ['medianIncome', 'renterPct', 'pctDriveAlone'],
  'parking-revenue':    ['medianIncome', 'populationDensity'],
  'business-activity':  ['medianIncome', 'pctBachelorsPlus', 'pctAsian'],
}

// ---------------------------------------------------------------------------
// CIVIC_METRICS — scatter Y-axis options for the Census Explorer
// ---------------------------------------------------------------------------
export const CIVIC_METRICS: CivicMetricConfig[] = [
  {
    key: 'crimeCount',
    label: 'Crime Incidents',
    datasetKey: 'policeIncidents',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, COUNT(*) as value',
    sourceView: 'Crime Incidents',
  },
  {
    key: 'cases311Count',
    label: '311 Cases',
    datasetKey: 'cases311',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, COUNT(*) as value',
    sourceView: '311 Cases',
  },
  {
    key: 'avgResponseTime',
    label: 'Avg Response Time',
    datasetKey: 'fireEMSDispatch',
    neighborhoodField: 'neighborhoods_analysis_boundaries',
    selectClause: '',
    isClientSide: true,
    sourceView: 'Emergency Response',
  },
  {
    key: 'fireCount',
    label: 'Fire Incidents',
    datasetKey: 'fireIncidents',
    neighborhoodField: 'neighborhood_district',
    selectClause: 'neighborhood_district, COUNT(*) as value',
    sourceView: 'Emergency Response',
  },
  {
    key: 'crashCount',
    label: 'Traffic Crashes',
    datasetKey: 'trafficCrashes',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, COUNT(*) as value',
    sourceView: 'Traffic Safety',
  },
  {
    key: 'crashInjuries',
    label: 'Crash Injuries',
    datasetKey: 'trafficCrashes',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, SUM(number_injured) as value',
    sourceView: 'Traffic Safety',
  },
  {
    key: 'citationCount',
    label: 'Parking Citations',
    datasetKey: 'parkingCitations',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, COUNT(*) as value',
    sourceView: 'Parking Citations',
  },
  {
    key: 'businessOpenings',
    label: 'Business Openings',
    datasetKey: 'businessLocations',
    neighborhoodField: 'analysis_neighborhood',
    selectClause: 'analysis_neighborhood, COUNT(*) as value',
    sourceView: 'Business Activity',
  },
]
