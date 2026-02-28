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
  },

  dispatch911Historical: {
    id: '2zdj-bwza',
    name: '911 Dispatch (Historical)',
    description: 'Closed law enforcement dispatched calls',
    endpoint: `${BASE_URL}/2zdj-bwza.json`,
    category: 'public-safety',
    hasGeo: false,
    defaultSort: 'received_datetime DESC',
  },

  parkingRevenue: {
    id: 'imvp-dq3v',
    name: 'Parking Meter Revenue',
    description: 'Per-transaction parking meter payments',
    endpoint: `${BASE_URL}/imvp-dq3v.json`,
    category: 'transportation',
    hasGeo: false,
    defaultSort: 'session_start_dt DESC',
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
} as const

export type DatasetKey = keyof typeof DATASETS
