// Returns `true` when the tab is visible, `false` when hidden.
// Used by usePollCadence to pause polling when the user has the tab
// in the background — saves Socrata quota and avoids stale data races
// on tab restoration.

import { useEffect, useState } from 'react'

export function useTabVisibility(): boolean {
  const [visible, setVisible] = useState(() =>
    typeof document !== 'undefined' ? document.visibilityState === 'visible' : true
  )

  useEffect(() => {
    if (typeof document === 'undefined') return
    const onChange = () => setVisible(document.visibilityState === 'visible')
    document.addEventListener('visibilitychange', onChange)
    return () => document.removeEventListener('visibilitychange', onChange)
  }, [])

  return visible
}
