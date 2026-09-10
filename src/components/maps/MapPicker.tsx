// src/components/maps/MapPicker.tsx
//
// "Which map?" — one menu, one vocabulary, two mounts. scope='rail' (AppShell,
// beside dark mode) offers the site-wide engines; scope='live' (The Last 48's
// control row) adds Photoreal when this route/device/key can honour it. A row
// that cannot be honoured is NOT rendered (never disabled-but-present — an
// empty affordance reads as broken, the UnderlayPicker rule). Standard stays
// hidden until Spec B flips STANDARD_SHIPPED.
import { useEffect, useRef, useState } from 'react'
import { useAppStore } from '@/stores/appStore'
import { useIsMobile } from '@/hooks/useIsMobile'
import { useRouteView } from '@/cities/useActiveCity'
import { effectiveMapEngine, STANDARD_SHIPPED, type MapEngine } from '@/stores/mapEngine'

const HAS_GOOGLE_KEY = !!import.meta.env.VITE_GOOGLE_TILES_KEY

const ROWS: Array<{ id: MapEngine; label: string; hint: string }> = [
  { id: 'classic', label: 'Classic', hint: 'today’s map' },
  { id: 'standard', label: 'Standard 3D', hint: 'buildings · light' },
  { id: 'photoreal', label: 'Photoreal', hint: 'Google 3D photos · slow and cinematic · desktop' },
]

export default function MapPicker({ scope }: { scope: 'rail' | 'live' }) {
  const mapEngine = useAppStore((s) => s.mapEngine)
  const setMapEngine = useAppStore((s) => s.setMapEngine)
  const isMobile = useIsMobile()
  const { viewId } = useRouteView()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const h = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    const t = setTimeout(() => document.addEventListener('mousedown', h), 50)
    return () => { clearTimeout(t); document.removeEventListener('mousedown', h) }
  }, [open])

  const ctx = { isMobile, viewId: viewId ?? null, hasKey: HAS_GOOGLE_KEY }
  const rows = ROWS.filter((r) => {
    if (r.id === 'standard') return STANDARD_SHIPPED
    if (r.id === 'photoreal') return scope === 'live' && effectiveMapEngine('photoreal', ctx) === 'photoreal'
    return true
  })
  if (rows.length < 2) return null
  const effective = effectiveMapEngine(mapEngine, ctx)
  const current = rows.find((r) => r.id === effective) ?? rows[0]

  return (
    <div ref={ref} className="relative" data-ambient-toggle>
      <button
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="menu" aria-expanded={open}
        title={`Map: ${current.label}`}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded-md text-label font-mono uppercase tracking-wider bg-paper-100/40 dark:bg-espresso-900/40 text-paper-600 dark:text-paper-400 hover:text-paper-800 dark:hover:text-paper-200 transition-colors"
      >
        <span>map · {current.label}</span>
        <svg width="9" height="9" viewBox="0 0 10 10" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden><path d="M2 4l3 3 3-3" /></svg>
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full mt-1.5 z-50 min-w-[15rem] rounded-lg bg-paper-50/95 dark:bg-espresso-900/95 backdrop-blur-lg border border-paper-200/50 dark:border-espresso-800 shadow-xl shadow-black/20 p-2">
          {rows.map((r) => (
            <button key={r.id} role="menuitem" onClick={() => { setMapEngine(r.id); setOpen(false) }}
              className={`flex flex-col w-full text-left px-2 py-1.5 rounded-md text-[12px] transition-colors ${r.id === effective ? 'bg-ochre-500/15 text-ink dark:text-paper-100' : 'text-paper-800 dark:text-paper-300 hover:bg-paper-100/60 dark:hover:bg-espresso-800/60'}`}>
              <span className="leading-tight">{r.label}</span>
              <span className="text-nano font-mono uppercase tracking-widest text-paper-500/70 dark:text-paper-600">{r.hint}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
