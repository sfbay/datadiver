import { useEffect, useRef, useState } from 'react'
import { CITIES, crossCityPath } from '@/cities/registry'
import type { CityId } from '@/cities/routing'

// The registry's own insertion order (sf first) — never a second hand-kept
// list (spec §B3: "the registry's cities"; duplicated-allowlist class).
const CITY_ORDER = Object.keys(CITIES) as CityId[]

/**
 * The brand-row city control (program-spec decision 3): the subtitle line
 * becomes a chevron button opening a compact city menu. Selection
 * NAVIGATES only — the URL is the sole city authority; CityChangeReset
 * (URL-keyed) clears cross-city selections regardless of how navigation
 * was triggered. onNavigate is AppShell's go() so the mobile drawer closes.
 */
export default function CitySwitcher({
  currentCityId,
  currentViewId,
  onNavigate,
}: {
  currentCityId: CityId
  currentViewId: string
  onNavigate: (path: string) => void
}) {
  const [open, setOpen] = useState(false)
  const rootRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false) }
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.addEventListener('mousedown', onClick)
    return () => {
      document.removeEventListener('keydown', onKey)
      document.removeEventListener('mousedown', onClick)
    }
  }, [open])

  return (
    <div ref={rootRef} className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-1 text-micro text-slate-400 dark:text-slate-500 font-mono uppercase
          tracking-widest mt-0.5 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
      >
        {CITIES[currentCityId].abbrev} Open Data
        <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden className={`transition-transform ${open ? 'rotate-180' : ''}`}>
          <path d="M1 2.5 L4 5.5 L7 2.5" fill="none" stroke="currentColor" strokeWidth="1.25" />
        </svg>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 top-full mt-1.5 z-50 min-w-[10.5rem] rounded-lg overflow-hidden
            bg-white dark:bg-espresso-800 shadow-lg shadow-slate-500/10 dark:shadow-black/40
            ring-1 ring-slate-200/60 dark:ring-white/10 py-1"
        >
          {CITY_ORDER.map((id) => {
            const isCurrent = id === currentCityId
            return (
              <button
                key={id}
                role="menuitemradio"
                aria-checked={isCurrent}
                disabled={isCurrent}
                onClick={() => {
                  setOpen(false)
                  onNavigate(crossCityPath(id, currentViewId))
                }}
                className={`w-full text-left px-3 py-1.5 text-[0.8125rem] flex items-center gap-2 transition-colors ${
                  isCurrent
                    ? 'text-ink dark:text-white cursor-default'
                    : 'text-slate-600 dark:text-slate-300 hover:bg-paper-100 dark:hover:bg-white/[0.04]'
                }`}
              >
                <span className={`w-1.5 h-1.5 rounded-full ${isCurrent ? 'bg-terracotta-500' : 'bg-slate-300 dark:bg-slate-600'}`} />
                {CITIES[id].name}
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}
