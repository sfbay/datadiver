/** SF Open Data dataset type definitions */

/** Fire Incidents (wr8u-xric) */
export interface FireIncident {
  incident_number: string
  call_number: string
  alarm_dttm: string
  arrival_dttm: string
  close_dttm: string
  incident_date: string
  address: string
  city: string
  zipcode: string
  battalion: string
  station_area: string
  suppression_units: number
  suppression_personnel: number
  ems_units: number
  ems_personnel: number
  fire_fatalities: number
  fire_injuries: number
  civilian_fatalities: number
  civilian_injuries: number
  number_of_alarms: number
  primary_situation: string
  action_taken_primary: string
  property_use: string
  mutual_aid: string
  supervisor_district: string
  neighborhood_district: string
  point: { type: string; coordinates: [number, number] }
  // Outcome fields
  estimated_property_loss?: number
  estimated_contents_loss?: number
  fire_spread?: string
  // Cause & Origin fields
  ignition_cause?: string
  ignition_factor_primary?: string
  heat_source?: string
  area_of_fire_origin?: string
  // Detection & Protection fields
  detectors_present?: string
  detector_effectiveness?: string
  automatic_extinguishing_system_present?: string
  automatic_extinguishing_sytem_type?: string  // NOTE: Socrata field has this typo (missing 's' in "system")
}

/** Server-side aggregation row for fire casualty/loss totals */
export interface FireCasualtyAggRow {
  injuries: string
  fatalities: string
  total_loss: string
}

/** Server-side aggregation row for fire ignition cause counts */
export interface FireCauseAggRow {
  ignition_cause: string
  cnt: string
}

/** Server-side aggregation row for fire property use counts */
export interface FirePropertyUseAggRow {
  property_use: string
  cnt: string
}

/** Server-side aggregation row for fire detector presence counts */
export interface FireDetectorAggRow {
  detectors_present: string
  cnt: string
}

/** Server-side aggregation row for fire neighborhood counts + casualties */
export interface FireNeighborhoodAggRow {
  neighborhood_district: string
  cnt: string
  injuries: string
  fatalities: string
}

/** Server-side aggregation row for battery fire yearly trend */
export interface BatteryTrendAggRow {
  year: string
  cnt: string
}

/** Fire/EMS Dispatched Calls (nuek-vuh3) */
export interface FireEMSDispatch {
  call_number: string
  unit_id: string
  incident_number: string
  call_type: string
  call_type_group: string
  received_dttm: string
  entry_dttm: string
  dispatch_dttm: string
  response_dttm: string
  on_scene_dttm: string
  transport_dttm: string
  hospital_dttm: string
  available_dttm: string
  call_final_disposition: string
  original_priority: string
  priority: string
  final_priority: string
  als_unit: boolean
  unit_type: string
  number_of_alarms: number
  address: string
  city: string
  zipcode_of_incident: string
  battalion: string
  station_area: string
  fire_prevention_district: string
  supervisor_district: string
  neighborhoods_analysis_boundaries: string
  case_location: { type: string; coordinates: [number, number] }
}

/** SFPD Incident Reports 2018+ (wg3w-h783) */
export interface PoliceIncident {
  incident_id: string
  incident_number: string
  cad_number: string
  incident_datetime: string
  incident_date: string
  incident_time: string
  incident_year: number
  incident_day_of_week: string
  report_datetime: string
  report_type_code: string
  report_type_description: string
  incident_code: string
  incident_category: string
  incident_subcategory: string
  incident_description: string
  resolution: string
  intersection: string
  police_district: string
  analysis_neighborhood: string
  supervisor_district: string
  latitude: number
  longitude: number
  point: { type: string; coordinates: [number, number] }
}

/** 911 Dispatch Calls (gnap-fj3t real-time, 2zdj-bwza historical) */
export interface DispatchCall {
  cad_number: string
  received_datetime: string
  entry_datetime: string
  dispatch_datetime: string
  enroute_datetime: string
  onscene_datetime: string
  close_datetime: string
  call_type_original: string
  call_type_original_desc: string
  call_type_final: string
  call_type_final_desc: string
  priority_original: string
  priority_final: string
  agency: string
  disposition: string
  onview_flag: boolean
  sensitive_call: boolean
}

