import { TIER_1_DATASETS, TIER_2_DATASETS, type DatasetId } from '@/types/last48'

const LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911 Realtime',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases':         '311',
  '911-historical':    '911 Historical',
  'parking-revenue':   'Parking Revenue',
  'police-incidents':  'Police',
}

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',  // indigo (cool, sensitive)
  'fire-ems-dispatch': '#b85a33',  // terracotta
  '311-cases':         '#d47149',  // terracotta-400
  '911-historical':    '#5c9693',  // teal (paired with 911)
  'parking-revenue':   '#d4a435',  // ochre
  'police-incidents':  '#963e30',  // brick
}

interface Props {
  selected: DatasetId[]
  onChange: (next: DatasetId[]) => void
}

export default function DatasetFilterChips({ selected, onChange }: Props) {
  const allChips: DatasetId[] = [...TIER_1_DATASETS, ...TIER_2_DATASETS]
  const isSelected = (id: DatasetId) => selected.includes(id)

  const toggle = (id: DatasetId) => {
    if (isSelected(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {allChips.map((id) => {
        const active = isSelected(id)
        const isTier2 = TIER_2_DATASETS.includes(id)
        return (
          <button
            key={id}
            type="button"
            onClick={() => toggle(id)}
            className={`
              px-2.5 py-1 rounded-full font-mono text-[10px] tracking-wide
              border transition-colors
              ${active
                ? 'border-transparent text-white shadow-sm'
                : 'border-paper-300 dark:border-espresso-600 text-paper-600 dark:text-paper-400 hover:border-paper-500'}
              ${isTier2 && !active ? 'opacity-60' : ''}
            `}
            style={active ? { backgroundColor: COLORS[id] } : undefined}
            aria-pressed={active}
          >
            {active ? '✓ ' : '○ '}{LABELS[id]}
          </button>
        )
      })}
    </div>
  )
}
