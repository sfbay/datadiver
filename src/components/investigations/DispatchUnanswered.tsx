import { InvestigationCard, ErrorState } from './InvestigationCard'
import { useDispatchUnanswered } from '@/hooks/useDispatchUnanswered'

/** Color for an outcome label — earth-tone tier palette. */
function outcomeColor(label: string): string {
  if (label === 'Cancelled') return '#963e30'   // brick-600 — most severe
  if (label === 'Late arrival') return '#d47149' // terracotta-500 — warning
  return '#a8926a'                                // paper-500 — neutral
}

export default function DispatchUnanswered() {
  const { data, isLoading, error } = useDispatchUnanswered()

  const headline = data
    ? `${data.totalExceeded.toLocaleString()} times help took more than 10 minutes`
    : 'Loading dispatch data…'

  return (
    <InvestigationCard
      eyebrow="911 Dispatch · Unanswered"
      accentColor="#d47149"
      headline={headline}
      subtitle="Fire/EMS Dispatch · Calls exceeding 10-min response target"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── Big number ─────────────────────────────────────── */}
          <div>
            <span
              className="text-[28px] font-mono font-bold tabular-nums leading-none"
              style={{ color: '#e8c06b' }}
            >
              {data.totalExceeded.toLocaleString()}
            </span>

            {/* YoY line */}
            <div className="mt-1 text-[10px] font-mono text-slate-500 dark:text-slate-400">
              {Math.abs(data.yoyPct) < 2 ? (
                'About the same as last year'
              ) : data.yoyPct > 0 ? (
                <>
                  <span style={{ color: '#d17566' }}>
                    ▲ {Math.round(data.yoyPct)}% more
                  </span>
                  {' than last year'}
                </>
              ) : (
                <>
                  <span style={{ color: '#9db87a' }}>
                    ▼ {Math.abs(Math.round(data.yoyPct))}% fewer
                  </span>
                  {' than last year'}
                </>
              )}
            </div>
          </div>

          {/* ── Hourly heatstrip ───────────────────────────────── */}
          <div>
            <div className="text-[8px] font-mono text-slate-500 dark:text-slate-400 uppercase tracking-wider mb-1">
              When calls go unanswered
            </div>

            {/* 24 cells */}
            <div className="flex gap-[1px]">
              {data.hourlyDistribution.map((count, hour) => {
                const max = Math.max(...data.hourlyDistribution, 1)
                const intensity = count / max
                // Evening hours (17–22) use brick tint, others terracotta —
                // the same warm spectrum as the page's other danger surfaces.
                const isEvening = hour >= 17 && hour <= 22
                const bg = isEvening
                  ? `rgba(150, 62, 48, ${0.08 + intensity * 0.72})`   // brick-600
                  : `rgba(212, 113, 73, ${0.08 + intensity * 0.72})`  // terracotta-500

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
                  className="text-[7px] font-mono text-slate-500 dark:text-slate-500"
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
                  <span className="text-[9px] font-mono text-slate-500 dark:text-slate-400 leading-tight">
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
