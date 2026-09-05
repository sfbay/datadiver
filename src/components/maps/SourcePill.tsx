// src/components/maps/SourcePill.tsx
// The credit pill beside the Mapbox wordmark (spec §6). Mounted by MapView
// when the route's manifest entry declares sources; Demographics mounts it
// `inline` inside its cartogram legend. Tier 3 — no glow.
import { useEffect, useId, useRef, useState, useMemo, type KeyboardEvent } from 'react'
import { useRouteView, useViewEntry } from '@/cities/useActiveCity'
import { useCitableQueries } from '@/lib/provenance/citations'
import { summarizeSources, pillFace } from '@/lib/provenance/sourceLine'
import SourcePanel from './SourcePanel'

// Measured in plan Task 2 (spec §14): 10px margin + 88px wordmark + 8px gap.
const PILL_LEFT_PX = 106
const PILL_BOTTOM_PX = 10

export default function SourcePill({ inline = false }: { inline?: boolean }) {
  const { cityId } = useRouteView()
  const entry = useViewEntry()
  const records = useCitableQueries(cityId, entry?.viewId ?? 'home')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false) }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation(); setOpen(false); triggerRef.current?.focus()
  }

  const face = useMemo(() => (entry ? pillFace(summarizeSources(cityId, entry)) : ''), [cityId, entry])
  if (!entry || (!entry.sources?.length && !entry.staticSources?.length)) return null

  const wrapper = inline
    ? 'relative inline-block'
    : 'absolute z-20 bottom-11 left-3 desk:bottom-[var(--pill-bottom)] desk:left-[var(--pill-left)]'

  return (
    <div ref={ref} onKeyDown={onKeyDown} className={wrapper} style={{ ['--pill-left' as string]: `${PILL_LEFT_PX}px`, ['--pill-bottom' as string]: `${PILL_BOTTOM_PX}px` }}>
      <button
        ref={triggerRef}
        id={id}
        onClick={() => setOpen((v) => !v)}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Where this data comes from — cite it or download the publisher's file"
        className="flex items-center gap-1.5 max-w-[14rem] h-[23px] px-2.5 rounded-full text-micro font-mono whitespace-nowrap
          bg-paper-50/90 dark:bg-espresso-900/90 text-ink dark:text-paper-200 ring-1 ring-paper-300/60 dark:ring-white/10
          hover:bg-paper-100 dark:hover:bg-espresso-800 transition-colors cursor-pointer"
      >
        <span className="truncate">{face}</span>
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`shrink-0 transition-transform duration-150 ${open ? 'rotate-180' : ''}`}><path d="M2 5l2-2 2 2" /></svg>
      </button>
      {open && (
        <div data-export-ignore className="absolute bottom-full left-0 mb-1.5 z-50">
          <SourcePanel cityId={cityId} entry={entry} records={records} labelledBy={id} />
        </div>
      )}
    </div>
  )
}
