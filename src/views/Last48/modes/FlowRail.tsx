import { useEffect, useRef, useState, Fragment } from 'react'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import type { KeyboardEvent } from 'react'
import MapSidebar from '@/components/layout/MapSidebar'
import { formatHeadline, formatApTime } from '@/utils/format'
import ScannerFeedLinks from '../chrome/ScannerFeedLinks'

const DATASET_LABEL: Record<DatasetId, { label: string; color: string }> = {
  '911-realtime':      { label: '911',   color: '#616a96' },
  'fire-ems-dispatch': { label: 'Fire',  color: '#b85a33' },
  '311-cases':         { label: '311',   color: '#7a9954' },
}

interface Props {
  events: NormalizedEvent[]
  selectedId?: string
  onSelect: (e: NormalizedEvent) => void
}

export default function FlowRail({ events, selectedId, onSelect }: Props) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastFirstId = useRef<string | null>(null)
  const selectedRowRef = useRef<HTMLDivElement | null>(null)

  // Id of the freshest event — changes whenever a new event arrives at the top.
  const headId = events[0]?.id ?? null

  // When a new event appears at the top, scroll the rail to the top — BUT NOT
  // while an event is selected (a click, or the AUTO tour dwelling on one).
  // Last 48 streams 911 + Fire + 311, so fresh events arrive often; yanking to
  // the top would scroll the selected row out of view. With a selection active,
  // the scroll-to-selected effect below owns the scroll.
  useEffect(() => {
    if (headId && headId !== lastFirstId.current && scrollRef.current && !selectedId) {
      scrollRef.current.scrollTop = 0
    }
    lastFirstId.current = headId
  }, [headId, selectedId])

  // Spec cap: 50 most-recent rows. BUT — if the user clicks a map dot for
  // an event older than the 50 most recent (the map shows thousands of
  // events; a click can land anywhere in the 48h window), we MUST also
  // render the selected event or the rail can't show the inversion at all.
  //
  // Behavior contract: once an out-of-sequence event is selected (clicked
  // on the map), we PIN it in the rail below a "selected · older" divider.
  // The pinned row persists across in-rail navigation (arrow keys, clicks
  // on other rows) — it only clears when the panel itself closes
  // (selectedId becomes undefined) or when the user clicks a DIFFERENT
  // out-of-sequence event (which replaces the pin).
  //
  // Why pin instead of derive-from-selectedId-each-render: if the row
  // vanishes the moment the user navigates away from it, the rail effectively
  // hides the older event — surprising, since the user just surfaced it.
  // Pinning matches Finder's "recently revealed file stays visible" pattern.
  const [pinnedOlder, setPinnedOlder] = useState<NormalizedEvent | null>(null)

  // When selection changes (e.g. from a map click), scroll the selected row
  // into view AND move keyboard focus to the rail listbox so arrow keys
  // advance through rows instead of panning the Mapbox canvas.
  //
  // Depends on pinnedOlder as well as selectedId: when a map click selects
  // an out-of-sequence event, selectedId updates BEFORE pinnedOlder commits.
  // On the first render, the pinned row doesn't exist yet, so the ref is
  // null and scrollIntoView no-ops. The second firing — after pinnedOlder
  // settles and the row mounts — is the one that actually scrolls.
  //
  // focus({ preventScroll: true }) avoids the browser's default focus-
  // induced scroll, which would compete with the explicit scrollIntoView
  // we just called on the row.
  // Keep the selected row visible. We CANNOT use scrollIntoView: the mobile
  // sheet is rendered at full height and translated DOWN to reveal only the
  // active snap (see useDraggableSheet), so the browser's scrollport is the
  // whole ~90vh sheet — most of it off-screen below the viewport. scrollIntoView
  // ('center'/'nearest') targets that full sheet and lands the row below the
  // fold (or decides it's already "visible" and no-ops). Instead, measure
  // ON-SCREEN positions and scroll the row to just below the sticky header at
  // the top of the VISIBLE area. Re-runs on headId so a fresh event pushing the
  // row down re-pins it.
  useEffect(() => {
    const container = scrollRef.current
    const row = selectedRowRef.current
    if (!container || !row) return
    container.focus({ preventScroll: true })
    const cTop = container.getBoundingClientRect().top
    const rTop = row.getBoundingClientRect().top
    const headerH = (container.firstElementChild as HTMLElement | null)?.offsetHeight ?? 0
    const delta = rTop - cTop - headerH - 8
    if (Math.abs(delta) > 1) {
      container.scrollTo({ top: container.scrollTop + delta, behavior: 'smooth' })
    }
  }, [selectedId, pinnedOlder, headId])

  useEffect(() => {
    // Panel closed (no selection) → clear pin.
    if (!selectedId) {
      setPinnedOlder(null)
      return
    }
    // Selected event is in the top 50 → keep existing pin unchanged.
    const isInTop50 = events.slice(0, 50).some((e) => e.id === selectedId)
    if (isInTop50) return
    // Selected event lives outside top 50 → pin it (replacing any prior pin).
    const sel = events.find((e) => e.id === selectedId)
    if (sel) setPinnedOlder(sel)
  }, [selectedId, events])

  const top50 = events.slice(0, 50)
  // Render the pinned older event only when it's still in the events buffer
  // AND not already part of the top 50 (a new poll could have brought it in).
  const showPin =
    pinnedOlder != null &&
    events.some((e) => e.id === pinnedOlder.id) &&
    !top50.some((e) => e.id === pinnedOlder.id)
  const limited = showPin
    ? [...top50, pinnedOlder!].sort((a, b) => b.receivedAt - a.receivedAt)
    : top50

  const withheldCount = events.filter((e) => e.longitude == null || e.latitude == null).length

  // ------------------------------------------------------------------
  // Keyboard navigation — listbox pattern (WAI-ARIA 1.1)
  // CRITICAL: The listbox semantics (role, aria-activedescendant,
  // tabIndex, onKeyDown) are passed via scrollContainerProps so they
  // land on the SCROLLING element inside MapSidebar. This is required
  // for scrollIntoView({ block: 'nearest' }) and aria-activedescendant
  // to work correctly — both expect the listbox to be the scroll root.
  // Do NOT move these props to a non-scrolling wrapper div.
  //
  // Esc is handled at the FlowMode level (document keydown) so it works
  // regardless of where focus currently sits.
  // ------------------------------------------------------------------
  function handleKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    if (!['ArrowDown', 'ArrowUp', 'Home', 'End', 'Enter'].includes(e.key)) return
    e.preventDefault()

    const idx = limited.findIndex((ev) => ev.id === selectedId)
    if (e.key === 'ArrowDown') {
      const next = idx < 0 ? 0 : Math.min(idx + 1, limited.length - 1)
      if (limited[next]) onSelect(limited[next])
    }
    if (e.key === 'ArrowUp') {
      const next = idx < 0 ? 0 : Math.max(idx - 1, 0)
      if (limited[next]) onSelect(limited[next])
    }
    if (e.key === 'Home' && limited[0]) onSelect(limited[0])
    if (e.key === 'End' && limited[limited.length - 1]) onSelect(limited[limited.length - 1])
    // Enter is a no-op here — the popover opens automatically on selection
    // change. We catch it only to preventDefault.
  }

  return (
    <MapSidebar
      width="lean"
      scrollContainerProps={{
        ref: scrollRef,
        role: 'listbox',
        'aria-label': '48-hour event log',
        'aria-activedescendant': selectedId ? `flow-row-${selectedId}` : undefined,
        tabIndex: 0,
        onKeyDown: handleKeyDown,
        className: 'flex flex-col focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500 focus-visible:ring-inset',
      }}
    >
      {/* Subtle header — solid bg matching the rail's visual register so it
          reads as part of the rail chrome, not a contrast band. Hairline
          border-b is the only visual edge. Below the label, three labeled
          stat pills (events / window / no GPS) carry the at-a-glance
          context that used to live in a single italic line. */}
      <div className="sticky top-0 z-10 px-3 pt-3 pb-2.5 flex-shrink-0 bg-paper-50 dark:bg-espresso-900 border-b border-paper-200/50 dark:border-espresso-800">
        <div className="flex items-center gap-2 px-1">
          <p className="text-nano font-mono uppercase tracking-[0.2em] text-paper-500/60 dark:text-paper-600">
            Latest Events
          </p>
          <div className="flex-1 h-[1px] bg-paper-200/30 dark:bg-white/[0.04]" />
        </div>
        <div className="flex flex-wrap gap-1.5 mt-2">
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 pl-2.5 pr-4 py-1.5 flex items-center">
            <p className="font-display italic text-[24px] md:text-[30px] leading-none tabular-nums text-paper-900 dark:text-paper-100">
              {events.length.toLocaleString()}
            </p>
          </div>
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 px-2 py-1.5 flex items-baseline gap-1.5 md:block">
            <p className="font-mono text-[8px] text-paper-500/70 dark:text-paper-600 uppercase tracking-[0.15em]">
              window
            </p>
            <p className="font-mono text-[24px] md:text-[12px] font-semibold text-paper-800 dark:text-paper-200 tabular-nums leading-none md:mt-1">
              48 hrs
            </p>
          </div>
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 px-2 py-1.5 flex items-baseline gap-1.5 md:block">
            <p className="font-mono text-[8px] text-paper-500/70 dark:text-paper-600 uppercase tracking-[0.15em]">
              no gps
            </p>
            <p className="font-mono text-[24px] md:text-[12px] font-semibold text-paper-800 dark:text-paper-200 tabular-nums leading-none md:mt-1">
              {withheldCount.toLocaleString()}
            </p>
          </div>
        </div>
      </div>

      <div className="px-2 py-2 flex flex-col gap-0.5">
        {limited.map((ev, idx) => {
          const meta = DATASET_LABEL[ev.datasetId]
          const isSel = ev.id === selectedId
          const isOutOfSequence = showPin && ev.id === pinnedOlder!.id
          const hasCoords = ev.longitude != null && ev.latitude != null

          // role="option" + aria-selected: WAI-ARIA listbox semantics.
          // <button> would produce invalid ARIA inside role="listbox".
          // Visual treatment emulates EmergencyResponse: body-font name +
          // italic mono subtitle + small pigment dot + AP-style time.
          //
          // Priority-A 911 events get two reinforcing row-level signals:
          // a brighter pigment dot (indigo-300 vs the default indigo-500)
          // and an explicit "Priority A" tag in the subtitle. The dot is
          // the at-a-glance scan cue; the text is the confirmation.
          const isPriorityA911 = ev.datasetId === '911-realtime' && ev.priority === 'A'
          const dotColor = isPriorityA911 ? '#aab3d4' : meta.color
          const subtitleBits: string[] = [meta.label]
          if (hasCoords && ev.neighborhood) subtitleBits.push(ev.neighborhood)
          if (!hasCoords) subtitleBits.push('location withheld')
          if (isPriorityA911) subtitleBits.push('Priority A')

          const row = (
            <div
              key={ev.id}
              id={`flow-row-${ev.id}`}
              role="option"
              aria-selected={isSel}
              ref={isSel ? selectedRowRef : undefined}
              onClick={() => onSelect(ev)}
              className={`
                relative py-2 px-2.5 rounded-lg cursor-pointer transition-all duration-200
                ${!hasCoords ? 'opacity-70' : ''}
                ${isSel
                  ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30'
                  : 'hover:bg-paper-100/50 dark:hover:bg-white/[0.04]'}
              `}
            >
              <div className="flex items-start gap-2">
                {/* Pigment dot on the LEFT — forms a vertical legend column
                    down the rail's leading edge, so the dataset is identifiable
                    at a glance for every row in the stack. Aligned to the
                    first text line via mt-[5px] to sit cleanly against the
                    headline cap-height regardless of row length. */}
                <div
                  className="w-1.5 h-1.5 rounded-full flex-shrink-0 mt-[5px]"
                  style={{ backgroundColor: dotColor }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  {/* line-clamp-2 lets long headlines (e.g., "Blocking driveway
                      cite only", "Other illegal parking") show in full across
                      two lines instead of truncating mid-word. Row height
                      varies with content length — acceptable per editorial
                      register; ER does the same on long neighborhood names. */}
                  <p className="text-[12px] font-medium text-paper-900 dark:text-paper-200 leading-tight line-clamp-2">
                    {formatHeadline(ev.headline ?? meta.label)}
                  </p>
                  <p className="text-micro text-paper-500 dark:text-paper-600 font-mono italic mt-0.5 truncate">
                    {subtitleBits.join(' · ')}
                  </p>
                </div>
                <span className="text-micro font-mono text-paper-600 dark:text-paper-400 whitespace-nowrap tabular-nums flex-shrink-0 mt-[2px]">
                  {formatApTime(ev.receivedAt)}
                </span>
              </div>
            </div>
          )

          // Divider only appears above the out-of-sequence selected event.
          // It signals "selection lives outside the recent 50 — older event."
          // Without quantifying the skipped count (would require a baseline
          // count query); a calm visual cue is the editorial choice.
          if (isOutOfSequence && idx > 0) {
            return (
              <Fragment key={`row-${ev.id}`}>
                <div className="flex items-center gap-2 my-2 px-3">
                  <div className="flex-1 h-[1px] bg-paper-200/30 dark:bg-white/[0.04]" />
                  <span className="text-nano font-mono uppercase tracking-[0.2em] text-paper-500/60 dark:text-paper-600 italic">
                    selected &middot; older
                  </span>
                  <div className="flex-1 h-[1px] bg-paper-200/30 dark:bg-white/[0.04]" />
                </div>
                {row}
              </Fragment>
            )
          }
          return row
        })}

        {events.length === 0 && (
          <div className="text-paper-500 dark:text-paper-600 text-center italic py-6 text-label">
            no events in window yet
          </div>
        )}
      </div>

      {/* Scanner footer — mobile only (the desktop bottom ScannerStrip is hidden
          on phones, where the sheet would cover it). sticky bottom-0 pins it to
          the bottom of the rail when the sheet is expanded. */}
      <div className="md:hidden sticky bottom-0 z-10 flex items-center gap-3 px-3 py-2.5 bg-paper-50 dark:bg-espresso-900 border-t border-paper-200/50 dark:border-espresso-800 font-mono text-label text-paper-700 dark:text-paper-400">
        <span className="text-ochre-600 dark:text-ochre-500" aria-hidden>📡</span>
        <span className="tracking-wider">SCANNER</span>
        <div className="ml-auto flex items-center gap-2">
          <ScannerFeedLinks />
        </div>
      </div>
    </MapSidebar>
  )
}
