import { lazy, Suspense } from 'react'
import { useActiveCity } from '@/cities/useActiveCity'
import SfHome from './Home'

// Lazy: Home is the app's one EAGER view import — a static CityLanding
// import would drag the Oakland indicator/fppc/cycles graph into the entry
// bundle ([[frontpage-load-perf]]).
const CityLanding = lazy(() => import('./CityLanding'))

/** The 'home' view for every city. SF keeps its editorial front page; other
 *  cities get the config-driven landing. In-view city branching is the
 *  dialect pattern — route rows carry key={city.id}, so no instance
 *  survives a cross-city navigation. Both branches keep their hooks
 *  unconditional (the early-return-inside-Home form was rejected: it
 *  either breaks rules-of-hooks or fires SF's preload battery from
 *  /oakland). */
export default function HomeRouter() {
  const city = useActiveCity()
  if (city.id === 'sf') return <SfHome />
  return (
    <Suspense fallback={null}>
      <CityLanding />
    </Suspense>
  )
}
