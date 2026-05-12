import type { DatasetId } from '@/types/last48'
export default function DatasetFilterChips(_: { selected: DatasetId[]; onChange: (next: DatasetId[]) => void }) {
  return <div className="font-mono text-[10px] text-paper-500">filter chips · placeholder</div>
}