/** Parking Meter Revenue Transaction (imvp-dq3v) */
export interface ParkingTransaction {
  transmission_datetime: string
  post_id: string
  street_block: string
  payment_type: string
  session_start_dt: string
  session_end_dt: string
  meter_event_type: string
  gross_paid_amt: string // comes as string from API
}

/** Parking Meter Inventory (8vzz-qzz9) */
export interface ParkingMeter {
  post_id: string
  ms_pay_station_id: string
  active_meter_flag: string
  meter_type: string
  cap_color: string
  street_name: string
  street_num: string
  longitude: string
  latitude: string
  analysis_neighborhood: string
  supervisor_district: string
  on_offstreet_type: string
  jurisdiction: string
  pm_district_id: string
  meter_vendor?: string
  meter_model?: string
}

/** Computed types for visualizations */
export interface ResponseTimeRecord {
  callNumber: string
  receivedAt: Date
  onSceneAt: Date
  responseTimeMinutes: number
  callType: string
  neighborhood: string
  district: string
  priority: string
  lat: number
  lng: number
}

export interface NeighborhoodStats {
  neighborhood: string
  avgResponseTime: number
  medianResponseTime: number
  totalIncidents: number
  fastestResponse: number
  slowestResponse: number
}

export interface MeterRevenueRecord {
  postId: string
  streetBlock: string
  totalRevenue: number
  transactionCount: number
  avgTransaction: number
  lat: number
  lng: number
  neighborhood: string
  capColor: string
}

/** Daily trend data point for comparison charts */
export interface DailyTrendPoint {
  day: string
  callCount: number
  avgResponseTime: number
  medianResponseTime: number
}

/** Hourly aggregation row from Socrata server-side query */
export interface HourlyAggRow {
  hour: string
  dow: string
  call_count: string
}

/** Full incident detail with all 7 response timestamps */
export interface IncidentDetail {
  callNumber: string
  callType: string
  callTypeGroup: string
  priority: string
  neighborhood: string
  district: string
  address: string
  timestamps: {
    received: string | null
    dispatch: string | null
    response: string | null
    onScene: string | null
    transport: string | null
    hospital: string | null
    available: string | null
  }
}

/** Server-side aggregation row for call type counts */
export interface CallTypeAggRow {
  call_type_final_desc: string
  call_count: string
  sensitive_call: string
}

/** Server-side aggregation row for disposition counts */
export interface DispositionAggRow {
  disposition: string
  call_count: string
}

/** 311 Service Request (vw6y-z8j6) */
export interface Cases311Record {
  service_request_id: string
  requested_datetime: string
  updated_datetime: string
  closed_date: string
  status_description: string
  service_name: string
  service_subtype: string
  service_details: string
  address: string
  lat: string
  long: string
  analysis_neighborhood: string
  supervisor_district: string
  police_district: string
  source: string
  agency_responsible: string
  media_url: string
  point: { type: string; coordinates: [number, number] }
}

/** Server-side aggregation row for 311 service category counts */
export interface ServiceCategoryAggRow {
  service_name: string
  case_count: string
}

/** Server-side aggregation row for 311 neighborhood counts */
export interface NeighborhoodAggRow311 {
  analysis_neighborhood: string
  case_count: string
}

/** Server-side per-meter aggregation row */
export interface MeterAggRow {
  post_id: string
  total_revenue: string
  tx_count: string
}

/** Server-side aggregation row for parking revenue stats */
export interface ParkingStatsAggRow {
  total_revenue: string
  total_count: string
  unique_meters: string
}

/** Server-side aggregation row for parking payment type breakdown */
export interface PaymentTypeAggRow {
  payment_type: string
  total_revenue: string
  tx_count: string
}

/** Server-side aggregation row for police incident category counts */
export interface IncidentCategoryAggRow {
  incident_category: string
  incident_count: string
}

/** Server-side aggregation row for police neighborhood counts */
export interface NeighborhoodAggRowPolice {
  analysis_neighborhood: string
  incident_count: string
}

/** Server-side aggregation row for police resolution counts */
export interface ResolutionAggRow {
  resolution: string
  incident_count: string
}

