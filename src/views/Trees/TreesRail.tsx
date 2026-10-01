// src/views/Trees/TreesRail.tsx
//
// The Trees rail: MapSidebar (a bottom sheet on mobile) with three tabs that
// ARE the lenses — a tab writes `?lens=` through the same setter as the
// header pills, so the URL stays the one source of truth. The header pills
// stay because the rail can be collapsed (desktop) or sit as a peeking sheet
// (mobile); either way the lens is still one click away.
//
// The wrapper carries `data-trees-rail`: the tree card lists it as an
// inside-selector, so a click in the rail re-targets the card rather than
// closing it. Each tab ends with one "Data notes ›" link to its section.
//
// The rail reads only the small aggregates file — it never waits for the
// 144k-site snapshot.

import { Link } from 'react-router-dom'
import MapSidebar from '@/components/layout/MapSidebar'
import { SkeletonSidebarRows } from '@/components/ui/Skeleton'
import type { TreesAggregates } from '@/lib/trees/types'
import type { NoteSectionId } from './dataNotes'
import EquityTab from './EquityTab'
import ExploreTab from './ExploreTab'
import SafetyTab from './SafetyTab'
import { RAIL_ERROR } from './treesPhrase'
import { LENSES, LENS_LABEL, type EquityRank, type Lens } from './treesUrl'

/** Until the header's notes popover lands, the link goes to the
 *  inventory's About row (the tree card does the same). */
const INVENTORY_NOTES_HREF = '/about#source-sf-tkzw-k3nq'

export interface TreesRailProps {
  lens: Lens
  onLens(lens: Lens): void
  agg: TreesAggregates | null
  aggError: string | null
  onRetry(): void
  species: string | null
  onSpecies(name: string | null): void
  onTree(id: number): void
  onNeighborhood(name: string): void
  /** Equity: the measure (`?rank=`) and the resolved `?nh=` selection. */
  rank: EquityRank
  onRank(rank: EquityRank): void
  neighborhood: string | null
  onSelectNeighborhood(name: string | null): void
  onOpenNotes?: (section: NoteSectionId) => void
  /** The reader's year, for AP dates (Safety's busiest day, the former-sites log). */
  nowYear: number
}

function NotesLink({ section, onOpenNotes }: { section: NoteSectionId; onOpenNotes?: (section: NoteSectionId) => void }) {
  const cls = 'font-mono text-micro uppercase tracking-[0.18em] text-paper-600 dark:text-paper-400 hover:text-moss-600 dark:hover:text-moss-400 transition-colors'
  return onOpenNotes ? (
    <button type="button" onClick={() => onOpenNotes(section)} className={cls}>Data notes ›</button>
  ) : (
    <Link to={INVENTORY_NOTES_HREF} className={cls}>Data notes ›</Link>
  )
}

export default function TreesRail(props: TreesRailProps) {
  const { lens, onLens, agg, aggError, onRetry, onOpenNotes } = props

  return (
    <div data-trees-rail className="contents">
      <MapSidebar>
        <div role="tablist" aria-label="Lens" className="flex gap-1 p-2 border-b border-paper-200/60 dark:border-white/[0.04] flex-shrink-0">
          {LENSES.map((l) => (
            <button
              key={l}
              type="button"
              role="tab"
              aria-selected={lens === l}
              onClick={() => onLens(l)}
              className={`flex-1 py-1.5 rounded-lg text-micro font-mono uppercase tracking-[0.15em] transition-colors duration-200 ${
                lens === l
                  ? 'bg-ochre-500/10 ring-1 ring-ochre-500/30 text-ink dark:text-white'
                  : 'text-paper-500 dark:text-paper-600 hover:text-paper-700 dark:hover:text-paper-400'
              }`}
            >
              {LENS_LABEL[l]}
            </button>
          ))}
        </div>

        <div role="tabpanel" aria-label={LENS_LABEL[lens]} className="p-4 flex-1 flex flex-col">
          {!agg ? (
            aggError ? (
              <div className="flex flex-col items-start gap-2">
                <p className="font-serif text-xs text-paper-700 dark:text-paper-300">{RAIL_ERROR}</p>
                <button type="button" onClick={onRetry} className="font-mono text-micro uppercase tracking-[0.15em] text-moss-700 dark:text-moss-400 hover:underline">
                  Retry
                </button>
              </div>
            ) : (
              <SkeletonSidebarRows count={8} />
            )
          ) : lens === 'explore' ? (
            <ExploreTab
              agg={agg}
              species={props.species}
              onSpecies={props.onSpecies}
              onTree={props.onTree}
              onNeighborhood={props.onNeighborhood}
            />
          ) : lens === 'equity' ? (
            <EquityTab
              agg={agg}
              rank={props.rank}
              onRank={props.onRank}
              neighborhood={props.neighborhood}
              onSelect={props.onSelectNeighborhood}
            />
          ) : (
            <SafetyTab
              agg={agg}
              neighborhood={props.neighborhood}
              onSelect={props.onSelectNeighborhood}
              nowYear={props.nowYear}
            />
          )}
          <div className="mt-6">
            <NotesLink section={lens} onOpenNotes={onOpenNotes} />
          </div>
        </div>
      </MapSidebar>
    </div>
  )
}
