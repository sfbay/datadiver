// src/views/Restaurants/RailStat.tsx
//
// RailStat — the stat chip at the top of a Storylines tab, replacing the
// lede paragraph. The Last 48 rule, number first, mark second, words last:
//
//   ┌────────────────────────┐
//   │ 124            (i)     │  big italic Fraunces numeral
//   │ ▇▇▇▇▇▇▇▆▆▆▃▃           │  the mark slot (a bar, a histogram, dots)
//   │ STOREFRONTS, 3+ NAMES  │  mono nano caption, ≤ 4 words
//   └────────────────────────┘
//
// The sentence the chip replaced is not lost: it rides the InfoTip (`tip`)
// and the chip's aria-label, so a reader who wants the prose clicks the
// "i" and a screen reader hears the whole fact. Glass register like the
// rail's rows (paper / espresso, never slate); Tier 3 — no glow.

import type { ReactNode } from 'react'
import InfoTip from '@/components/ui/InfoTip'

interface RailStatProps {
  /** The figure. A number is grouped ('1,234'); a string renders as given. */
  value: number | string
  /** Mono caption under the mark, ≤ 4 words. */
  caption: string
  /** The mark — a DotRow, a PartWhole, an inline SVG. Optional. */
  mark?: ReactNode
  /** The old lede sentence: the InfoTip's gloss. */
  tip?: string
  /** Screen-reader sentence for the whole chip; defaults to `tip`, else
   *  "{value} {caption}". */
  label?: string
  className?: string
}

export default function RailStat({ value, caption, mark, tip, label, className = '' }: RailStatProps) {
  const figure = typeof value === 'number' ? value.toLocaleString('en-US') : value
  const aria = label ?? tip ?? `${figure} ${caption}`
  return (
    <div
      role="group"
      aria-label={aria}
      className={`rounded-lg bg-paper-100/50 dark:bg-espresso-800/40 px-3 pt-2 pb-2.5 min-w-0 ${className}`}
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-display italic text-3xl leading-none tabular-nums text-paper-900 dark:text-paper-100" aria-hidden>
          {figure}
        </span>
        {tip && (
          <span className="-mr-1.5 -mt-0.5 shrink-0">
            <InfoTip term={caption} text={tip} />
          </span>
        )}
      </div>
      {/* The mark keeps its own `label` (role="img") — a histogram's bins or
          a dot row's counts add detail the chip's sentence does not carry. */}
      {mark && <div className="mt-2 min-w-0">{mark}</div>}
      <p className="mt-1.5 font-mono text-nano uppercase tracking-[0.15em] text-paper-600 dark:text-paper-400 leading-tight" aria-hidden>
        {caption}
      </p>
    </div>
  )
}