/** Parking Citation (ab4h-6ztd) */
export interface ParkingCitationRecord {
  citation_number: string
  citation_issued_datetime: string
  violation: string
  violation_desc: string
  citation_location: string
  fine_amount: string
  vehicle_plate_state: string
  the_geom: { type: string; coordinates: [number, number] }
  analysis_neighborhood: string
  supervisor_districts: string
}

/** Server-side aggregation row for violation type counts + revenue */
export interface ViolationTypeAggRow {
  violation_desc: string
  citation_count: string
  total_fines: string
  avg_fine: string
}

/** Server-side aggregation row for citation neighborhood counts + revenue */
export interface NeighborhoodAggRowCitations {
  analysis_neighborhood: string
  citation_count: string
  total_fines: string
  avg_fine: string
}

/** Traffic Crash (ubvf-ztfx) */
export interface TrafficCrashRecord {
  unique_id: string
  collision_datetime: string
  collision_severity: string
  type_of_collision: string
  mviw: string
  ped_action: string
  weather_1: string
  road_surface: string
  road_cond_1: string
  lighting: string
  number_killed: string
  number_injured: string
  primary_rd: string
  secondary_rd: string
  analysis_neighborhood: string
  supervisor_district: string
  police_district: string
  tb_latitude: string
  tb_longitude: string
  point: { type: string; coordinates: [number, number] }
  dph_col_grp_description: string
  vz_pcf_group: string
}

/** Speed Camera Citations (d5uh-bk84) */
export interface SpeedCameraRecord {
  date: string
  site_id: string
  location: string
  enforcement_type: string
  posted_speed: string
  avg_issued_speed: string
  issued_warnings: string
  issued_citations: string
  _11_to_15_mph_over: string
  _16_to_20_mph_over: string
  _21_plus_mph_over: string
  latitude: string
  longitude: string
  analysis_neighborhood: string
}

/** Red Light Camera Citations (uzmr-g2uc) */
export interface RedLightCameraRecord {
  intersection: string
  directions_enforced: string
  violation_type: string
  month: string
  count: string
  point: { type: string; coordinates: [number, number] }
  analysis_neighborhood: string
}

/** Pavement Condition Index (5aye-4rtt) */
export interface PavementConditionRecord {
  cnn: string
  street_name: string
  pci_score: string
  from_street: string
  to_street: string
  pci_change_date: string
  treatment_or_survey: string
  latitude: string
  longitude: string
}

/** Server-side aggregation row for crash severity counts */
export interface CrashSeverityAggRow {
  collision_severity: string
  crash_count: string
}

/** Server-side aggregation row for crash mode counts */
export interface CrashModeAggRow {
  dph_col_grp_description: string
  crash_count: string
}

/** Server-side aggregation row for crash neighborhood counts */
export interface NeighborhoodAggRowCrashes {
  analysis_neighborhood: string
  crash_count: string
  total_injured: string
  total_killed: string
}

/** Registered Business Location (g8m3-pdis) */
export interface BusinessLocationRecord {
  uniqueid: string
  certificate_number: string
  ttxid: string
  ownership_name: string
  dba_name: string
  full_business_address: string
  city: string
  state: string
  business_zip: string
  dba_start_date: string
  dba_end_date: string | null
  location_start_date: string
  location_end_date: string | null
  naic_code: string
  naic_code_description: string
  parking_tax: boolean
  transient_occupancy_tax: boolean
  location: { type: string; coordinates: [number, number] } | null
}

/** Server-side aggregation row for sector counts */
export interface SectorAggRow {
  naic_code_description: string
  cnt: string
}

/** Monthly breakdown row for net formation chart */
export interface BusinessMonthlyRow {
  month: string
  cnt: string
}

/** View state for URL serialization */
export type ViewId = 'home' | 'emergency-response' | 'parking-revenue' | 'dispatch-911' | '311-cases' | 'crime-incidents' | 'parking-citations' | 'traffic-safety' | 'business-activity'

export interface ViewState {
  view: ViewId
  dateRange: { start: string; end: string }
  neighborhood?: string
  serviceType?: 'fire' | 'police' | 'ems' | 'all'
  mapBounds?: { north: number; south: number; east: number; west: number }
  mapZoom?: number
  mapCenter?: { lat: number; lng: number }
}
