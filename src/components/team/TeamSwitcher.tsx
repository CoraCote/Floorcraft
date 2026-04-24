import { useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { ChevronDown } from 'lucide-react'
import { useMyTeams } from '../../lib/teams/useMyTeams'

/**
 * Dropdown in the TopBar that lets users switch between teams and jump
 * to the "create team" flow. We render null when the user's team list is
 * still loading (`useMyTeams` returns null pre-fetch) so the TopBar
 * doesn't flash a bare chevron.
 *
 * `currentSlug` is passed in rather than read from `useParams` because
 * the switcher mounts on both team-home (`/t/:teamSlug`) and office
 * routes (`/t/:teamSlug/o/:officeSlug/*`) — letting the caller pass it
 * means we don't have to guess which param name to read from.
 */
export function TeamSwitcher({ currentSlug }: { currentSlug: string | undefined }) {
  const teams = useMyTeams()
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const navigate = useNavigate()

  // Outside-click to close. We intentionally use mousedown (not click) so
  // a mousedown on the trigger button doesn't collide with the toggle —
  // the click handler inside the button fires second and wins.
  useEffect(() => {
    function onClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', onClick)
    return () => document.removeEventListener('mousedown', onClick)
  }, [])

  if (!teams) return null
  const current = teams.find((t) => t.slug === currentSlug)

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        aria-haspopup="menu"
        aria-expanded={open}
      >
        {current?.name ?? 'Teams'}
        <ChevronDown size={14} />
      </button>
      {open && (
        <div
          role="menu"
          className="absolute left-0 mt-1 w-56 bg-white dark:bg-gray-900 border rounded shadow z-30"
        >
          {teams.map((t) => (
            <button
              key={t.id}
              role="menuitem"
              onClick={() => {
                setOpen(false)
                navigate(`/t/${t.slug}`)
              }}
              className={`block w-full text-left px-3 py-1.5 text-sm hover:bg-gray-50 dark:hover:bg-gray-800/50 ${
                t.slug === currentSlug ? 'font-medium' : ''
              }`}
            >
              {t.name}
            </button>
          ))}
          <div className="border-t" />
          <button
            onClick={() => {
              setOpen(false)
              navigate('/onboarding/team')
            }}
            className="block w-full text-left px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-50 dark:hover:bg-gray-800/50"
          >
            + Create team
          </button>
        </div>
      )}
    </div>
  )
}
