import { useState, useCallback } from 'react'

interface ShareLinkButtonProps {
  /** Build the URL to copy — called on click so it captures current state */
  buildUrl: () => string
  /** Accent color class for the checkmark flash */
  accentClass?: string
}

/**
 * Compact "copy share link" button for detail panels.
 * Shows a link icon, copies URL to clipboard, flashes a checkmark on success.
 */
export default function ShareLinkButton({ buildUrl, accentClass = 'text-slate-400' }: ShareLinkButtonProps) {
  const [copied, setCopied] = useState(false)

  const handleCopy = useCallback(() => {
    const url = buildUrl()
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    })
  }, [buildUrl])

  return (
    <button
      onClick={handleCopy}
      title="Copy share link"
      className={`w-6 h-6 flex items-center justify-center rounded-full transition-all ${
        copied
          ? 'bg-emerald-500/15'
          : 'hover:bg-white/10 text-slate-400 hover:text-slate-300'
      }`}
    >
      {copied ? (
        <svg width="12" height="12" viewBox="0 0 12 12" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-500">
          <path d="M2 6l3 3 5-5" strokeLinecap="round" strokeLinejoin="round" />
        </svg>
      ) : (
        <svg width="12" height="12" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" className={accentClass}>
          <path d="M6.5 9.5l3-3M5.5 8.5l-1.1 1.1a1.5 1.5 0 002.1 2.1L7.6 10.6M8.4 5.4l1.1-1.1a1.5 1.5 0 012.1 2.1L10.5 7.5" strokeLinecap="round" />
        </svg>
      )}
    </button>
  )
}
