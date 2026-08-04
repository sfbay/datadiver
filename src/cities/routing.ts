// The ONLY code in the app that interprets location.pathname. Everything that
// needs a city or view identity derives it from parseRoute — never by matching
// pathname literals (the pre-spine bug class: eraSourceForPath returned
// undefined for any two-segment path, useUrlSync's Sets exact-matched '/live').

export type CityId = 'sf' | 'oakland'

/** First-segment prefixes that name a non-SF city. SF is root-only and never
 *  appears as a prefix — '/sf/…' is not a valid URL shape. Typed against
 *  Exclude<CityId, 'sf'> so adding a prefix without extending the CityId union
 *  fails to compile right here at the Set literal. */
const CITY_PREFIXES: ReadonlySet<Exclude<CityId, 'sf'>> = new Set(['oakland'])

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
  const first = segments[0]
  if (first !== undefined) {
    // React Router's <Route path="/oakland/*"> matches case-insensitively, so
    // the prefix check (and the cityId we return) must agree — lowercase ONCE
    // here and reuse the same value for both. viewId is intentionally left
    // as-authored: case-variant view slugs are pre-existing router behavior,
    // out of scope here.
    const lower = first.toLowerCase()
    if ((CITY_PREFIXES as ReadonlySet<string>).has(lower)) {
      return { cityId: lower as CityId, viewId: segments[1] ?? 'home' }
    }
  }
  return { cityId: 'sf', viewId: segments[0] ?? 'home' }
}

export function viewPath(cityId: CityId, viewId: string): string {
  const view = viewId === 'home' ? '' : `/${viewId}`
  return cityId === 'sf' ? (view || '/') : `/${cityId}${view}`
}
