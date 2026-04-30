import type { LucideIcon } from 'lucide-react'

/**
 * FeatureCard — single tile in the "What you can do" grid on the
 * landing page. Icon in a soft indigo circle, heading, short
 * description. No bullets, no nested logic — pure presentation.
 *
 * Card-level hover treatment: the whole tile is wrapped in a rounded
 * border that stays transparent until hover, at which point the
 * border picks up a faint blue tint and the icon pill brightens. The
 * tile lifts a single pixel on hover via `-translate-y-px`, which is
 * the smallest amount of motion that still reads as alive. Because
 * the transform is an ordinary CSS transition, the OS-level
 * `prefers-reduced-motion` will suppress it automatically — no JS
 * guard needed.
 */
export function FeatureCard({
  icon: Icon,
  title,
  description,
}: {
  icon: LucideIcon
  title: string
  description: string
}) {
  return (
    <div className="group relative text-left bg-[color:var(--color-paper-raised)] dark:bg-gray-900 p-7 transition-colors hover:bg-[color:var(--color-blueprint-soft)] dark:hover:bg-gray-800/60">
      {/* Hairline cyan top edge appears on hover — telegraphs that the
          card is interactive without adding a chevron or button. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-0 top-0 h-px bg-[color:var(--color-blueprint)] opacity-0 transition-opacity group-hover:opacity-100"
      />
      <div
        className="text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)] w-10 h-10 rounded-md border border-[color:var(--color-paper-line)] dark:border-gray-700 bg-[color:var(--color-paper)] flex items-center justify-center mb-5"
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed text-sm">{description}</p>
    </div>
  )
}
