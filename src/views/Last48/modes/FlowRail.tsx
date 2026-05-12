import { useEffect, useRef } from 'react'
import type { NormalizedEvent, DatasetId } from '@/types/last48'

const DATASET_ABBREV: Record<DatasetId, { label: string; color: string }> = {
  '911-realtime':      { label: '911',   color: '#616a96' },
  'fire-ems-dispatch': { label: 'FIRE',  color: '#b85a33' },
  '311-cases':         { label: '311',   color: '#d47149' },
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
  // Compact common SF neighborhoods to 3-5 char codes
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
  const scrollRef = useRef<HTMLDivElement>(null)
  const lastFirstId = useRef<string | null>(null)

  // When a new event appears at the top, scroll the rail to the top
  useEffect(() => {
    const firstId = events[0]?.id ?? null
    if (firstId && firstId !== lastFirstId.current && scrollRef.current) {
      scrollRef.current.scrollTop = 0
    }
    lastFirstId.current = firstId
  }, [events])

  const limited = events.slice(0, 80)

  return (
    <aside
      className="w-[clamp(180px,16vw,260px)] border-l border-paper-200/40 dark:border-espresso-700 bg-paper-50/40 dark:bg-espresso-950/60 flex flex-col"
      aria-label="Recent events"
    >
      <div className="px-3 pt-3 pb-2 border-b border-paper-200/40 dark:border-espresso-800">
        <h2 className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          FRESHEST
        </h2>
        <p className="font-mono text-[9px] text-paper-500 dark:text-paper-600 mt-0.5">
          {events.length} events · 48h window
        </p>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-2 py-2 flex flex-col gap-1">
        {limited.map((ev) => {
          const meta = DATASET_ABBREV[ev.datasetId]
          const isSel = ev.id === selectedId
          return (
            <button
              key={ev.id}
              type="button"
              onClick={() => onSelect(ev)}
              className={`
                text-left px-2 py-1.5 rounded font-mono text-[10px]
                ${isSel
                  ? 'bg-ochre-500/20 ring-1 ring-ochre-500'
                  : 'hover:bg-paper-200/40 dark:hover:bg-espresso-800/60'}
              `}
              aria-pressed={isSel}
            >
              <div className="flex items-baseline gap-1.5">
                <span className="text-paper-500 dark:text-paper-600 tabular-nums">{formatTime(ev.receivedAt)}</span>
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
                <div className="text-paper-700 dark:text-paper-400 truncate mt-0.5 leading-tight">
                  {ev.headline}
                </div>
              )}
            </button>
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
