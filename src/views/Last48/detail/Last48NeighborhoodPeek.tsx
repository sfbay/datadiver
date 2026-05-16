// src/views/Last48/detail/Last48NeighborhoodPeek.tsx
//
// HOTSPOTS click target — diagnoses an anomaly rather than just naming
// it. Shows per-dataset z-score breakdown, top contributing events.

import type { AnomalyResult, NormalizedEvent, DatasetId } from '@/types/last48'

const DATASET_LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases':         '311',
}

function zColor(z: number): string {
  if (z >= 1.5)  return '#963e30'
  if (z >= 0.5)  return '#d47149'
  if (z >= -0.5) return '#7a5f42'
  if (z >= -1.5) return '#a8926a'
  return '#a8926a'
}

interface Props {
  neighborhood: string
  anomalies: AnomalyResult[]
  events: NormalizedEvent[]
  onClose: () => void
}

export default function Last48NeighborhoodPeek({ neighborhood, anomalies, events, onClose }: Props) {
  const overallZ = anomalies.length > 0
    ? anomalies.reduce((s, a) => s + a.zScore, 0) / anomalies.length
    : 0

  const isAbove = overallZ >= 0
  const summaryLine = isAbove ? 'unusual activity in the last 48 hours' : 'below baseline activity in the last 48 hours'

  // Compute max |z| for the bar width scaling
  const maxAbsZ = Math.max(2, ...anomalies.map((a) => Math.abs(a.zScore)))

  // Top contributing events (5 most recent in this neighborhood)
  const topEvents = events.slice(0, 5)

  return (
    <aside className="absolute top-0 right-0 w-[clamp(280px,28vw,400px)] h-full bg-paper-50 dark:bg-espresso-900 border-l border-paper-300 dark:border-espresso-700 z-30 flex flex-col">
      <button
        type="button"
        onClick={onClose}
        className="self-end p-3 text-paper-500 hover:text-paper-300 text-lg leading-none"
        aria-label="Close panel"
      >
        ✕
      </button>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
        {/* Eyebrow */}
        <div className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500">
          ── NEIGHBORHOOD ANOMALY <span style={{ color: zColor(overallZ) }}>{overallZ >= 0 ? '+' : ''}{overallZ.toFixed(1)}σ</span>
        </div>

        {/* Headline */}
        <div>
          <h2 className="font-display text-xl text-ink dark:text-white leading-tight">{neighborhood}</h2>
          <p className="font-mono text-[11px] text-paper-700 dark:text-paper-400 mt-1 italic">
            {summaryLine}
          </p>
        </div>

        {/* Per-dataset breakdown */}
        <section>
          <h3 className="font-mono text-[10px] tracking-wider text-paper-600 dark:text-paper-500 mb-2">
            PER-DATASET BREAKDOWN
          </h3>
          <ul className="flex flex-col gap-1.5 font-mono text-[10px]">
            {anomalies.map((a) => {
              const widthPct = Math.min(100, (Math.abs(a.zScore) / maxAbsZ) * 100)
              const label = a.datasetId === 'combined' ? 'combined' : DATASET_LABELS[a.datasetId as DatasetId] ?? a.datasetId
              return (
                <li key={String(a.datasetId)} className="flex items-center gap-2">
                  <span className="w-16 text-paper-700 dark:text-paper-400 truncate">{label}</span>
                  <span className="w-12 text-right tabular-nums" style={{ color: zColor(a.zScore) }}>
                    {a.zScore >= 0 ? '+' : ''}{a.zScore.toFixed(1)}σ
                  </span>
                  <span className="flex-1 h-2 bg-paper-200/60 dark:bg-espresso-800 rounded">
                    <span
                      className="block h-full rounded"
                      style={{ width: `${widthPct}%`, backgroundColor: zColor(a.zScore) }}
                    />
                  </span>
                </li>
              )
            })}
            {anomalies.length === 0 && (
              <li className="text-paper-500 italic">no per-dataset anomalies</li>
            )}
          </ul>
        </section>

        {/* Top contributing events */}
        <section>
          <h3 className="font-mono text-[10px] tracking-wider text-paper-600 dark:text-paper-500 mb-2">
            TOP CONTRIBUTING EVENTS
          </h3>
          <ul className="flex flex-col gap-1 font-mono text-[10px]">
            {topEvents.map((ev) => (
              <li key={ev.id} className="flex items-baseline gap-2 border-b border-paper-200/40 dark:border-espresso-800 pb-1">
                <span className="text-paper-500 dark:text-paper-600 tabular-nums">
                  {new Date(ev.receivedAt).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
                </span>
                <span className="text-paper-800 dark:text-paper-300 flex-1 truncate">{ev.headline ?? ev.callType ?? 'event'}</span>
              </li>
            ))}
            {topEvents.length === 0 && (
              <li className="text-paper-500 italic">no events to show</li>
            )}
          </ul>
        </section>
      </div>

      <div className="border-t border-paper-200/40 dark:border-espresso-700 px-5 py-4 bg-paper-100/60 dark:bg-espresso-950/60">
        <a
          href={`/?n=${encodeURIComponent(neighborhood)}`}
          className="block font-mono text-[12px] text-ochre-700 dark:text-ochre-400 hover:text-ochre-500 dark:hover:text-ochre-300 tracking-wider"
        >
          See {neighborhood} across SF →
        </a>
        <p className="text-[10px] text-paper-500 dark:text-paper-600 mt-1 italic leading-snug">
          Switch to a neighborhood-focused view across all DataDiver tools.
        </p>
      </div>
    </aside>
  )
}
