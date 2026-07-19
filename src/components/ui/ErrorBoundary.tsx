// src/components/ui/ErrorBoundary.tsx
//
// App-level crash containment. Before this existed, any render error in any
// view took down the whole app to a white screen — nav included. The boundary
// keeps the shell alive and renders an editorial fallback in the content area.
//
// Two exports:
//   <ErrorBoundary>      — plain boundary, manual reset via the retry button
//   <RouteErrorBoundary> — keys the boundary by pathname, so simply navigating
//                          to another view discards the crashed subtree and
//                          recovers without a full reload
//
// Error boundaries must be class components — React has no hook equivalent
// for componentDidCatch/getDerivedStateFromError.

import { Component, type ReactNode, type CSSProperties } from 'react'
import { useLocation } from 'react-router-dom'

interface ErrorBoundaryProps {
  children: ReactNode
}

interface ErrorBoundaryState {
  error: Error | null
}

export class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = { error: null }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error }
  }

  componentDidCatch(error: Error, info: { componentStack?: string | null }) {
    // Console is the observability surface for a client-only app — keep the
    // stack readable for bug reports from journalists who hit F12.
    console.error('[DataDiver] view crashed:', error, info.componentStack)
  }

  render() {
    if (!this.state.error) return this.props.children

    const message = this.state.error.message || String(this.state.error)

    return (
      <div className="h-full overflow-y-auto grid place-items-center px-[clamp(16px,3vw,48px)]">
        <div
          className="glass-card relative rounded-[28px] rounded-bl-none overflow-hidden glow-host max-w-[560px] w-full"
          style={{ '--glow': '#963e30' } as CSSProperties}
        >
          <div className="glow-corner is-lg" style={{ opacity: 0.45 }} />

          <div className="relative px-[clamp(24px,4vw,44px)] py-[clamp(28px,4vw,44px)]">
            <div className="flex items-center gap-2.5 mb-5">
              <div className="h-px w-7 bg-brick-500/60" />
              <p className="text-micro font-mono uppercase tracking-[0.25em] text-brick-500">
                Something broke
              </p>
            </div>

            <h1
              className="font-display text-ink dark:text-paper-100 leading-[0.95] mb-4"
              style={{ fontSize: 'clamp(1.75rem, 3vw + 0.5rem, 2.75rem)' }}
            >
              <em>This view crashed.</em>
            </h1>

            <p className="text-[14px] leading-relaxed text-ink/70 dark:text-slate-300 mb-4">
              The rest of DataDiver is fine — pick another view from the sidebar,
              or retry this one. If it keeps happening, the note below is what a
              bug report needs.
            </p>

            <p className="rounded-md border border-brick-500/25 bg-brick-500/[0.06] px-3.5 py-2.5 text-[12px] font-mono text-brick-500 break-words mb-6">
              {message}
            </p>

            <button
              type="button"
              onClick={() => this.setState({ error: null })}
              className="inline-flex items-center gap-2 rounded-md bg-terracotta-500 hover:bg-terracotta-600 text-white px-4 py-2.5 text-[13px] font-mono uppercase tracking-wider transition-colors"
            >
              Retry this view
            </button>
          </div>
        </div>
      </div>
    )
  }
}

/** Boundary that resets automatically on navigation — keyed by pathname, so a
 *  crashed view's subtree is discarded the moment the user goes elsewhere. */
export function RouteErrorBoundary({ children }: { children: ReactNode }) {
  const location = useLocation()
  return <ErrorBoundary key={location.pathname}>{children}</ErrorBoundary>
}
