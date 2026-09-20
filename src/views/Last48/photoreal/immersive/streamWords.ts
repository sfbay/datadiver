// src/views/Last48/photoreal/immersive/streamWords.ts
//
// Reader-facing stream names for SENTENCES — the band's status line and the
// here card's counts. The map chips shout in caps (DATASET_META.label);
// these are the same three streams said quietly. Zero-import so the pure
// leaves (here.ts) and the components can both read them.
import type { DatasetId } from '@/types/last48'

export const STREAM_WORD: Record<DatasetId, string> = {
  '911-realtime': '911 dispatch',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases': '311 case',
}
