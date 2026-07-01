// src/lib/alerts/radii.ts
//
// Single source of truth for the subscribable alert radii (in miles), shared by
// BOTH the client radius pills (src/views/Alerts/AlertsView.tsx) and the server
// validator (api/alerts/subscribe.ts). The two MUST agree: the "invalid radius"
// subscribe failure (June 2026) was exactly this list drifting — the ⅛-mi
// (0.125) pill was added to the client but never to the server allow-list, so
// every ⅛-mi subscription was rejected at validate(). Keep this the ONLY
// definition; never re-introduce a local copy on either side.
//
// 0.125 = 1/8 is an exact binary float, so the validator's `.includes()`
// equality check is safe (it would not be for a value like 0.1).
export const ALERT_RADII: readonly number[] = [0.125, 0.25, 0.5, 1, 2]
