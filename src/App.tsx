import { BrowserRouter, Routes, Route, Navigate, useLocation } from 'react-router-dom'
import { Suspense, lazy, useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import AppShell from '@/components/layout/AppShell'
import { RouteErrorBoundary } from '@/components/ui/ErrorBoundary'
// Eager: ONLY the landing page. Every dataset view is route-split — including
// The Last 48, whose import graph carries Mapbox GL (~467 KB gzip): keeping it
// lazy keeps the GL engine off Home's critical path (the manualChunks split in
// vite.config.ts only helps if no EAGER module reaches mapbox-gl). The
// flagship still feels instant: an idle-time prefetch in App() warms its
// chunks once the landing page has painted and gone quiet.
import Home from '@/views/Home/Home'

const Last48 = lazy(() => import('@/views/Last48/Last48'))
const EmergencyResponse = lazy(() => import('@/views/EmergencyResponse/EmergencyResponse'))
const ParkingRevenue = lazy(() => import('@/views/ParkingRevenue/ParkingRevenue'))
const Dispatch911 = lazy(() => import('@/views/Dispatch911/Dispatch911'))
const Cases311 = lazy(() => import('@/views/Cases311/Cases311'))
const CrimeIncidents = lazy(() => import('@/views/CrimeIncidents/CrimeIncidents'))
const ParkingCitations = lazy(() => import('@/views/ParkingCitations/ParkingCitations'))
const TrafficSafety = lazy(() => import('@/views/TrafficSafety/TrafficSafety'))
const BusinessActivity = lazy(() => import('@/views/BusinessActivity/BusinessActivity'))
const BusinessSearch = lazy(() => import('@/views/BusinessSearch/BusinessSearch'))
const BusinessProfile = lazy(() => import('@/views/BusinessSearch/BusinessProfile'))
const ChainProfile = lazy(() => import('@/views/BusinessSearch/ChainProfile'))
const OwnerProfile = lazy(() => import('@/views/BusinessSearch/OwnerProfile'))
const CampaignFinance = lazy(() => import('@/views/CampaignFinance/CampaignFinance'))
const Demographics = lazy(() => import('@/views/Demographics/Demographics'))
const CityBudget = lazy(() => import('@/views/CityBudget/CityBudget'))
const Elections = lazy(() => import('@/views/Elections/Elections'))
const Neighborhood = lazy(() => import('@/views/Neighborhood/Neighborhood'))
const Alerts = lazy(() => import('@/views/Alerts/AlertsView'))
const About = lazy(() => import('@/views/About/About'))
const Pulse = lazy(() => import('@/views/Pulse/Pulse'))

/** Chunk-loading fallback — same calm register as the skeleton kit: a corner
 *  pill, not a takeover. The view's own progressive skeletons handle the rest
 *  once the chunk arrives. */
function RouteFallback() {
  return (
    <div className="h-full grid place-items-center">
      <div className="flex items-center gap-2.5 rounded-full border border-ink/[0.08] dark:border-white/[0.08] bg-paper-100/70 dark:bg-espresso-800/70 px-4 py-2">
        <span className="w-2 h-2 rounded-full bg-terracotta-500 animate-pulse" aria-hidden />
        <span className="text-micro font-mono uppercase tracking-[0.2em] text-ink/55 dark:text-slate-400">
          Loading view
        </span>
      </div>
    </div>
  )
}

/** Permanent redirect from the old /live-feeds path to the canonical /live,
 *  preserving the query string and hash so deep-links (?event=…, ?ambient=…)
 *  survive. */
function LiveFeedsRedirect() {
  const { search, hash } = useLocation()
  return <Navigate to={{ pathname: '/live', search, hash }} replace />
}

export default function App() {
  const isDarkMode = useAppStore((s) => s.isDarkMode)
  const typeScale = useAppStore((s) => s.typeScale)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  useEffect(() => {
    document.documentElement.setAttribute('data-type-scale', typeScale)
  }, [typeScale])

  // Warm the flagship view's chunks (Last48 + the mapbox chunk it pulls) once
  // the browser is idle — nav to /live stays instant without costing Home's
  // first paint. Vite dedupes this with the route's lazy() import. Safari has
  // no requestIdleCallback; a short timeout is close enough there.
  useEffect(() => {
    const warm = () => {
      void import('@/views/Last48/Last48')
    }
    if ('requestIdleCallback' in window) {
      const id = window.requestIdleCallback(warm, { timeout: 5000 })
      return () => window.cancelIdleCallback(id)
    }
    const t = setTimeout(warm, 2500)
    return () => clearTimeout(t)
  }, [])

  return (
    <BrowserRouter>
      <AppShell>
        <RouteErrorBoundary>
        <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/emergency-response" element={<EmergencyResponse />} />
          <Route path="/parking-revenue" element={<ParkingRevenue />} />
          <Route path="/dispatch-911" element={<Dispatch911 />} />
          <Route path="/311-cases" element={<Cases311 />} />
          <Route path="/crime-incidents" element={<CrimeIncidents />} />
          <Route path="/parking-citations" element={<ParkingCitations />} />
          <Route path="/traffic-safety" element={<TrafficSafety />} />
          <Route path="/business-activity" element={<BusinessActivity />} />
          <Route path="/business" element={<BusinessSearch />} />
          <Route path="/business/chain/:ban" element={<ChainProfile />} />
          <Route path="/business/owner/:name" element={<OwnerProfile />} />
          <Route path="/business/:uniqueid" element={<BusinessProfile />} />
          <Route path="/campaign-finance" element={<CampaignFinance />} />
          <Route path="/demographics" element={<Demographics />} />
          <Route path="/city-budget" element={<CityBudget />} />
          <Route path="/elections" element={<Elections />} />
          <Route path="/neighborhood" element={<Neighborhood />} />
          <Route path="/pulse" element={<Pulse />} />
          <Route path="/live" element={<Last48 />} />
          {/* /live-feeds → /live: keep the old path as a permanent redirect so
              shared event links (?event=…) and bookmarks don't 404. */}
          <Route path="/live-feeds" element={<LiveFeedsRedirect />} />
          <Route path="/alerts" element={<Alerts />} />
          <Route path="/about" element={<About />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
        </Suspense>
        </RouteErrorBoundary>
      </AppShell>
    </BrowserRouter>
  )
}
