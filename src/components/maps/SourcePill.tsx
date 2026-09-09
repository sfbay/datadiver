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
import { useEffect, useId, useRef, useState, useMemo, useCallback, type KeyboardEvent } from 'react'
import { createPortal } from 'react-dom'
import { useRouteView, useViewEntry } from '@/cities/useActiveCity'
import { useCitableQueries } from '@/lib/provenance/citations'
import { summarizeSources, pillFace } from '@/lib/provenance/sourceLine'
import SourcePanel from './SourcePanel'

// MEASURED in a browser 2026-09-09 (Chrome, 1440×900, default type scale), which
// corrected both values — they had been derived on paper while the browser bridge
// was down. Mapbox's wordmark actually sits at left 6, bottom 6, 88×23 relative to
// the map, so its right edge is x=94 and its baseline is 6px off the map's bottom.
//
// LEFT is shared across viewports: 94 + an 8px gap. It keeps the pill beside the
// wordmark and clear of the zoom column at x=10–39 in BOTH viewports. BOTTOM
// differs: on mobile the draggable sheet's peek line sits at y=28px, so the pill
// holds the built-in `bottom-11` (44px) clear of the sheet; on desktop (`desk:`)
// it drops to 6px so its bottom edge lines up with the wordmark's, reading as one
// credit row rather than two things at slightly different heights.
// The mobile pill sits on its own row above the wordmark, so it gains nothing
// from aligning with it — it only has to clear Mapbox's zoom column, which ends
// at x=44. Starting at 52 buys 50px of extra width for the credit on the
// narrowest screens, which is where the clamp bites.
const PILL_LEFT_PX = 102
const PILL_LEFT_MOBILE_PX = 52
const PILL_BOTTOM_PX = 6

export default function SourcePill({ inline = false }: { inline?: boolean }) {
  const { cityId } = useRouteView()
  const entry = useViewEntry()
  const records = useCitableQueries(cityId, entry?.viewId ?? 'home')
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const portalRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const id = useId()

  // Where to pin the portalled inline panel, in viewport coordinates. Measured
  // from the trigger when the panel opens (and on resize/scroll while it is
  // open), because a portalled node cannot inherit its host's position.
  const [anchor, setAnchor] = useState<{ top: number; right: number } | null>(null)
  const measure = useCallback(() => {
    const t = triggerRef.current
    if (!t) return
    const r = t.getBoundingClientRect()
    setAnchor({ top: r.bottom + 6, right: Math.max(8, window.innerWidth - r.right) })
  }, [])

  useEffect(() => {
    if (!inline || !open) return
    measure()
    window.addEventListener('resize', measure)
    window.addEventListener('scroll', measure, true)
    return () => {
      window.removeEventListener('resize', measure)
      window.removeEventListener('scroll', measure, true)
    }
  }, [inline, open, measure])

  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const t = e.target as Node
      // The inline panel is portalled out of `ref`, so it needs its own check —
      // without this, any click inside the open panel would close it.
      if (ref.current?.contains(t) || portalRef.current?.contains(t)) return
      setOpen(false)
    }
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
    : 'absolute z-20 bottom-11 left-[var(--pill-left-mobile)] desk:bottom-[var(--pill-bottom)] desk:left-[var(--pill-left)]'

  return (
    <div
      ref={ref}
      onKeyDown={onKeyDown}
      className={wrapper}
      style={{
        ['--pill-left' as string]: `${PILL_LEFT_PX}px`,
        ['--pill-left-mobile' as string]: `${PILL_LEFT_MOBILE_PX}px`,
        ['--pill-bottom' as string]: `${PILL_BOTTOM_PX}px`,
      }}
    >
      <button
        ref={triggerRef}
        id={id}
        onClick={handleTriggerClick}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="Where this data comes from — cite it or download the publisher's file"
        // The clamp is ONE viewport-free utility on purpose. A `desk:` variant
        // keys off html[data-vp], which the PNG exporter's cloned document does
        // not reliably carry, and html2canvas measures this mono face a few
        // percent wider than the browser does — so a clamp sized snugly to the
        // longest real face still tripped `truncate` in the export and shipped
        // a credit reading "via DataDiv…". 26rem is the 22rem design budget
        // (pinned by pillFaceWidth.test.ts) plus slack for that drift; min()
        // keeps it inside a phone without needing a breakpoint at all.
        className="flex items-center gap-1.5 max-w-[min(26rem,calc(100vw-4rem))] overflow-hidden h-[23px] px-2.5 rounded-full text-micro font-mono whitespace-nowrap
          bg-paper-50/90 dark:bg-espresso-900/90 text-ink dark:text-paper-200 ring-1 ring-paper-300/60 dark:ring-white/10
          hover:bg-paper-100 dark:hover:bg-espresso-800 transition-colors cursor-pointer"
      >
        {/* NOT `truncate`. The exporter re-measures this mono face a few percent
            wider than the browser does, so text-overflow:ellipsis fired in the
            PNG even when the credit fitted on screen — every export of a longer
            face shipped "via DataDiv…", losing the one line that has to survive
            a screenshot. Proven in Chrome 2026-09-09: dropping truncate alone
            restored the full credit in the export, with the clamp unchanged.
            `shrink-0` keeps flex from squeezing it; the button's own clamp plus
            pillFaceWidth.test.ts are what actually bound the width. */}
        <span className="shrink-0">{face}</span>
        <svg width="7" height="7" viewBox="0 0 8 8" fill="none" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"
          // The caret points where the panel will go: up for the map-mounted
          // pill (which opens upward), down for the inline one (which opens
          // downward), and flips once the panel is open.
          className={`shrink-0 transition-transform duration-150 ${(inline ? !open : open) ? 'rotate-180' : ''}`}><path d="M2 5l2-2 2 2" /></svg>
      </button>
      {/* MAP-MOUNTED panel: stays in the tree, opens UPWARD off the credit row.
          On mobile it breaks out of the pill's horizontal offset to the map's own
          left edge (0.75rem − var(--pill-left-mobile)), because the panel is far
          wider than the pill and would otherwise run off a phone; on desktop it
          sits flush above the pill. */}
      {open && !inline && (
        <div
          data-export-ignore
          className="absolute z-50 bottom-full mb-1.5 left-[calc(0.75rem-var(--pill-left-mobile))] desk:left-0"
        >
          <SourcePanel cityId={cityId} entry={entry} records={records} labelledBy={id} />
        </div>
      )}

      {/* INLINE panel (Demographics' cartogram legend) is PORTALLED to <body>.
          Two measured reasons, both from the 2026-09-09 walk. Its host sits near
          the TOP of the view, so opening upward put the panel's top at y=-362 on
          a 1440×900 screen; and the cartogram's container carries overflow-hidden,
          so even opening downward it was clipped to a ~30px sliver. A portal is
          the only fix that escapes an ancestor's clip — the same reason the
          map-mounted panel's z-index limitation is still open. Pinned in viewport
          coordinates from the trigger's rect, re-measured on resize and scroll. */}
      {open && inline && anchor && createPortal(
        <div
          ref={portalRef}
          data-export-ignore
          style={{ position: 'fixed', top: anchor.top, right: anchor.right, zIndex: 60 }}
        >
          <SourcePanel cityId={cityId} entry={entry} records={records} labelledBy={id} />
        </div>,
        document.body,
      )}
    </div>
  )
}
