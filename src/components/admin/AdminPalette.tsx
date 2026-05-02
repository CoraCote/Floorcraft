import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CreditCard,
  History,
  LayoutDashboard,
  Search,
  ShieldCheck,
  Users,
  X as XIcon,
} from 'lucide-react'
import { adminListTeams, adminListUsers, type AdminTeamRow, type AdminUserRow } from '../../lib/adminLists'

/**
 * Cmd+K / Ctrl+K command palette for the admin surface.
 *
 * Mounted by AdminLayout; opens via the keyboard shortcut anywhere
 * inside `/admin`. A single input searches across:
 *
 *   - Pages — the static admin nav (Overview / Teams / Users / etc).
 *   - Teams — by name or slug, fetched once via adminListTeams.
 *   - Users — by email or name, fetched once via adminListUsers.
 *
 * The team + user lists are cached for the lifetime of the AdminLayout
 * mount; opening the palette repeatedly doesn't re-hit Supabase. A
 * fresh tab / hard reload reloads them.
 *
 * Selecting a result navigates and closes. Esc closes. Up/Down move
 * the focused result; Enter activates it. Mouse hover updates focus.
 */

interface PaletteResult {
  id: string
  // Display label (rendered in bold).
  label: string
  // Subtitle below the label (slug, email, etc).
  hint?: string
  // Right-side category tag.
  group: 'Pages' | 'Teams' | 'Users'
  // Lucide icon component for the row.
  Icon: typeof LayoutDashboard
  // Path to navigate to on activation.
  to: string
}

const PAGES: PaletteResult[] = [
  {
    id: 'page-overview',
    label: 'Overview',
    hint: 'Platform stats + recent activity',
    group: 'Pages',
    Icon: LayoutDashboard,
    to: '/admin',
  },
  {
    id: 'page-teams',
    label: 'Teams',
    hint: 'Browse, suspend, delete teams',
    group: 'Pages',
    Icon: Building2,
    to: '/admin/teams',
  },
  {
    id: 'page-users',
    label: 'Users',
    hint: 'Browse, grant or revoke admin',
    group: 'Pages',
    Icon: Users,
    to: '/admin/users',
  },
  {
    id: 'page-admins',
    label: 'Platform admins',
    hint: 'Manage who has admin access',
    group: 'Pages',
    Icon: ShieldCheck,
    to: '/admin/admins',
  },
  {
    id: 'page-billing',
    label: 'Billing',
    hint: 'Subscriptions, overrides, at-risk',
    group: 'Pages',
    Icon: CreditCard,
    to: '/admin/billing',
  },
  {
    id: 'page-audit',
    label: 'Audit',
    hint: 'Cross-team event feed',
    group: 'Pages',
    Icon: History,
    to: '/admin/audit',
  },
]

