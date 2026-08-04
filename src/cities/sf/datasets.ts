/** Socrata dataset registry — all SF Open Data endpoints */

import type { RawDatasetConfig } from '../types'

export const SF_DATASETS_RAW: Record<string, RawDatasetConfig> = {
  fireIncidents: {
    id: 'wr8u-xric',
    name: 'Fire Incidents',
    description: 'Non-medical fire incidents with response details and outcomes',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'alarm_dttm DESC',
    dateField: 'alarm_dttm',
    cacheTTL: 10 * 60_000, // 10 min — updated continuously but queries use date ranges
  },

  fireEMSDispatch: {
    id: 'nuek-vuh3',
    name: 'Fire/EMS Dispatched Calls',
    description: 'Per-unit dispatch records with full response timeline',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'case_location',
    defaultSort: 'received_dttm DESC',
    dateField: 'received_dttm',
    cacheTTL: 10 * 60_000, // 10 min
  },

  policeIncidents: {
    id: 'wg3w-h783',
    name: 'Police Incident Reports (2018+)',
    description: 'SFPD incident reports with crime categories and resolutions',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'incident_datetime DESC',
    dateField: 'incident_datetime',
    cacheTTL: 10 * 60_000, // 10 min
  },

  // SFPD's pre-2018 archive — 2,071,736 incidents back to 2003, geocoded and
  // carrying Analysis Neighborhoods as a computed region. Frozen (last row
  // 2018-05-15), so it caches long. It OVERLAPS policeIncidents by 4.5 months
  // and uses an entirely different schema and category vocabulary: query it
  // only through src/views/CrimeIncidents/crimeEra.ts, which cuts the seam at
  // 2018-01-01 and translates the field names.
  policeIncidentsHistorical: {
    id: 'tmnf-yvry',
    name: 'Police Incident Reports (2003–May 2018)',
    description: 'SFPD historical incident reports — different schema and category vocabulary than the 2018+ set',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'location',
    defaultSort: 'date DESC',
    dateField: 'date',
    cacheTTL: 24 * 60 * 60_000, // 24h — the dataset is closed, nothing new lands
  },

  dispatch911Realtime: {
    id: 'gnap-fj3t',
    name: '911 Dispatch (Real-Time)',
    description: 'Live 911 dispatched calls, rolling 48-hour window',
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
    category: 'public-safety',
    hasGeo: false,
    defaultSort: 'received_datetime DESC',
    dateField: 'received_datetime',
  },

  parkingRevenue: {
    id: 'imvp-dq3v',
    name: 'Parking Meter Revenue',
    description: 'Per-transaction parking meter payments',
    category: 'transportation',
    hasGeo: false,
    defaultSort: 'session_start_dt DESC',
    dateField: 'session_start_dt',
    cacheTTL: 15 * 60_000, // 15 min — updated daily
  },

  parkingMeters: {
    id: '8vzz-qzz9',
    name: 'Parking Meter Inventory',
    description: 'All parking meters with locations and attributes',
    category: 'transportation',
    hasGeo: true,
    geoField: 'shape',
    cacheTTL: 3_600_000, // 1 hour — inventory changes rarely
  },

  cases311: {
    id: 'vw6y-z8j6',
    name: '311 Cases',
    description: 'SF 311 service requests — street cleaning, graffiti, encampments, and more',
    category: 'other',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'requested_datetime DESC',
    dateField: 'requested_datetime',
    cacheTTL: 10 * 60_000, // 10 min — updated daily
  },
  parkingCitations: {
    id: 'ab4h-6ztd',
    name: 'Parking Citations',
    description: 'SFMTA parking citations with violation details and fines',
    category: 'transportation',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'citation_issued_datetime DESC',
    dateField: 'citation_issued_datetime',
    cacheTTL: 30 * 60_000, // 30 min — known geo data gap, updates infrequently
  },

  trafficCrashes: {
    id: 'ubvf-ztfx',
    name: 'Traffic Crashes',
    description: 'Traffic collision reports with severity, mode, and conditions',
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'collision_datetime DESC',
    dateField: 'collision_datetime',
    cacheTTL: 30 * 60_000, // 30 min — high reporting latency
  },

  speedCameras: {
    id: 'd5uh-bk84',
    name: 'Speed Camera Citations',
    description: 'Automated speed enforcement camera citation data by site',
    category: 'transportation',
    hasGeo: true,
    defaultSort: 'date DESC',
    dateField: 'date',
    cacheTTL: 30 * 60_000, // 30 min
  },

  redLightCameras: {
    id: 'uzmr-g2uc',
    name: 'Red Light Camera Citations',
    description: 'Red light camera violation counts by intersection',
    category: 'transportation',
    hasGeo: true,
    geoField: 'point',
    cacheTTL: 30 * 60_000, // 30 min
  },

  pavementCondition: {
    id: '5aye-4rtt',
    name: 'Pavement Condition Index',
    description: 'Street pavement condition scores across San Francisco',
    category: 'other',
    hasGeo: true,
    cacheTTL: 3_600_000,
  },

  businessLocations: {
    id: 'g8m3-pdis',
    name: 'Registered Business Locations',
    description: 'Business registrations with opening/closing dates and industry codes',
    category: 'other',
    hasGeo: true,
    geoField: 'location',
    defaultSort: 'dba_start_date DESC',
    dateField: 'dba_start_date',
    cacheTTL: 15 * 60_000, // 15 min — updated daily
  },

  campaignFinance: {
    id: 'pitq-e56w',
    name: 'Campaign Finance',
    description: 'Campaign contributions, expenditures, and independent expenditure disclosures',
    category: 'other',
    hasGeo: false,
    defaultSort: 'calculated_date DESC',
    dateField: 'calculated_date',
    cacheTTL: 30 * 60_000, // 30 min — filings update periodically
  },

  // ── City Budget & Spending ────────────────────────────────
  budget: {
    id: 'xdgd-c79v',
    name: 'Budget',
    description: 'Planned appropriations by department, program, and object',
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly at most
  },

  spendingRevenue: {
    id: 'bpnb-jwfb',
    name: 'Spending & Revenue',
    description: 'Actual spending and revenue by department, program, and object',
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },

  vendorPayments: {
    id: 'n9pm-xkyq',
    name: 'Vendor Payments (Vouchers)',
    description: 'Individual payments to vendors with department and contract detail',
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },

  supplierContracts: {
    id: 'cqi5-hm2d',
    name: 'Supplier Contracts',
    description: 'Contract awards with utilization and remaining amounts',
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },
  highInjuryNetwork: {
    id: 'enwt-3u8m',
    name: 'High Injury Network (2024)',
    description: 'Vision Zero street segments where 75% of severe/fatal crashes occur (13% of streets)',
    category: 'public-safety',
    hasGeo: true,
    cacheTTL: 24 * 60 * 60_000, // 24 hours — updated annually
    ext: 'geojson', // Socrata serves this one as GeoJSON, not the default .json
  },

  evictionNotices: {
    id: '5cei-gny5',
    name: 'Eviction Notices',
    description: 'Housing eviction notices filed with the SF Rent Board since 1997',
    category: 'housing',
    hasGeo: true,
    geoField: 'shape',
    dateField: 'file_date',
    defaultSort: 'file_date DESC',
  },

  buyoutAgreements: {
    id: 'wmam-7g8d',
    name: 'Buyout Agreements',
    description: 'Tenant buyout disclosures and agreements filed with the SF Rent Board since March 2015',
    category: 'housing',
    hasGeo: true,
    geoField: 'point',
    dateField: 'buyout_agreement_date',
    defaultSort: 'buyout_agreement_date DESC',
  },
}
