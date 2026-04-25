import type { ReactNode } from 'react'

/**
 * Shared header row used at the top of every polished right-sidebar panel.
 *
 * # Why this exists
 *
 * The editor's right sidebar has five tabs (Properties / People / Reports /
 * Insights / Annotations-is-nested) and until Wave 17D each panel rolled its
 * own header: different font sizes, different count-pill styling, different
 * action-button treatments. Cycling between tabs felt like flipping between
 * three slightly different apps.
 *
 * This component is the visual grammar for that row: a single responsible
 * place for the panel title, the optional count pill next to it, and the
 * optional action slot on the right (Add / Refresh / "Open full report"
 * link). The Properties and People tabs currently render their own headers
 * inline — they're stable and we deliberately don't retrofit them in this
 * wave. This component picks up the pattern for the three panels we're
 * polishing now and for whichever sidebar panel someone adds next.
 *
 * # Layout
 *
 * - `justify-between` so the action slot pushes to the right.
 * - `border-b` + `pb-2.5` + `mb-3` — the same spacing PeoplePanel and
 *   PropertiesPanel use so stacking them in the same scroll area looks
 *   intentional.
 * - `tabular-nums` on the count pill: a jumping count ("3" → "12" → "3")
 *   shouldn't shift the title beside it.
 *
 * # Empty/null rules
 *
 * - `count` left `undefined` hides the pill (don't render "0" — it reads as
 *   stale data rather than an intentional zero).
 * - `actions` is a slot; callers can pack icon-buttons or a text link there.
 *   We intentionally don't expose a typed `{ icon, onClick }` array because
 *   the call sites vary (Refresh is a button, "Open full reports" is a
 *   Link) — a slot keeps both simple.
 */
export interface PanelHeaderProps {
  /** Title shown on the left. Short noun phrase (e.g. "Annotations"). */
  title: string
  /** Optional numeric badge shown next to the title. Hidden when undefined. */
  count?: number
  /** Optional action slot on the right — buttons, links, icon clusters. */
  actions?: ReactNode
  /** Optional subtitle shown under the title. Rarely needed; omit by default. */
  subtitle?: string
  /** Extra class applied to the outer element. */
  className?: string
}

export function PanelHeader({
  title,
  count,
  actions,
  subtitle,
  className,
}: PanelHeaderProps) {
  return (
    <div
      data-testid="panel-header"
      className={`flex items-start justify-between gap-2 pb-2.5 border-b border-gray-100 dark:border-gray-800 mb-3 ${
        className ?? ''
      }`}
    >
      <div className="flex flex-col min-w-0">
        <div className="flex items-center gap-2 min-w-0">
          <h2 className="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">
            {title}
          </h2>
          {typeof count === 'number' && (
            <span
              data-testid="panel-header-count"
              className="px-1.5 py-0.5 rounded-full bg-gray-100 dark:bg-gray-800 text-[10px] font-medium text-gray-600 dark:text-gray-300 tabular-nums flex-shrink-0"
            >
              {count}
            </span>
          )}
        </div>
        {subtitle && (
          <div className="text-[11px] text-gray-500 dark:text-gray-400 mt-0.5 truncate">
            {subtitle}
          </div>
        )}
      </div>
      {actions && <div className="flex items-center gap-1 flex-shrink-0">{actions}</div>}
    </div>
  )
}
