// src/components/ui/DataSourceLine.tsx

interface DataSourceLineProps {
  dataset: string       // e.g., "American Community Survey 5-Year Estimates"
  source: string        // e.g., "U.S. Census Bureau"
  id?: string           // optional dataset ID
  caveats?: string[]    // optional known limitations
  vintage?: string      // e.g., "2020-2024"
  dataAsOf?: string     // e.g., "Mar 20, 2026" — data freshness timestamp
  recordCount?: number  // e.g., 847 — number of records backing this view
  className?: string
}

export default function DataSourceLine({ dataset, source, id, caveats, vintage, dataAsOf, recordCount, className = '' }: DataSourceLineProps) {
  return (
    <div className={`text-micro text-slate-500 dark:text-slate-500 ${className}`}>
      <span>{dataset}</span>
      {vintage && <span> ({vintage})</span>}
      <span> · {source}</span>
      {id && <span> · {id}</span>}
      {dataAsOf && <span> · Data as of: {dataAsOf}</span>}
      {recordCount != null && recordCount > 0 && (
        <span> · Based on {recordCount.toLocaleString()} records</span>
      )}
      {caveats && caveats.length > 0 && (
        <div className="mt-0.5 text-ochre-600/70 dark:text-ochre-500/50">
          {caveats.map((c, i) => <div key={i}>⚠ {c}</div>)}
        </div>
      )}
    </div>
  )
}
