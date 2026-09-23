// src/views/Last48/photoreal/immersive/addressSearch.ts
//
// The navigator's ADDRESS search (Jesse, 2026-09-23) — Mapbox Geocoding v6
// forward search, SF only. Pure: the URL builder and the response reader;
// useAddressSearch is the hook around them.
//
// Terms (Mapbox Product Terms, July 21 2026, read 2026-09-23):
//   §2.7.2 — a TEMPORARY geocode may position results on a map (no rule
//            that the map be Mapbox's) but must not be exported, stored or
//            cached. So: no `permanent=true`, no cache, and a result never
//            goes into the URL (a shared link would store it) — the address
//            detour lives in page state only.
//   §2.7.1 — never display a result's latitude/longitude. The rows show the
//            address text only.
//   §2.7.5 — POI results only with a Mapbox map, so `types` is address and
//            street; never `poi`.
import { SF_BOUNDS } from '@/utils/geo'

export const GEOCODE_FORWARD = 'https://api.mapbox.com/search/geocode/v6/forward'
/** Characters typed before the navigator asks Mapbox anything. */
export const ADDRESS_MIN_CHARS = 3
export const ADDRESS_LIMIT = 5

export interface AddressHit {
  id: string
  /** The street address or street name — what the row shows. */
  label: string
  /** The rest of the place line ("San Francisco, California 94103"). */
  sublabel: string
  /** Positions the camera only — never rendered (§2.7.1). */
  lng: number
  lat: number
}

export function addressSearchUrl(query: string, token: string): URL {
  const url = new URL(GEOCODE_FORWARD)
  url.searchParams.set('q', query.trim())
  url.searchParams.set('types', 'address,street')
  url.searchParams.set('bbox', `${SF_BOUNDS.west},${SF_BOUNDS.south},${SF_BOUNDS.east},${SF_BOUNDS.north}`)
  url.searchParams.set('proximity', '-122.4194,37.7749')
  url.searchParams.set('country', 'us')
  url.searchParams.set('limit', String(ADDRESS_LIMIT))
  url.searchParams.set('access_token', token)
  return url
}

const inSF = (lng: number, lat: number) =>
  lng > SF_BOUNDS.west && lng < SF_BOUNDS.east && lat > SF_BOUNDS.south && lat < SF_BOUNDS.north

/** Reads a v6 forward response into rows. Anything malformed, or outside the
 *  city (the bbox is a hint to Mapbox, not a promise), is dropped. */
export function addressHits(json: unknown): AddressHit[] {
  const features = (json as { features?: unknown[] } | null)?.features
  if (!Array.isArray(features)) return []
  const out: AddressHit[] = []
  for (const f of features) {
    const g = (f as { geometry?: { coordinates?: unknown } }).geometry?.coordinates
    const p = (f as { properties?: Record<string, unknown> }).properties ?? {}
    if (!Array.isArray(g) || typeof g[0] !== 'number' || typeof g[1] !== 'number') continue
    const [lng, lat] = g as [number, number]
    if (!inSF(lng, lat)) continue
    const label = typeof p.name === 'string' ? p.name : typeof p.full_address === 'string' ? p.full_address : null
    if (!label) continue
    const id = typeof p.mapbox_id === 'string' ? p.mapbox_id : `${label}|${lng.toFixed(5)}|${lat.toFixed(5)}`
    // The place line ends ", United States" on every row — noise in an
    // SF-only list.
    const sublabel = typeof p.place_formatted === 'string' ? p.place_formatted.replace(/,\s*United States$/, '') : ''
    out.push({ id, label, sublabel, lng, lat })
  }
  return out
}
