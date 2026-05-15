// src/views/Last48/chrome/LayerControls.tsx
//
// Replaces ModeToggle. Renders the composable layer controls:
//   - FLOW points on/off toggle
//   - Base-fill picker: None / Anomaly / Demographic
// Demographic surfaces the UnderlayPicker once selected.

import UnderlayPicker from '@/components/maps/UnderlayPicker'
import { UNDERLAY_PRESETS } from '@/utils/censusVariables'
import type { CensusVariable } from '@/types/census'

export type BaseFill = 'none' | 'anomaly' | 'demographic'

interface Props {
  pointsOn: boolean
  onPointsToggle: (next: boolean) => void
  fill: BaseFill
  onFillChange: (next: BaseFill) => void
  underlayVariable: CensusVariable | null
  onUnderlayChange: (v: CensusVariable | null) => void
}

export default function LayerControls({
  pointsOn,
  onPointsToggle,
  fill,
  onFillChange,
  underlayVariable,
  onUnderlayChange,
}: Props) {
  return (
    <div className="flex items-center gap-2">
      {/* FLOW points toggle */}
      <button
        onClick={() => onPointsToggle(!pointsOn)}
        className={`px-3 py-1.5 rounded-md text-[11px] font-mono uppercase tracking-wider transition-all duration-200 ${
          pointsOn
            ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100'
            : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
        }`}
        aria-pressed={pointsOn}
      >
        {pointsOn ? '● flow' : '○ flow'}
      </button>

      {/* Base-fill picker */}
      <div className="flex items-center gap-1 bg-paper-100/40 dark:bg-espresso-900/40 rounded-lg p-0.5">
        {(['none', 'anomaly', 'demographic'] as const).map((f) => (
          <button
            key={f}
            onClick={() => onFillChange(f)}
            className={`px-2.5 py-1 rounded text-[10px] font-mono uppercase tracking-wider transition-all duration-200 ${
              fill === f
                ? 'bg-paper-200 dark:bg-espresso-800 text-ink dark:text-paper-100 shadow-sm'
                : 'text-paper-500 dark:text-paper-600 hover:text-paper-300'
            }`}
          >
            {f}
          </button>
        ))}
      </div>

      {/* Demographic variable picker — shows only when demographic fill is active */}
      {fill === 'demographic' && (
        <UnderlayPicker
          presets={UNDERLAY_PRESETS['last48'] ?? []}
          activeVariable={underlayVariable}
          onSelect={onUnderlayChange}
        />
      )}
    </div>
  )
}
