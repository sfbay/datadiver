import { LAST48_DATASETS, type DatasetId } from '@/types/last48'

const LABELS: Record<DatasetId, string> = {
  '911-realtime':      '911 Realtime',
  'fire-ems-dispatch': 'Fire/EMS',
  '311-cases':         '311',
}

const COLORS: Record<DatasetId, string> = {
  '911-realtime':      '#616a96',  // indigo (cool, sensitive)
  'fire-ems-dispatch': '#b85a33',  // terracotta
  '311-cases':         '#7a9954',  // moss — civic upkeep, distinct from terracotta Fire/EMS
}

interface Props {
  selected: DatasetId[]
  onChange: (next: DatasetId[]) => void
}

export default function DatasetFilterChips({ selected, onChange }: Props) {
  const allChips: DatasetId[] = LAST48_DATASETS
  const isSelected = (id: DatasetId) => selected.includes(id)

  const toggle = (id: DatasetId) => {
    if (isSelected(id)) onChange(selected.filter((s) => s !== id))
    else onChange([...selected, id])
  }

  return (
    <div className="flex flex-wrap gap-2 items-center">
      {allChips.map((id) => {
        const active = isSelected(id)
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
                : 'opacity-50 border-paper-300 dark:border-espresso-600 text-paper-600 dark:text-paper-400 hover:border-paper-500 hover:opacity-75'}
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
