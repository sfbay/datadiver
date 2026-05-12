import type { NormalizedEvent } from '@/types/last48'
export default function Last48EventPeek(_: { event: NormalizedEvent; onClose: () => void }) {
  return <div className="absolute top-0 right-0 w-80 h-full bg-paper-50 dark:bg-espresso-900 border-l border-paper-300 dark:border-espresso-700 p-3">PEEK · placeholder</div>
}
