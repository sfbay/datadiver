import { InvestigationCard, ErrorState } from './InvestigationCard'
import { useVisionZero } from '@/hooks/useVisionZero'

/** AP-style date: months with ≤5 letters spelled out, others abbreviated
 *  with a period. (House convention — see feedback_ap_style_dates.) */
const AP_MONTHS = [
  'Jan.', 'Feb.', 'March', 'April', 'May', 'June',
  'July', 'Aug.', 'Sept.', 'Oct.', 'Nov.', 'Dec.',
]
function formatApDate(iso: string): string {
  const [, m, d] = iso.split('-').map(Number)
  return `${AP_MONTHS[m - 1]} ${d}`
}

/**
 * Vision Zero counter — deliberately the most somber card on the page.
 * No playful elements, no Dana adjacency (mascot placement rules), brick
 * accent, and the publish-lag caveat is part of the design: an empty
 * recent window is reporting latency, not safer streets.
 */
export default function VisionZeroCounter() {
  const { data, isLoading, error } = useVisionZero()

  const headline = data
    ? `${data.killed} ${data.killed === 1 ? 'life' : 'lives'} lost on SF streets this year`
    : 'Loading crash data…'

  return (
    <InvestigationCard
      eyebrow="Vision Zero · Severe & Fatal"
      accentColor="#963e30"
      headline={headline}
      subtitle={
        data
          ? `Traffic crashes · Jan. 1 – ${formatApDate(data.dataThrough)}, ${data.year}`
          : 'Traffic crashes · severe & fatal'
      }
      explorePath="/traffic-safety"
      sourceName="TransBASE Crash Data"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── The number that matters ──────────────────────────── */}
          <div className="flex items-baseline gap-4">
            <div>
              <span
                className="text-[28px] font-mono font-bold tabular-nums leading-none"
                style={{ color: '#963e30' }}
              >
                {data.killed}
              </span>
              <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                killed
              </div>
            </div>
            <div>
              <span className="text-[18px] font-mono font-bold tabular-nums leading-none text-ink dark:text-paper-200">
                {data.severelyInjured}
              </span>
              <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                severely injured
              </div>
            </div>
            <div>
              <span className="text-[18px] font-mono font-bold tabular-nums leading-none text-ink dark:text-paper-200">
                {data.crashes}
              </span>
              <div className="text-[9px] font-mono uppercase tracking-wider text-slate-500 dark:text-slate-400 mt-1">
                crashes
              </div>
            </div>
          </div>

          {/* ── YoY, matched windows ─────────────────────────────── */}
          <div className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
            {Math.abs(data.yoyPct) < 2 ? (
              `About the same as ${data.year - 1} over the same months`
            ) : data.yoyPct > 0 ? (
              <>
                <span style={{ color: '#d17566' }}>
                  ▲ {Math.round(data.yoyPct)}% more
                </span>
                {` severe crashes than ${data.year - 1} over the same months`}
              </>
            ) : (
              <>
                <span style={{ color: '#9db87a' }}>
                  ▼ {Math.abs(Math.round(data.yoyPct))}% fewer
                </span>
                {` severe crashes than ${data.year - 1} over the same months`}
              </>
            )}
          </div>

          {/* ── The honesty line — lag is part of the story. Two lags:
              publish (~4-6 wks) AND fatality coding (longer — deaths are
              upgraded from injury records after certification, so recent
              months revise upward). See docs/data-insights.md. ─────── */}
          <p className="text-[9px] font-mono text-slate-500 dark:text-slate-500">
            Reports lag 4–6 weeks; fatality coding longer — recent months revise
            upward · data through {formatApDate(data.dataThrough)}
          </p>
        </div>
      ) : null}
    </InvestigationCard>
  )
}
