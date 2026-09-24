/** Socrata dataset registry — all SF Open Data endpoints */

import type { RawDatasetConfig } from '../types'

export const SF_DATASETS_RAW: Record<string, RawDatasetConfig> = {
  fireIncidents: {
    id: 'wr8u-xric',
    name: 'Fire Incidents',
    description: 'Non-medical fire incidents with response details and outcomes',
    publisher: { short: 'SFFD', full: 'San Francisco Fire Department' },
    category: 'public-safety',
    hasGeo: true,
    geoField: 'point',
    defaultSort: 'alarm_dttm DESC',
    dateField: 'alarm_dttm',
    cacheTTL: 10 * 60_000, // 10 min — updated daily but queries use date ranges
  },

  fireEMSDispatch: {
    id: 'nuek-vuh3',
    name: 'Fire/EMS Dispatched Calls',
    description: 'Per-unit dispatch records with full response timeline',
    publisher: { short: 'SFFD', full: 'San Francisco Fire Department' },
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
    publisher: { short: 'SFPD', full: 'San Francisco Police Department' },
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
    publisher: { short: 'SFPD', full: 'San Francisco Police Department' },
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
    publisher: { short: 'SF DEM', full: 'San Francisco Department of Emergency Management' },
    category: 'public-safety',
    // Coordinates ARE published (intersection_point) — snapped to the nearest
    // intersection, suppressed on sensitive calls. Was wrongly hasGeo:false
    // ("no coordinates" in About) until 2026-09-09; the Last 48 had drawn
    // them all along. See photoreal/markerPrecision.ts for the probe.
    hasGeo: true,
    geoField: 'intersection_point',
    defaultSort: 'received_datetime DESC',
    cacheTTL: 60_000, // 1 min for real-time data
    dateField: 'received_datetime',
  },

  dispatch911Historical: {
    id: '2zdj-bwza',
    name: '911 Dispatch (Historical)',
    description: 'Closed law enforcement dispatched calls',
    publisher: { short: 'SF DEM', full: 'San Francisco Department of Emergency Management' },
    category: 'public-safety',
    hasGeo: false,
    defaultSort: 'received_datetime DESC',
    dateField: 'received_datetime',
  },

  parkingRevenue: {
    id: 'imvp-dq3v',
    name: 'Parking Meter Revenue',
    description: 'Per-transaction parking meter payments',
    publisher: { short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' },
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
    publisher: { short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' },
    category: 'transportation',
    hasGeo: true,
    geoField: 'shape',
    cacheTTL: 3_600_000, // 1 hour — inventory changes rarely
  },

  cases311: {
    id: 'vw6y-z8j6',
    name: '311 Cases',
    description: 'SF 311 service requests — street cleaning, graffiti, encampments, and more',
    publisher: { short: 'SF 311', full: 'San Francisco 311' },
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
    publisher: { short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' },
    category: 'transportation',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'citation_issued_datetime DESC',
    dateField: 'citation_issued_datetime',
    cacheTTL: 30 * 60_000, // 30 min — known geo data gap, updated daily (per the portal)
  },

  trafficCrashes: {
    id: 'ubvf-ztfx',
    name: 'Traffic Crashes',
    description: 'Traffic collision reports with severity, mode, and conditions',
    publisher: { short: 'SFDPH/SFPD', full: 'San Francisco Department of Public Health and San Francisco Police Department' },
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
    publisher: { short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' },
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
    publisher: { short: 'SFMTA', full: 'San Francisco Municipal Transportation Agency' },
    category: 'transportation',
    hasGeo: true,
    geoField: 'point',
    cacheTTL: 30 * 60_000, // 30 min
  },

  pavementCondition: {
    id: '5aye-4rtt',
    name: 'Pavement Condition Index',
    description: 'Street pavement condition scores across San Francisco',
    publisher: { short: 'SF Public Works', full: 'San Francisco Public Works' },
    category: 'other',
    hasGeo: true,
    cacheTTL: 3_600_000,
  },

  businessLocations: {
    id: 'g8m3-pdis',
    name: 'Registered Business Locations',
    description: 'Business registrations with opening/closing dates and industry codes',
    publisher: { short: 'SF Treasurer & Tax Collector', full: 'Office of the Treasurer & Tax Collector, City and County of San Francisco' },
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
    publisher: { short: 'SF Ethics Commission', full: 'San Francisco Ethics Commission' },
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
    publisher: { short: 'SF Controller', full: 'Office of the Controller, City and County of San Francisco' },
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly at most
  },

  spendingRevenue: {
    id: 'bpnb-jwfb',
    name: 'Spending & Revenue',
    description: 'Actual spending and revenue by department, program, and object',
    publisher: { short: 'SF Controller', full: 'Office of the Controller, City and County of San Francisco' },
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },

  vendorPayments: {
    id: 'n9pm-xkyq',
    name: 'Vendor Payments (Vouchers)',
    description: 'Individual payments to vendors with department and contract detail',
    publisher: { short: 'SF Controller', full: 'Office of the Controller, City and County of San Francisco' },
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },

  supplierContracts: {
    id: 'cqi5-hm2d',
    name: 'Supplier Contracts',
    description: 'Contract awards with utilization and remaining amounts',
    publisher: { short: 'SF Controller', full: 'Office of the Controller, City and County of San Francisco' },
    category: 'other',
    hasGeo: false,
    cacheTTL: 60 * 60_000, // 1 hour — updated weekly
  },
  highInjuryNetwork: {
    id: 'enwt-3u8m',
    name: 'High Injury Network (2024)',
    description: 'Vision Zero street segments where 75% of severe/fatal crashes occur (13% of streets)',
    publisher: { short: 'SFDPH', full: 'San Francisco Department of Public Health (Vision Zero)' },
    category: 'public-safety',
    hasGeo: true,
    cacheTTL: 24 * 60 * 60_000, // 24 hours — not updated (historical only)
    ext: 'geojson', // Socrata serves this one as GeoJSON, not the default .json
  },

  evictionNotices: {
    id: '5cei-gny5',
    name: 'Eviction Notices',
    description: 'Housing eviction notices filed with the SF Rent Board since 1997',
    publisher: { short: 'SF Rent Board', full: 'San Francisco Residential Rent Stabilization and Arbitration Board' },
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
    publisher: { short: 'SF Rent Board', full: 'San Francisco Residential Rent Stabilization and Arbitration Board' },
    category: 'housing',
    hasGeo: true,
    geoField: 'point',
    dateField: 'buyout_agreement_date',
    defaultSort: 'buyout_agreement_date DESC',
  },

  // ── Restaurant inspections (Behind the Storefront) ─────────
  // Three extracts, three grading systems, never reconciled (spec §6). Only
  // the 2024+ set is read live; the two historical ones are read at build
  // time by scripts/build-storefronts.ts (the Oakland "registered, not yet
  // read by a view" precedent — About lists them either way).
  //   The live set carries ONE junk row dated 2031-05-16 (Cisco Systems,
  // permit 105295): every query clamps `inspection_date <= sfToday`, and
  // useDataFreshness (an unclamped MAX) must NOT be pointed at this set —
  // it returns 2031. The feed also thins on 2025-07-01 (~1,011 → ~297
  // rows/month, inspection_type + census go null); src/views/Restaurants/
  // inspectionFeed.ts owns that seam. Probed 2026-09-24 on data.sf.gov.
  restaurantInspections: {
    id: 'tvy3-wexg',
    name: 'Health Inspections (2024+)',
    description: 'Food-safety inspections with placard outcomes (Pass, Conditional Pass, Closure) since Jan. 2024',
    publisher: { short: 'DPH', full: 'S.F. Department of Public Health' },
    category: 'other',
    hasGeo: true,
    geoField: 'point', // columns.json: `point`; latitude/longitude are plain numbers too
    defaultSort: 'inspection_date DESC',
    dateField: 'inspection_date',
    cacheTTL: 30 * 60_000, // 30 min — publishes daily, ~1 day behind
  },

  // Mar. 2020 → Aug. 3 2023. One row per VIOLATION (count distinct
  // inspection_id); Conditional Pass is spelled four ways (CONDITIIONAL/CONDITIONA/
  // CONDITONAL PASS). Geo column is `the_geom` (columns.json), not `location`.
  restaurantInspections2020: {
    id: '5tti-66ds',
    name: 'Health Inspections (2020–2023)',
    description: 'Food-safety inspections with placard outcomes, March 2020 to August 2023 — one row per violation',
    publisher: { short: 'DPH', full: 'S.F. Department of Public Health' },
    category: 'other',
    hasGeo: true,
    geoField: 'the_geom',
    defaultSort: 'date DESC',
    dateField: 'date',
    cacheTTL: 24 * 60 * 60_000, // 24h — historical only, not updated
  },

  // Oct. 2016 → Oct. 2019 (one straggler in Nov.). One row per VIOLATION;
  // numeric scores on routine inspections only (47.4% unscored by design).
  // Geo column is `business_location`; its lat/lng columns are
  // business_latitude/business_longitude (missing for 3,497 of 6,253
  // businesses — the generator fills them from the 2024+ set by address).
  restaurantInspections2016: {
    id: 'pyih-qa8i',
    name: 'Health Inspection Scores (2016–2019)',
    description: 'Food-safety inspections with numeric scores, October 2016 to October 2019 — one row per violation',
    publisher: { short: 'DPH', full: 'S.F. Department of Public Health' },
    category: 'other',
    hasGeo: true,
    geoField: 'business_location',
    defaultSort: 'inspection_date DESC',
    dateField: 'inspection_date',
    cacheTTL: 24 * 60 * 60_000, // 24h — historical only, not updated
  },
}
