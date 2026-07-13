// src/views/Last48/detail/Last48NeighborhoodPeek.tsx
//
// Anomaly-choropleth click target — diagnoses a deviation rather than just
// naming it. Speaks the wire's language (roadmap item 6, PR 2): the eyebrow
// carries a tier phrase from pulsePhrase.combinedDeviation instead of a raw
// σ, and the per-stream rows show the concrete comparison the data CAN back
// — this window's count vs the rounded usual. Precise z values survive in
// each row's title attribute for the reader who hovers for the machinery.

import type { AnomalyResult, NormalizedEvent, DatasetId } from '@/types/last48'
import { combinedDeviation, roundNice } from '@/lib/pulse/pulsePhrase'
import { signalColor } from '@/views/Pulse/SignalGlyph'
import { combineZ } from '../modes/anomalyRamp'

const DATASET_LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases':         '311',
}

/** Deviation color via the Pulse signal palette; muted when near usual. */
function devColor(z: number): string {
  const d = combinedDeviation(z)
  return d.near ? '#7a5f42' : signalColor(d.signalType, d.magnitude)
}

interface Props {
  neighborhood: string
  anomalies: AnomalyResult[]
  events: NormalizedEvent[]
  onClose: () => void
}

export default function Last48NeighborhoodPeek({ neighborhood, anomalies, events, onClose }: Props) {
  // Stouffer-combined, matching the map fill + rail (anomalyRamp.combineZ) —
  // the eyebrow must agree with the color the reader just clicked.
  const overallZ = combineZ(anomalies.map((a) => a.zScore))
  const overall = combinedDeviation(overallZ)
  const summaryLine = `${overall.spoken} over the last 48 hours`

  // Compute max |z| for the bar width scaling
  const maxAbsZ = Math.max(2, ...anomalies.map((a) => Math.abs(a.zScore)))

  // Top contributing events (5 most recent in this neighborhood)
  const topEvents = events.slice(0, 5)

  return (
    <aside className="absolute top-0 right-0 w-[clamp(280px,28vw,400px)] h-full bg-paper-50 dark:bg-espresso-900 border-l border-paper-300 dark:border-espresso-700 z-30 flex flex-col">
      <button
        type="button"
        onClick={onClose}
        className="self-end p-3 text-paper-500 hover:text-paper-700 dark:hover:text-paper-300 text-lg leading-none"
        aria-label="Close panel"
      >
        ✕
      </button>

      <div className="flex-1 overflow-y-auto px-5 pb-4 flex flex-col gap-4">
        {/* Eyebrow — tier phrase, not a σ; the precise combined value rides
            the title attribute for the hover-for-machinery reader. */}
        <div
          className="font-mono text-[10px] tracking-widest text-paper-600 dark:text-paper-500"
          title={`combined score ${overallZ >= 0 ? '+' : ''}${overallZ.toFixed(1)}σ`}
        >
          ── NEIGHBORHOOD SIGNAL <span className="uppercase" style={{ color: devColor(overallZ) }}>{overall.short}</span>
        </div>

        {/* Headline */}
        <div>
          <h2 className="font-display text-xl text-paper-900 dark:text-white leading-tight">{neighborhood}</h2>
          <p className="font-mono text-[11px] text-paper-700 dark:text-paper-400 mt-1 italic">
            {summaryLine}
          </p>
        </div>

        {/* Per-stream breakdown — the concrete comparison each stream's data
            can back: this window's count vs the rounded usual. */}
        <section>
          <h3 className="font-mono text-[10px] tracking-wider text-paper-600 dark:text-paper-500 mb-2">
            BY STREAM · THIS 48H VS USUAL
          </h3>
          <ul className="flex flex-col gap-1.5 font-mono text-[10px]">
            {anomalies.map((a) => {
              const widthPct = Math.min(100, (Math.abs(a.zScore) / maxAbsZ) * 100)
              const label = a.datasetId === 'combined' ? 'combined' : DATASET_LABELS[a.datasetId as DatasetId] ?? a.datasetId
              const color = devColor(a.zScore)
              return (
                <li
                  key={String(a.datasetId)}
                  className="flex items-center gap-2"
                  title={`${a.zScore >= 0 ? '+' : ''}${a.zScore.toFixed(1)}σ vs its 12-week baseline`}
                >
                  <span className="w-16 text-paper-700 dark:text-paper-400 truncate">{label}</span>
                  <span className="w-24 text-right tabular-nums whitespace-nowrap">
                    <span style={{ color }}>{a.count48h}</span>
                    <span className="text-paper-500 dark:text-paper-600"> · usual ≈ {roundNice(a.baselineMean)}</span>
                  </span>
                  <span className="flex-1 h-2 bg-paper-200/60 dark:bg-espresso-800 rounded">
                    <span
                      className="block h-full rounded"
                      style={{ width: `${widthPct}%`, backgroundColor: color }}
                    />
                  </span>
                </li>
              )
            })}
            {anomalies.length === 0 && (
              <li className="text-paper-500 italic">no per-stream comparisons yet</li>
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
