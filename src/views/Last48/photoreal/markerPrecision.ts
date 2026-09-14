// src/views/Last48/photoreal/markerPrecision.ts
//
// ZERO-IMPORT leaf. What a published coordinate MEANS per Last 48 stream —
// probed 2026-09-09 against the live API (newest 2,000 rows each):
//   911 realtime   gnap-fj3t  intersection_point  60% distinct, intersection names
//   Fire/EMS       nuek-vuh3  case_location       35% distinct, "MISSION ST/PARK ST"
//   311            vw6y-z8j6  point               90% distinct, "831 FULTON ST"
// So 911 and Fire/EMS are snapped to the nearest intersection (~half a block
// of true uncertainty) and 311 is address-level. Marker SHAPE and the card's
// location label both read this table; a needle on a corner would be false
// precision for two of the three streams.
export type MarkerPrecision = 'intersection' | 'address'

export const PRECISION = {
  '911-realtime': 'intersection',
  'fire-ems-dispatch': 'intersection',
  '311-cases': 'address',
} as const satisfies Record<string, MarkerPrecision>

export const PRECISION_LABEL: Record<MarkerPrecision, string> = {
  intersection: 'Nearest intersection',
  address: 'Address',
}
