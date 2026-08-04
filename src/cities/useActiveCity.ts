import { useLocation } from 'react-router-dom'
import { parseRoute, type RouteIdentity } from './routing'
import { getCity } from './registry'
import type { CityConfig } from './types'

export function useRouteView(): RouteIdentity {
  return parseRoute(useLocation().pathname)
}
export function useActiveCity(): CityConfig {
  return getCity(useRouteView().cityId)
}
