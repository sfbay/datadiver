interface Props {
  mode: 'flow' | 'hotspots'
  onChange: (next: 'flow' | 'hotspots') => void
}

export default function ModeToggle({ mode, onChange }: Props) {
  return (
    <div
      className="inline-flex border border-paper-300 dark:border-espresso-600 rounded-md overflow-hidden font-mono text-[10px] tracking-wider"
      role="tablist"
      aria-label="Last 48 mode"
    >
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'flow'}
        onClick={() => onChange('flow')}
        className={`
          px-3 py-1.5 transition-colors
          ${mode === 'flow'
            ? 'bg-ochre-500 text-espresso-900'
            : 'text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-espresso-700'}
        `}
      >
        FLOW
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={mode === 'hotspots'}
        onClick={() => onChange('hotspots')}
        className={`
          px-3 py-1.5 transition-colors border-l border-paper-300 dark:border-espresso-600
          ${mode === 'hotspots'
            ? 'bg-ochre-500 text-espresso-900'
            : 'text-paper-600 dark:text-paper-400 hover:bg-paper-100 dark:hover:bg-espresso-700'}
        `}
      >
        HOTSPOTS
      </button>
    </div>
  )
}
