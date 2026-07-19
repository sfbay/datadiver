import { useState, useRef, useEffect, useLayoutEffect } from 'react'
import { createPortal } from 'react-dom'
import { getGlossaryEntry } from '@/utils/glossary'

interface InfoTipProps {
  /** Glossary key — looks up plain-language explanation */
  term: string
  /** Override the glossary text with a custom explanation */
  text?: string
  /** Size of the icon in px (default 12) */
  size?: number
}

export default function InfoTip({ term, text, size = 12 }: InfoTipProps) {
  const explanation = text || getGlossaryEntry(term)
  if (!explanation) return null

  const [open, setOpen] = useState(false)
  // Tooltip is portaled to document.body so it can't be clipped by ancestor
  // stacking contexts (StatCard's transition / opacity etc). Coords are
  // computed from the trigger's bounding rect each time it opens.
  const [coords, setCoords] = useState<{ top: number; left: number; placeAbove: boolean } | null>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  useLayoutEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    const placeAbove = spaceBelow < 160
    // Center horizontally on the trigger; CSS transform handles the centering.
    setCoords({
      top: placeAbove ? rect.top - 6 : rect.bottom + 6,
      left: rect.left + rect.width / 2,
      placeAbove,
    })
  }, [open])

  // Close on outside click
  useEffect(() => {
    if (!open) return
    const handler = (e: MouseEvent) => {
      if (
        triggerRef.current && !triggerRef.current.contains(e.target as Node) &&
        tipRef.current && !tipRef.current.contains(e.target as Node)
      ) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handler)
    return () => document.removeEventListener('mousedown', handler)
  }, [open])

  return (
    <>
      <button
        ref={triggerRef}
        onClick={() => setOpen(!open)}
        onMouseEnter={() => setOpen(true)}
        onMouseLeave={() => setOpen(false)}
        className="inline-flex items-center justify-center rounded-full
          text-slate-400/60 dark:text-slate-600
          hover:text-slate-500 dark:hover:text-slate-400
          hover:bg-slate-200/50 dark:hover:bg-white/[0.06]
          transition-colors duration-150 cursor-help ml-1"
        style={{ width: size + 4, height: size + 4 }}
        aria-label={`What does "${term}" mean?`}
      >
        <svg
          width={size}
          height={size}
          viewBox="0 0 16 16"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.5"
        >
          <circle cx="8" cy="8" r="6.5" />
          <path d="M6.5 6.5a1.5 1.5 0 1 1 1.5 1.5v1.5" strokeLinecap="round" />
          <circle cx="8" cy="12" r="0.5" fill="currentColor" stroke="none" />
        </svg>
      </button>

      {open && coords && createPortal(
        <div
          ref={tipRef}
          onMouseEnter={() => setOpen(true)}
          onMouseLeave={() => setOpen(false)}
          className="fixed w-56 px-3 py-2.5 rounded-lg
            bg-white dark:bg-slate-800
            border border-slate-200 dark:border-white/[0.08]
            shadow-xl shadow-black/10 dark:shadow-black/40
            text-label leading-relaxed text-slate-600 dark:text-slate-300
            normal-case tracking-normal whitespace-normal font-normal font-sans
            animate-in fade-in duration-150 pointer-events-auto"
          style={{
            zIndex: 9999,
            top: coords.top,
            left: coords.left,
            transform: coords.placeAbove
              ? 'translate(-50%, -100%)'
              : 'translate(-50%, 0)',
          }}
        >
          {explanation}
        </div>,
        document.body,
      )}
    </>
  )
}
