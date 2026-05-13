import { useEffect, useRef } from 'react'
import type { NormalizedEvent, DatasetId } from '@/types/last48'
import type { KeyboardEvent } from 'react'

const DATASET_ABBREV: Record<DatasetId, { label: string; color: string }> = {
  '911-realtime':      { label: '911',   color: '#616a96' },
  'fire-ems-dispatch': { label: 'FIRE',  color: '#b85a33' },
  '311-cases':         { label: '311',   color: '#7a9954' },
  '911-historical':    { label: '911H',  color: '#5c9693' },
  'parking-revenue':   { label: 'PARK',  color: '#d4a435' },
  'police-incidents':  { label: 'SFPD',  color: '#963e30' },
}

function formatTime(receivedAt: number): string {
  return new Date(receivedAt).toLocaleTimeString('en-US', {
    hour: '2-digit', minute: '2-digit', hour12: false,
  })
}

function shortNeighborhood(name: string | undefined): string {
  if (!name) return ''
  const map: Record<string, string> = {
    'Mission': 'MIS',
    'Tenderloin': 'TL',
    'South of Market': 'SOMA',
    'Excelsior': 'EX',
    'Sunset/Parkside': 'SUN',
    'Bayview Hunters Point': 'BHP',
    'Visitacion Valley': 'VIS V',
    'Nob Hill': 'NB',
  }
  return map[name] ?? name.slice(0, 4).toUpperCase()
}

interface Props {
  events: NormalizedEvent[]
  selectedId?: string
  onSelect: (e: NormalizedEvent) => void
}

export default function FlowRail({ events, selectedId, onSelect }: Props) {
  const scrollRef    = useRef<HTMLDivElement>(null)
  const lastFirstId  = useRef<string | null>(null)
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
  // and append it; sort keeps chronological order.
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

  // ------------------------------------------------------------------
  // Keyboard navigation — listbox pattern (WAI-ARIA 1.1)
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
    // change (driven by selectedEvent in FlowMode). We catch it only to
    // preventDefault so it doesn't trigger native scroll or button activation.
  }

  return (
    <aside
      className="w-[clamp(180px,16vw,260px)] border-l border-paper-200/40 dark:border-espresso-700 dark:bg-espresso-950/60 flex flex-col"
      aria-label="Recent events"
    >
      <div className="px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800">
        <h2 className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          FRESHEST
        </h2>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5 tabular-nums">
          {events.length} events · 48h window
        </p>
      </div>

      <div
        ref={scrollRef}
        role="listbox"
        aria-label="48-hour event log"
        aria-activedescendant={selectedId ? `flow-row-${selectedId}` : undefined}
        tabIndex={0}
        onKeyDown={handleKeyDown}
        className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ochre-500 focus-visible:ring-inset"
      >
        {limited.map((ev) => {
          const meta  = DATASET_ABBREV[ev.datasetId]
          const isSel = ev.id === selectedId

          // Row styling emulates the EmergencyResponse sidebar pattern:
          // soft ochre tint + ring on selected (vs aggressive cream
          // inversion). py-2 px-3 rounded-lg matches the ER row chrome
          // so the rails feel like siblings across the app.
          //
          // role="option" + aria-selected: WAI-ARIA listbox semantics.
          // <button> is replaced with <div role="option"> because using
          // <button> inside role="listbox" produces invalid ARIA markup.
          return (
            <div
              key={ev.id}
              id={`flow-row-${ev.id}`}
              role="option"
              aria-selected={isSel}
              ref={isSel ? selectedRowRef : undefined}
              onClick={() => onSelect(ev)}
              className={`
                relative text-left py-2 px-3 rounded-lg font-mono text-[10px]
                leading-tight cursor-pointer transition-all duration-200
                ${isSel
                  ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30 text-paper-200 dark:text-paper-200'
                  : 'text-paper-700 dark:text-paper-400 hover:bg-white/80 dark:hover:bg-white/[0.04]'}
              `}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="tabular-nums text-paper-500 dark:text-paper-600">
                  {formatTime(ev.receivedAt)}
                </span>
                <span
                  className="font-bold tracking-wider"
                  style={{ color: meta.color }}
                >
                  {meta.label}
                </span>
                {ev.neighborhood && (
                  <span className="text-ochre-700 dark:text-ochre-500">
                    {shortNeighborhood(ev.neighborhood)}
                  </span>
                )}
              </div>
              {ev.headline && (
                <div className={`truncate mt-0.5 leading-tight ${isSel ? 'text-paper-300' : 'text-paper-700 dark:text-paper-400'}`}>
                  {ev.headline}
                </div>
              )}
            </div>
          )
        })}
        {events.length === 0 && (
          <div className="text-paper-500 dark:text-paper-600 text-center italic py-6">
            no events in window yet
          </div>
        )}
      </div>
    </aside>
  )
}
