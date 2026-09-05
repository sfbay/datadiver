// The authored table of every source DataDiver reads that is NOT a Socrata
// dataset in a city registry (spec §3.2). Type-import only — this module
// rides the entry bundle via the manifest.
import type { CityId } from '@/cities/routing'

export type NonSocrataId =
  | 'sf-analysis-neighborhoods' | 'sf-precincts-2012' | 'sf-precincts-2022'
  | 'sf-elections-results' | 'sf-cvr-20241105' | 'sf-tract-assignment'
  | 'acs-2023-5yr' | 'oak-beats' | 'oak-neighborhoods' | 'mapbox-basemap'

export interface NonSocrataElection {
  dateCode: string
  label: string
  sovUrl: string
  dsovUrl: string
  certifiedDrop: string
}

export interface NonSocrataSource {
  id: NonSocrataId
  cities: readonly CityId[]
  kind: 'boundary' | 'results' | 'ballots' | 'census' | 'crosswalk' | 'basemap'
  publisher: { short: string; full: string }
  title: string
  vintage: string
  upstreamUrl: string
  landingUrl: string
  license: { name: string; url?: string } | 'not stated'
  /** Same-origin file DataDiver serves (download link). */
  servedPath?: string
  generator?: string
  derivedLicense?: 'CC BY 4.0'
  /** Socrata 4×4 when the upstream is a portal layer (live metadata + /d/ link). */
  socrataId?: string
  socrataHost?: string
  elections?: readonly NonSocrataElection[]
}

const PDDL = { name: 'Open Data Commons Public Domain Dedication and License (PDDL)', url: 'http://opendatacommons.org/licenses/pddl/1.0/' }

