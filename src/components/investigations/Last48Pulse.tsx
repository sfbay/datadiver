import { InvestigationCard, ErrorState } from './InvestigationCard'
import { useLast48Pulse } from '@/hooks/useLast48Pulse'
import { LAST48_DATASETS, type DatasetId } from '@/types/last48'

// Same pigment-per-stream identity as DatasetSuperChips / FlowMapLayer.
const PIGMENTS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',  // indigo
  'fire-ems-dispatch': '#b85a33',  // terracotta
  '311-cases':         '#7a9954',  // moss
}

const LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911 calls',
  'fire-ems-dispatch': 'Fire & EMS',
  '311-cases':         '311 reports',
}

export default function Last48Pulse() {
  const { data, isLoading, error } = useLast48Pulse()

  const headline = data
    ? `${data.total.toLocaleString()} events in the last 48 hours`
    : 'Listening to the city…'

  return (
    <InvestigationCard
      eyebrow="The Last 48 · Live Pulse"
      accentColor="#5c9693"
      headline={headline}
      subtitle="911 · Fire & EMS · 311 — three live streams, one window"
      explorePath="/live-feeds"
      sourceName="DataSF · Live streams"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── Stacked proportion bar — who owns the window ─────── */}
          <div className="flex h-3 rounded-sm overflow-hidden gap-[1px]">
            {LAST48_DATASETS.map((id) => {
              const share = data.total > 0 ? data.counts[id] / data.total : 0
              return (
                <div
                  key={id}
                  style={{
                    backgroundColor: PIGMENTS[id],
                    width: `${Math.max(share * 100, 1)}%`,
                    opacity: 0.85,
                  }}
                  title={`${LABELS[id]} — ${data.counts[id].toLocaleString()}`}
                />
              )
            })}
          </div>

          {/* ── Per-stream rows ──────────────────────────────────── */}
          <div className="flex flex-col gap-1.5">
            {LAST48_DATASETS.map((id) => (
              <div key={id} className="flex items-baseline gap-2">
                <span
                  className="w-1.5 h-1.5 rounded-full self-center flex-shrink-0"
                  style={{ backgroundColor: PIGMENTS[id] }}
                  aria-hidden
                />
                <span className="text-[10px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 w-24">
                  {LABELS[id]}
                </span>
                <span
                  className="text-[15px] font-mono font-bold tabular-nums leading-none"
                  style={{ color: PIGMENTS[id] }}
                >
                  {data.counts[id].toLocaleString()}
                </span>
                <span className="text-[9px] font-mono text-slate-500 dark:text-slate-500 tabular-nums ml-auto">
                  {(data.counts[id] / 48).toFixed(0)}/hr
                </span>
              </div>
            ))}
          </div>

          {/* Provenance — seeded counts are last-visit truth, not live. */}
          <p className="text-[9px] font-mono text-slate-500 dark:text-slate-500">
            {data.isLive
              ? 'Counted live from DataSF just now'
              : 'As of your last visit — refreshing…'}
          </p>
        </div>
      ) : null}
    </InvestigationCard>
  )
}
