// src/views/Last48/modes/BootEmanation.tsx
//
// Calm sonar-ping boot pulse — 2–3 rings expand from map center then fade.
// Reuses @keyframes emanate from src/index.css. Mounts once on view mount,
// self-unmounts after ~2.4s. Not rotating — that motion was rejected in PR #37.
// Does NOT re-fire on layer toggles; the component is stable-mounted inside
// Last48UnifiedView which persists for the view lifetime.

import { useEffect, useState } from 'react'

export default function BootEmanation() {
  const [visible, setVisible] = useState(true)
  useEffect(() => {
    const t = setTimeout(() => setVisible(false), 2400)
    return () => clearTimeout(t)
  }, [])

  if (!visible) return null

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center motion-reduce:hidden">
      <svg width="200" height="200" viewBox="0 0 200 200" style={{ overflow: 'visible' }}>
        <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.75)" strokeWidth="1"
          style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out forwards' }} />
        <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.55)" strokeWidth="1"
          style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out 0.5s forwards' }} />
        <circle cx="100" cy="100" r="20" fill="none" stroke="rgba(245,236,217,0.35)" strokeWidth="1"
          style={{ transformBox: 'view-box', transformOrigin: '100px 100px', animation: 'emanate 1.9s ease-out 1.0s forwards' }} />
      </svg>
    </div>
  )
}