export function AdminPalette() {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const [teams, setTeams] = useState<AdminTeamRow[] | null>(null)
  const [users, setUsers] = useState<AdminUserRow[] | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  // Keyboard shortcut: Cmd+K (mac) or Ctrl+K (everywhere else)
  // toggles the palette. We deliberately ignore the "?"/slash
  // patterns the rest of the app uses — admin surfaces stay
  // consistent with the editor's CommandPalette idiom.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setOpen((o) => {
          const next = !o
          // Reset transient state on open so reopening the palette
          // starts fresh — fold it into the same setState the
          // toggle uses so we don't trip the React 19
          // set-state-in-effect rule with a follow-up setState.
          if (next) {
            setQuery('')
            setFocusIdx(0)
          }
          return next
        })
        return
      }
      if (e.key === 'Escape' && open) {
        e.preventDefault()
        setOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open])

  // Lazy-load teams + users on first open. Best-effort: a project
  // that hasn't applied the admin migrations returns null and the
  // palette gracefully shows only Pages.
  useEffect(() => {
    if (!open) return
    let cancelled = false
    if (!teams) {
      void adminListTeams().then((t) => {
        if (!cancelled) setTeams(t ?? [])
      })
    }
    if (!users) {
      void adminListUsers().then((u) => {
        if (!cancelled) setUsers(u ?? [])
      })
    }
    // Defer the input focus by a microtask so the dialog has
    // committed to the DOM. Doesn't touch React state.
    queueMicrotask(() => inputRef.current?.focus())
    return () => {
      cancelled = true
    }
  }, [open, teams, users])

  const results = useMemo<PaletteResult[]>(() => {
    const trimmed = query.trim().toLowerCase()
    // Pages always render. With no query they're the entire result
    // set; with a query they're filtered to substring matches on
    // label or hint.
    const pageResults = trimmed
      ? PAGES.filter(
          (p) =>
            p.label.toLowerCase().includes(trimmed) ||
            (p.hint ?? '').toLowerCase().includes(trimmed),
        )
      : PAGES
    // Teams + Users only contribute results when the user's typed
    // something — at empty-state we want the page list to be
    // unobstructed. Cap each section so a wildly-matching query
    // doesn't drown the palette.
    const teamResults: PaletteResult[] = trimmed
      ? (teams ?? [])
          .filter(
            (t) =>
              t.name.toLowerCase().includes(trimmed) ||
              t.slug.toLowerCase().includes(trimmed),
          )
          .slice(0, 8)
          .map((t) => ({
            id: `team-${t.id}`,
            label: t.name,
            hint: t.slug,
            group: 'Teams' as const,
            Icon: Building2,
            to: `/admin/teams/${t.id}`,
          }))
      : []
    const userResults: PaletteResult[] = trimmed
      ? (users ?? [])
          .filter((u) => {
            const haystack = [u.email, u.name ?? ''].join(' ').toLowerCase()
            return haystack.includes(trimmed)
          })
          .slice(0, 8)
          .map((u) => ({
            id: `user-${u.id}`,
            label: u.email,
            hint: u.name?.trim() || undefined,
            group: 'Users' as const,
            Icon: Users,
            to: `/admin/users/${u.id}`,
          }))
      : []
    return [...pageResults, ...teamResults, ...userResults]
  }, [query, teams, users])

  // Compute the effective focus inline rather than re-syncing
  // state in an effect. Keeps focus in bounds when results shrink
  // (e.g. the user types and narrows the matches) without
  // tripping the React 19 set-state-in-effect rule.
  const effectiveFocus =
    results.length === 0
      ? 0
      : Math.min(Math.max(0, focusIdx), results.length - 1)

  function activate(r: PaletteResult) {
    setOpen(false)
    navigate(r.to)
  }

  function onListKeyDown(e: React.KeyboardEvent) {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIdx(() => Math.min(results.length - 1, effectiveFocus + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIdx(() => Math.max(0, effectiveFocus - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      const r = results[effectiveFocus]
      if (r) activate(r)
    }
  }

  if (!open) return null

  // Group results visually by their `group` so the operator sees
  // sectioned output instead of an undifferentiated list.
  const grouped: Array<[string, PaletteResult[]]> = []
  for (const r of results) {
    const last = grouped[grouped.length - 1]
    if (last && last[0] === r.group) last[1].push(r)
    else grouped.push([r.group, [r]])
  }

  // Map result index across the flat `results` array so per-row
  // focused styling matches arrow-key + click + hover state.
  let runningIdx = -1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Admin command palette"
      className="fixed inset-0 z-50 flex items-start justify-center pt-[15vh] px-4 bg-black/30 dark:bg-black/60 backdrop-blur-sm"
      onClick={() => setOpen(false)}
    >
      <div
        className="w-full max-w-xl rounded-xl border border-[color:var(--color-paper-line)] dark:border-gray-800 bg-[color:var(--color-paper-raised)] dark:bg-gray-900 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={onListKeyDown}
      >
        <div className="flex items-center gap-2 px-3 py-2.5 border-b border-[color:var(--color-paper-line)] dark:border-gray-800">
          <Search size={14} aria-hidden="true" className="text-gray-400" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setFocusIdx(0)
            }}
            placeholder="Find a page, team, or user…"
            className="flex-1 bg-transparent text-sm text-gray-900 dark:text-gray-100 placeholder:text-gray-400 focus:outline-none"
            aria-label="Search"
          />
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Close palette"
            className="text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
          >
            <XIcon size={14} aria-hidden="true" />
          </button>
        </div>

        <div className="max-h-[50vh] overflow-y-auto py-1">
          {results.length === 0 ? (
            <p className="px-4 py-6 text-sm text-gray-500 dark:text-gray-400 text-center">
              No matches.
            </p>
          ) : (
            grouped.map(([group, rows]) => (
              <div key={group}>
                <div className="px-3 pt-2 pb-1 font-mono text-[10px] font-medium uppercase tracking-[0.18em] text-gray-400 dark:text-gray-500">
                  {group}
                </div>
                {rows.map((r) => {
                  runningIdx += 1
                  const idx = runningIdx
                  const isFocused = effectiveFocus === idx
                  return (
                    <button
                      key={r.id}
                      type="button"
                      role="option"
                      aria-selected={isFocused}
                      onMouseEnter={() => setFocusIdx(idx)}
                      onClick={() => activate(r)}
                      className={`w-full flex items-center gap-3 px-3 py-2 text-left text-sm ${
                        isFocused
                          ? 'bg-[color:var(--color-paper-sunken)] dark:bg-gray-800/70'
                          : 'hover:bg-[color:var(--color-paper-sunken)]/60 dark:hover:bg-gray-800/40'
                      }`}
                    >
                      <r.Icon size={14} aria-hidden="true" className="text-gray-400 shrink-0" />
                      <span className="flex-1 min-w-0">
                        <span className="block truncate text-gray-900 dark:text-gray-100">
                          {r.label}
                        </span>
                        {r.hint && (
                          <span className="block truncate text-xs text-gray-500 dark:text-gray-400">
                            {r.hint}
                          </span>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-3 px-3 py-1.5 border-t border-[color:var(--color-paper-line)] dark:border-gray-800 text-[10px] text-gray-400 dark:text-gray-500">
          <span>
            <kbd className="font-mono px-1 py-0.5 rounded bg-[color:var(--color-paper-sunken)] dark:bg-gray-800">
              ↑↓
            </kbd>{' '}
            navigate
          </span>
          <span>
            <kbd className="font-mono px-1 py-0.5 rounded bg-[color:var(--color-paper-sunken)] dark:bg-gray-800">
              ↵
            </kbd>{' '}
            open
          </span>
          <span>
            <kbd className="font-mono px-1 py-0.5 rounded bg-[color:var(--color-paper-sunken)] dark:bg-gray-800">
              esc
            </kbd>{' '}
            close
          </span>
        </div>
      </div>
    </div>
  )
}
