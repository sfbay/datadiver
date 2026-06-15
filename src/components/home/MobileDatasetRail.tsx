// src/components/home/MobileDatasetRail.tsx
//
// Mobile-only dataset discovery. With the sidebar nav now behind the hamburger
// (below md), Home has no visible dataset navigation — so surface a swipeable
// rail of dataset chips right under the Dana hero, leading with The Last 48, to
// point users straight at the data. Hidden at md+ where the sidebar returns.

import { useNavigate } from 'react-router-dom'
import { NAV_ITEMS } from '@/components/layout/AppShell'

// Skip Home itself, and the non-dataset utility routes.
const HIDDEN_PATHS = new Set<string>(['/', '/about', '/alerts'])

export default function MobileDatasetRail() {
  const navigate = useNavigate()
  const items = NAV_ITEMS.filter((i) => !HIDDEN_PATHS.has(i.path))

  return (
    // Break out of the page's clamp() padding so the rail scrolls edge-to-edge,
    // then re-add the inset inside so the first chip still aligns with content.
    <nav
      aria-label="Datasets"
      className="md:hidden -mx-[clamp(16px,3vw,64px)] mb-12"
    >
      <div className="flex gap-2 overflow-x-auto snap-x px-[clamp(16px,3vw,64px)] pb-1">
        {items.map((item) => (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            className="snap-start shrink-0 flex items-center gap-2 rounded-full
              border border-paper-300/60 dark:border-espresso-700
              bg-paper-100/70 dark:bg-espresso-900/70
              pl-1.5 pr-3.5 py-1.5 hover:border-paper-500 dark:hover:border-espresso-500 transition-colors"
          >
            <span
              className="relative flex items-center justify-center w-6 h-6 rounded-full text-[9px] font-mono font-bold text-white shrink-0"
              style={{ backgroundColor: item.accentColor }}
            >
              {item.shortLabel}
              {item.path === '/live' && (
                <span className="pulse-live absolute -top-0.5 -right-0.5 w-1.5 h-1.5 rounded-full bg-brick-500" />
              )}
            </span>
            <span className="whitespace-nowrap text-[13px] font-semibold text-ink dark:text-paper-100">
              {item.label}
            </span>
          </button>
        ))}
      </div>
    </nav>
  )
}
