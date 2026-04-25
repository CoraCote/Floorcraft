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
    <div className="group text-left rounded-xl border border-transparent p-5 -m-5 transition-all duration-150 hover:border-blue-100 hover:bg-white hover:shadow-sm hover:-translate-y-px dark:hover:border-blue-900/40 dark:hover:bg-gray-900/50 motion-reduce:transition-none motion-reduce:hover:transform-none">
      <div
        className="bg-blue-50 text-blue-600 dark:bg-blue-950/40 dark:text-blue-300 w-12 h-12 rounded-full flex items-center justify-center mb-4 transition-colors group-hover:bg-blue-100 dark:group-hover:bg-blue-900/50"
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 dark:text-gray-100 mb-2">{title}</h3>
      <p className="text-gray-600 dark:text-gray-400 leading-relaxed">{description}</p>
    </div>
  )
}
