/** MoversPill — "MOVERS · Car break-ins +12% ▾" in the CardTray pill bar,
 *  to the right of Compare. Opens a dropdown holding the two "What's moving"
 *  strips (crime, then enforcement under its own eyebrow). Chips toggle
 *  `?sub=` exactly as the sidebar rows do — same `toggleSub`.
 *
 *  The headline is `data.topCrimeMover` — the ticker card's definition
 *  (watched-first `topMover`) — never `crimeMovers[0]`, so the two surfaces
 *  can't disagree about the biggest mover. Enforcement never reaches the
 *  headline: an arrest-generated number is not a crime headline.
 *
 *  Modeled on ComparisonPopover: same wrapper, same click-outside listener,
 *  same chevron. The dropdown STAYS OPEN after a chip click (a reader toggles
 *  several); Escape closes it. Tier 3 chrome — no glow on the pill or panel.
 */

import { useState, useEffect, useRef, type KeyboardEvent } from 'react'
import SubcategoryStrip from './SubcategoryStrip'
import { formatMoverDelta } from './subcategoryMovers'
import type { SubcategoryData } from './useSubcategoryMovers'

export default function MoversPill({ data, selectedSubs, onSelect }: {
  /** From useSubcategoryMovers. */
  data: SubcategoryData
  selectedSubs: Set<string>
  /** The view's toggleSub. */
  onSelect: (keys: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  // Close on click outside
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  // Escape closes — listened on the wrapper, not document, so it only fires
  // while focus is inside this control.
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Escape' || !open) return
    e.stopPropagation()
    setOpen(false)
    triggerRef.current?.focus()
  }

  const m = data.compared ? data.topCrimeMover : null
  const isActive = m !== null
  const title = m
    ? `Biggest change ${data.comparisonLabel}: ${m.label} ${formatMoverDelta(m.delta)}`
    : data.isLoading
      ? 'Ranking movers…'
      : 'What’s moving — no comparison window'

  return (
    <div className="relative" ref={ref} onKeyDown={onKeyDown}>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded-full transition-all duration-150 cursor-pointer
          ${isActive
            ? 'bg-brick-500/15 border border-brick-500/40 text-brick-400 hover:bg-brick-500/25'
            : 'bg-slate-900/50 dark:bg-white/[0.02] border border-white/[0.04] text-slate-400 hover:bg-slate-800/60 dark:hover:bg-white/[0.04] hover:border-white/[0.08]'
          }`}
        title={title}
        aria-haspopup="true"
        aria-expanded={open}
      >
        <span className="text-nano font-mono uppercase tracking-[0.15em] opacity-70">Movers</span>
        {m && (
          <>
            <span className="text-micro font-mono truncate max-w-[8rem]" title={m.subcategory}>
              {m.label}
            </span>
            <span className="text-micro font-mono tabular-nums">{formatMoverDelta(m.delta)}</span>
          </>
        )}
        <svg
          width="8" height="8" viewBox="0 0 8 8"
          fill="none" stroke="currentColor"
          strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        >
          <path d="M2 3l2 2 2-2" />
        </svg>
      </button>

      {open && (
        <div className="absolute top-full left-0 mt-1.5 w-80 max-w-[calc(100vw-2rem)] rounded-lg
          bg-slate-900/95 backdrop-blur-sm border border-white/[0.08]
          shadow-xl shadow-black/40 p-3 space-y-3 z-50"
        >
          <SubcategoryStrip
            register="panel"
            eyebrow="What's moving"
            movers={data.crimeMovers}
            comparisonLabel={data.comparisonLabel}
            compared={data.compared}
            selectedSubs={selectedSubs}
            onSelect={onSelect}
            emptyNote="Too few incidents in this range to rank movers."
            isLoading={data.isLoading}
          />
          {!data.isLoading && data.enforcementMovers.length > 0 && (
            <SubcategoryStrip
              register="panel"
              eyebrow="Enforcement activity · what police chose to act on"
              movers={data.enforcementMovers}
              comparisonLabel={data.comparisonLabel}
              compared={data.compared}
              selectedSubs={selectedSubs}
              onSelect={onSelect}
              emptyNote=""
              isLoading={data.isLoading}
            />
          )}
        </div>
      )}
    </div>
  )
}
