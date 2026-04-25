import type { ReactNode } from 'react'

/**
 * Shared section wrapper used across the polished right-sidebar panels.
 *
 * # Why this exists
 *
 * Properties, Insights, and Reports all render a stack of "sections" — a
 * small uppercase label over a block of content. Pre-Wave-17D each panel
 * defined its own inline `<h3>` idiom with slightly different tracking,
 * weights, and margins. The JSON-Crack idiom (`text-[11px] font-semibold
 * uppercase tracking-wider`) was the consensus target but only the
 * PropertiesPanel's local `Section` helper honoured it perfectly.
 *
 * This component locks that treatment in. It exposes two layout modes:
 *
 * - `plain` (default): just the header + children, no wrapping card. Good
 *   when the content already has its own borders (e.g. the InsightCard
 *   stack which uses per-card colour accents).
 * - `card`: wraps children in the soft-bordered card surface used by
 *   UtilizationWidgets and NeighborhoodMetrics so numeric readouts read
 *   as discrete readouts rather than loose text.
 *
 * # Subtitle
 *
 * Reports and the bigger readouts benefit from a one-line "what does this
 * show?" under the header. For simple sections it's noise, so it stays
 * optional. When present it renders in the same muted gray all the other
 * panel sub-labels use.
 *
 * # Sticky headers
 *
 * Passing `sticky` switches the header to `sticky top-0` with a matching
 * backdrop-blurred background — useful inside long scroll regions. The
 * parent has to carry the scroll (`overflow-y-auto`) and `position:
 * relative`, but the default inside the RightSidebar tabpanel already
 * satisfies both. Off by default because short panels would show a floaty
 * header with nothing to scroll past, which looks wrong.
 */
export interface PanelSectionProps {
  /** Uppercase section label rendered at the top. */
  title: string
  /** Optional one-line explanation rendered under the title. */
  subtitle?: string
  /** Optional action slot aligned to the right of the title row. */
  actions?: ReactNode
  /** Section contents. */
  children: ReactNode
  /** Wrap children in the bordered card surface. Default `false`. */
  card?: boolean
  /** Make the header sticky to the top of the scroll container. Default `false`. */
  sticky?: boolean
  /** Extra classes on the outer element. */
  className?: string
  /** Accessible name for the enclosing region. Defaults to `title`. */
  ariaLabel?: string
}

export function PanelSection({
  title,
  subtitle,
  actions,
  children,
  card = false,
  sticky = false,
  className,
  ariaLabel,
}: PanelSectionProps) {
  const headerClass = [
    'flex items-center justify-between gap-2',
    sticky
      ? 'sticky top-0 z-[1] -mx-3 px-3 py-1.5 bg-white/95 dark:bg-gray-950/95 backdrop-blur'
      : '',
  ]
    .filter(Boolean)
    .join(' ')

  const content = card ? (
    <div className="rounded-md border border-gray-200 dark:border-gray-800 bg-gray-50/60 dark:bg-gray-900/40 p-3">
      {children}
    </div>
  ) : (
    children
  )

  return (
    <section
      aria-label={ariaLabel ?? title}
      className={`flex flex-col gap-2 ${className ?? ''}`}
    >
      <div className={headerClass}>
        <div className="flex flex-col min-w-0">
          <h3 className="text-[11px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
            {title}
          </h3>
          {subtitle && (
            <p className="text-[11px] text-gray-500 dark:text-gray-400 normal-case tracking-normal font-normal mt-0.5">
              {subtitle}
            </p>
          )}
        </div>
        {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
      </div>
      {content}
    </section>
  )
}
