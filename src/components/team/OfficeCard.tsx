import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { Archive, ArchiveRestore, Copy, MoreHorizontal, Trash2 } from 'lucide-react'
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
  /** Asks the parent to delete this office (opens its confirm dialog). */
  onDelete: (office: OfficeListItem) => void
  /** Soft-archive (or restore an archived) office. Optimistic remove
   *  / restore is the parent's responsibility. */
  onArchive: (office: OfficeListItem) => void
  /** Duplicate the office's payload into a fresh row. Parent decides
   *  the new name + handles navigation. */
  onDuplicate: (office: OfficeListItem) => void
}

/**
 * Dense office card for the team home dashboard. The whole tile is a
 * `Link` to the office map; the kebab menu is a sibling button so its
 * click doesn't navigate. Stats are precomputed by the parent so the
 * card stays a pure presentational component.
 */
export function OfficeCard({
  office,
  teamSlug,
  thumbnailElements,
  stats,
  avatars,
  onDelete,
  onArchive,
  onDuplicate,
}: Props) {
  const [menuOpen, setMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  // Click-outside / Escape handlers for the kebab popover. Same shape
  // the FileMenu primitive uses; this card is small enough that
  // hand-rolling is cheaper than reaching for a generic dropdown.
  useEffect(() => {
    if (!menuOpen) return
    function onPointer(e: MouseEvent) {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        setMenuOpen(false)
      }
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setMenuOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onPointer)
      document.removeEventListener('keydown', onKey)
    }
  }, [menuOpen])
  const isArchived = Boolean(office.archived_at)
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
        className="block bg-[color:var(--color-paper-raised)] dark:bg-gray-900 rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 overflow-hidden hover:border-[color:var(--color-blueprint)]/40 hover:shadow-lg hover:-translate-y-px transition-all duration-200 motion-reduce:hover:transform-none focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)]"
      >
        <div className="w-full h-40 bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/50 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
          <OfficeThumbnail elements={thumbnailElements} width="100%" height="100%" />
        </div>
        <div className="p-4">
          <div className="flex items-start justify-between gap-2">
            <h3 className="text-base font-semibold text-gray-900 dark:text-gray-100 truncate">{office.name}</h3>
            {/* Spacer so the kebab button (positioned absolutely) doesn't collide with the title. */}
            <span className="w-7 shrink-0" aria-hidden="true" />
          </div>
          <div
            className="mt-1 text-xs text-gray-500 dark:text-gray-400"
            title={`Last updated ${preciseTitle}`}
          >
            {metaParts.join(' · ')}
          </div>
          {/* Occupancy bar — shows the assigned/desks ratio at a glance
              so an owner managing multiple offices can see at the team
              dashboard whether each plan is full or has headroom.
              Hidden when there are no desks; the existing "No one
              assigned yet" line in the avatars block covers that
              case. */}
          {stats.desks > 0 && (
            <div className="mt-2">
              <div className="flex items-center justify-between text-[11px] text-gray-500 dark:text-gray-400 mb-0.5">
                <span>
                  {stats.assigned} / {stats.desks} seats
                </span>
                <span className="tabular-nums">
                  {Math.round((stats.assigned / stats.desks) * 100)}%
                </span>
              </div>
              <div
                className="h-1 rounded bg-[color:var(--color-paper-sunken)] dark:bg-gray-800 overflow-hidden"
                role="progressbar"
                aria-label="Seat occupancy"
                aria-valuenow={stats.assigned}
                aria-valuemax={stats.desks}
              >
                <div
                  className="h-full bg-[color:var(--color-blueprint-strong)] transition-[width] duration-300 motion-reduce:transition-none"
                  style={{
                    width: `${Math.min(100, Math.round((stats.assigned / stats.desks) * 100))}%`,
                  }}
                />
              </div>
            </div>
          )}
          {office.is_private && (
            <div className="mt-2 text-xs text-amber-700 dark:text-amber-300">Private</div>
          )}
          <div className="mt-3 pt-3 border-t border-[color:var(--color-paper-line)] dark:border-gray-800 flex items-center justify-between">
            {avatars.length > 0 ? (
              <div className="flex -space-x-2">
                {avatars.slice(0, 4).map((a) => (
                  <div
                    key={a.id}
                    className="w-6 h-6 rounded-full ring-2 ring-[color:var(--color-paper-raised)] flex items-center justify-center text-[10px] font-medium text-white"
                    style={{ backgroundColor: a.color }}
                    aria-hidden="true"
                  >
                    {a.initials}
                  </div>
                ))}
                {stats.assigned > avatars.length && (
                  <div className="w-6 h-6 rounded-full ring-2 ring-[color:var(--color-paper-raised)] bg-[color:var(--color-paper-sunken)] dark:bg-gray-800 flex items-center justify-center text-[10px] font-medium text-gray-600 dark:text-gray-300">
                    +{stats.assigned - avatars.length}
                  </div>
                )}
              </div>
            ) : (
              <div className="text-xs text-gray-500 dark:text-gray-400">
                {stats.assigned > 0
                  ? `${stats.assigned} ${stats.assigned === 1 ? 'person' : 'people'} assigned`
                  : 'No one assigned yet'}
              </div>
            )}
          </div>
        </div>
      </Link>
      <div ref={menuRef} className="absolute top-[10px] right-[10px]">
        <button
          type="button"
          aria-label={`Actions for ${office.name}`}
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          title="More actions"
          onClick={(e) => {
            e.preventDefault()
            e.stopPropagation()
            setMenuOpen((o) => !o)
          }}
          className={`p-1.5 rounded-md text-gray-400 dark:text-gray-500 bg-[color:var(--color-paper-raised)]/80 dark:bg-gray-900/80 backdrop-blur-sm hover:text-gray-700 dark:hover:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800/50 focus:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-blueprint)] transition-opacity ${
            menuOpen
              ? 'opacity-100'
              : 'opacity-0 group-hover:opacity-100 focus:opacity-100'
          }`}
        >
          <MoreHorizontal size={16} aria-hidden="true" />
        </button>
        {menuOpen && (
          <div
            role="menu"
            className="absolute right-0 mt-1 w-44 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 border border-[color:var(--color-paper-line)] dark:border-gray-800 rounded-lg shadow-lg py-1 z-10"
          >
            {isArchived ? (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenuOpen(false)
                  onArchive(office)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
              >
                <ArchiveRestore size={14} aria-hidden="true" />
                Unarchive
              </button>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenuOpen(false)
                  onArchive(office)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
              >
                <Archive size={14} aria-hidden="true" />
                Archive
              </button>
            )}
            {!isArchived && (
              <button
                type="button"
                role="menuitem"
                onClick={(e) => {
                  e.preventDefault()
                  e.stopPropagation()
                  setMenuOpen(false)
                  onDuplicate(office)
                }}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-gray-700 dark:text-gray-200 hover:bg-[color:var(--color-paper-sunken)] dark:hover:bg-gray-800"
              >
                <Copy size={14} aria-hidden="true" />
                Duplicate
              </button>
            )}
            <button
              type="button"
              role="menuitem"
              onClick={(e) => {
                e.preventDefault()
                e.stopPropagation()
                setMenuOpen(false)
                onDelete(office)
              }}
              className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-left text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-950/30"
            >
              <Trash2 size={14} aria-hidden="true" />
              Delete
            </button>
          </div>
        )}
      </div>
      {isArchived && (
        <span
          aria-label="Archived"
          title="Archived"
          className="absolute top-[10px] left-[10px] inline-flex items-center gap-1 text-[10px] uppercase tracking-wider font-semibold text-amber-700 dark:text-amber-300 bg-amber-50/95 dark:bg-amber-950/40 px-1.5 py-0.5 rounded backdrop-blur-sm"
        >
          <Archive size={11} aria-hidden="true" />
          Archived
        </span>
      )}
    </div>
  )
}
