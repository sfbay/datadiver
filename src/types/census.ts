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
  shortLabel: string
  category: CensusCategory
  acsTable: string
  acsVariables: string[]
  format: 'currency' | 'percent' | 'number' | 'density'
  colorScale: 'sequential' | 'diverging'
  colorRamp: string[]
  availableAt: ('neighborhood' | 'tract' | 'blockgroup')[]
  description?: string
  isSubPicker?: boolean
  parentGroup?: string
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
  tractCount?: number
  blockGroupCount?: number
  tracts: string[]
}

/** A single entry in the tract-to-neighborhood crosswalk */
export interface TractMapping {
  tractId: string
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
  datasetKey: string
  neighborhoodField: string
  selectClause: string
  isClientSide?: boolean
  sourceView: string
}
