import { useEffect, useRef, useState, Fragment } from 'react'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import type { KeyboardEvent } from 'react'
import MapSidebar from '@/components/layout/MapSidebar'
import { formatHeadline, formatApTime } from '@/utils/format'

const DATASET_LABEL: Record<DatasetId, { label: string; color: string }> = {
  '911-realtime':      { label: '911',   color: '#616a96' },
  'fire-ems-dispatch': { label: 'Fire',  color: '#b85a33' },
  '311-cases':         { label: '311',   color: '#7a9954' },
  '911-historical':    { label: '911H',  color: '#5c9693' },
  'parking-revenue':   { label: 'Park',  color: '#d4a435' },
  'police-incidents':  { label: 'SFPD',  color: '#963e30' },
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

  // When a new event appears at the top, scroll the rail to the top
  useEffect(() => {
    const firstId = events[0]?.id ?? null
    if (firstId && firstId !== lastFirstId.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    lastFirstId.current = firstId
  }, [events])

  // When selection changes (e.g. from a map click), scroll the selected row
  // into view so the user can see the highlight in the rail.
  useEffect(() => {
    if (selectedRowRef.current) {
      selectedRowRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' })
    }
  }, [selectedId])

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
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-paper-500/60 dark:text-paper-600">
            Latest
          </p>
          <div className="flex-1 h-[1px] bg-paper-200/30 dark:bg-white/[0.04]" />
        </div>
        <div className="grid grid-cols-3 gap-1.5 mt-2">
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 px-2 py-1.5">
            <p className="font-mono text-[12px] font-semibold text-paper-800 dark:text-paper-200 tabular-nums leading-none">
              {events.length.toLocaleString()}
            </p>
            <p className="font-mono text-[8px] text-paper-500/70 dark:text-paper-600 uppercase tracking-[0.15em] mt-1">
              events
            </p>
          </div>
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 px-2 py-1.5">
            <p className="font-mono text-[12px] font-semibold text-paper-800 dark:text-paper-200 tabular-nums leading-none">
              48h
            </p>
            <p className="font-mono text-[8px] text-paper-500/70 dark:text-paper-600 uppercase tracking-[0.15em] mt-1">
              window
            </p>
          </div>
          <div className="rounded-md bg-paper-100/50 dark:bg-espresso-800/40 px-2 py-1.5">
            <p className="font-mono text-[12px] font-semibold text-paper-800 dark:text-paper-200 tabular-nums leading-none">
              {withheldCount.toLocaleString()}
            </p>
            <p className="font-mono text-[8px] text-paper-500/70 dark:text-paper-600 uppercase tracking-[0.15em] mt-1">
              no gps
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
          // NOTE: priority field is added in Phase 4 (PR #44); once that lands
          // on main, surface "Priority A" here for 911-realtime events whose
          // priority === 'A' — Phase 5's wiring of the rail through
          // Last48UnifiedView is the natural place.
          const subtitleBits: string[] = [meta.label]
          if (hasCoords && ev.neighborhood) subtitleBits.push(ev.neighborhood)
          if (!hasCoords) subtitleBits.push('location withheld')

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
                  style={{ backgroundColor: meta.color }}
                  aria-hidden="true"
                />
                <div className="min-w-0 flex-1">
                  {/* line-clamp-2 lets long headlines (e.g., "Blocking driveway
                      cite only", "Other illegal parking") show in full across
                      two lines instead of truncating mid-word. Row height
                      varies with content length — acceptable per editorial
                      register; ER does the same on long neighborhood names. */}
                  <p className="text-[12px] font-medium text-ink dark:text-paper-200 leading-tight line-clamp-2">
                    {formatHeadline(ev.headline ?? meta.label)}
                  </p>
                  <p className="text-[10px] text-paper-500 dark:text-paper-600 font-mono italic mt-0.5 truncate">
                    {subtitleBits.join(' · ')}
                  </p>
                </div>
                <span className="text-[10px] font-mono text-paper-600 dark:text-paper-400 whitespace-nowrap tabular-nums flex-shrink-0 mt-[2px]">
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
                  <span className="text-[9px] font-mono uppercase tracking-[0.2em] text-paper-500/60 dark:text-paper-600 italic">
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
          <div className="text-paper-500 dark:text-paper-600 text-center italic py-6 text-[11px]">
            no events in window yet
          </div>
        )}
      </div>
    </MapSidebar>
  )
}
