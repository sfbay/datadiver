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
 *
 *  `open` is CONTROLLED by the view, not local state: a chip click changes
 *  the row WHERE, the row query reloads, and CrimeIncidents swaps the whole
 *  CardTray for its skeleton while it does — unmounting this pill. Local
 *  state would re-initialise closed on every remount, so the panel shut
 *  after each toggle. The view's state survives the remount.
 */

import { useEffect, useRef, type KeyboardEvent } from 'react'
import SubcategoryStrip from './SubcategoryStrip'
import { formatMoverDelta } from './subcategoryMovers'
import type { SubcategoryData } from './useSubcategoryMovers'

export default function MoversPill({ data, selectedSubs, onSelect, open, onOpenChange }: {
  /** From useSubcategoryMovers. */
  data: SubcategoryData
  selectedSubs: Set<string>
  /** The view's toggleSub. */
  onSelect: (keys: string[]) => void
  /** Owned by the view — see the docblock: the pill is unmounted with the
   *  CardTray on every row refetch, so its open state must live above it. */
  open: boolean
  onOpenChange: (open: boolean) => void
}) {
  const setOpen = onOpenChange
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
  }, [open, setOpen])

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
  // Three honest resting states: a comparison window that resolved but
  // produced no crime bucket over the 150-case floor (or none that moved)
  // is NOT "no comparison window" — the panel beneath says "too few", and
  // enforcement movers may still be listed. The tooltip must agree with it.
  const title = m
    ? `Biggest change ${data.comparisonLabel}: ${m.label} ${formatMoverDelta(m.delta)}`
    : data.isLoading
      ? 'Ranking movers…'
      : data.compared
        ? 'What’s moving — too few cases to rank a crime mover'
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
        <div className="absolute top-full left-0 mt-1.5 w-96 max-w-[calc(100vw-2rem)] max-h-[70vh] overflow-y-auto rounded-lg
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
