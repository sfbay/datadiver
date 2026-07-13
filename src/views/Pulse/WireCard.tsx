// src/views/Pulse/WireCard.tsx
//
// One Pulse entry as a TICKET-STUB card (design "A" from the studies):
//
//   ┌────────────────────────────┬─────────┐
//   │ 311 reports                ┊ M I S S │  ← subject
//   │ ⌃⌃⌃  186                   ┊ I O N   │  ← glyph + big-number anchor
//   │ ▓▓▓▓▓░░│░░░  usual         ┊         │  ← deviation bar (how far from normal)
//   │ in the last 48h · usual≈90 ┊         │  ← context · precise comparison
//   └────────────────────────────┴─────────┘
//        main body                  stub (place, solid pigment, perforated)
//
// The stub owns PLACE (solid pigment, paper-white, wraps — long slash-names
// like "Oceanview/Merced/Ingleside" break on the injected zero-width spaces).
// The deviation bar renders only when there's a "usual" to compare to; live
// tallies + milestones (no ratio) simply omit it. All prose + encoding come
// from the tested pulsePhrase layer.

import { Link } from 'react-router-dom'
import type { WireItem } from '@/lib/pulse/pulsePhrase'
import SignalGlyph from './SignalGlyph'
import DeviationBar from './DeviationBar'

// Slashes are joiners with no break opportunity — inject a zero-width space
// after each so long neighborhood names wrap inside the narrow stub.
const softenSlashes = (s: string) => s.replace(/\//g, '/​')

export default function WireCard({ item }: { item: WireItem }) {
  // One colour per card = its feed (911 / Fire-EMS / 311 / a citywide trend).
  // Direction is carried by the arrow + the bar's position, not colour.
  const color = item.pigment ?? '#8a7050' // paper-600 neutral fallback
  const hasPlace = !!item.place
  const stubLabel = hasPlace ? softenSlashes(item.place!) : item.kind === 'incident' ? 'Live' : 'Citywide'

  return (
    <Link
      to={item.evidenceHref}
      aria-label={`${item.bigValue} ${item.signalLabel}. Open the records.`}
      className="group flex min-h-[120px] overflow-hidden rounded-xl border
                 bg-paper-100 dark:bg-espresso-900
                 hover:-translate-y-0.5 hover:shadow-[0_8px_24px_-12px_rgba(30,20,13,0.28)]
                 transition-all duration-200"
      style={{ borderColor: `${color}59` }}
    >
      {/* ── main body ─────────────────────────────────────────── */}
      {/* feed-colour wash, densest at the stub, fading left across the metrics —
          binds the stub to ITS OWN numbers so a neighbour's stub can't claim them */}
      <div
        className="flex-1 min-w-0 px-4 py-3.5 flex flex-col"
        style={{ backgroundImage: `linear-gradient(90deg, transparent 30%, ${color}3d)` }}
      >
        <h3 className="font-display text-[1.05rem] leading-tight tracking-tight text-ink dark:text-paper-100 mb-1.5">
          {item.subject}
        </h3>

        <div className="flex items-center gap-2.5">
          <SignalGlyph type={item.signalType} magnitude={item.magnitude} size={22} color={color} />
          {/* Big number in the feed colour — same ink as the bar below it, so
              the reading and its scale register as one statement. */}
          <span
            className="font-display italic text-[2.3rem] leading-[0.82] tabular-nums"
            style={{ color }}
          >
            {item.bigValue}
          </span>
        </div>

        {item.ratio !== undefined && (
          <DeviationBar
            ratio={item.ratio}
            color={color}
            // Trend cards' ratio compares to A YEAR AGO, not the 12-week
            // "usual" — the tick must say which reference it marks.
            tickLabel={item.kind === 'trend' ? 'last yr' : 'usual'}
          />
        )}

        <p className="mt-1.5 font-mono text-[10px] leading-tight text-paper-600 dark:text-paper-500">
          <span className="text-paper-500 dark:text-paper-600">{item.context}</span>
          {item.factLine && <> · {item.factLine}</>}
        </p>
      </div>

      {/* ── stub (place) ──────────────────────────────────────── */}
      {/* Liquid width, no breakpoint: 136px on desktop, easing to 104px on
          narrow phones (26vw @ 390px ≈ 101px) so the body keeps ~200px+ for
          the glyph + big number. Names wrap; that's the stub's design. */}
      <div
        className={`relative flex-shrink-0 w-[clamp(104px,26vw,136px)] flex items-center justify-center px-3 py-2.5
                    ${hasPlace ? '' : 'bg-paper-200/70 dark:bg-espresso-800'}`}
        style={hasPlace ? { backgroundColor: color } : undefined}
      >
        <span
          className={`font-mono text-[13px] font-bold tracking-[0.06em] uppercase text-center leading-[1.28]
                      ${hasPlace ? 'text-paper-50' : 'text-paper-700 dark:text-paper-400'}`}
        >
          {stubLabel}
        </span>
      </div>
    </Link>
  )
}
