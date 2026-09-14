// src/views/Last48/photoreal/immersive/Last48Immersive.tsx
//
// /live/immersive — Spec A2. The slow documentary: one incident at a time,
// a lower-third band, a dream-paced camera. This file owns the DATA (the
// same 48h window hook as /live, same cite purposes — the route is a detail
// route of the `live` family, so the manifest's sources cover it), the URL
// contract (?event= is the active stop, ?play=1 auto-advance, ?tune=1 the
// dev panel, ?tod= the grade override), the carousel state, keys, hold and
// the overlay. Chrome is off (AppShell reads routeChrome); mobile / no key /
// resting never reach this file (ImmersiveGate).
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAppStore } from '@/stores/appStore'
import { useLast48Window } from '@/hooks/useLast48Window'
import { LAST48_DATASETS, type NormalizedEvent } from '@/types/last48'
import { PACE_PRESETS } from '../../ambient/pace'
import { chainTour } from '../tourChain'
import { carouselIndex, stepIndex, peekIds, queueIds } from './carousel'
import { useAutoAdvance } from './useAutoAdvance'
import LowerThird from './LowerThird'
import RightRail, { HOLD_MS } from './RightRail'
import FrameTicks from './FrameTicks'
import ImmersiveScene from './ImmersiveScene'

/** Value equality over the fields anything downstream reads (the director's
 *  target, the hero/disc discs, the card). A poll that changes none of these
 *  must not produce a new object. */
function sameEvent(a: NormalizedEvent | undefined, b: NormalizedEvent | undefined): boolean {
  return (
    a != null && b != null &&
    a.id === b.id &&
    a.longitude === b.longitude && a.latitude === b.latitude &&
    a.receivedAt === b.receivedAt && a.state === b.state
  )
}

/** Element-wise identity — the members are already stabilised by `sameEvent`. */
function sameList(a: readonly NormalizedEvent[], b: readonly NormalizedEvent[]): boolean {
  return a.length === b.length && a.every((e, i) => e === b[i])
}

