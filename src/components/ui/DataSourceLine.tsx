// src/components/ui/DataSourceLine.tsx
import React from 'react'

interface DataSourceLineProps {
  dataset: string       // e.g., "American Community Survey 5-Year Estimates"
  source: string        // e.g., "U.S. Census Bureau"
  id?: string           // optional dataset ID
  caveats?: string[]    // optional known limitations
  vintage?: string      // e.g., "2020-2024"
  className?: string
}

export default function DataSourceLine({ dataset, source, id, caveats, vintage, className = '' }: DataSourceLineProps) {
  return (
    <div className={`text-[10px] text-slate-500 dark:text-slate-500 ${className}`}>
      <span>{dataset}</span>
      {vintage && <span> ({vintage})</span>}
      <span> · {source}</span>
      {id && <span> · {id}</span>}
      {caveats && caveats.length > 0 && (
        <div className="mt-0.5 text-amber-600/70 dark:text-amber-500/50">
          {caveats.map((c, i) => <div key={i}>⚠ {c}</div>)}
        </div>
      )}
    </div>
  )
}
