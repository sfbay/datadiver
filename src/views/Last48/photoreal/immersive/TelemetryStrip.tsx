// src/views/Last48/photoreal/immersive/TelemetryStrip.tsx
//
// The instrument band across the top of the map (Jesse, 2026-09-20): the
// top strip is TELEMETRY ONLY — where the camera is pointed, how it is
// pointed, what light the scene is wearing and whether the tiles have
// caught up. Everything you DO lives in the right rail; nothing in here is
// a control.
//
// Two rules it keeps. First, no abbreviations: an instrument band is the
// one place a UI reaches for HDG/ALT/LAT, and this one spells them out —
// Heading, Tilt, Altitude, Latitude, Longitude — because a reader who has
// never flown anything is the audience. Second, it stays quiet: no glow,
// no noise, no pigment. A dark plate, a double rule at its bottom edge (the
// house newspaper divider, the same two lines the band under the map wears)
// and mono figures that change under you.
import type { Grade } from '../grade'

interface Props {
  /** The camera TARGET: the active stop, or the camera's own ground point
   *  when there is no stop yet. Null before either exists. */
  lat: number | null
  lng: number | null
  /** Live camera, sampled by the scene. Null until the first sample lands. */
  headingDeg: number | null
  tiltDeg: number | null
  altitudeM: number | null
  tilesLoaded: boolean
  /** The grade the tiles are wearing. */
  grade: Grade
}

/** A measured cell: the spelled-out name, then the figure. */
function Cell({ label, value, pill }: { label: string; value: string; pill?: boolean }) {
  return (
    <span className="whitespace-nowrap flex items-center gap-1.5">
      <span className="text-paper-400">{label}</span>
      {pill ? <span className={PILL} style={PILL_STYLE}>{value}</span> : <span>{value}</span>}
    </span>
  )
}

/** Each reading sits in its own latte pill — the coffee-with-cream tone the
 *  active card wears — so the figures separate from their names at a glance. */
const PILL = 'inline-block rounded-full px-2 py-px leading-[1.15] text-ink'
const PILL_STYLE = { background: '#dcc9a6' } as const

/** The separator between cells INSIDE a group. Groups themselves are spaced. */
const Dot = () => <span className="text-paper-400" aria-hidden>·</span>

const GROUP = 'flex items-center gap-2 shrink-0'

/** 37.7749 → "37.7749° N". Four decimals ≈ 11 m, which is the precision the
 *  event feeds actually carry (an intersection, not a doorway). */
function formatLat(v: number): string {
  return `${Math.abs(v).toFixed(4)}° ${v < 0 ? 'S' : 'N'}`
}
function formatLng(v: number): string {
  return `${Math.abs(v).toFixed(4)}° ${v < 0 ? 'W' : 'E'}`
}
/** Compass degrees, always three digits — 035°, not 35°, so the figure does
 *  not change width as the camera swings. */
function formatHeading(deg: number): string {
  const n = ((Math.round(deg) % 360) + 360) % 360
  return `${String(n).padStart(3, '0')}°`
}
/** Cesium's pitch is negative looking DOWN; the strip reports the angle and
 *  names the direction rather than making the reader read a minus sign. */
function formatTilt(deg: number): string {
  const n = Math.round(deg)
  return `${Math.abs(n)}° ${n < 0 ? 'up' : 'down'}`
}

export default function TelemetryStrip({
  lat, lng, headingDeg, tiltDeg, altitudeM, tilesLoaded, grade,
}: Props) {

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 h-9 flex items-center gap-6 px-4 overflow-hidden
        font-mono text-[13px] tabular-nums text-paper-300
        bg-espresso-950/85 backdrop-blur-md border-b border-paper-300/15"
    >
      {/* Double rule: the plate's own bottom border plus this one, 3 px under
          it — the same divider the band below the map wears, inverted. */}
      <div className="absolute inset-x-0 -bottom-[3px] h-px bg-paper-300/15" aria-hidden />

      <div className={GROUP}>
        <span className="hidden xl:inline">San Francisco</span>
        <span className="hidden xl:inline"><Dot /></span>
        {lat != null && lng != null ? (
          <>
            <Cell label="Latitude" value={formatLat(lat)} pill />
            <Dot />
            <Cell label="Longitude" value={formatLng(lng)} pill />
          </>
        ) : (
          <span className="text-paper-400">Finding the ground…</span>
        )}
      </div>

      <div className={GROUP}>
        <Cell label="Heading" value={headingDeg != null ? formatHeading(headingDeg) : '—'} />
        <Dot />
        <Cell label="Tilt" value={tiltDeg != null ? formatTilt(tiltDeg) : '—'} />
        <Dot />
        <Cell label="Altitude" value={altitudeM != null ? `${altitudeM} m` : '—'} />
      </div>

      {/* No clock: a wall time beside a photograph reads as "live imagery",
          which these tiles are not (Jesse, 2026-09-20). The grade alone. */}
      <div className={`${GROUP} hidden xl:flex`}>
        <Cell label="Light" value={`${grade[0].toUpperCase()}${grade.slice(1)}`} />
      </div>

      <div className={`${GROUP} ml-auto`}>
        <span className="text-paper-400">{tilesLoaded ? 'Tiles settled' : 'Loading tiles…'}</span>
      </div>
    </div>
  )
}
