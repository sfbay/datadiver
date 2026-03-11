/** Socrata dataset registry — all SF Open Data endpoints */

export interface DatasetConfig {
  id: string
  name: string
  description: string
  endpoint: string
  category: 'public-safety' | 'transportation' | 'other'
  hasGeo: boolean
  geoField?: string
  defaultSort?: string
  cacheTTL?: number // ms, default 5 min
  dateField?: string
}

const BASE_URL = 'https://data.sfgov.org/resource'

export const DATASETS: Record<string, DatasetConfig> = {
  fireIncidents: {
    id: 'wr8u-xric',
    name: 'Fire Incidents',
    description: 'Non-medical fire incidents with response details and outcomes',
    endpoint: `${BASE_URL}/wr8u-xric.json`,
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'alarm_dttm DESC',
    dateField: 'alarm_dttm',
  },

  fireEMSDispatch: {
    id: 'nuek-vuh3',
    name: 'Fire/EMS Dispatched Calls',
    description: 'Per-unit dispatch records with full response timeline',
    endpoint: `${BASE_URL}/nuek-vuh3.json`,
    category: 'public-safety',
    hasGeo: true,
    geoField: 'case_location',
    defaultSort: 'received_dttm DESC',
    dateField: 'received_dttm',
  },

  policeIncidents: {
    id: 'wg3w-h783',
    name: 'Police Incident Reports (2018+)',
    description: 'SFPD incident reports with crime categories and resolutions',
    endpoint: `${BASE_URL}/wg3w-h783.json`,
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'incident_datetime DESC',
    dateField: 'incident_datetime',
  },

  dispatch911Realtime: {
    id: 'gnap-fj3t',
    name: '911 Dispatch (Real-Time)',
    description: 'Live 911 dispatched calls, rolling 48-hour window',
    endpoint: `${BASE_URL}/gnap-fj3t.json`,
    category: 'public-safety',
    hasGeo: false,
    defaultSort: 'received_datetime DESC',
    cacheTTL: 60_000, // 1 min for real-time data
    dateField: 'received_datetime',
  },

  dispatch911Historical: {
    id: '2zdj-bwza',
    name: '911 Dispatch (Historical)',
    description: 'Closed law enforcement dispatched calls',
    endpoint: `${BASE_URL}/2zdj-bwza.json`,
    category: 'public-safety',
    hasGeo: false,
    defaultSort: 'received_datetime DESC',
    dateField: 'received_datetime',
  },

  parkingRevenue: {
    id: 'imvp-dq3v',
    name: 'Parking Meter Revenue',
    description: 'Per-transaction parking meter payments',
    endpoint: `${BASE_URL}/imvp-dq3v.json`,
    category: 'transportation',
    hasGeo: false,
    defaultSort: 'session_start_dt DESC',
    dateField: 'session_start_dt',
  },

  parkingMeters: {
    id: '8vzz-qzz9',
    name: 'Parking Meter Inventory',
    description: 'All parking meters with locations and attributes',
    endpoint: `${BASE_URL}/8vzz-qzz9.json`,
    category: 'transportation',
    hasGeo: true,
    geoField: 'shape',
    cacheTTL: 3_600_000, // 1 hour — inventory changes rarely
  },

  cases311: {
    id: 'vw6y-z8j6',
    name: '311 Cases',
    description: 'SF 311 service requests — street cleaning, graffiti, encampments, and more',
    endpoint: `${BASE_URL}/vw6y-z8j6.json`,
    category: 'other',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'requested_datetime DESC',
    dateField: 'requested_datetime',
  },
  parkingCitations: {
    id: 'ab4h-6ztd',
    name: 'Parking Citations',
    description: 'SFMTA parking citations with violation details and fines',
    endpoint: `${BASE_URL}/ab4h-6ztd.json`,
    category: 'transportation',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'citation_issued_datetime DESC',
    dateField: 'citation_issued_datetime',
  },

  trafficCrashes: {
    id: 'ubvf-ztfx',
    name: 'Traffic Crashes',
    description: 'Traffic collision reports with severity, mode, and conditions',
    endpoint: `${BASE_URL}/ubvf-ztfx.json`,
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'collision_datetime DESC',
    dateField: 'collision_datetime',
  },

  speedCameras: {
    id: 'd5uh-bk84',
    name: 'Speed Camera Citations',
    description: 'Automated speed enforcement camera citation data by site',
    endpoint: `${BASE_URL}/d5uh-bk84.json`,
    category: 'transportation',
    hasGeo: true,
    defaultSort: 'date DESC',
    dateField: 'date',
  },

  redLightCameras: {
    id: 'uzmr-g2uc',
    name: 'Red Light Camera Citations',
    description: 'Red light camera violation counts by intersection',
    endpoint: `${BASE_URL}/uzmr-g2uc.json`,
    category: 'transportation',
    hasGeo: true,
    geoField: 'point',
  },

  pavementCondition: {
    id: '5aye-4rtt',
    name: 'Pavement Condition Index',
    description: 'Street pavement condition scores across San Francisco',
    endpoint: `${BASE_URL}/5aye-4rtt.json`,
    category: 'other',
    hasGeo: true,
    cacheTTL: 3_600_000,
  },

  businessLocations: {
    id: 'g8m3-pdis',
    name: 'Registered Business Locations',
    description: 'Business registrations with opening/closing dates and industry codes',
    endpoint: `${BASE_URL}/g8m3-pdis.json`,
    category: 'other',
    hasGeo: true,
    geoField: 'location',
    defaultSort: 'dba_start_date DESC',
    dateField: 'dba_start_date',
  },

  campaignFinance: {
    id: 'pitq-e56w',
    name: 'Campaign Finance',
    description: 'Campaign contributions, expenditures, and independent expenditure disclosures',
    endpoint: `${BASE_URL}/pitq-e56w.json`,
    category: 'other',
    hasGeo: false,
    defaultSort: 'calculated_date DESC',
    dateField: 'calculated_date',
  },
} as const

export type DatasetKey = keyof typeof DATASETS
