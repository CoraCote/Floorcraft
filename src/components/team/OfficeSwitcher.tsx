import { useEffect, useMemo, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  Check,
  ChevronDown,
  ExternalLink,
  Plus,
  Search,
} from 'lucide-react'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'
import { cn } from '../../lib/cn'
import { supabase } from '../../lib/supabase'
import {
  listOffices,
  type OfficeListItem,
} from '../../lib/offices/officeRepository'
import { getCachedOffices } from '../../lib/offices/allOfficesCache'

/**
 * Wave 15D — document-strip office switcher.
 *
 * Lives in the FloorSwitcher row, left-aligned, and promotes the office
 * identity out of the crowded TopBar and into the strip where the user
 * already reads "what am I editing" cues (floors, add-floor). Clicking
 * the trigger opens a dropdown listing every office on the current
 * team, ordered by `updated_at` DESC — the same order TeamHomePage
 * uses for its "Recently opened" sort, so a user's muscle memory
 * carries across.
 *
 * Why a new component rather than extending TeamSwitcher: offices and
 * teams are different mental models (a team OWNS many offices; a user
 * belongs to many teams). Keeping the two switchers visually similar
 * but structurally separate avoids the "one mega dropdown with four
 * nested levels" trap that Linear's workspace switcher falls into.
 *
 * The trigger doubles as the office name label. We also expose a
 * "Rename" row inside the dropdown rather than layering a click-to-edit
 * input onto the trigger itself — the old TopBar project-name button
 * tried to do both and users routinely mis-clicked. One action per
 * button is the clearer idiom.
 *
 * Data flow:
 *   1. Resolve teamSlug → teamId via Supabase.
 *   2. Prefer the `allOfficesCache` snapshot for instant first paint —
 *      the palette primes it on open, so editors who came from the
 *      dashboard hit a warm cache immediately.
 *   3. Fall back to `listOffices` on cache miss. We store this in
 *      local state rather than pushing into the cache; the cache's
 *      invalidation is owned by the palette flow and we don't want
 *      to race with it.
 *
 * A11y: uppercase section header, `role="menu"` panel with
 * `role="menuitem"` rows, the current office gets
 * `aria-current="page"`, the trigger has `aria-label="Switch office"`.
 */

interface OfficeSwitcherProps {
  /** Current team slug (from `/t/:teamSlug/...`) — used to build destination URLs. */
  teamSlug: string | undefined
  /** Current office slug (from `/t/:teamSlug/o/:officeSlug/...`) — highlights the active row. */
  officeSlug: string | undefined
  /** Current office display name. Used as the trigger label. */
  officeName: string | undefined
  /** Opens a rename input for the current office. */
  onRenameCurrent: () => void
}

/**
 * Threshold at which the dropdown renders a search input, mirroring
 * TeamSwitcher's 9+ heuristic. Eight or fewer offices fit
 * comfortably on screen at once; beyond that the search earns its
 * vertical cost.
 */
const OFFICE_SEARCH_THRESHOLD = 9

