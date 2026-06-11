import { InvestigationCard, ErrorState } from './InvestigationCard'
import { useResponseEquity } from '@/hooks/useResponseEquity'

/** Truncate a neighborhood name to maxLen chars with ellipsis */
function truncateName(name: string, maxLen: number): string {
  return name.length > maxLen ? name.slice(0, maxLen) + '…' : name
}

export default function ResponseEquity() {
  const { data, isLoading, error } = useResponseEquity()

  const headline = data
    ? `Help takes ${data.gapMultiplier.toFixed(1)}× longer in ${data.worst.name}`
    : 'Loading response time data…'

  return (
    <InvestigationCard
      eyebrow="911 Response · The Equity Gap"
      accentColor="#b85a33"
      headline={headline}
      subtitle="Fire/EMS Dispatch · Average response time by neighborhood"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <ErrorState error={error} />
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── Three equity bars (best / avg / worst) ──────────
              Earth-tone tier palette: moss for best, paper-grey neutral
              for cityAvg, brick for worst. Matches the heatmap scale
              tokens (--scale-fast / --scale-slow / --scale-critical). */}
          <div className="flex flex-col gap-2">
            {[
              {
                entry: data.best,
                labelColor: '#9db87a',  // moss-400
                valueColor: '#7a9954',  // moss-500
                barFrom: '#445c2b',     // moss-700
                barTo: '#9db87a',       // moss-400
              },
              {
                entry: data.cityAvg,
                labelColor: '#a8926a',  // paper-500
                valueColor: '#a8926a',  // paper-500
                barFrom: '#3a2a1e',     // espresso-700
                barTo: '#a8926a',       // paper-500
              },
              {
                entry: data.worst,
                labelColor: '#d17566',  // brick-400
                valueColor: '#b85545',  // brick-500
                barFrom: '#6f2b20',     // brick-700
                barTo: '#d17566',       // brick-400
              },
            ].map(({ entry, labelColor, valueColor, barFrom, barTo }) => {
              const maxSeconds = data.worst.medianSeconds
              const widthPct = maxSeconds > 0
                ? (entry.medianSeconds / maxSeconds) * 100
                : 0

              return (
                <div key={entry.name} className="flex items-center gap-2">
                  {/* Label */}
                  <span
                    className="text-[9px] font-mono text-right flex-shrink-0 truncate"
                    style={{ width: 72, color: labelColor }}
                    title={entry.name}
                  >
                    {truncateName(entry.name, 14)}
                  </span>

                  {/* Bar track */}
                  <div className="flex-1 h-[5px] rounded-full bg-white/5 overflow-hidden">
                    <div
                      className="h-full rounded-full"
                      style={{
                        width: `${widthPct}%`,
                        background: `linear-gradient(to right, ${barFrom}, ${barTo})`,
                        transition: 'width 0.6s ease-out',
                      }}
                    />
                  </div>

                  {/* Value */}
                  <span
                    className="text-[14px] font-mono font-bold flex-shrink-0"
                    style={{ color: valueColor, minWidth: 36, textAlign: 'right' }}
                  >
                    {entry.medianFormatted}
                  </span>
                </div>
              )
            })}
          </div>

          {/* ── Gap callout ───────────────────────────────────── */}
          <div
            className="rounded-md px-3 py-2"
            style={{ backgroundColor: 'rgba(150, 62, 48, 0.10)' }}
          >
            <span className="text-[12px] font-mono font-bold" style={{ color: '#d17566' }}>
              {data.gapMultiplier.toFixed(1)}×
            </span>{' '}
            <span className="text-[10px] font-mono text-slate-500 dark:text-slate-400">
              slower — the gap between fastest and slowest neighborhoods
            </span>
          </div>

          {/* ── Mini heatgrid ─────────────────────────────────── */}
          {data.heatgrid.length > 0 && (
            <div
              className="overflow-x-auto"
              style={{
                display: 'grid',
                gridTemplateColumns: `50px repeat(${data.heatgridNeighborhoods.length}, 1fr)`,
                rowGap: 2,
                columnGap: 2,
              }}
            >
              {/* Header row: empty corner + neighborhood names */}
              <div />
              {data.heatgridNeighborhoods.map((nh) => (
                <div
                  key={nh}
                  className="text-[7px] font-mono text-slate-600 text-center truncate"
                  title={nh}
                >
                  {nh.slice(0, 5)}
                </div>
              ))}

              {/* Data rows: call type label + cells */}
              {(() => {
                // Compute min/max across all heatgrid cells for normalization
                const allSeconds = data.heatgrid.map((c) => c.medianSeconds).filter((s) => s > 0)
                const minSec = allSeconds.length ? Math.min(...allSeconds) : 0
                const maxSec = allSeconds.length ? Math.max(...allSeconds) : 1
                const range = maxSec - minSec || 1

                return data.heatgridCallTypes.map((ct) => (
                  <>
                    {/* Row header */}
                    <div
                      key={`label-${ct}`}
                      className="text-[7px] font-mono text-slate-600 truncate flex items-center"
                      title={ct}
                    >
                      {ct.slice(0, 8)}
                    </div>

                    {/* Cells */}
                    {data.heatgridNeighborhoods.map((nh) => {
                      const cell = data.heatgrid.find(
                        (c) => c.neighborhood === nh && c.callType === ct
                      )
                      const intensity = cell
                        ? (cell.medianSeconds - minSec) / range
                        : null

                      let bg = 'transparent'
                      let backgroundImage: string | undefined
                      let title: string

                      if (intensity !== null && cell) {
                        if (intensity < 0.35) {
                          // moss-500 (#7a9954) — fast tier
                          bg = `rgba(122, 153, 84, ${0.15 + intensity * 0.5})`
                        } else if (intensity < 0.6) {
                          // ochre-500 (#d4a435) — ok tier
                          bg = `rgba(212, 164, 53, ${0.2 + (intensity - 0.35) * 0.6})`
                        } else {
                          // brick-600 (#963e30) — slow / critical tier
                          bg = `rgba(150, 62, 48, ${0.25 + (intensity - 0.6) * 0.7})`
                        }
                        title = `${nh} / ${ct}: ${cell.medianFormatted}`
                      } else {
                        // Insufficient data: diagonal-stripe pattern in paper-500
                        // signals "suppressed for sample size" — visually distinct
                        // from a colored cell (data present) and from a blank
                        // background (no neighborhood selected).
                        bg = 'rgba(168, 146, 106, 0.04)'
                        backgroundImage =
                          'repeating-linear-gradient(45deg, rgba(168, 146, 106, 0.22) 0 1px, transparent 1px 5px)'
                        title = `${nh} / ${ct}: fewer than 20 calls in this category — suppressed to avoid unreliable averages`
                      }

                      return (
                        <div
                          key={`${ct}-${nh}`}
                          className="rounded-sm"
                          style={{
                            height: 14,
                            backgroundColor: bg,
                            backgroundImage,
                          }}
                          title={title}
                        />
                      )
                    })}
                  </>
                ))
              })()}
            </div>
          )}

          {/* Legend: explain the suppression pattern. Editorial principle —
              never hide insufficient data; surface it with explicit rationale. */}
          {data.heatgrid.length > 0 && data.heatgrid.length < (data.heatgridNeighborhoods.length * data.heatgridCallTypes.length) && (
            <div className="flex items-center gap-1.5 mt-2 text-[8px] font-mono text-slate-500">
              <span
                className="inline-block w-3 h-2 rounded-sm flex-shrink-0"
                style={{
                  backgroundColor: 'rgba(168, 146, 106, 0.04)',
                  backgroundImage:
                    'repeating-linear-gradient(45deg, rgba(168, 146, 106, 0.22) 0 1px, transparent 1px 5px)',
                }}
              />
              <span>n &lt; 20 — sample suppressed for reliability</span>
            </div>
          )}
        </div>
      ) : null}
    </InvestigationCard>
  )
}
