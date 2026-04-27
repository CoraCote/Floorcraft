import { useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Check,
  ChevronDown,
  HelpCircle,
  Plus,
  Search,
  Settings,
  Users,
} from 'lucide-react'
import { useMyTeams } from '../../lib/teams/useMyTeams'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'
import { cn } from '../../lib/cn'
import type { Team } from '../../types/team'

/**
 * Wave 14C polish — TopBar team switcher.
 *
 * Matches the FileMenu / ContextMenu vocabulary: uppercase group
 * headers, 14px lucide icons, keyboard-first navigation (Arrow Up/Down,
 * Home/End, Esc, Tab), and dark-mode tokens.
 *
 * Sections in render order:
 *   - Search input (only when the user has 9+ teams, to keep the common
 *     case weightless)
 *   - Switch team — one row per team, with an active-row check + dot.
 *     Only rendered when the user has 2+ teams.
 *   - Manage — currently just "Team settings" (the other items in the
 *     PRD — Members, Billing — either have no route or are nested
 *     under /settings). Grep App.tsx to confirm before adding more.
 *   - Help — User guide link.
 *   - Footer — Create new team.
 *
 * `currentSlug` is still a prop (rather than `useParams`) so the
 * component can mount on both team-home and office routes without
 * guessing which param name to read.
 */

const TEAM_SEARCH_THRESHOLD = 9

export function TeamSwitcher({ currentSlug }: { currentSlug: string | undefined }) {
  const teams = useMyTeams()
  const navigate = useNavigate()
  const {
    open,
    toggle,
    close,
    focusedIndex,
    setFocusedIndex,
    registerItemRef,
    panelProps,
    triggerProps,
  } = useDropdownMenu()
  const [query, setQuery] = useState('')

  const filteredTeams = useMemo(() => {
    if (!teams) return []
    if (!query.trim()) return teams
    const q = query.trim().toLowerCase()
    return teams.filter((t) => t.name.toLowerCase().includes(q))
  }, [teams, query])

  if (!teams) return null

  const current = teams.find((t) => t.slug === currentSlug)
  const showSearch = teams.length >= TEAM_SEARCH_THRESHOLD
  const showSwitchGroup = teams.length >= 2
  const reduceMotion = prefersReducedMotion()

  // Row is a discriminated union of every clickable destination in the
  // dropdown. The search input is NOT an arrow-key target (it owns its
  // own typing), so it's tracked separately.
  type Row =
    | { kind: 'team'; team: Team }
    | { kind: 'settings' }
    | { kind: 'help' }
    | { kind: 'create' }

  function activate(action: () => void) {
    close()
    // Run the action synchronously after close — the close() setState
    // batches with the click event, so there's no interleaving risk
    // from React's perspective, and running sync keeps tests simple
    // (no microtask flushing needed to observe navigation).
    action()
  }

  function onRowClick(row: Row) {
    if (row.kind === 'team') {
      activate(() => navigate(`/t/${row.team.slug}`))
    } else if (row.kind === 'settings' && current) {
      activate(() => navigate(`/t/${current.slug}/settings`))
    } else if (row.kind === 'help') {
      activate(() => navigate('/help'))
    } else if (row.kind === 'create') {
      activate(() => navigate('/onboarding/team'))
    }
  }

  // Pre-compute row indices for arrow-key roving focus. Order matches
  // the render order below: switch-team rows first, then settings,
  // then user-guide, then create-new-team.
  const teamRowStart = 0
  const settingsIdx = showSwitchGroup ? filteredTeams.length : 0
  const helpIdx = settingsIdx + (current ? 1 : 0)
  const createIdx = helpIdx + 1

  return (
    <div className="relative">
      <button
        {...triggerProps}
        type="button"
        onClick={toggle}
        className="flex items-center gap-1 px-2 py-1 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        data-testid="team-switcher-trigger"
      >
        {current?.name ?? 'Teams'}
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          {...panelProps}
          role="menu"
          aria-label="Team switcher"
          className={cn(
            'absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow dark:bg-gray-900 dark:border-gray-800 dark:shadow-black/40 z-50 py-1 origin-top-left',
            !reduceMotion && 'dropdown-enter',
          )}
          data-testid="team-switcher-panel"
        >
          {showSearch && (
            <div className="px-2 pt-1 pb-2 border-b border-gray-100 dark:border-gray-800">
              <div className="relative">
                <Search
                  size={12}
                  aria-hidden="true"
                  className="absolute left-2 top-1/2 -translate-y-1/2 text-gray-400"
                />
                <input
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search teams"
                  aria-label="Search teams"
                  data-testid="team-switcher-search"
                  className="w-full pl-6 pr-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                />
              </div>
            </div>
          )}

          {showSwitchGroup && filteredTeams.length > 0 && (
            <div>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Switch team
              </div>
              {filteredTeams.map((t, ti) => {
                const idx = teamRowStart + ti
                const active = t.slug === currentSlug
                return (
                  <button
                    key={t.id}
                    ref={registerItemRef(idx)}
                    role="menuitem"
                    type="button"
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onClick={() => onRowClick({ kind: 'team', team: t })}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                    data-testid={`team-switcher-team-${t.slug}`}
                  >
                    <span
                      className={cn(
                        'inline-flex h-5 w-5 items-center justify-center rounded-full text-[10px] font-semibold',
                        active
                          ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                          : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
                      )}
                      aria-hidden="true"
                    >
                      {initials(t.name)}
                    </span>
                    {active && (
                      <span
                        aria-hidden="true"
                        className="h-1.5 w-1.5 rounded-full bg-blue-500"
                      />
                    )}
                    <span className={cn('flex-1 truncate', active && 'font-medium')}>{t.name}</span>
                    {active && <Check size={14} aria-hidden="true" className="text-blue-500" />}
                  </button>
                )
              })}
            </div>
          )}

          {current && (
            <div>
              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Manage
              </div>
              <button
                ref={registerItemRef(settingsIdx)}
                role="menuitem"
                type="button"
                tabIndex={focusedIndex === settingsIdx ? 0 : -1}
                onClick={() => onRowClick({ kind: 'settings' })}
                onMouseEnter={() => setFocusedIndex(settingsIdx)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                data-testid="team-switcher-settings"
              >
                <Settings size={14} aria-hidden="true" />
                <span className="flex-1">Team settings</span>
              </button>
            </div>
          )}

          <div>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Help
            </div>
            <button
              ref={registerItemRef(helpIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === helpIdx ? 0 : -1}
              onClick={() => onRowClick({ kind: 'help' })}
              onMouseEnter={() => setFocusedIndex(helpIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
              data-testid="team-switcher-help"
            >
              <HelpCircle size={14} aria-hidden="true" />
              <span className="flex-1">User guide</span>
            </button>
          </div>

          <div>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <button
              ref={registerItemRef(createIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === createIdx ? 0 : -1}
              onClick={() => onRowClick({ kind: 'create' })}
              onMouseEnter={() => setFocusedIndex(createIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
            >
              <Plus size={14} aria-hidden="true" />
              <span className="flex-1">Create new team</span>
              <Users size={14} aria-hidden="true" className="opacity-0" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean)
  if (parts.length === 0) return '?'
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase()
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
}
