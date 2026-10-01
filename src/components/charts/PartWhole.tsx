// src/components/charts/PartWhole.tsx
//
// PartWhole — "n of m" as one bar: a muted track for m, a pigment fill for
// n. It replaces sentences such as "vermin were cited at 369 of the 456
// closure inspections" with the bar plus a mono "369 of 456". No axis, no
// legend; the caller supplies the two figures and the pigment.
//
// `fluid` drops the fixed pixel width: the bar fills whatever its container
// leaves (min-w-0), so it can never run past the edge of a narrow box such as
// a half-width RailStat chip — at any rail width or Large Type setting. Inside
// a chip, pass `figures={false}` too: the chip's big numeral already states
// the share, and the mono "n of m" is what overflowed (Trees walk, Sept. 30
// 2026).

interface PartWholeProps {
  part: number
  whole: number
  color: string
  /** Fixed bar width in px; ignored when `fluid`. */
  width?: number
  height?: number
  /** Fill the container's width instead of a fixed `width`. */
  fluid?: boolean
  /** Show "part of whole" in mono after the bar. Default true. */
  figures?: boolean
  /** Format the two figures (default: locale grouping). */
  fmt?: (n: number) => string
  label?: string
  className?: string
}

const group = (n: number) => n.toLocaleString('en-US')

export default function PartWhole({
  part, whole, color, width = 96, height = 6, fluid = false, figures = true, fmt = group, label, className = '',
}: PartWholeProps) {
  const share = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0
  return (
    <span
      className={`${fluid ? 'flex w-full min-w-0' : 'inline-flex'} items-center gap-2 ${className}`}
      role={label ? 'img' : undefined}
      aria-label={label}
    >
      {fluid ? (
        <span className="relative block flex-1 min-w-0" style={{ height }} aria-hidden>
          <span className="absolute inset-0 rounded-[1px]" style={{ background: color, opacity: 0.18 }} />
          <span
            className="absolute inset-y-0 left-0 rounded-[1px]"
            style={{ background: color, width: `${share * 100}%`, minWidth: share > 0 ? 2 : 0 }}
          />
        </span>
      ) : (
        <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block shrink-0" aria-hidden>
          <rect x={0} y={0} width={width} height={height} rx={1} fill={color} opacity={0.18} />
          <rect x={0} y={0} width={Math.max(share > 0 ? 2 : 0, share * width)} height={height} rx={1} fill={color} />
        </svg>
      )}
      {figures && (
        <span className="font-mono text-nano tabular-nums whitespace-nowrap">
          {fmt(part)} <span className="opacity-60">of {fmt(whole)}</span>
        </span>
      )}
    </span>
  )
}
