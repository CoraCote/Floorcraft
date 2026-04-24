import type { ReactNode } from 'react'

/**
 * Rich, first-hover tooltip that hangs off the right edge of a ToolSelector
 * button. Kept presentational: the wrapping button owns the hover state +
 * `useFirstUseTooltip` gating and simply renders this card when both
 * conditions hold (mouse over + tool never-used). Consumers pair it with
 * `aria-describedby` on the button to keep screen-reader output in sync
 * with the visual tooltip.
 */
export interface FirstUseTooltipProps {
  /** Stable id so the triggering button can `aria-describedby` it. */
  id: string
  /** Tool display name, rendered as the tooltip heading. */
  name: string
  /** One-line description of what the tool does. */
  description: string
  /** Optional keyboard shortcut hint (e.g. "W", "⇧R"). */
  shortcut?: string
  /** Optional icon to anchor the tooltip visually. */
  icon?: ReactNode
}

export function FirstUseTooltip({
  id,
  name,
  description,
  shortcut,
  icon,
}: FirstUseTooltipProps) {
  return (
    <div
      id={id}
      role="tooltip"
      className="absolute left-full top-0 ml-2 w-60 z-50 pointer-events-none"
    >
      <div className="bg-gray-900 text-white rounded-lg shadow-xl p-3 text-xs leading-snug border border-gray-800">
        <div className="flex items-center gap-2 mb-1">
          {icon && (
            <span className="text-blue-300" aria-hidden="true">
              {icon}
            </span>
          )}
          <span className="font-semibold text-sm">{name}</span>
          {shortcut && (
            <kbd
              className="ml-auto text-[10px] font-mono bg-white/15 px-1.5 py-0.5 rounded"
              aria-hidden="true"
            >
              {shortcut}
            </kbd>
          )}
        </div>
        <div className="text-gray-200">{description}</div>
      </div>
    </div>
  )
}
