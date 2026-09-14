// src/views/Last48/ImmersiveGate.tsx
//
// Route element for /live/immersive (Spec A2 §2): desktop, key present and
// not resting → the lazy immersive page (the Cesium chunk); otherwise
// straight to /live with the same query. Imports NO Cesium — it rides the
// entry bundle beside the route table. useUrlSync stands down on this route
// (routeChrome === 'none') so its dateless write cannot clobber the redirect.
import { lazy, Suspense } from 'react'
import { Navigate, useLocation } from 'react-router-dom'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useAppStore } from '@/stores/appStore'

const Page = lazy(() => import('./photoreal/immersive/Last48Immersive'))
const HAS_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_TILES_KEY

export default function ImmersiveGate() {
  const isMobile = useIsMobile()
  const { search } = useLocation()
  const photorealResting = useAppStore((s) => s.photorealResting)
  if (isMobile || !HAS_GOOGLE_KEY || photorealResting) {
    // Carry the STOP over, nothing else: ?play= / ?tune= / ?tod= are immersive
    // controls and would otherwise stick to the classic page (and ?tune= means
    // something different there).
    const event = new URLSearchParams(search).get('event')
    return <Navigate to={event ? `/live?event=${encodeURIComponent(event)}` : '/live'} replace />
  }
  return (
    <Suspense fallback={<div className="h-full w-full bg-espresso-950" />}>
      <Page />
    </Suspense>
  )
}
