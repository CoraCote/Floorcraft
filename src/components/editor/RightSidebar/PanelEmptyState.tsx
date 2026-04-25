import type { LucideIcon } from 'lucide-react'
import type { ReactNode } from 'react'

/**
 * Shared empty-state used across the polished right-sidebar panels.
 *
 * # Why this exists
 *
 * Every panel needs an answer to "what should I see before any data is
 * here?" Pre-Wave-17D, each panel took a different swing: AnnotationsPanel
 * had a one-liner in muted gray, InsightsPanel used an inline flex block
 * with a CheckCircle, PropertiesPanel had a fully composed tinted-icon +
 * title + body + helper copy. The PropertiesPanel treatment reads best —
 * it looks intentional rather than "we forgot to render something".
 *
 * This component standardises on that treatment:
 *
 *   ┌──────────────────────────────┐
 *   │        ◯ (tinted circle)     │
 *   │       Title line              │
 *   │     Soft body of copy         │
 *   │     [ Primary action button ] │
 *   └──────────────────────────────┘
 *
 * The tinted circle is bigger than a bare icon, which gives the first
 * eye-catch before the user reads the title. Icon colour is deliberately
 * muted (`gray-400`) — the empty state isn't an alarm, it's a nudge. If
 * a panel genuinely needs an alarm ("you've hit quota") it shouldn't use
 * this component — it should render a toast or a critical InsightCard.
 *
 * # Sizing
 *
 * Padding is generous vertically (`py-10`) so the block breathes inside a
 * flush sidebar without being so tall that the panel's other sections
 * hide below the fold. For very short sidebars (< 400px tall) the parent
 * can pass `compact` to trim vertical padding in half.
 */
export interface PanelEmptyStateProps {
  /** Lucide icon component rendered inside the tinted circle. */
  icon: LucideIcon
  /** Short, direct title — the answer to "why is this empty?". */
  title: string
  /** Supporting body copy. One sentence usually does it. */
  body?: ReactNode
  /** Optional CTA slot — typically a single `<Button />`. */
  action?: ReactNode
  /** Trim vertical padding to fit very short containers. Default `false`. */
  compact?: boolean
  /** Extra classes on the outer element. */
  className?: string
}

export function PanelEmptyState({
  icon: Icon,
  title,
  body,
  action,
  compact = false,
  className,
}: PanelEmptyStateProps) {
  return (
    <div
      data-testid="panel-empty-state"
      className={`flex flex-col items-center justify-center px-4 text-center ${
        compact ? 'py-6' : 'py-10'
      } ${className ?? ''}`}
    >
      <div
        aria-hidden
        className="w-12 h-12 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center mb-3"
      >
        <Icon size={20} className="text-gray-400 dark:text-gray-500" />
      </div>
      <p className="text-sm font-medium text-gray-700 dark:text-gray-200 mb-1">
        {title}
      </p>
      {body && (
        <div className="text-xs text-gray-500 dark:text-gray-400 max-w-[240px] leading-relaxed">
          {body}
        </div>
      )}
      {action && <div className="mt-4 flex items-center gap-2">{action}</div>}
    </div>
  )
}
