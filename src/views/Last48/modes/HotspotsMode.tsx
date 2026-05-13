import type { Last48WindowResult } from '@/hooks/useLast48Window'
import type { DatasetId } from '@/types/last48'
export default function HotspotsMode(_: { window48: Last48WindowResult; datasets: DatasetId[] }) {
  return <div className="flex items-center justify-center h-full text-paper-500">HOTSPOTS · coming in Phase 2</div>
}
