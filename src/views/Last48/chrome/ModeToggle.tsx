import type { CSSProperties } from 'react'

interface Props {
  mode: 'flow' | 'hotspots'
  onChange: (next: 'flow' | 'hotspots') => void
}

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    // Semantically a segmented control (two exclusive choices), not a
    // tab pattern — tab pattern requires an associated tabpanel which
    // isn't relevant here. role="group" + aria-pressed on each button
    // is the correct ARIA shape and matches DatasetFilterChips.
    <div
      className="inline-flex border border-paper-300 dark:border-espresso-600 rounded-md overflow-hidden font-mono text-[10px] tracking-wider"
      role="group"
      aria-label="Last 48 mode"
    >
      <button
        type="button"
        aria-pressed={mode === 'flow'}
        onClick={() => onChange('flow')}
        className={`
          relative px-3 py-1.5 transition-colors overflow-hidden
          ${mode === 'flow'
            ? 'bg-ochre-500 text-espresso-900 glow-host'
            : 'text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-espresso-700'}
        `}
        style={mode === 'flow' ? ({ ['--glow' as string]: '#f5ecd9' } as CSSProperties) : undefined}
      >
        {mode === 'flow' && <span className="glow-corner is-sm" aria-hidden />}
        <span className="relative">FLOW</span>
      </button>
      <button
        type="button"
        aria-pressed={mode === 'hotspots'}
        onClick={() => onChange('hotspots')}
        className={`
          relative px-3 py-1.5 transition-colors overflow-hidden border-l border-paper-300 dark:border-espresso-600
          ${mode === 'hotspots'
            ? 'bg-ochre-500 text-espresso-900 glow-host'
            : 'text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-espresso-700'}
        `}
        style={mode === 'hotspots' ? ({ ['--glow' as string]: '#f5ecd9' } as CSSProperties) : undefined}
      >
        {mode === 'hotspots' && <span className="glow-corner is-sm" aria-hidden />}
        <span className="relative">HOTSPOTS</span>
      </button>
    </div>
  )
}
