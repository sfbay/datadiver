// src/components/charts/PartWhole.tsx
//
// PartWhole — "n of m" as one bar: a muted track for m, a pigment fill for
// n. It replaces sentences such as "vermin were cited at 369 of the 456
// closure inspections" with the bar plus a mono "369 of 456". No axis, no
// legend; the caller supplies the two figures and the pigment.

interface PartWholeProps {
  part: number
  whole: number
  color: string
  width?: number
  height?: number
  /** Show "part of whole" in mono after the bar. Default true. */
  figures?: boolean
  /** Format the two figures (default: locale grouping). */
  fmt?: (n: number) => string
  label?: string
  className?: string
}

const group = (n: number) => n.toLocaleString('en-US')

export default function PartWhole({
  part, whole, color, width = 96, height = 6, figures = true, fmt = group, label, className = '',
}: PartWholeProps) {
  const share = whole > 0 ? Math.max(0, Math.min(1, part / whole)) : 0
  return (
    <span className={`inline-flex items-center gap-2 ${className}`} role={label ? 'img' : undefined} aria-label={label}>
      <svg width={width} height={height} viewBox={`0 0 ${width} ${height}`} className="block shrink-0" aria-hidden>
        <rect x={0} y={0} width={width} height={height} rx={1} fill={color} opacity={0.18} />
        <rect x={0} y={0} width={Math.max(share > 0 ? 2 : 0, share * width)} height={height} rx={1} fill={color} />
      </svg>
      {figures && (
        <span className="font-mono text-nano tabular-nums whitespace-nowrap">
          {fmt(part)} <span className="opacity-60">of {fmt(whole)}</span>
        </span>
      )}
    </span>
  )
}
