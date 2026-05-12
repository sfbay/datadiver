import type { NormalizedEvent } from '@/types/last48'
export default function FlowRail(_: {
  events: NormalizedEvent[]
  selectedId?: string
  onSelect: (e: NormalizedEvent) => void
}) {
  return <aside className="w-60 border-l border-paper-200/40 dark:border-espresso-700 p-2 font-mono text-[10px]">RAIL · placeholder</aside>
}
