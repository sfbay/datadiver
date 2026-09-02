import type { SearchResult } from './useOmniSearch'

export function SearchIcon({ size = 14 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 16 16"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      className="shrink-0"
    >
      <circle cx="7" cy="7" r="5" />
      <path d="M11 11l4 4" />
    </svg>
  )
}

interface ResultRowProps {
  result: SearchResult
  onSelect: (r: SearchResult) => void
  /** `slim` is the compact dropdown row; `grand` is the command-palette
   *  scale — the ⌘K modal empties the screen, so its terms must dominate it,
   *  not whisper at dropdown size. The Home box uses `grand` too. */
  size?: 'slim' | 'grand'
  /** `button` (default) is the modal's row — a real <button>. `option` is
   *  the combobox row: a `role="option"` div under a `role="listbox"` (a
   *  <button> inside a listbox is invalid ARIA — the FlowRail rule), driven
   *  by aria-activedescendant rather than focus. */
  as?: 'button' | 'option'
  /** Option only: the aria-activedescendant target. */
  active?: boolean
  id?: string
  /** Option only: mouse hover — the owner mirrors it into activeIdx so the
   *  keyboard and the pointer never disagree about which row Enter takes. */
  onHover?: () => void
}

const HOVER = 'hover:bg-paper-100/50 dark:hover:bg-white/[0.04]'
/** The active-option highlight equals the hover treatment — one row is
 *  "the one Enter takes", whichever input device pointed at it. */
const ACTIVE = 'bg-paper-100/50 dark:bg-white/[0.04]'

function RowBody({ result, grand }: { result: SearchResult; grand: boolean }) {
  return (
    <>
      <span className={`leading-none shrink-0 ${grand ? 'text-2xl' : 'text-base'}`}>
        {result.icon}
      </span>
      <span className="flex-1 min-w-0">
        {/* Name and code are SEPARATE spans on one line — only the name
            truncates, so a long region label can never clip away the code
            that is the precise unit the data is keyed by (the beat/region
            idiom from the ranking rows). Rows without a `code` render exactly
            as before: a single truncating label filling the line. */}
        <span className="flex items-baseline gap-2 min-w-0">
          <span
            className={`min-w-0 text-ink dark:text-paper-100 truncate ${
              grand ? 'text-lg desk:text-xl' : 'text-[13px]'
            }`}
          >
            {result.label}
          </span>
          {result.code && (
            <span
              className={`shrink-0 font-mono text-paper-600 dark:text-paper-400 ${
                grand ? 'text-sm' : 'text-micro'
              }`}
            >
              {result.code}
            </span>
          )}
        </span>
        <span
          className={`block font-mono text-paper-600 dark:text-paper-400 truncate ${
            grand ? 'text-sm mt-1' : 'text-micro mt-0.5'
          }`}
        >
          {result.sublabel}
        </span>
      </span>
      <span
        className={`font-mono text-paper-500 dark:text-paper-600 uppercase shrink-0 ${
          grand ? 'text-label tracking-widest' : 'text-nano tracking-wider'
        }`}
      >
        {result.category}
      </span>
    </>
  )
}

export function ResultRow({
  result,
  onSelect,
  size = 'slim',
  as = 'button',
  active = false,
  id,
  onHover,
}: ResultRowProps) {
  const grand = size === 'grand'
  const layout = grand ? 'gap-4 px-5 py-3.5' : 'gap-3 px-3 py-2'

  if (as === 'option') {
    return (
      <div
        role="option"
        id={id}
        aria-selected={active}
        // preventDefault on mousedown is load-bearing: it keeps the combobox
        // INPUT focused, so the panel (open = focused && query) does not
        // close before the click lands on this row.
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => onSelect(result)}
        onMouseEnter={onHover}
        className={`w-full flex items-center text-left cursor-pointer transition-colors ${HOVER} ${
          active ? ACTIVE : ''
        } ${layout}`}
      >
        <RowBody result={result} grand={grand} />
      </div>
    )
  }

  return (
    <button
      type="button"
      onClick={() => onSelect(result)}
      className={`w-full flex items-center text-left transition-colors ${HOVER} ${layout}`}
    >
      <RowBody result={result} grand={grand} />
    </button>
  )
}
