// src/components/maps/SourcePill.tsx
// The credit pill beside the Mapbox wordmark (spec §6). Mounted by MapView
// when the route's manifest entry declares sources; Demographics mounts it
// `inline` inside its cartogram legend. Tier 3 — no glow.
//
// KNOWN LIMITATION, deferred to the visual walk (fix-round-1, review finding
// 4): the open panel lives inside MapView's `z-[2]` children container, so
// it beats the stat-card tray (z-10) but loses to detail panels (z-30) and
// Mapbox popups (z-15) if either is open at the same time as this panel.
// This repo's z-index hierarchy (CLAUDE.md) is deliberately numbered close
// between neighbors specifically so a component that wants to jump the
// stack gets noticed rather than papered over with a z-999 — both fixes on
// the table (raising this container, or portalling the panel to `body`)
// want a human looking at the real page first, so this is carried forward
// rather than guessed at without a browser.
import { useEffect, useId, useRef, useState, useMemo, type KeyboardEvent } from 'react'
import { useRouteView, useViewEntry } from '@/cities/useActiveCity'
import { useCitableQueries } from '@/lib/provenance/citations'
import { summarizeSources, pillFace } from '@/lib/provenance/sourceLine'
import SourcePanel from './SourcePanel'

// LEFT is shared across viewports (10px margin + 88px wordmark + 8px gap,
// spec §14) — the pill always sits beside the wordmark, never on top of the
// zoom column at x=10–39. BOTTOM differs: on mobile the draggable sheet's
// peek line sits at y=28px, so the pill holds the built-in `bottom-11`
// (44px) clear of both the sheet and Mapbox's zoom buttons (y=43–103 at
// x=10–39 — irrelevant here since the pill starts at x=106); on desktop
// (`desk:`) it drops to the tighter 10px margin used throughout the review.
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

  // macOS Safari does not focus a <button> on click, so Escape (which reads
  // `open` off this wrapper's onKeyDown) can be dead right after a click-to-
  // open unless we focus the trigger ourselves.
  const handleTriggerClick = () => {
    setOpen((v) => !v)
    triggerRef.current?.focus()
  }

  const face = useMemo(() => (entry ? pillFace(summarizeSources(cityId, entry)) : ''), [cityId, entry])
  if (!entry || (!entry.sources?.length && !entry.staticSources?.length)) return null

  const wrapper = inline
    ? 'relative inline-block'
    : 'absolute z-20 bottom-11 left-[var(--pill-left)] desk:bottom-[var(--pill-bottom)]'

  return (
    <div ref={ref} onKeyDown={onKeyDown} className={wrapper} style={{ ['--pill-left' as string]: `${PILL_LEFT_PX}px`, ['--pill-bottom' as string]: `${PILL_BOTTOM_PX}px` }}>
      <button
        ref={triggerRef}
        id={id}
        onClick={handleTriggerClick}
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
        <div data-export-ignore className={`absolute bottom-full mb-1.5 z-50 ${inline ? 'right-0' : 'left-0'}`}>
          <SourcePanel cityId={cityId} entry={entry} records={records} labelledBy={id} />
        </div>
      )}
    </div>
  )
}
