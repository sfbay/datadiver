// src/views/Trees/TreeCard.tsx
//
// The linkable tree card — `?tree=<site id>` (Trees.tsx owns the param). A
// top-right DetailPanelShell, moss glow. Mount it KEYED by site id: the live
// reads (useTreeCard) start fresh per site, so a previous site's row never
// flashes under a new number.
//
// What the card is in comes from cardState (treeCardModel.ts, pure, tested):
//   loading  the live row or notices are out (or, with no live row, the
//            snapshot that tells "left" from "unknown" is still loading)
//   site     the live row: title, Latin name, address, the fact table, the
//            species rank (→ ?species=), notices, nearby fall reports
//   left     in the snapshot, absent from a SUCCESSFUL live read
//   unknown  in neither
//   error    a read failed — with Retry, never shown as absence
//
// Every sentence comes from treesPhrase.ts. Labels in the fact table are
// plain nouns; the precision behind them lives in the data notes.

import type { ReactNode } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import { classifyRow } from '@/lib/trees/species'
import type { TreesAggregates, TreesSnapshot } from '@/lib/trees/types'
import type { NoteSectionId } from './dataNotes'
import { BRICK_600, MOSS_500 } from './mapLayers'
import { cardState, snapshotSite, speciesRank, type CardModel } from './treeCardModel'
import { CARD_ERROR, NOT_RECORDED, TRUNK_NOTE, UNKNOWN_SITE, leftInventoryNote } from './treesPhrase'
import { useTreeCard } from './useTreeCard'

const OCHRE_500 = '#d4a435'
/** Rem width of the card (the `w-[20rem]` literal below — a literal so
 *  Tailwind sees it); Trees.tsx's flyTo offset reads this figure. */
export const TREE_CARD_REM = 20

const LINK =
  'underline decoration-dotted underline-offset-2 hover:text-moss-600 dark:hover:text-moss-400 transition-colors'
const EYEBROW = 'text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 mb-1'

export interface TreeCardProps {
  siteId: number
  snapshot: TreesSnapshot | null
  snapshotError: string | null
  aggregates: TreesAggregates | null
  nowYear: number
  onClose(): void
  onRetrySnapshot(): void
  onPickNeighborhood(name: string): void
  onPickSpecies(name: string): void
  /** Opens the header's data-notes popover at a section ('tree'). */
  onOpenNotes(section: NoteSectionId): void
  insideSelectors?: string[]
}

function Dot({ color }: { color: string }) {
  return <span aria-hidden className="inline-block w-1.5 h-1.5 rounded-full shrink-0 mt-[0.4rem]" style={{ background: color }} />
}

function Fact({ label, children }: { label: string; children: ReactNode }) {
  return (
    <>
      <dt className="text-label font-mono uppercase tracking-[0.08em] text-slate-500 dark:text-slate-400 pt-px">{label}</dt>
      <dd className="font-serif text-xs text-slate-700 dark:text-slate-200 leading-snug">{children}</dd>
    </>
  )
}

const orNot = (v: string | null): string => v ?? NOT_RECORDED

function NotesLink({ onOpenNotes }: { onOpenNotes(section: NoteSectionId): void }) {
  const cls = 'text-nano font-mono uppercase tracking-[0.2em] text-slate-500 dark:text-slate-400 hover:text-moss-600 dark:hover:text-moss-400 transition-colors'
  return (
    <button type="button" onClick={() => onOpenNotes('tree')} className={cls}>
      Data notes ›
    </button>
  )
}

