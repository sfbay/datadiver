// The funder "baseball card" — spec §4. A top-right DetailPanelShell over
// the committee view (never a column takeover), mounted by CampaignFinance
// only when `?funder=` parses and the active city's builders carry a
// `funder` block (SF; Oakland's is null and the card never mounts there).
import { useState } from 'react'
import DetailPanelShell from '@/components/ui/DetailPanelShell'
import ExportButton from '@/components/export/ExportButton'
import { useFunderProfile } from '@/hooks/useFunderProfile'
import { displayName } from '@/lib/funders/funderKey'
import type { FunderBuilders } from '../fppcDialect'
import FunderMasthead from './FunderMasthead'
import FunderTiles from './FunderTiles'

export default function FunderCard({ keyParam, fzip, builders, onClose, onSetZip }: {
  keyParam: string
  fzip: string | null
  builders: FunderBuilders
  onClose: () => void
  onSetZip: (zip: string | null) => void
}) {
  const { profile, failed, isLoading, retry } = useFunderProfile(keyParam, fzip, builders)
  // Owned here for Task 6's YearStrip (click-to-filter); unused until then —
  // referenced via data-year below so the value isn't dead in the meantime.
  const [year, setYear] = useState<number | null>(null)

  // profile.gifts is entirely byYear-derived — a failed byYear also reads
  // gifts === 0, which is an ARTIFACT of the failure, not a fact. The empty
  // line must never render off a section that didn't load; the byYear-retry
  // line below takes its place instead.
  const isEmpty = !!profile && !isLoading && !failed.includes('byYear') && profile.gifts === 0

  return (
    <DetailPanelShell
      open
      onClose={onClose}
      isLoading={isLoading && !profile}
      widthClass="w-[26rem]"
      mobileCompact
      glowColor="#8b6282"
      spinnerClass="border-plum-400"
      buildShareUrl={() => window.location.href}
    >
      <div id="funder-card" data-year={year ?? ''}>
        <div className="flex items-start justify-between gap-2 mb-1">
          <div className="min-w-0 flex-1">
            <FunderMasthead profile={profile} failed={failed} onSetZip={onSetZip} fzip={fzip} />
          </div>
          <ExportButton targetSelector="#funder-card" filename={displayName(keyParam)} />
        </div>

        {failed.includes('variants') && (
          <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
            Filed-as details did not load —{' '}
            <button
              type="button"
              onClick={() => retry('variants')}
              className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
            >
              retry
            </button>
          </p>
        )}

        {failed.includes('byYear') && (
          <p className="text-micro font-mono text-slate-400 dark:text-slate-500 mt-1">
            Totals did not load —{' '}
            <button
              type="button"
              onClick={() => retry('byYear')}
              className="underline decoration-dotted underline-offset-2 hover:text-plum-500 dark:hover:text-plum-400 transition-colors"
            >
              retry
            </button>
          </p>
        )}

        {isEmpty && (
          <p className="text-micro font-serif italic text-slate-500 dark:text-slate-400 mt-3">
            No itemized gifts found under this name — {displayName(profile!.key)}
          </p>
        )}

        {profile && <FunderTiles profile={profile} failed={failed} retry={retry} />}

        {/* Task 6: YearStrip */}
        {/* Task 7: Recipients · FiledAs · GiftList · Footer */}
      </div>
    </DetailPanelShell>
  )
}
