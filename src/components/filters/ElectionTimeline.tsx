/**
 * ElectionTimeline — full-width scrubber for cross-election playback
 *
 * Dots for each election, play/pause button, speed control.
 * "The Time Machine" — animate through SF elections over time.
 */
import type { ElectionMeta } from '@/types/elections'

interface ElectionTimelineProps {
  elections: ElectionMeta[]
  activeIndex: number
  onIndexChange: (index: number) => void
  isPlaying: boolean
  onPlayToggle: () => void
  speed: number
  onSpeedChange: (speed: number) => void
}

const SPEEDS = [1, 2, 5]

export default function ElectionTimeline({
  elections,
  activeIndex,
  onIndexChange,
  isPlaying,
  onPlayToggle,
  speed,
  onSpeedChange,
}: ElectionTimelineProps) {
  if (elections.length < 2) return null

  const active = elections[activeIndex]
  const year = active ? new Date(active.date).getFullYear() : ''

  return (
    <div className="flex items-center gap-3 px-6 py-2.5 bg-slate-900/80 backdrop-blur-md border-t border-white/[0.04]">
      {/* Play/pause */}
      <button
        onClick={onPlayToggle}
        className="w-8 h-8 rounded-full bg-indigo-500/20 flex items-center justify-center hover:bg-indigo-500/30 transition-colors flex-shrink-0"
      >
        {isPlaying ? (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="#616a96">
            <rect x="2" y="1" width="3" height="10" rx="0.5" />
            <rect x="7" y="1" width="3" height="10" rx="0.5" />
          </svg>
        ) : (
          <svg width="12" height="12" viewBox="0 0 12 12" fill="#616a96">
            <path d="M3 1L10 6L3 11Z" />
          </svg>
        )}
      </button>

      {/* Year counter */}
      <div className="text-2xl font-mono font-bold text-indigo-500 tabular-nums min-w-[3.75rem]">
        {year}
      </div>

      {/* Scrubber track */}
      <div className="flex-1 flex items-center gap-0 relative h-8">
        {/* Track line */}
        <div className="absolute top-1/2 left-0 right-0 h-[2px] bg-slate-700 -translate-y-1/2 rounded-full" />
        <div
          className="absolute top-1/2 left-0 h-[2px] bg-indigo-500 -translate-y-1/2 rounded-full transition-all duration-300"
          style={{ width: `${(activeIndex / Math.max(elections.length - 1, 1)) * 100}%` }}
        />

        {/* Dots */}
        {elections.map((election, i) => {
          const left = `${(i / Math.max(elections.length - 1, 1)) * 100}%`
          const isActive = i === activeIndex
          const elYear = new Date(election.date).getFullYear()

          return (
            <button
              key={election.dateCode}
              onClick={() => onIndexChange(i)}
              className="absolute -translate-x-1/2 group"
              style={{ left }}
              title={election.label}
            >
              <div
                className={`w-3 h-3 rounded-full border-2 transition-all duration-200 ${
                  isActive
                    ? 'bg-indigo-500 border-indigo-400 scale-125'
                    : i < activeIndex
                      ? 'bg-indigo-500/50 border-indigo-500/40 hover:scale-110'
                      : 'bg-slate-700 border-slate-600 hover:scale-110'
                }`}
              />
              {/* Year label (show on every other dot or if hovered) */}
              <span
                className={`absolute top-5 left-1/2 -translate-x-1/2 text-[8px] font-mono whitespace-nowrap transition-opacity ${
                  isActive ? 'text-indigo-500 opacity-100' : 'text-slate-500 opacity-0 group-hover:opacity-100'
                }`}
              >
                {elYear}
              </span>
            </button>
          )
        })}
      </div>

      {/* Speed control */}
      <div className="flex items-center gap-1 flex-shrink-0">
        {SPEEDS.map((s) => (
          <button
            key={s}
            onClick={() => onSpeedChange(s)}
            className={`px-1.5 py-0.5 rounded text-nano font-mono transition-all ${
              speed === s
                ? 'bg-indigo-500/20 text-indigo-500'
                : 'text-slate-500 hover:text-slate-300'
            }`}
          >
            {s}x
          </button>
        ))}
      </div>

      {/* Election label */}
      <p className="text-micro font-mono text-slate-500 flex-shrink-0 max-w-[8.75rem] truncate">
        {active?.type === 'general' ? 'General' : active?.type === 'primary' ? 'Primary' : active?.type || ''}
      </p>
    </div>
  )
}
