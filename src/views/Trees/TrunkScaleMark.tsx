// src/views/Trees/TrunkScaleMark.tsx
//
// The tree card's trunk-size scale mark (ruling R24) — the React twin of
// trunkScaleHtml: the same spec, the same geometry, the same colours
// (trunkScale.ts). The tick is currentColor, so it takes the row's ink.

import { CARD_SCALE, SCALE_ACTIVE, SCALE_MUTED, SCALE_MUTED_OPACITY, trunkScaleGeometry, type ScaleSize, type TrunkScaleSpec } from './trunkScale'

export default function TrunkScaleMark({ spec, size = CARD_SCALE, className = '' }: { spec: TrunkScaleSpec; size?: ScaleSize; className?: string }) {
  const g = trunkScaleGeometry(spec, size)
  return (
    <svg
      role="img"
      aria-label={spec.sentence}
      viewBox={`0 0 ${g.width} ${g.height}`}
      className={`block overflow-visible ${className}`}
      style={{ width: `${g.width / 16}rem`, height: `${g.height / 16}rem` }}
    >
      {g.segments.map((s) =>
        g.hollow ? (
          <rect
            key={s.key} data-step={s.key} x={s.x + 0.5} y={s.y + 0.5} width={s.w - 1} height={s.h - 1} rx={1}
            fill="none" stroke={SCALE_MUTED} strokeWidth={1} strokeDasharray="2 1.5"
          />
        ) : (
          <rect
            key={s.key} data-step={s.key} x={s.x} y={s.y} width={s.w} height={s.h} rx={1}
            fill={s.active ? SCALE_ACTIVE : SCALE_MUTED} fillOpacity={s.active ? 1 : SCALE_MUTED_OPACITY}
          />
        ),
      )}
      {g.tick && (
        <line x1={g.tick.x} x2={g.tick.x} y1={g.tick.y1} y2={g.tick.y2} stroke="currentColor" strokeWidth={g.tick.w} strokeLinecap="round" />
      )}
    </svg>
  )
}
