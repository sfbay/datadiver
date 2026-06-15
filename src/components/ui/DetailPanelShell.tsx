import { useRef, useEffect, type ReactNode, type CSSProperties } from 'react'
import ShareLinkButton from '@/components/ui/ShareLinkButton'
import { useIsMobile } from '@/hooks/useIsMobile'

interface DetailPanelShellProps {
  /** Controls visibility — panel renders null when false */
  open: boolean
  /** Called to close the panel (X button + outside click) */
  onClose: () => void
  /** Loading state — shows spinner instead of children */
  isLoading: boolean
  /** Accent color for the spinner border (e.g. "border-teal-400") */
  spinnerClass?: string
  /** Width class override (default "w-72") */
  widthClass?: string
  /** Optional share link builder — omit to hide the share button */
  buildShareUrl?: () => string
  /** Accent class passed to ShareLinkButton */
  shareAccentClass?: string
  /** Hex color driving the panel's top-left corner glow. Defaults to the
   *  brand terracotta. Pass the dataset's pigment for per-view consistency. */
  glowColor?: string
  /** Optional CSS selectors for additional regions that should be treated
   *  as "inside" the panel for outside-click dismiss purposes. Clicks within
   *  elements matching any of these selectors will NOT dismiss the panel.
   *  Use when the panel coexists with another interactive surface that
   *  drives its content — e.g., Last 48's FlowRail (listbox) is the
   *  selection driver, so rail clicks shouldn't dismiss the event card. */
  additionalInsideSelectors?: string[]
  /** Panel content — only rendered when not loading */
  children: ReactNode
}

/**
 * Shared chrome wrapper for all detail panels.
 *
 * Provides:
 * - Positioned card with slide-in animation
 * - Close button (top-right X)
 * - Optional ShareLinkButton
 * - Loading spinner
 * - Scrollable content area
 * - Outside-click dismiss
 */
export default function DetailPanelShell({
  open,
  onClose,
  isLoading,
  spinnerClass = 'border-slate-400',
  widthClass = 'w-72',
  buildShareUrl,
  shareAccentClass,
  glowColor = '#b85a33', // terracotta-600 — brand fallback
  additionalInsideSelectors,
  children,
}: DetailPanelShellProps) {
  const panelRef = useRef<HTMLDivElement>(null)
  const isMobile = useIsMobile()

  // Close on outside click. `additionalInsideSelectors` extends the
  // "inside" boundary beyond the panel itself — useful when the panel is
  // driven by another interactive surface (e.g., a sidebar listbox).
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      const target = e.target as Node | null
      if (!target) return
      if (panelRef.current && panelRef.current.contains(target)) return
      if (additionalInsideSelectors && target instanceof Element) {
        for (const selector of additionalInsideSelectors) {
          if (target.closest(selector)) return
        }
      }
      onClose()
    }
    // Delay to avoid catching the click that opened the panel
    const timer = setTimeout(() => document.addEventListener('mousedown', handler), 100)
    return () => {
      clearTimeout(timer)
      document.removeEventListener('mousedown', handler)
    }
  }, [open, onClose, additionalInsideSelectors])

  if (!open) return null

  // Below md the panel is a full-width bottom sheet (z-40, above the list
  // sheet's z-30) with a backdrop; at md+ it's the top-right card — now
  // viewport-width-capped so a w-80 card can't overrun a narrow map column.
  const outerClass = isMobile
    ? 'fixed inset-x-0 bottom-0 z-40 max-h-[70vh] animate-in fade-in slide-in-from-bottom-4'
    : `absolute top-5 right-5 z-30 ${widthClass} max-w-[calc(100vw-2.5rem)] max-h-[80vh] animate-in fade-in slide-in-from-right-4`

  return (
    <>
      {isMobile && (
        <div className="fixed inset-0 z-[39] bg-black/40" onClick={onClose} aria-hidden="true" />
      )}
      <div ref={panelRef} className={outerClass}>
        {/* Inner glow-host wrapper — keeps the corner-glow clip + isolation on a
            separate element so it doesn't fight the outer div's positioning (the
            .glow-host CSS rule sets position: relative, which used to silently
            override the outer positioning class and move the panel). */}
        <div
          className={`glow-host overflow-y-auto ${isMobile ? 'rounded-t-2xl' : 'rounded-xl'} p-4 max-h-[80vh] bg-white dark:bg-slate-900 border border-slate-200 dark:border-white/[0.08] shadow-xl shadow-black/20`}
          style={{ '--glow': glowColor } as CSSProperties}
        >
          <div className="glow-corner" />
          {/* Top-right actions */}
          <div className="absolute top-2 right-2 flex items-center gap-0.5 z-10">
            {buildShareUrl && (
              <ShareLinkButton buildUrl={buildShareUrl} accentClass={shareAccentClass} />
            )}
            <button
              onClick={onClose}
              className="w-6 h-6 flex items-center justify-center rounded-full text-slate-500 dark:text-slate-400 hover:text-ink dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/10 transition-all"
            >
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M2 2l8 8M10 2l-8 8" />
              </svg>
            </button>
          </div>

          {isLoading && (
            <div className="relative flex items-center justify-center py-8">
              <div className={`w-5 h-5 border-2 ${spinnerClass} border-t-transparent rounded-full animate-spin`} />
            </div>
          )}

          {!isLoading && <div className="relative">{children}</div>}
        </div>
      </div>
    </>
  )
}
