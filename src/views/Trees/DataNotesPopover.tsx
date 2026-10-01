// src/views/Trees/DataNotesPopover.tsx
//
// The header's "Data notes" popover — the precision behind every simplified
// label on the page (chrome stays clean, the notes carry the detail). The
// notes live ONCE, in dataNotes.ts, grouped by surface; every rail tab and
// the tree card link here at their own section instead of re-printing it
// (the Restaurants lesson). The popover is controlled by Trees.tsx so those
// links can open it at a section. No reader sentence is written here — the
// sections, the sources line and its links all come from dataNotes.ts.
//
// The open panel carries `data-export-ignore` (a PNG export never shows it);
// the wrapper carries `data-trees-notes`, which the tree card lists as an
// inside-selector so reading the notes does not close the card.

import { useEffect, useMemo, useRef } from 'react'
import { Link } from 'react-router-dom'
import type { NoticedByKind } from '@/lib/trees/siteNotices'
import type { TreesAggregates } from '@/lib/trees/types'
import { NOTES_SOURCES, buildDataNotes, type NoteSectionId } from './dataNotes'

const LINK = 'underline decoration-moss-500/50 hover:decoration-moss-500'

export default function DataNotesPopover({ aggregates, noticed, nowYear, section, onOpen, onClose }: {
  aggregates: TreesAggregates | null
  /** What the noticed sites are listed as now (from the snapshot); null until it loads. */
  noticed: NoticedByKind | null
  nowYear: number
  /** The open section, or null when closed. */
  section: NoteSectionId | null
  onOpen: (section: NoteSectionId) => void
  onClose: () => void
}) {
  const open = section !== null
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    if (!open) return
    const onDown = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) onClose() }
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    document.addEventListener('mousedown', onDown)
    document.addEventListener('keydown', onKey)
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey) }
  }, [open, onClose])

  // Land on the section the caller asked for (the header button asks for
  // 'general'). A rail or card link is far from the popover, so the scroll
  // is the only cue that the click did something.
  useEffect(() => {
    if (!section) return
    const el = ref.current?.querySelector<HTMLElement>(`[data-note-section="${section}"]`)
    el?.scrollIntoView({ block: 'start' })
  }, [section])

  const sections = useMemo(() => buildDataNotes(aggregates, nowYear, noticed), [aggregates, nowYear, noticed])

  return (
    <div ref={ref} data-trees-notes className="relative">
      <button
        type="button"
        onClick={() => (open ? onClose() : onOpen('general'))}
        aria-expanded={open}
        className="px-2.5 py-1.5 rounded-md text-[12px] font-medium text-slate-500 dark:text-slate-400 hover:text-ink dark:hover:text-white bg-slate-100/80 dark:bg-white/[0.04] transition-colors"
      >
        Data notes
      </button>
      {open && (
        <div
          role="dialog"
          aria-label="Data notes"
          data-export-ignore
          className="absolute right-0 top-full mt-2 z-50 w-[min(26rem,calc(100vw-2rem))] max-h-[70vh] overflow-y-auto rounded-xl bg-paper-50 dark:bg-espresso-900 ring-1 ring-slate-200/60 dark:ring-white/[0.06] shadow-xl p-4 space-y-5"
        >
          {sections.map((sec) => (
            <section key={sec.id} data-note-section={sec.id} className="space-y-3 scroll-mt-4">
              <h3 className="font-mono text-micro uppercase tracking-[0.2em] text-moss-700 dark:text-moss-400 border-b border-slate-200/60 dark:border-white/[0.06] pb-1">
                {sec.title}
              </h3>
              {sec.notes.map((n) => (
                <div key={n.title}>
                  <p className="text-label font-mono uppercase tracking-[0.15em] text-slate-500 dark:text-slate-400">{n.title}</p>
                  <p className="mt-1 text-[13px] leading-relaxed text-ink dark:text-paper-200">
                    {n.body}
                    {n.link && (
                      <>
                        {' '}
                        <a href={n.link.href} target="_blank" rel="noopener noreferrer" className={LINK}>{n.link.text}</a>.
                      </>
                    )}
                  </p>
                </div>
              ))}
            </section>
          ))}
          <p className="text-[13px] leading-relaxed text-ink dark:text-paper-200">
            {NOTES_SOURCES.lead}{' '}
            {NOTES_SOURCES.links.map((l, i) => (
              <span key={l.href}>
                {i > 0 && ' · '}
                <Link className={LINK} to={l.href}>{l.text}</Link>
              </span>
            ))}
          </p>
        </div>
      )}
    </div>
  )
}
