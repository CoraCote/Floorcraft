import { useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Building2,
  CreditCard,
  HelpCircle,
  Home,
  Search,
  Settings,
  Users,
  X as XIcon,
} from 'lucide-react'
import type { OfficeListItem } from '../../lib/offices/officeRepository'

/**
 * Cmd+K / Ctrl+K palette for the team home dashboard. Mirrors the
 * AdminPalette shape (focus management, grouped sections, kbd hints
 * in the footer) but scoped to a single team:
 *
 *   - Pages — team home, settings, members, billing, help.
 *   - Offices — by name or slug, links to the office map.
 *   - Members — by name or email, links to /settings/members.
 *
 * The parent (TeamHomePage) owns the offices + teammates lists;
 * the palette is a pure presentational + filter component so the
 * dashboard's load lifecycle isn't doubled.
 */

interface PaletteResult {
  id: string
  label: string
  hint?: string
  group: 'Pages' | 'Offices' | 'Members'
  Icon: typeof Home
  to: string
}

interface Teammate {
  user_id: string
  name: string | null
  email: string | null
}

export function TeamPalette({
  teamSlug,
  offices,
  teammates,
}: {
  teamSlug: string
  offices: OfficeListItem[]
  teammates: Teammate[]
}) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [focusIdx, setFocusIdx] = useState(0)
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()

  const PAGES = useMemo<PaletteResult[]>(
    () => [
      {
        id: 'page-home',
        label: 'Team home',
        hint: 'Office grid + recents',
        group: 'Pages',
        Icon: Home,
        to: `/t/${teamSlug}`,
      },
      {
        id: 'page-settings',
        label: 'Settings',
        hint: 'Name, logo, danger zone',
        group: 'Pages',
        Icon: Settings,
        to: `/t/${teamSlug}/settings`,
      },
      {
        id: 'page-members',
        label: 'Members',
        hint: 'Invite, manage roles',
        group: 'Pages',
        Icon: Users,
        to: `/t/${teamSlug}/settings/members`,
      },
      {
        id: 'page-billing',
        label: 'Billing',
        hint: 'Plan, invoices, seats',
        group: 'Pages',
        Icon: CreditCard,
        to: `/t/${teamSlug}/settings/billing`,
      },
      {
        id: 'page-help',
        label: 'Help',
        hint: 'User guide + FAQ',
        group: 'Pages',
        Icon: HelpCircle,
        to: '/help',
      },
    ],
    [teamSlug],
  )

  // Keyboard shortcut: Cmd+K (mac) / Ctrl+K. Same idiom as
  // AdminPalette so admins jumping between surfaces don't have to
  // remember a different binding.
  useEffect(() => {
    function onKeyDown(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        // Don't intercept inside text inputs in the editor or
        // settings — the editor's own CommandPalette has Cmd+K
        // and we don't want them fighting. The team-home dashboard
        // doesn't host either, so this is just a defensive guard.
        const tag = (e.target as HTMLElement | null)?.tagName
        if (tag === 'INPUT' || tag === 'TEXTAREA') {
          // Allow if the input is OUR palette input — it's how the
          // user closes via re-pressing Cmd+K.
          if (e.target !== inputRef.current) return
        }
        e.preventDefault()
        setOpen((o) => {
          const next = !o
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

  // Defer the input focus by a microtask so the dialog has
  // committed to the DOM. Doesn't touch React state, satisfies
  // React 19's set-state-in-effect rule.
  useEffect(() => {
    if (!open) return
    queueMicrotask(() => inputRef.current?.focus())
  }, [open])

  const results = useMemo<PaletteResult[]>(() => {
    const trimmed = query.trim().toLowerCase()
    const pageResults = trimmed
      ? PAGES.filter(
          (p) =>
            p.label.toLowerCase().includes(trimmed) ||
            (p.hint ?? '').toLowerCase().includes(trimmed),
        )
      : PAGES
    const officeResults: PaletteResult[] = trimmed
      ? offices
          .filter(
            (o) =>
              o.name.toLowerCase().includes(trimmed) ||
              o.slug.toLowerCase().includes(trimmed),
          )
          .slice(0, 8)
          .map((o) => ({
            id: `office-${o.id}`,
            label: o.name,
            hint: o.slug,
            group: 'Offices' as const,
            Icon: Building2,
            to: `/t/${teamSlug}/o/${o.slug}/map`,
          }))
      : []
    const memberResults: PaletteResult[] = trimmed
      ? teammates
          .filter((t) => {
            const haystack = [t.email ?? '', t.name ?? ''].join(' ').toLowerCase()
            return haystack.includes(trimmed)
          })
          .slice(0, 8)
          .map((t) => ({
            id: `member-${t.user_id}`,
            label: t.name?.trim() || t.email || 'member',
            hint: t.email ?? undefined,
            group: 'Members' as const,
            Icon: Users,
            to: `/t/${teamSlug}/settings/members`,
          }))
      : []
    return [...pageResults, ...officeResults, ...memberResults]
  }, [query, PAGES, offices, teammates, teamSlug])

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

  const grouped: Array<[string, PaletteResult[]]> = []
  for (const r of results) {
    const last = grouped[grouped.length - 1]
    if (last && last[0] === r.group) last[1].push(r)
    else grouped.push([r.group, [r]])
  }

  let runningIdx = -1

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Team command palette"
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
            placeholder="Find a page, office, or member…"
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
                      <r.Icon
                        size={14}
                        aria-hidden="true"
                        className="text-gray-400 shrink-0"
                      />
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
