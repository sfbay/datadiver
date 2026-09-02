/** MoversPill — "MOVERS · Car break-ins +12% ▾" in the CardTray pill bar,
 *  to the right of Compare. Opens a dropdown of TILES — one big number per
 *  mover, its name under it, the two counts in the footer — in two rows:
 *  crime, then enforcement. Tiles toggle `?sub=` exactly as the sidebar rows
 *  do — same `toggleSub`. No paragraphs: the ranking rule lives behind the
 *  info dot (glossary 'movers'), the comparison window is one short label.
 *
 *  The headline is `data.topCrimeMover` — the ticker card's definition
 *  (watched-first `topMover`) — never `crimeMovers[0]`, so the two surfaces
 *  can't disagree about the biggest mover. Enforcement never reaches the
 *  headline: an arrest-generated number is not a crime headline. In the
 *  panel the enforcement row keeps a neutral number colour and its own
 *  eyebrow so the two registers never read as one list.
 *
 *  Modeled on ComparisonPopover: same wrapper, same click-outside listener,
 *  same chevron. The dropdown STAYS OPEN after a tile click (a reader toggles
 *  several); Escape closes it. Tier 3 chrome — no glow on the pill or panel.
 *
 *  `open` is CONTROLLED by the view, not local state: a tile click changes
 *  the row WHERE, the row query reloads, and CrimeIncidents swaps the whole
 *  CardTray for its skeleton while it does — unmounting this pill. Local
 *  state would re-initialise closed on every remount, so the panel shut
 *  after each toggle. The view's state survives the remount.
 */

import { useEffect, useRef, type KeyboardEvent } from 'react'
import InfoTip from '@/components/ui/InfoTip'
import { Skeleton } from '@/components/ui/Skeleton'
import { formatMoverDelta, type Mover } from './subcategoryMovers'
import type { SubcategoryData } from './useSubcategoryMovers'

/** A real minus for the big figure; formatMoverDelta's hyphen is fine at
 *  text-micro in the pill but reads as a dash at display size. */
const displayDelta = (pct: number) => formatMoverDelta(pct).replace(/^-/, '−')

function MoverTile({ m, on, register, onSelect }: {
  m: Mover
  on: boolean
  register: 'crime' | 'enforcement'
  onSelect: (keys: string[]) => void
}) {
  const figure = register === 'crime'
    ? 'text-brick-400'
    : 'text-paper-300'
  return (
    <button
      type="button"
      onClick={() => onSelect(m.keys)}
      aria-pressed={on}
      title={[
        m.subcategory,
        `${m.current.toLocaleString()} now · ${m.prior.toLocaleString()} in the comparison window`,
        m.note,
      ].filter(Boolean).join('\n')}
      className={`shrink-0 snap-start w-28 rounded-md px-2.5 py-2 text-left transition-all duration-150 cursor-pointer ${
        on
          ? 'bg-brick-500/15 ring-1 ring-brick-500/40'
          : 'bg-white/[0.04] hover:bg-white/[0.08]'
      }`}
    >
      <p className={`font-display italic text-2xl leading-none tabular-nums ${figure}`}>
        {displayDelta(m.delta)}
      </p>
      <p className="mt-1.5 text-micro leading-snug text-slate-200 line-clamp-2 min-h-[2.4em]">
        {m.label}
      </p>
      <p className="mt-1 font-mono text-nano tabular-nums text-slate-500 whitespace-nowrap">
        {m.current.toLocaleString()} · was {m.prior.toLocaleString()}
      </p>
    </button>
  )
}

function TileRow({ movers, register, selectedSubs, onSelect }: {
  movers: Mover[]
  register: 'crime' | 'enforcement'
  selectedSubs: Set<string>
  onSelect: (keys: string[]) => void
}) {
  return (
    <div className="flex gap-2 overflow-x-auto snap-x snap-mandatory pb-0.5 -mx-0.5 px-0.5">
      {movers.map((m) => (
        <MoverTile
          key={m.key}
          m={m}
          on={m.keys.every((k) => selectedSubs.has(k))}
          register={register}
          onSelect={onSelect}
        />
      ))}
    </div>
  )
}

function TileSkeleton() {
  return (
    <div className="flex gap-2">
      {[0, 1, 2].map((i) => <Skeleton key={i} className="h-[4.75rem] w-28 shrink-0 rounded-md" />)}
    </div>
  )
}

function Eyebrow({ text, right, info }: { text: string; right?: string; info?: string }) {
  return (
    <div className="flex items-center gap-2 mb-2">
      <p className="text-nano font-mono uppercase tracking-[0.2em] text-slate-500 whitespace-nowrap flex items-center">
        {text}
        {info && <InfoTip term={info} size={11} />}
      </p>
      <div className="flex-1 h-[1px] bg-white/[0.06]" />
      {right && (
        <span className="text-nano font-mono text-slate-500 whitespace-nowrap">{right}</span>
      )}
    </div>
  )
}

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

  const crimeEmpty = !data.compared
    ? 'No comparison window'
    : 'Too few cases to rank'

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
          shadow-xl shadow-black/40 p-3 z-50"
        >
          <Eyebrow
            text="What's moving"
            info="movers"
            right={!data.isLoading && data.compared ? data.comparisonLabel : undefined}
          />
          {data.isLoading ? (
            <TileSkeleton />
          ) : data.compared && data.crimeMovers.length > 0 ? (
            <TileRow movers={data.crimeMovers} register="crime" selectedSubs={selectedSubs} onSelect={onSelect} />
          ) : (
            <p className="text-micro text-slate-500 italic">{crimeEmpty}</p>
          )}

          {!data.isLoading && data.compared && data.enforcementMovers.length > 0 && (
            <div className="mt-3">
              <Eyebrow text="Enforcement" right="officer-initiated" />
              <TileRow movers={data.enforcementMovers} register="enforcement" selectedSubs={selectedSubs} onSelect={onSelect} />
            </div>
          )}
        </div>
      )}
    </div>
  )
}
