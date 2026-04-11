import { InvestigationCard } from './InvestigationCard'
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
      accentColor="#f59e0b"
      headline={headline}
      subtitle="Fire/EMS Dispatch · Average response time by neighborhood"
      explorePath="/emergency-response"
      sourceName="SFFD Dispatch Data"
      isLoading={isLoading || (!data && !error)}
    >
      {error ? (
        <p className="text-[9px] font-mono text-red-400 py-2">{error}</p>
      ) : data ? (
        <div className="flex flex-col gap-3">
          {/* ── Three equity bars ─────────────────────────────── */}
          <div className="flex flex-col gap-2">
            {[
              {
                entry: data.best,
                labelColor: '#86efac',
                valueColor: '#34d399',
                barFrom: '#166534',
                barTo: '#34d399',
              },
              {
                entry: data.cityAvg,
                labelColor: '#94a3b8',
                valueColor: '#94a3b8',
                barFrom: '#334155',
                barTo: '#94a3b8',
              },
              {
                entry: data.worst,
                labelColor: '#fca5a5',
                valueColor: '#f87171',
                barFrom: '#7f1d1d',
                barTo: '#f87171',
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
            style={{ backgroundColor: 'rgba(239,68,68,0.08)' }}
          >
            <span className="text-[12px] font-mono font-bold text-red-400">
              {data.gapMultiplier.toFixed(1)}×
            </span>{' '}
            <span className="text-[9px] font-mono text-slate-400">
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

                      let bg = 'rgba(255,255,255,0.03)'
                      if (intensity !== null) {
                        if (intensity < 0.35) {
                          bg = `rgba(16,185,129,${0.15 + intensity * 0.5})`   // green
                        } else if (intensity < 0.6) {
                          bg = `rgba(245,158,11,${0.2 + (intensity - 0.35) * 0.6})` // amber
                        } else {
                          bg = `rgba(239,68,68,${0.25 + (intensity - 0.6) * 0.7})`  // red
                        }
                      }

                      return (
                        <div
                          key={`${ct}-${nh}`}
                          className="rounded-sm"
                          style={{
                            height: 14,
                            backgroundColor: bg,
                          }}
                          title={cell ? `${nh} / ${ct}: ${cell.medianFormatted}` : `${nh} / ${ct}: no data`}
                        />
                      )
                    })}
                  </>
                ))
              })()}
            </div>
          )}
        </div>
      ) : null}
    </InvestigationCard>
  )
}