function SiteBody({
  model,
  siteId,
  onPickNeighborhood,
  onPickSpecies,
  onOpenNotes,
}: {
  model: CardModel
  siteId: number
  onPickNeighborhood(name: string): void
  onPickSpecies(name: string): void
  onOpenNotes(section: NoteSectionId): void
}) {
  const species = model.species
  return (
    <article data-tree-site={siteId}>
      <header className="pr-14">
        <p className={EYEBROW}>Site {siteId}</p>
        <h2 className="font-display text-xl leading-tight text-ink dark:text-white">{model.title}</h2>
        {model.latin && <p className="font-serif italic text-xs text-slate-600 dark:text-slate-300 mt-0.5">{model.latin}</p>}
        <p className="text-micro font-mono text-slate-500 dark:text-slate-400 mt-1">{model.address}</p>
      </header>

      <dl className="mt-3 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 items-baseline">
        <Fact label="Trunk size">{model.trunk}</Fact>
        <Fact label="Planted">{orNot(model.plantedDate)}</Fact>
        <Fact label="Legal status">{orNot(model.legalStatus)}</Fact>
        <Fact label="Planted by">{orNot(model.planter)}</Fact>
        <Fact label="Watered by">{orNot(model.watering)}</Fact>
        <Fact label="Site">{orNot(model.site)}</Fact>
        <Fact label="Plot">{orNot(model.plot)}</Fact>
        <Fact label="Neighborhood">
          {model.neighborhood ? (
            <button type="button" onClick={() => onPickNeighborhood(model.neighborhood as string)} className={`text-left ${LINK}`}>
              {model.neighborhood}
            </button>
          ) : (
            NOT_RECORDED
          )}
        </Fact>
      </dl>

      {model.rankLine && species && (
        <p className="mt-3 text-micro font-mono text-moss-700 dark:text-moss-400">
          <button type="button" onClick={() => onPickSpecies(species)} className={`text-left ${LINK}`}>
            {model.rankLine}
          </button>
        </p>
      )}

      {(model.notices.length > 0 || model.falls) && (
        <ul className="mt-3 space-y-1">
          {model.notices.map((line, i) => (
            <li key={`${i}|${line}`} className="flex gap-2 text-micro font-serif text-slate-700 dark:text-slate-200 leading-snug">
              <Dot color={OCHRE_500} />
              <span>{line}</span>
            </li>
          ))}
          {model.falls && (
            <li className="flex gap-2 text-micro font-serif text-slate-700 dark:text-slate-200 leading-snug">
              <Dot color={BRICK_600} />
              <span>{model.falls}</span>
            </li>
          )}
        </ul>
      )}

      <p className="mt-3 text-nano font-serif italic text-slate-500 dark:text-slate-400 leading-snug">{TRUNK_NOTE}</p>

      <div className="mt-3 flex flex-wrap items-baseline gap-x-4 gap-y-1">
        <NotesLink onOpenNotes={onOpenNotes} />
        <a
          href={model.portalUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`text-micro font-mono text-moss-700 dark:text-moss-400 ${LINK}`}
        >
          Open the city record ↗
        </a>
      </div>
    </article>
  )
}

function OneLine({ siteId, children }: { siteId: number; children: ReactNode }) {
  return (
    <article data-tree-site={siteId}>
      <header className="pr-14">
        <p className={EYEBROW}>Site {siteId}</p>
      </header>
      {children}
    </article>
  )
}

export default function TreeCard({
  siteId,
  snapshot,
  snapshotError,
  aggregates,
  nowYear,
  onClose,
  onRetrySnapshot,
  onPickNeighborhood,
  onPickSpecies,
  onOpenNotes,
  insideSelectors,
}: TreeCardProps) {
  const live = useTreeCard(siteId)
  const site = snapshotSite(snapshot, siteId)
  // The rank follows the LIVE row's own kind and species string (verbatim).
  const rank = live.row && aggregates
    ? speciesRank(aggregates.species, live.row.species, classifyRow(live.row.species))
    : null

  const state = cardState({
    siteId,
    inSnapshot: site !== null,
    snapshotKind: site?.kind ?? null,
    asOf: snapshot?.asOf ?? aggregates?.asOf ?? `${nowYear}-01-01`,
    loading: live.loading,
    error: live.error,
    row: live.row,
    notices: live.notices,
    extras: { fallsNearby: site?.fallsNearby ?? null, rank, ranked: aggregates?.species.length ?? 0 },
    nowYear,
    snapshot: snapshot ? 'ready' : snapshotError ? { failed: snapshotError } : 'loading',
  })

  const retry = () => {
    live.retry()
    if (snapshotError) onRetrySnapshot()
  }

  return (
    <DetailPanelShell
      open
      onClose={onClose}
      isLoading={state.kind === 'loading'}
      widthClass="w-[20rem]"
      mobileCompact
      glowColor={MOSS_500}
      spinnerClass="border-moss-500"
      buildShareUrl={() => window.location.href}
      shareAccentClass="text-moss-600"
      additionalInsideSelectors={insideSelectors}
    >
      {state.kind === 'site' && (
        <SiteBody
          model={state.model}
          siteId={siteId}
          onPickNeighborhood={onPickNeighborhood}
          onPickSpecies={onPickSpecies}
          onOpenNotes={onOpenNotes}
        />
      )}
      {state.kind === 'left' && (
        <OneLine siteId={siteId}>
          <p className="font-serif text-sm text-slate-700 dark:text-slate-200 leading-snug">{leftInventoryNote(state.asOf, nowYear, state.rowKind)}</p>
          <div className="mt-3"><NotesLink onOpenNotes={onOpenNotes} /></div>
        </OneLine>
      )}
      {state.kind === 'unknown' && (
        <OneLine siteId={siteId}>
          <p className="font-serif text-sm text-slate-700 dark:text-slate-200 leading-snug">{UNKNOWN_SITE}</p>
        </OneLine>
      )}
      {state.kind === 'error' && (
        <OneLine siteId={siteId}>
          {/* The raw fetch error stays off the card; it rides the title. */}
          <p title={state.message} className="font-serif text-sm text-slate-700 dark:text-slate-200 leading-snug">{CARD_ERROR}</p>
          <button
            type="button"
            onClick={retry}
            className="mt-3 px-2.5 py-1 rounded-md text-micro font-mono uppercase tracking-[0.15em] bg-moss-500/10 text-moss-700 dark:text-moss-400 hover:bg-moss-500/20 transition-colors"
          >
            Retry
          </button>
        </OneLine>
      )}
    </DetailPanelShell>
  )
}
