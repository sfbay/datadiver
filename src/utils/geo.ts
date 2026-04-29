/** Geographic utility functions */

/** San Francisco map center and bounds */
export const SF_CENTER = { lat: 37.7749, lng: -122.4194 }
export const SF_BOUNDS = {
  north: 37.8324,
  south: 37.7065,
  east: -122.3279,
  west: -122.5168,
}
export const SF_DEFAULT_ZOOM = 12

/** Default 3D camera orientation for all maps. Pitch puts the camera at a
 *  moderate aerial angle so dot density reads well; the positive (clockwise)
 *  bearing aligns SF's NW-SE peninsula axis with the screen diagonal, fitting
 *  more of the city on screen with less wasted ocean in the corners. Users
 *  can still rotate/tilt freely after first render — these are only the
 *  initial values. Tuned visually via the `?debug=map` overlay in MapView. */
export const SF_DEFAULT_PITCH = 48
export const SF_DEFAULT_BEARING = 20.1

/** Extract lat/lng from a Socrata point field */
export function extractCoordinates(
  point: { type: string; coordinates: [number, number] } | null | undefined
): { lat: number; lng: number } | null {
  if (!point?.coordinates) return null
  const [lng, lat] = point.coordinates // GeoJSON is [lng, lat]
  if (!lat || !lng || lat === 0 || lng === 0) return null
  return { lat, lng }
}

/** Extract coordinates from separate lat/lng fields */
export function coordsFromFields(
  lat: string | number | null | undefined,
  lng: string | number | null | undefined
): { lat: number; lng: number } | null {
  const la = typeof lat === 'string' ? parseFloat(lat) : lat
  const ln = typeof lng === 'string' ? parseFloat(lng) : lng
  if (!la || !ln || isNaN(la) || isNaN(ln)) return null
  return { lat: la, lng: ln }
}

/** SF Neighborhoods list (41 analysis neighborhoods) */
export const SF_NEIGHBORHOODS = [
  'Bayview Hunters Point', 'Bernal Heights', 'Castro/Upper Market',
  'Chinatown', 'Excelsior', 'Financial District/South Beach',
  'Glen Park', 'Golden Gate Park', 'Haight Ashbury', 'Hayes Valley',
  'Inner Richmond', 'Inner Sunset', 'Japantown', 'Lakeshore',
  'Lincoln Park', 'Lone Mountain/USF', 'Marina', 'McLaren Park',
  'Mission', 'Mission Bay', 'Nob Hill', 'Noe Valley', 'North Beach',
  'Oceanview/Merced/Ingleside', 'Outer Mission', 'Outer Richmond',
  'Pacific Heights', 'Portola', 'Potrero Hill', 'Presidio',
  'Presidio Heights', 'Russian Hill', 'Seacliff', 'South of Market',
  'Sunset/Parkside', 'Tenderloin', 'Treasure Island', 'Twin Peaks',
  'Visitacion Valley', 'West of Twin Peaks', 'Western Addition',
] as const

export type SFNeighborhood = (typeof SF_NEIGHBORHOODS)[number]

/** Non-residential areas (parks, military) — exclude from demographic rankings and profiles */
export const NON_RESIDENTIAL_NEIGHBORHOODS = new Set([
  'Golden Gate Park',
  'McLaren Park',
  'Lincoln Park',
  'Presidio',
])
