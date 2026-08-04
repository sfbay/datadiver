// The ONLY code in the app that interprets location.pathname. Everything that
// needs a city or view identity derives it from parseRoute — never by matching
// pathname literals (the pre-spine bug class: eraSourceForPath returned
// undefined for any two-segment path, useUrlSync's Sets exact-matched '/live').

export type CityId = 'sf' | 'oakland'

/** First-segment prefixes that name a non-SF city. SF is root-only and never
 *  appears as a prefix — '/sf/…' is not a valid URL shape. */
const CITY_PREFIXES: ReadonlySet<string> = new Set(['oakland'])

export interface RouteIdentity {
  cityId: CityId
  /** Route slug of the view family: first path segment after any city prefix,
   *  'home' at the root. Deeper segments are detail pages of the same view
   *  ('/business/chain/x' → 'business'). NOT validated against any view union —
   *  unknown slugs fall to the router's catch-all exactly as before. */
  viewId: string
}

export function parseRoute(pathname: string): RouteIdentity {
  const segments = pathname.split('/').filter(Boolean)
  if (segments.length > 0 && CITY_PREFIXES.has(segments[0])) {
    return { cityId: segments[0] as CityId, viewId: segments[1] ?? 'home' }
  }
  return { cityId: 'sf', viewId: segments[0] ?? 'home' }
}

export function viewPath(cityId: CityId, viewId: string): string {
  const view = viewId === 'home' ? '' : `/${viewId}`
  return cityId === 'sf' ? (view || '/') : `/${cityId}${view}`
}
