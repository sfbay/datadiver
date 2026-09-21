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
//
// Round B: when the reader clicks open ground the left cell becomes the
// HERE reading (neighborhood, corner, the last 48 hours within 300 m, one
// ACS line) — still a reading, not a control; the ✕ is its only button.
import type { Grade } from '../grade'
import type { HereReading } from './useHereCard'

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
  /** Round B §3: the here reading, when a ground click opened one. Replaces
   *  the San Francisco · Latitude · Longitude cell while open. */
  here: HereReading | null
  onCloseHere: () => void
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
  lat, lng, headingDeg, tiltDeg, altitudeM, tilesLoaded, grade, here, onCloseHere,
}: Props) {

  return (
    <div
      className="pointer-events-none absolute inset-x-0 top-0 z-20 min-h-9 py-1 flex flex-wrap items-center gap-x-6 gap-y-1 px-4
        font-mono text-[13px] tabular-nums text-paper-300
        bg-espresso-950/85 backdrop-blur-md border-b border-paper-300/15"
    >
      {/* Double rule: the plate's own bottom border plus this one, 3 px under
          it — the same divider the band below the map wears, inverted. */}
      <div className="absolute inset-x-0 -bottom-[3px] h-px bg-paper-300/15" aria-hidden />

      {here ? (
        // The here reading: neighborhood as the leading pill (it is the
        // answer to "where is this"), then the corner, the counts, the ACS
        // line — each omitted when unknown, never printed as a dash. Its own
        // class string (no `shrink-0` — GROUP's is what stopped the wrap
        // from ever engaging) so a long reading wraps to a second line
        // inside the plate instead of spilling off it. The live region wraps
        // ONLY the reading text — the ✕ sits outside it as a sibling, so
        // closing (or the corner landing) never re-announces a button the
        // reader is already focused on.
        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 pointer-events-auto">
          <span className="flex flex-wrap items-center gap-x-2 gap-y-1" role="status" aria-live="polite">
            {here.neighborhood && <span className={PILL} style={PILL_STYLE}>{here.neighborhood}</span>}
            {here.corner && (<>{here.neighborhood && <Dot />}<span>{here.corner}</span></>)}
            {(here.neighborhood || here.corner) && <Dot />}
            <span>{here.nearby}</span>
            {here.acs && (<><Dot /><span>{here.acs}</span></>)}
          </span>
          <button
            type="button" onClick={onCloseHere} aria-label="Close" title="Close (Escape)"
            className="ml-1 h-6 w-6 rounded-full text-paper-400 hover:text-paper-100 hover:bg-paper-300/15 leading-none focus-visible:outline focus-visible:outline-1 focus-visible:outline-paper-300"
          >×</button>
        </div>
      ) : (
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
      )}

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
