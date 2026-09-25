// src/views/Restaurants/NotesLink.tsx
//
// The one line a tab or the biography panel prints where it used to
// re-print its data notes: a link that opens the header's notes popover at
// this surface's section. The notes themselves live once, in dataNotes.ts.

import type { NoteSectionId } from './dataNotes'

interface NotesLinkProps {
  section: NoteSectionId
  onOpen?: (section: NoteSectionId) => void
  className?: string
}

export default function NotesLink({ section, onOpen, className = '' }: NotesLinkProps) {
  if (!onOpen) return null
  return (
    <button
      type="button"
      onClick={() => onOpen(section)}
      className={`font-mono text-micro uppercase tracking-[0.18em] text-paper-600 dark:text-paper-400 hover:text-ink dark:hover:text-paper-200 ${className}`}
    >
      Data notes ›
    </button>
  )
}
