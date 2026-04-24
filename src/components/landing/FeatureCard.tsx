import type { LucideIcon } from 'lucide-react'

/**
 * FeatureCard — single tile in the "What you can do" grid on the
 * landing page. Icon in a soft indigo circle, heading, short
 * description. No bullets, no nested logic — pure presentation.
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
    <div className="text-left">
      <div
        className="bg-blue-50 text-blue-600 w-12 h-12 rounded-full flex items-center justify-center mb-4"
        aria-hidden="true"
      >
        <Icon className="w-5 h-5" />
      </div>
      <h3 className="text-lg font-semibold text-gray-900 mb-2">{title}</h3>
      <p className="text-gray-600 leading-relaxed">{description}</p>
    </div>
  )
}