export const NON_SOCRATA: Record<NonSocrataId, NonSocrataSource> = {
  'sf-analysis-neighborhoods': {
    id: 'sf-analysis-neighborhoods', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Planning', full: 'San Francisco Planning Department' },
    title: 'Analysis Neighborhoods', vintage: '2010 census tracts, dissolved to 41 neighborhoods',
    upstreamUrl: 'https://data.sfgov.org/resource/j2bu-swwd.geojson?$limit=100',
    landingUrl: 'https://data.sfgov.org/d/j2bu-swwd',
    license: PDDL, servedPath: '/data/geo/sf-analysis-neighborhoods.geojson',
    generator: 'scripts/build-neighborhood-boundaries.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'j2bu-swwd', socrataHost: 'data.sfgov.org',
  },
  'sf-precincts-2012': {
    id: 'sf-precincts-2012', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Election Precincts - Historical, Defined 2012', vintage: 'precincts used through June 2022',
    upstreamUrl: 'https://data.sfgov.org/resource/bsfq-aeyw.geojson?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/bsfq-aeyw',
    license: PDDL, servedPath: '/data/elections/geo/prec-2012.geojson',
    generator: 'scripts/build-precinct-geometry.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'bsfq-aeyw', socrataHost: 'data.sfgov.org',
  },
  'sf-precincts-2022': {
    id: 'sf-precincts-2022', cities: ['sf'], kind: 'boundary',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Election Precincts - Current, Defined 2022', vintage: 'precincts used from November 2022',
    upstreamUrl: 'https://data.sfgov.org/resource/d6x4-hefw.geojson?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/d6x4-hefw',
    license: 'not stated', servedPath: '/data/elections/geo/prec-2022.geojson',
    generator: 'scripts/build-precinct-geometry.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'd6x4-hefw', socrataHost: 'data.sfgov.org',
  },
  'sf-elections-results': {
    id: 'sf-elections-results', cities: ['sf'], kind: 'results',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Statement of the Vote (certified results)', vintage: 'five elections, Nov. 2020 – Nov. 2024',
    upstreamUrl: 'https://sfelections.org/results/', landingUrl: 'https://sfelections.org/results/',
    license: 'not stated', servedPath: '/data/elections/index.json',
    generator: 'scripts/build-election-results.mjs', derivedLicense: 'CC BY 4.0',
    // The certification DROP date is not derivable from the election date —
    // authored here (the only other copy is the gitignored
    // data/elections-src/manifest.json). 2020 prefixes its finals with the date.
    elections: [
      { dateCode: '20201103', label: 'Nov. 3, 2020', sovUrl: 'https://www.sfelections.org/results/20201103/data/20201201/20201201_sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20201103/data/20201201/20201201_dsov.xlsx', certifiedDrop: '2020-12-01' },
      { dateCode: '20220607', label: 'June 7, 2022', sovUrl: 'https://www.sfelections.org/results/20220607/data/20220621/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20220607/data/20220621/dsov.xlsx', certifiedDrop: '2022-06-21' },
      { dateCode: '20221108', label: 'Nov. 8, 2022', sovUrl: 'https://www.sfelections.org/results/20221108/data/20221201/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20221108/data/20221201/dsov.xlsx', certifiedDrop: '2022-12-01' },
      { dateCode: '20240305', label: 'March 5, 2024', sovUrl: 'https://www.sfelections.org/results/20240305/data/20240322/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20240305/data/20240322/dsov.xlsx', certifiedDrop: '2024-03-22' },
      { dateCode: '20241105', label: 'Nov. 5, 2024', sovUrl: 'https://www.sfelections.org/results/20241105/data/20241203/sov.xlsx', dsovUrl: 'https://www.sfelections.org/results/20241105/data/20241203/dsov.xlsx', certifiedDrop: '2024-12-03' },
    ],
  },
  'sf-cvr-20241105': {
    id: 'sf-cvr-20241105', cities: ['sf'], kind: 'ballots',
    publisher: { short: 'SF Dept. of Elections', full: 'San Francisco Department of Elections' },
    title: 'Cast Vote Record, November 5, 2024', vintage: 'Nov. 5, 2024 (certified)',
    // Byte-identical to scripts/fetch-cvr-sources.mjs CVR_SOURCES['20241105'].zip
    upstreamUrl: 'https://www.sfelections.org/results/20241105/data/20241203/CVR_Export_20241202143051.zip',
    landingUrl: 'https://sfelections.org/results/20241105w/detail.html',
    license: 'not stated', servedPath: '/data/elections/results/20241105/cvr/_manifest.json',
    generator: 'scripts/build-cvr-ballots.ts', derivedLicense: 'CC BY 4.0',
  },
  'sf-tract-assignment': {
    id: 'sf-tract-assignment', cities: ['sf'], kind: 'crosswalk',
    publisher: { short: 'SF Planning', full: 'San Francisco Planning Department' },
    title: 'Analysis Neighborhoods - 2020 census tracts assigned to neighborhoods', vintage: '2020 census tracts',
    upstreamUrl: 'https://data.sfgov.org/resource/sevw-6tgi.json?$limit=1000',
    landingUrl: 'https://data.sfgov.org/d/sevw-6tgi',
    license: PDDL, generator: 'scripts/patch-renter-households.py',
    socrataId: 'sevw-6tgi', socrataHost: 'data.sfgov.org',
  },
  'acs-2023-5yr': {
    id: 'acs-2023-5yr', cities: ['sf', 'oakland'], kind: 'census',
    publisher: { short: 'U.S. Census Bureau', full: 'U.S. Census Bureau' },
    title: 'American Community Survey 5-Year Estimates', vintage: 'ACS 2019–2023 5-year estimates',
    upstreamUrl: 'https://api.census.gov/data/2023/acs/acs5',
    landingUrl: 'https://www.census.gov/programs-surveys/acs/',
    license: { name: 'Public domain (U.S. federal government work)', url: 'https://www.census.gov/data/developers/about/terms-of-service.html' },
    generator: 'scripts/generate-census-static.ts', derivedLicense: 'CC BY 4.0',
  },
  'oak-beats': {
    id: 'oak-beats', cities: ['oakland'], kind: 'boundary',
    publisher: { short: 'OPD', full: 'Oakland Police Department' },
    title: 'Police Beats', vintage: '59 beats, layer updated July 2024',
    upstreamUrl: 'https://data.oaklandca.gov/resource/78s7-673i.geojson?$limit=100',
    landingUrl: 'https://data.oaklandca.gov/d/78s7-673i',
    license: 'not stated', servedPath: '/data/geo/oakland-beats.geojson',
    generator: 'scripts/build-oakland-beats.py', derivedLicense: 'CC BY 4.0',
    socrataId: '78s7-673i', socrataHost: 'data.oaklandca.gov',
  },
  'oak-neighborhoods': {
    id: 'oak-neighborhoods', cities: ['oakland'], kind: 'boundary',
    publisher: { short: 'City of Oakland', full: 'City of Oakland' },
    title: 'Neighborhoods (131 polygons, dissolved to 10 regions)', vintage: 'layer updated July 2024',
    upstreamUrl: 'https://data.oaklandca.gov/resource/sb4q-6bkc.geojson?$limit=200',
    landingUrl: 'https://data.oaklandca.gov/d/sb4q-6bkc',
    license: 'not stated', servedPath: '/data/geo/oakland-regions.geojson',
    generator: 'scripts/build-oakland-regions.py', derivedLicense: 'CC BY 4.0',
    socrataId: 'sb4q-6bkc', socrataHost: 'data.oaklandca.gov',
  },
  'mapbox-basemap': {
    id: 'mapbox-basemap', cities: ['sf', 'oakland'], kind: 'basemap',
    publisher: { short: 'Mapbox · OpenStreetMap', full: 'Mapbox and OpenStreetMap contributors' },
    title: 'Basemap (Mapbox Light / Dark v11)', vintage: 'always-current tiles',
    upstreamUrl: 'https://www.mapbox.com/about/maps/', landingUrl: 'https://www.openstreetmap.org/copyright',
    license: { name: 'Mapbox Terms of Service; OpenStreetMap data under ODbL', url: 'https://www.openstreetmap.org/copyright' },
  },
}

export const NON_SOCRATA_IDS = Object.keys(NON_SOCRATA) as NonSocrataId[]

export function nonSocrataFor(cityId: CityId): NonSocrataSource[] {
  return NON_SOCRATA_IDS.map((id) => NON_SOCRATA[id]).filter((r) => r.cities.includes(cityId))
}