export function OfficeSwitcher({
  teamSlug,
  officeSlug,
  officeName,
  onRenameCurrent,
}: OfficeSwitcherProps) {
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

  // Resolve teamSlug → teamId. Mirrors useAllOfficesIndex's pattern
  // rather than taking the id as a prop so call sites that only know
  // the slug (i.e. everywhere inside the editor shell) don't have to
  // thread an extra round-trip through the render tree.
  const [teamId, setTeamId] = useState<string | null>(null)
  useEffect(() => {
    if (!teamSlug) return
    let cancelled = false
    void supabase
      .from('teams')
      .select('id')
      .eq('slug', teamSlug)
      .maybeSingle()
      .then(({ data }) => {
        if (cancelled || !data) return
        setTeamId((data as { id: string }).id)
      })
    return () => {
      cancelled = true
    }
  }, [teamSlug])

  // Office list. Seeded from the palette's warm cache when available,
  // otherwise fetched directly. The cache lookup happens during the
  // render so the first paint uses cached data (no flash of empty
  // state); the effect only fires the background revalidation.
  const [fresh, setFresh] = useState<OfficeListItem[] | null>(null)
  const offices = useMemo<OfficeListItem[] | null>(() => {
    if (fresh) return fresh
    if (!teamId) return null
    return getCachedOffices(teamId) ?? null
  }, [fresh, teamId])

  useEffect(() => {
    if (!teamId) return
    let cancelled = false
    void listOffices(teamId).then((list) => {
      if (cancelled) return
      setFresh(list)
    })
    return () => {
      cancelled = true
    }
  }, [teamId])

  const [query, setQuery] = useState('')
  const filteredOffices = useMemo(() => {
    if (!offices) return []
    if (!query.trim()) return offices
    const q = query.trim().toLowerCase()
    return offices.filter((o) => o.name.toLowerCase().includes(q))
  }, [offices, query])

  const reduceMotion = prefersReducedMotion()
  const loading = offices === null
  const totalCount = offices?.length ?? 0
  const showSearch = totalCount >= OFFICE_SEARCH_THRESHOLD
  const showSwitchGroup = totalCount >= 2

  function activate(action: () => void) {
    close()
    action()
  }

  function onSelectOffice(slug: string) {
    if (!teamSlug) return
    activate(() => navigate(`/t/${teamSlug}/o/${slug}/map`))
  }

  // Row indices for arrow-key roving. Order must match the render
  // order below: office rows → rename → manage → new office.
  let nextIdx = 0
  const officeRowStart = nextIdx
  if (showSwitchGroup) nextIdx += filteredOffices.length
  const renameIdx = nextIdx++
  const manageIdx = nextIdx++
  const createIdx = nextIdx++

  // Trigger label. Falls back to a neutral placeholder so the
  // component is still meaningful during the initial project load
  // (before projectStore.currentProject is populated).
  const label = officeName?.trim() || 'Untitled office'

  return (
    <div className="relative">
      <button
        {...triggerProps}
        type="button"
        onClick={toggle}
        aria-label="Switch office"
        className="flex items-center gap-1.5 px-2 py-1 text-sm font-semibold text-gray-800 dark:text-gray-100 hover:bg-gray-100 dark:hover:bg-gray-800 rounded"
        data-testid="office-switcher-trigger"
      >
        <Building2 size={14} aria-hidden="true" className="text-gray-400 dark:text-gray-500" />
        <span className="truncate max-w-[220px]">{label}</span>
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          {...panelProps}
          role="menu"
          aria-label="Office switcher"
          className={cn(
            'absolute left-0 mt-1 w-72 bg-white border border-gray-200 rounded shadow dark:bg-gray-900 dark:border-gray-800 dark:shadow-black/40 z-50 py-1 origin-top-left',
            !reduceMotion && 'dropdown-enter',
          )}
          data-testid="office-switcher-panel"
        >
          {/* Header row — office name + "Manage" link jumping back
              to TeamHome. Keeps the trigger's current label visible
              inside the panel too; tiny affordance that makes the
              panel feel anchored to the trigger you clicked. */}
          <div className="flex items-center gap-2 px-3 py-2 border-b border-gray-100 dark:border-gray-800">
            <div
              aria-hidden="true"
              className="flex-shrink-0 inline-flex h-6 w-6 items-center justify-center rounded bg-gray-100 dark:bg-gray-800 text-gray-500 dark:text-gray-400"
            >
              <Building2 size={14} />
            </div>
            <div className="flex-1 min-w-0">
              <div
                className="text-xs font-medium text-gray-700 dark:text-gray-200 truncate"
                title={label}
              >
                {label}
              </div>
              <div className="text-[10px] text-gray-500 dark:text-gray-400">
                Current office
              </div>
            </div>
          </div>

          {showSearch && (
            <div className="px-2 pt-2 pb-1 border-b border-gray-100 dark:border-gray-800">
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
                  placeholder="Search offices"
                  aria-label="Search offices"
                  data-testid="office-switcher-search"
                  className="w-full pl-6 pr-2 py-1 text-xs bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-700 dark:text-gray-200"
                />
              </div>
            </div>
          )}

          {showSwitchGroup && (
            <div>
              <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
                Switch office
              </div>
              {/* Cap the scroll height so a team with dozens of offices
                  doesn't expand the dropdown past the viewport. */}
              <div className="max-h-64 overflow-y-auto">
                {filteredOffices.map((o, oi) => {
                  const idx = officeRowStart + oi
                  const active = o.slug === officeSlug
                  return (
                    <button
                      key={o.id}
                      ref={registerItemRef(idx)}
                      role="menuitem"
                      type="button"
                      tabIndex={focusedIndex === idx ? 0 : -1}
                      aria-current={active ? 'page' : undefined}
                      onClick={() => onSelectOffice(o.slug)}
                      onMouseEnter={() => setFocusedIndex(idx)}
                      className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                      data-testid={`office-switcher-office-${o.slug}`}
                    >
                      <span
                        aria-hidden="true"
                        className={cn(
                          'inline-flex h-5 w-5 items-center justify-center rounded text-[10px]',
                          active
                            ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                            : 'bg-gray-100 text-gray-500 dark:bg-gray-800 dark:text-gray-400',
                        )}
                      >
                        <Building2 size={12} />
                      </span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="h-1.5 w-1.5 rounded-full bg-blue-500"
                        />
                      )}
                      <span className={cn('flex-1 truncate', active && 'font-medium')}>
                        {o.name}
                      </span>
                      {active && <Check size={14} aria-hidden="true" className="text-blue-500" />}
                    </button>
                  )
                })}
                {filteredOffices.length === 0 && query.trim() && (
                  <div className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400">
                    No offices match "{query.trim()}"
                  </div>
                )}
              </div>
            </div>
          )}

          {loading && !showSwitchGroup && (
            <div className="px-3 py-2 space-y-2" aria-hidden="true">
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded animate-pulse" />
              <div className="h-4 bg-gray-100 dark:bg-gray-800 rounded w-3/4 animate-pulse" />
            </div>
          )}

          {/* Manage group. Rename + Team-home link live here so the
              two actions the office-identity cluster owns are always
              a single extra click away, regardless of whether the
              user has 1 office or 50. */}
          <div>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Manage
            </div>
            <button
              ref={registerItemRef(renameIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === renameIdx ? 0 : -1}
              onClick={() => activate(onRenameCurrent)}
              onMouseEnter={() => setFocusedIndex(renameIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
              data-testid="office-switcher-rename"
            >
              <span className="flex-1">Rename this office</span>
            </button>
            {teamSlug && (
              <button
                ref={registerItemRef(manageIdx)}
                role="menuitem"
                type="button"
                tabIndex={focusedIndex === manageIdx ? 0 : -1}
                onClick={() =>
                  activate(() => navigate(`/t/${teamSlug}`))
                }
                onMouseEnter={() => setFocusedIndex(manageIdx)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                data-testid="office-switcher-manage"
              >
                <ExternalLink size={14} aria-hidden="true" />
                <span className="flex-1">Manage offices</span>
              </button>
            )}
          </div>

          {/* Footer: + New office. Routes to TeamHome with a ?create=1
              flag so TeamHome can open its create dialog — avoids
              duplicating the create flow's state across two components.
              If the team slug is missing (shouldn't happen inside the
              editor, but defensive) we hide the row rather than dead-link. */}
          {teamSlug && (
            <div>
              <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              <button
                ref={registerItemRef(createIdx)}
                role="menuitem"
                type="button"
                tabIndex={focusedIndex === createIdx ? 0 : -1}
                onClick={() =>
                  activate(() => navigate(`/t/${teamSlug}?create=1`))
                }
                onMouseEnter={() => setFocusedIndex(createIdx)}
                className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:bg-gray-100 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                data-testid="office-switcher-create"
              >
                <Plus size={14} aria-hidden="true" />
                <span className="flex-1">New office</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