export default function Last48Immersive() {
  const [searchParams, setSearchParams] = useSearchParams()
  const navigate = useNavigate()
  const hostRef = useRef<HTMLDivElement>(null)

  const window48 = useLast48Window({
    datasets: LAST48_DATASETS,
    cite: { viewId: 'live', sample: 'window-sample', count: 'window-count' },
  })
  const events = useMemo(
    () => window48.events.filter((e) => e.longitude != null && e.latitude != null),
    [window48.events],
  )

  // ── URL contract ──────────────────────────────────────────────────────
  const activeId = searchParams.get('event')
  const playing = searchParams.get('play') === '1'
  const tuneOn = searchParams.get('tune') === '1'
  const todOverride = searchParams.get('tod')
  const setParam = useCallback((key: string, value: string | null) => {
    setSearchParams((prev) => {
      if ((prev.get(key) ?? null) === value) return prev
      const np = new URLSearchParams(prev)
      if (value) np.set(key, value); else np.delete(key)
      return np
    }, { replace: true })
  }, [setSearchParams])

  // Identity is STABILISED by VALUE: useLast48Window re-creates every event
  // object on each poll (911 every 2 min), so an unchanged active stop used to
  // arrive as a brand-new object — and the director memoises its leg on the
  // target's identity, so the camera re-flew 18 s to the SAME stop every two
  // minutes (hero + discs rebuilt, preload re-aimed). Cache by id and return
  // the PREVIOUS object whenever the fields anything downstream reads are
  // equal; everything below (active / prev / next / queue / discs) inherits it.
  // Same pattern as Spec A's `stableSelected` in Last48Photoreal.tsx.
  const stableById = useRef(new Map<string, NormalizedEvent>())
  const byId = useMemo(() => {
    const was = stableById.current
    const out = new Map<string, NormalizedEvent>()
    for (const e of events) {
      const prior = was.get(e.id)
      out.set(e.id, sameEvent(prior, e) ? prior! : e)
    }
    // Ref write inside the memo: the memo IS the identity cache and only ever
    // stores what it is about to return (the house pattern). Rebuilding the map
    // also drops ids that have left the 48 h window.
    stableById.current = out
    return out
  }, [events])

  // The pass: newest 24, nearest-neighbour chain. Recomputed when the window
  // polls; the id-based index below survives the reorder.
  const chain = useMemo(() => chainTour(events), [events])
  // The active stop must never age out mid-dwell. chainTour keeps only the
  // newest 24, so once the current stop slips out of that set carouselIndex
  // fell back to 0 and the write-back effect rewrote ?event= to the newest
  // stop under the viewer — a camera jump mid-dwell. While the id is still
  // inside the 48 h window, keep it as the head of the pass and let the chain
  // continue behind it (index 0 ⇒ the write-back below stays quiet).
  const order = useMemo(() => {
    if (!activeId || !byId.has(activeId) || chain.includes(activeId)) return chain
    return [activeId, ...chain]
  }, [chain, activeId, byId])

  const index = carouselIndex(order, activeId)
  const active = index >= 0 ? byId.get(order[index]) ?? null : null
  // Keep ?event= truthful: an absent/stale id resolves to the newest stop and
  // the URL is written to say so (a copied link reopens the same stop).
  useEffect(() => {
    if (index >= 0 && order[index] !== activeId) setParam('event', order[index])
  }, [index, order, activeId, setParam])

  const peeks = peekIds(order, index)
  const prev = peeks.prev ? byId.get(peeks.prev) ?? null : null
  // The next TWO stops: the band's two forward tiles AND the map's two dim
  // discs are the same pair, so there is one list (the old six-row queue went
  // with the queue list itself — Jesse, 2026-09-13). Stabilised because its
  // members are identity-stable above but a fresh array on every poll would
  // still re-run ImmersiveScene's setQueue effect (rebuilding the discs) for
  // no change.
  const aheadRef = useRef<NormalizedEvent[]>([])
  const ahead = useMemo(() => {
    const fresh = queueIds(order, index, 2).map((id) => byId.get(id)).filter((e): e is NormalizedEvent => !!e)
    const out = sameList(aheadRef.current, fresh) ? aheadRef.current : fresh
    aheadRef.current = out
    return out
  }, [order, index, byId])

  const jump = useCallback((id: string) => { setParam('event', id) }, [setParam])
  const step = useCallback((delta: 1 | -1) => {
    const i = stepIndex(order, index, delta)
    if (i >= 0) setParam('event', order[i])
  }, [order, index, setParam])

  // ── Arrival, play, hold, overlay ──────────────────────────────────────
  const [arrived, setArrived] = useState(false)
  useEffect(() => { setArrived(false) }, [activeId])
  const [holdLeftMs, setHoldLeftMs] = useState(0)
  const holdUntilRef = useRef(0)
  const startHold = useCallback(() => {
    holdUntilRef.current = Date.now() + HOLD_MS
    setHoldLeftMs(HOLD_MS)
  }, [])
  const hold = holdLeftMs > 0
  // One 100 ms ticker for the whole hold (deps on the BOOLEAN, so the ticker
  // is not torn down and rebuilt on every tick it causes).
  useEffect(() => {
    if (!hold) return
    const id = setInterval(() => setHoldLeftMs(Math.max(0, holdUntilRef.current - Date.now())), 100)
    return () => clearInterval(id)
  }, [hold])
  const [overlayOn, setOverlayOn] = useState(true)
  const reducedMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, [])
  const pace = PACE_PRESETS.dream

  useAutoAdvance({ playing, arrived, hold, dwellMs: pace.dwellMs, stopKey: activeId, onAdvance: () => step(1) })

  const leave = useCallback(() => {
    navigate(activeId ? `/live?event=${encodeURIComponent(activeId)}` : '/live')
  }, [navigate, activeId])
  // Google quota/auth refusal: the same session-only flag Spec A sets, so the
  // classic page shows its resting note and the gate blocks re-entry today.
  const rest = useCallback(() => {
    useAppStore.setState({ photorealResting: true })
    leave()
  }, [leave])

  // ── Keys (Spec A2 §2, §6; Plan ruling 3 adds Space) ───────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const t = e.target as HTMLElement | null
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return
      // Never swallow a browser/OS chord — ⌘← and Alt← are Back, and this page
      // is one keypress from the classic view.
      if (e.metaKey || e.ctrlKey || e.altKey) return
      switch (e.key) {
        case 'ArrowLeft': e.preventDefault(); step(-1); break
        case 'ArrowRight': e.preventDefault(); step(1); break
        case ' ': e.preventDefault(); setParam('play', playing ? null : '1'); break
        case 'o': case 'O': setOverlayOn((v) => !v); break
        case 'h': case 'H': startHold(); break
        case 'Escape': if (!overlayOn) setOverlayOn(true); else leave(); break
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [step, playing, overlayOn, setParam, startHold, leave])

  // The chrome is an L: controls down the RIGHT, content along the BOTTOM
  // (Jesse, 2026-09-13). Both arms mount and unmount together with the
  // overlay, so `O` leaves the map filling the whole window.
  return (
    <div className="flex h-full flex-row bg-espresso-950">
      <div className="flex-1 min-w-0 flex flex-col">
        <div ref={hostRef} className="relative flex-1 min-h-0" data-photoreal-host>
          <ImmersiveScene
            hostRef={hostRef}
            active={active}
            next={ahead[0] ?? null}
            queue={ahead}
            pace={pace}
            hold={hold}
            reducedMotion={reducedMotion}
            todOverride={todOverride}
            tuneOn={tuneOn}
            onArrived={() => setArrived(true)}
            onPick={jump}
            onUserInput={() => { if (playing) setParam('play', null) }}
            onRest={rest}
          />
          {!overlayOn && <FrameTicks hostRef={hostRef} />}
          {!overlayOn && (
            <p className="pointer-events-none absolute left-1/2 top-3 z-10 -translate-x-1/2 rounded-full bg-espresso-900/70 px-3 py-1 font-mono text-nano uppercase tracking-widest text-paper-300/80">
              O · overlay
            </p>
          )}
        </div>
        {overlayOn && (
          <LowerThird
            prev={prev}
            active={active}
            ahead={ahead}
            onJump={jump}
            onStep={step}
          />
        )}
      </div>
      {overlayOn && (
        <RightRail
          playing={playing}
          holdLeftMs={holdLeftMs}
          onPlayToggle={() => setParam('play', playing ? null : '1')}
          onHold={startHold}
          onOverlayToggle={() => setOverlayOn(false)}
          onExit={leave}
        />
      )}
    </div>
  )
}
