import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import { useEffect } from 'react'
import { useAppStore } from '@/stores/appStore'
import AppShell from '@/components/layout/AppShell'
import Home from '@/views/Home/Home'
import EmergencyResponse from '@/views/EmergencyResponse/EmergencyResponse'
import ParkingRevenue from '@/views/ParkingRevenue/ParkingRevenue'

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
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AppShell>
    </BrowserRouter>
  )
}
