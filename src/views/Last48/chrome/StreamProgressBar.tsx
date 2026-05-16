// src/views/Last48/chrome/StreamProgressBar.tsx
//
// Slim top progress band driven by useLast48Window's per-stream initial-load
// state. Mirrors MapProgressBar's visual language but counts streams, not
// queries.

import type { DatasetId } from '@/types/last48'

interface Props {
  initialLoadedByDataset: Record<DatasetId, boolean>
  enabled: DatasetId[]
  color?: string
}

export default function StreamProgressBar({ initialLoadedByDataset, enabled, color = '#7a9954' }: Props) {
  const total = enabled.length
  const completed = enabled.filter((id) => initialLoadedByDataset[id]).length
  const fraction = total > 0 ? completed / total : 0
  const active = completed < total

  if (!active) return null

  return (
    <div className={`absolute top-0 left-0 right-0 z-20 h-1 overflow-hidden transition-opacity duration-500 ${active ? 'opacity-100' : 'opacity-0'}`}>
      <div className="absolute inset-0" style={{ backgroundColor: `${color}10` }} />
      <div
        className="absolute inset-y-0 left-0 transition-all duration-700 ease-out"
        style={{
          width: `${Math.max(fraction * 100, active ? 3 : 0)}%`,
          background: `linear-gradient(to right, ${color}60, ${color})`,
          boxShadow: `0 0 12px ${color}40`,
        }}
      />
      {active && total > 0 && (
        <div className="absolute top-1.5 right-2">
          <span className="text-[9px] font-mono tabular-nums text-paper-500 dark:text-paper-600">
            {completed} / {total}
          </span>
        </div>
      )}
    </div>
  )
}
