import { useState, useRef, useEffect } from 'react'
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
  const [position, setPosition] = useState<'below' | 'above'>('below')
  const triggerRef = useRef<HTMLButtonElement>(null)
  const tipRef = useRef<HTMLDivElement>(null)

  // Determine if tooltip should render above or below
  useEffect(() => {
    if (!open || !triggerRef.current) return
    const rect = triggerRef.current.getBoundingClientRect()
    const spaceBelow = window.innerHeight - rect.bottom
    setPosition(spaceBelow < 160 ? 'above' : 'below')
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
    <span className="relative inline-flex items-center">
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

      {open && (
        <div
          ref={tipRef}
          className={`
            absolute z-50 w-56 px-3 py-2.5 rounded-lg
            bg-white dark:bg-slate-800
            border border-slate-200 dark:border-white/[0.08]
            shadow-xl shadow-black/10 dark:shadow-black/40
            text-[11px] leading-relaxed text-slate-600 dark:text-slate-300
            normal-case tracking-normal whitespace-normal font-normal font-sans
            animate-in fade-in duration-150
            ${position === 'below'
              ? 'top-full mt-1.5 left-1/2 -translate-x-1/2'
              : 'bottom-full mb-1.5 left-1/2 -translate-x-1/2'
            }
          `}
        >
          {explanation}
        </div>
      )}
    </span>
  )
}
