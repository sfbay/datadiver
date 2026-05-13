import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import AppShell from '@/components/layout/AppShell'
import Home from '@/views/Home/Home'
import EmergencyResponse from '@/views/EmergencyResponse/EmergencyResponse'
import ParkingRevenue from '@/views/ParkingRevenue/ParkingRevenue'
import Dispatch911 from '@/views/Dispatch911/Dispatch911'
import Cases311 from '@/views/Cases311/Cases311'
import CrimeIncidents from '@/views/CrimeIncidents/CrimeIncidents'
import ParkingCitations from '@/views/ParkingCitations/ParkingCitations'
import TrafficSafety from '@/views/TrafficSafety/TrafficSafety'
import BusinessActivity from '@/views/BusinessActivity/BusinessActivity'
import BusinessSearch from '@/views/BusinessSearch/BusinessSearch'
import BusinessProfile from '@/views/BusinessSearch/BusinessProfile'
import ChainProfile from '@/views/BusinessSearch/ChainProfile'
import OwnerProfile from '@/views/BusinessSearch/OwnerProfile'
import CampaignFinance from '@/views/CampaignFinance/CampaignFinance'
import Demographics from '@/views/Demographics/Demographics'
import CityBudget from '@/views/CityBudget/CityBudget'
import LiveFeeds from '@/views/LiveFeeds/LiveFeeds'
import Last48 from '@/views/Last48/Last48'
import Elections from '@/views/Elections/Elections'
import Neighborhood from '@/views/Neighborhood/Neighborhood'

export default function App() {
  const isDarkMode = useAppStore((s) => s.isDarkMode)

  useEffect(() => {
    document.documentElement.classList.toggle('dark', isDarkMode)
  }, [isDarkMode])

  return (
    <BrowserRouter>
      <AppShell>
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
          <Route path="/live-feeds" element={<Last48 />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
