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

/** View state for URL serialization */
export type ViewId = 'home' | 'emergency-response' | 'parking-revenue'

export interface ViewState {
  view: ViewId
  dateRange: { start: string; end: string }
  neighborhood?: string
  serviceType?: 'fire' | 'police' | 'ems' | 'all'
  mapBounds?: { north: number; south: number; east: number; west: number }
  mapZoom?: number
  mapCenter?: { lat: number; lng: number }
}
