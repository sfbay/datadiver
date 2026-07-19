// src/components/ui/ErrorState.tsx
//
// Shared retry-able error card for failed Socrata queries. Sits wherever the
// data would have rendered (chart zone, sidebar section, map overlay) — same
// philosophy as the Skeleton kit: each zone owns its own failure state, no
// full-screen takeover. Pair with useDataset's `error` + `refetch`.

interface ErrorStateProps {
  /** The error string from useDataset (or any fetch hook). */
  message: string
  /** Usually useDataset's refetch. Omit to hide the retry button. */
  onRetry?: () => void
  /** Short context label, e.g. "response times" — reads as "Couldn't load response times". */
  what?: string
  className?: string
}

export function ErrorState({ message, onRetry, what, className = '' }: ErrorStateProps) {
  return (
    <div
      role="alert"
      className={`rounded-[14px] border border-brick-500/25 bg-brick-500/[0.05] px-4 py-3.5 ${className}`}
    >
      <div className="flex items-center gap-2 mb-1.5">
        <div className="h-px w-5 bg-brick-500/60" aria-hidden />
        <p className="text-nano font-mono uppercase tracking-[0.22em] text-brick-500">
          Couldn’t load{what ? ` ${what}` : ''}
        </p>
      </div>
      <p className="text-[12px] font-mono text-ink/60 dark:text-slate-400 break-words leading-relaxed">
        {message}
      </p>
      {onRetry && (
        <button
          type="button"
          onClick={onRetry}
          className="mt-2.5 inline-flex items-center gap-1.5 rounded-md border border-brick-500/35 px-3 py-1.5 text-micro font-mono uppercase tracking-wider text-brick-500 hover:bg-brick-500/10 transition-colors"
        >
          <svg width="11" height="11" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" aria-hidden>
            <path d="M13.5 8a5.5 5.5 0 1 1-1.6-3.9M13.5 1.5v3h-3" />
          </svg>
          Retry
        </button>
      )}
    </div>
  )
}
