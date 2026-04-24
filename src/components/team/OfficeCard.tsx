import { Link } from 'react-router-dom'
import { MoreHorizontal } from 'lucide-react'
import { OfficeThumbnail, type ThumbnailElement } from './OfficeThumbnail'
import { formatRelative } from '../../lib/time'
import type { OfficeListItem } from '../../lib/offices/officeRepository'

interface CardStats {
  floors: number
  desks: number
  assigned: number
}

interface Avatar {
  id: string
  initials: string
  color: string
}

interface Props {
  office: OfficeListItem
  teamSlug: string
  thumbnailElements: ThumbnailElement[]
  stats: CardStats
  avatars: Avatar[]
  onMenu: (office: OfficeListItem) => void
}

/**
 * Dense office card for the team home dashboard. The whole tile is a
 * `Link` to the office map; the kebab menu is a sibling button so its
 * click doesn't navigate. Stats are precomputed by the parent so the
 * card stays a pure presentational component.
 */
export function OfficeCard({ office, teamSlug, thumbnailElements, stats, avatars, onMenu }: Props) {
  const rel = formatRelative(office.updated_at) ?? 'recently'
  const preciseTitle = new Date(office.updated_at).toUTCString()

  // Compact metadata line: floors / desks / updated. Dot separators.
  const metaParts: string[] = []
  if (stats.floors > 0) metaParts.push(`${stats.floors} ${stats.floors === 1 ? 'floor' : 'floors'}`)
  if (stats.desks > 0) metaParts.push(`${stats.desks} ${stats.desks === 1 ? 'desk' : 'desks'}`)
  metaParts.push(`updated ${rel}`)

  return (
    <div className="relative group">
      <Link
        to={`/t/${teamSlug}/o/${office.slug}/map`}
        className="block bg-white rounded-xl border border-gray-200 overflow-hidden hover:border-gray-300 hover:shadow-lg transition-all duration-200 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <div className="w-full h-40 bg-gray-50 border-b border-gray-100">
          <OfficeThumbnail elements={thumbnailElements} width="100%" height="100%" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 truncate">{office.name}</h3>
            {/* Spacer so the kebab button (positioned absolutely) doesn't collide with the title. */}
            <span className="w-7 shrink-0" aria-hidden="true" />
          </div>
          <div
            className="mt-1 text-xs text-gray-500"
            title={`Last updated ${preciseTitle}`}
          >
            {metaParts.join(' · ')}
          </div>
          {office.is_private && (
            <div className="mt-2 text-xs text-amber-700">Private</div>
          )}
          <div className="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between">
            {avatars.length > 0 ? (
              <div className="flex -space-x-2">
                {avatars.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="w-6 h-6 rounded-full ring-2 ring-white flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: a.color }}
                    aria-hidden="true"
                  >
                    {a.initials}
                  </div>
                ))}
                {stats.assigned > avatars.length && (
                  <div className="w-6 h-6 rounded-full ring-2 ring-white bg-gray-100 flex items-center justify-center text-[10px] font-medium text-gray-600">
                    +{stats.assigned - avatars.length}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500">
                {stats.assigned > 0
                  ? `${stats.assigned} ${stats.assigned === 1 ? 'person' : 'people'} assigned`
                  : 'No one assigned yet'}
              </div>
            )}
          </div>
        </div>
      </Link>
      <button
        type="button"
        aria-label={`Actions for ${office.name}`}
        title="More actions"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          onMenu(office)
        }}
        className="absolute top-[10px] right-[10px] p-1.5 rounded-md text-gray-400 bg-white/80 backdrop-blur-sm hover:text-gray-700 hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 opacity-0 group-hover:opacity-100 focus:opacity-100 transition-opacity"
      >
        <MoreHorizontal size={16} aria-hidden="true" />
      </button>
    </div>
  )
}
