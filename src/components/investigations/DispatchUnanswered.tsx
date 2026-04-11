import { InvestigationCard } from './InvestigationCard'
import { useDispatchUnanswered } from '@/hooks/useDispatchUnanswered'

/** Color for an outcome label */
function outcomeColor(label: string): string {
  if (label === 'Cancelled') return '#ef4444'
  if (label === 'Late arrival') return '#f97316'
  return '#64748b'
}

export default function DispatchUnanswered() {
  const { data, isLoading, error } = useDispatchUnanswered()

  const headline = data
    ? `${data.totalExceeded.toLocaleString()} times help took more than 10 minutes`
    : 'Loading dispatch data…'

  return (
    <InvestigationCard
      eyebrow="911 Dispatch · Unanswered"
      accentColor="#f97316"
      headline={headline}
      subtitle="Fire/EMS Dispatch · Calls exceeding 10-min response target"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <p className="text-[9px] font-mono text-red-400 py-2">{error}</p>
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── Big number ─────────────────────────────────────── */}
          <div>
            <span className="text-[28px] font-mono font-bold text-amber-200 tabular-nums leading-none">
              {data.totalExceeded.toLocaleString()}
            </span>

            {/* YoY line */}
            <div className="mt-1 text-[10px] font-mono text-slate-500">
              {Math.abs(data.yoyPct) < 2 ? (
                'About the same as last year'
              ) : data.yoyPct > 0 ? (
                <>
                  <span className="text-red-400">
                    ▲ {Math.round(data.yoyPct)}% more
                  </span>
                  {' than last year'}
                </>
              ) : (
                <>
                  <span className="text-green-400">
                    ▼ {Math.abs(Math.round(data.yoyPct))}% fewer
                  </span>
                  {' than last year'}
                </>
              )}
            </div>
          </div>

          {/* ── Hourly heatstrip ───────────────────────────────── */}
          <div>
            <div className="text-[7px] font-mono text-slate-600 uppercase tracking-wider mb-1">
              When calls go unanswered
            </div>

            {/* 24 cells */}
            <div className="flex gap-[1px]">
              {data.hourlyDistribution.map((count, hour) => {
                const max = Math.max(...data.hourlyDistribution, 1)
                const intensity = count / max
                // Evening hours (17–22) use red tint, others orange
                const isEvening = hour >= 17 && hour <= 22
                const bg = isEvening
                  ? `rgba(239,68,68,${0.08 + intensity * 0.72})`
                  : `rgba(249,115,22,${0.08 + intensity * 0.72})`

                return (
                  <div
                    key={hour}
                    className="flex-1 h-4 rounded-[1px]"
                    style={{ backgroundColor: bg }}
                    title={`${hour}:00 — ${count.toLocaleString()} calls`}
                  />
                )
              })}
            </div>

            {/* Hour axis labels */}
            <div className="flex justify-between mt-0.5">
              {['12am', '6am', '12pm', '6pm', '12am'].map((label, i) => (
                <span
                  key={i}
                  className="text-[6px] font-mono text-slate-700"
                >
                  {label}
                </span>
              ))}
            </div>
          </div>

          {/* ── Outcome breakdown ──────────────────────────────── */}
          {data.outcomes.length > 0 && (
            <div className="flex gap-3">
              {data.outcomes.slice(0, 3).map((outcome) => (
                <div key={outcome.label} className="flex flex-col gap-0.5">
                  <span
                    className="text-[13px] font-mono font-bold tabular-nums leading-none"
                    style={{ color: outcomeColor(outcome.label) }}
                  >
                    {Math.round(outcome.pct)}%
                  </span>
                  <span className="text-[8px] font-mono text-slate-500 leading-tight">
                    {outcome.label}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}
    </InvestigationCard>
  )
}
