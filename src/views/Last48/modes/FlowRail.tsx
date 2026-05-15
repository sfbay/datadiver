import { useEffect, useRef, Fragment } from 'react'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import type { KeyboardEvent } from 'react'
import MapSidebar from '@/components/layout/MapSidebar'
import { toSentenceCase, formatApTime } from '@/utils/format'

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

  // Spec cap: 50 most-recent rows. BUT — if the selected event is older
  // than the 50 most recent (the map shows thousands of events; a click
  // can land anywhere in the 48h window), we MUST also render the
  // selected event or the rail can't show the inversion at all. Find
  // the selected event in the full buffer if it's outside the top 50
  // and append it; sort keeps chronological order. A divider rendered
  // above this out-of-sequence row tells the reader why it appears
  // below the recent stream.
  const top50 = events.slice(0, 50)
  const selectedInTop = selectedId
    ? top50.some((e) => e.id === selectedId)
    : true
  const selectedOutsideTop =
    !selectedInTop && selectedId
      ? events.find((e) => e.id === selectedId) ?? null
      : null
  const limited = selectedOutsideTop
    ? [...top50, selectedOutsideTop].sort((a, b) => b.receivedAt - a.receivedAt)
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
      {/* Subtle header — follows EmergencyResponse's "BY NEIGHBORHOOD" register:
          mono small-caps label + thin right divider, count line below in italic. */}
      <div className="sticky top-0 z-10 px-4 pt-4 pb-3 flex-shrink-0 bg-paper-50/95 dark:bg-espresso-950/95 backdrop-blur-sm border-b border-paper-200/30 dark:border-espresso-800">
        <div className="flex items-center gap-2">
          <p className="text-[9px] font-mono uppercase tracking-[0.2em] text-paper-500/70 dark:text-paper-600">
            Freshest
          </p>
          <div className="flex-1 h-[1px] bg-paper-200/40 dark:bg-white/[0.04]" />
        </div>
        <p className="text-[10px] text-paper-500 dark:text-paper-600 italic mt-1 tabular-nums">
          {events.length} events &middot; 48h window
          {withheldCount > 0 && ` · ${withheldCount} location-withheld`}
        </p>
      </div>

      <div className="px-2 py-2 flex flex-col gap-0.5">
        {limited.map((ev, idx) => {
          const meta = DATASET_LABEL[ev.datasetId]
          const isSel = ev.id === selectedId
          const isOutOfSequence = selectedOutsideTop != null && ev.id === selectedOutsideTop.id
          const hasCoords = ev.longitude != null && ev.latitude != null

          // role="option" + aria-selected: WAI-ARIA listbox semantics.
          // <button> would produce invalid ARIA inside role="listbox".
          // Visual treatment emulates EmergencyResponse: body-font name +
          // italic mono subtitle + small pigment dot + AP-style time.
          const subtitleBits: string[] = [meta.label]
          if (hasCoords && ev.neighborhood) subtitleBits.push(ev.neighborhood)
          if (!hasCoords) subtitleBits.push('location withheld')
          if (ev.priority === 'A') subtitleBits.push('Priority A')

          const row = (
            <div
              key={ev.id}
              id={`flow-row-${ev.id}`}
              role="option"
              aria-selected={isSel}
              ref={isSel ? selectedRowRef : undefined}
              onClick={() => onSelect(ev)}
              className={`
                relative py-2 px-3 rounded-lg cursor-pointer transition-all duration-200
                ${!hasCoords ? 'opacity-70' : ''}
                ${isSel
                  ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30'
                  : 'hover:bg-paper-100/50 dark:hover:bg-white/[0.04]'}
              `}
            >
              <div className="flex items-center justify-between gap-2">
                <div className="min-w-0 flex-1">
                  <p className="text-[12px] font-medium text-ink dark:text-paper-200 truncate leading-tight">
                    {toSentenceCase(ev.headline ?? meta.label)}
                  </p>
                  <p className="text-[10px] text-paper-500 dark:text-paper-600 font-mono italic mt-0.5 truncate">
                    {subtitleBits.join(' · ')}
                  </p>
                </div>
                <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                  <div
                    className="w-1.5 h-1.5 rounded-full flex-shrink-0"
                    style={{ backgroundColor: meta.color }}
                  />
                  <span className="text-[11px] font-mono text-paper-700 dark:text-paper-300 whitespace-nowrap tabular-nums">
                    {formatApTime(ev.receivedAt)}
                  </span>
                </div>
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
