import { useCallback, useDeferredValue, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import {
  Search,
  SearchX,
  Clock,
  Layers,
  Users,
  Box,
  Compass,
  Eye,
  Wrench,
  Zap,
  Globe,
  Building2,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { useUIStore } from '../../stores/uiStore'
import { useFloorStore } from '../../stores/floorStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useProjectStore } from '../../stores/projectStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useAllOfficesIndex } from '../../hooks/useAllOfficesIndex'
import { searchAllOffices, type CrossOfficeResult } from '../../lib/crossOfficeSearch'
import { crossOfficeNavPath, crossOfficeRowKey } from '../../lib/crossOfficePaletteNav'
import { CrossOfficeResultsGroup } from './CommandPalette/CrossOfficeResultsGroup'
import {
  filterCommandItems,
  SECTION_LABELS,
  SECTION_ORDER,
  type CommandItem,
  type CommandSection,
} from '../../lib/commandPaletteFilter'
import { buildCommandItems } from './commandPaletteActions'
import {
  addRecent,
  getRecents,
  getScope,
  setScope,
  type CommandPaletteScope,
} from '../../lib/commandPaletteRecents'

/** Cap on cross-office result rows — keeps the palette from unbounded growth. */
const MAX_CROSS_OFFICE_RESULTS = 30

/**
 * Per-section icon used in the row prefix and the group header. Picked to
 * mirror the rest of the editor chrome (FileMenu/ContextMenu both use
 * lucide). Keeping the map flat means new sections just need a single
 * entry here rather than a switch in JSX.
 */
const SECTION_ICON: Record<CommandSection, LucideIcon> = {
  floors: Layers,
  people: Users,
  elements: Box,
  navigate: Compass,
  view: Eye,
  tools: Wrench,
  actions: Zap,
}

/**
 * Stable keyboard-shortcut hints for the rows that have a global binding.
 * Lookup is by action `id` so the action catalogue itself can stay free of
 * presentational metadata. Values are kept in the same shorthand as the
 * Help overlay so the two surfaces never disagree.
 *
 * Only a handful of palette actions have a real binding today; the rest
 * intentionally return `undefined` and render with no shortcut pill. We
 * never invent a shortcut just to fill the column.
 */
const ACTION_SHORTCUT: Record<string, string> = {
  'view-toggle-grid': 'G',
  'view-zoom-in': '+',
  'view-zoom-out': '-',
  'view-zoom-reset': '0',
  'action-presentation': 'P',
  'action-export': 'Cmd+E',
  'action-export-png': 'Cmd+Shift+E',
}

/**
 * Cmd+K / Ctrl+K / "/" quick-action palette.
 *
 * Mounted inside ProjectShell (so it only activates on an office route,
 * not on the landing / auth pages). Opens via `uiStore.commandPaletteOpen`,
 * closes on Escape, click-outside, Enter, or any action run. While open,
 * the modal ref-count is bumped so other global hotkeys stand down.
 *
 * Visual model (Wave 12A polish):
 *   - Top-pinned card overlay matching the FileMenu / ContextMenu palette:
 *     rounded-xl card, hairline border, soft 2xl shadow, dark-mode aware.
 *   - Borderless search row with a leading Search icon; placeholder text
 *     gives a couple of example queries so first-run users see the syntax.
 *   - Scope chip beneath the input toggles This-office vs All-offices and
 *     persists the choice in localStorage (see `commandPaletteRecents`).
 *   - "Recent" ribbon (max 5) renders only when the query is empty and at
 *     least one recent is stored. Each recent row uses a Clock prefix.
 *   - Result list groups items by category with a 10px uppercase header,
 *     icon + label per row, optional secondary muted text, and an
 *     optional right-aligned <kbd> shortcut pill.
 *   - Empty state (no in-office matches AND no cross-office matches) shows
 *     a SearchX icon plus a tiny syntax hint.
 *
 * The component is split into an outer gate + inner body so that the
 * per-open state (query, highlight) initializes naturally via `useState`
 * when the palette mounts, rather than being reset in an effect. Keeping
 * the body mounted-only-while-open also means the hooks inside it don't
 * need to branch on `open`, which keeps the React Compiler happy.
 */
export function CommandPalette() {
  const open = useUIStore((s) => s.commandPaletteOpen)
  if (!open) return null
  return <CommandPaletteBody />
}

function CommandPaletteBody() {
  const setOpen = useUIStore((s) => s.setCommandPaletteOpen)
  const registerModalOpen = useUIStore((s) => s.registerModalOpen)
  const registerModalClose = useUIStore((s) => s.registerModalClose)
  const presentationMode = useUIStore((s) => s.presentationMode)

  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{
    teamSlug: string
    officeSlug: string
  }>()

  const employees = useVisibleEmployees()
  const floors = useFloorStore((s) => s.floors)
  // Active-floor elements drive the "Find element" rows. We read from the
  // live elementsStore rather than the archived floorStore.floors entry
  // because the former is always current for the visible floor.
  const activeElements = useElementsStore((s) => s.elements)
  // Office name surfaces in the scope chip ("Office: Acme HQ"). Read once
  // at body-mount via a selector — the chip only re-renders when the
  // string actually changes.
  const officeName = useProjectStore((s) => s.currentProject?.name ?? null)

  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const scopeChipRef = useRef<HTMLButtonElement | null>(null)
  const [crossHighlightKey, setCrossHighlightKey] = useState<string | null>(null)
  // Recents are read once on mount and refreshed locally after each
  // invocation (we always close-on-run, so re-reading on every render
  // would be wasted work). Storing the array in state lets the ribbon
  // update mid-session if the user invokes something twice.
  const [recents, setRecents] = useState<string[]>(() => getRecents())
  const [scope, setScopeState] = useState<CommandPaletteScope>(() => getScope())

  // Deferred query drives the cross-office search. `useDeferredValue`
  // lets React schedule the heavier cross-office scan at a lower priority
  // than the input's visual update, so sustained typing bursts never
  // block the keystroke — matches the spec's "keydown-debounced" perf
  // guardrail without the setState-in-effect dance.
  const deferredQuery = useDeferredValue(query)

  const allOfficesIndex = useAllOfficesIndex(teamSlug)
  const crossOfficeSupported = allOfficesIndex.length > 1
  const crossResults = useMemo<CrossOfficeResult[]>(() => {
    // Scope-gated: when the user has narrowed the palette to "this
    // office" we skip the cross-office scan entirely. The chip toggle
    // therefore acts as both a visual cue *and* a perf knob.
    if (scope === 'office') return []
    if (deferredQuery.length < 2) return []
    return searchAllOffices(deferredQuery, allOfficesIndex).slice(
      0,
      MAX_CROSS_OFFICE_RESULTS,
    )
  }, [deferredQuery, allOfficesIndex, scope])

  // Bump the modal ref-count so other global hotkeys (arrow nudges,
  // Cmd+A, etc) stand down while the palette owns the keyboard. Mirrors
  // the pattern in CalibrateScaleModal / RosterDetailDrawer.
  useEffect(() => {
    registerModalOpen()
    return () => registerModalClose()
  }, [registerModalOpen, registerModalClose])

  // Focus the search input on mount. `requestAnimationFrame` so the
  // input has actually mounted before we try to focus it (focus before
  // paint can race in jsdom).
  useEffect(() => {
    const id = requestAnimationFrame(() => inputRef.current?.focus())
    return () => cancelAnimationFrame(id)
  }, [])

  const close = useCallback(() => setOpen(false), [setOpen])

  const onCrossPick = useCallback(
    (result: CrossOfficeResult) => {
      if (!teamSlug) return
      navigate(crossOfficeNavPath(teamSlug, result))
      close()
    },
    [teamSlug, navigate, close],
  )

  // Delegate the full item catalogue to `commandPaletteActions`.
  // The builder is a pure function over its inputs — rebuilding on every
  // render is fine because it's capped (People: 8, Elements: 20) and the
  // heavy lifting (the cross-office search) runs separately above.
  const items = useMemo<CommandItem[]>(
    () =>
      buildCommandItems({
        floors,
        employees,
        activeFloorElements: activeElements,
        query,
        navigate,
        teamSlug,
        officeSlug,
        close,
        presentationMode,
      }),
    [
      floors,
      employees,
      activeElements,
      query,
      navigate,
      teamSlug,
      officeSlug,
      close,
      presentationMode,
    ],
  )

  const filtered = useMemo(() => filterCommandItems(items, query), [items, query])

  // Resolve recent ids back to live items. Stale ids (an action that no
  // longer exists this render — e.g. a floor that was deleted since the
  // entry was recorded) drop out silently rather than rendering a broken
  // row. Capped to whatever survives, which is always ≤ MAX.
  const itemsById = useMemo(() => {
    const map = new Map<string, CommandItem>()
    for (const it of items) map.set(it.id, it)
    return map
  }, [items])
  const recentItems = useMemo<CommandItem[]>(() => {
    return recents
      .map((id) => itemsById.get(id))
      .filter((v): v is CommandItem => Boolean(v))
  }, [recents, itemsById])

  // Recent ribbon only renders when the query is empty *and* something
  // resolves. An empty array suppresses both the header and the divider
  // so first-time users don't see a phantom section.
  const showRecents = query.trim().length === 0 && recentItems.length > 0

  // Run an action — wraps the catalogue's `run()` so we can record it
  // into the recents ring on the same call. The catalogue's `run()`
  // itself fires `close()`, so we don't need to chain a close here.
  const runItem = useCallback(
    (item: CommandItem) => {
      const next = addRecent(item.id)
      setRecents(next)
      item.run()
    },
    [],
  )

  // Build the navigable keyboard list. Order: recents → grouped sections,
  // matching the visual top-to-bottom layout. We deliberately do NOT
  // include cross-office rows in this list — those have their own
  // hover-driven highlight (`crossHighlightKey`) so they don't fight the
  // primary list for the Arrow keys.
  const navList = useMemo<CommandItem[]>(() => {
    if (showRecents) return [...recentItems, ...filtered]
    return filtered
  }, [showRecents, recentItems, filtered])

  // Clamp the highlight to the navigable range inline rather than in an
  // effect. When the query changes and the highlighted row falls outside
  // the new list, we show index 0 as active — users expect the first
  // match to be selected after typing.
  const effectiveHighlight =
    highlightIndex >= navList.length ? 0 : highlightIndex

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = navList[effectiveHighlight]
      if (item) {
        runItem(item)
        return
      }
      // No in-office match — fall through to the top cross-office result
      // (if any) so typing-then-enter still does something sensible.
      const crossPick =
        crossResults.find((r) => crossOfficeRowKey(r) === crossHighlightKey) ??
        crossResults[0]
      if (crossPick) onCrossPick(crossPick)
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => {
        const base = i >= navList.length ? 0 : i
        return navList.length ? (base + 1) % navList.length : 0
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => {
        const base = i >= navList.length ? 0 : i
        return navList.length
          ? (base - 1 + navList.length) % navList.length
          : 0
      })
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      if (navList.length > 0) setHighlightIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      if (navList.length > 0) setHighlightIndex(navList.length - 1)
      return
    }
    if (e.key === 'Tab') {
      // Cycle Tab between the scope chip and the first item in the list.
      // Shift+Tab walks the same pair backwards. The chip is real focusable
      // markup, so we can rely on browser-native focus once we hand off.
      e.preventDefault()
      if (document.activeElement === scopeChipRef.current) {
        inputRef.current?.focus()
      } else {
        scopeChipRef.current?.focus()
      }
      return
    }
  }

  // Group items by section for rendering, while keeping a single flat
  // index space so the highlight lines up with keyboard navigation.
  const grouped: { section: CommandSection; items: CommandItem[] }[] = []
  for (const section of SECTION_ORDER) {
    const sectionItems = filtered.filter((i) => i.section === section)
    if (sectionItems.length > 0) grouped.push({ section, items: sectionItems })
  }

  // Toggle the scope chip. When cross-office search isn't supported (the
  // current team only has one office, so the search index has nothing to
  // hand back), the chip renders read-only and this handler is never
  // wired — see the JSX below.
  const toggleScope = () => {
    const next: CommandPaletteScope = scope === 'office' ? 'all' : 'office'
    setScopeState(next)
    setScope(next)
  }

  // Empty state shows when neither the in-office list nor the cross-office
  // list have anything to render. We also gate on a non-empty query so the
  // empty state doesn't flash on first open before the user has typed.
  const showEmptyState =
    query.trim().length > 0 &&
    grouped.length === 0 &&
    crossResults.length === 0

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/40"
      style={{ paddingTop: '20vh' }}
      onClick={close}
      role="dialog"
      aria-modal="true"
      aria-label="Command palette"
      data-testid="command-palette"
    >
      <div
        className="bg-white dark:bg-gray-900 rounded-xl shadow-2xl border border-gray-200 dark:border-gray-800 w-full max-w-[600px] mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        {/* Search row — borderless input with a leading lucide icon to
            mirror the FileMenu / CanvasFinder visual language. */}
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-200 dark:border-gray-800">
          <Search
            size={16}
            className="text-gray-400 dark:text-gray-500 flex-shrink-0"
            aria-hidden="true"
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Jump to anything…"
            aria-label="Command palette search"
            data-testid="command-palette-input"
            className="flex-1 text-base bg-transparent outline-none text-gray-900 dark:text-gray-100 placeholder:text-gray-400 dark:placeholder:text-gray-500"
          />
        </div>

        {/* Scope chip row — a single small chip indicating the current
            search scope. Click toggles when cross-office search is
            available; otherwise it's a read-only badge. */}
        <div className="px-4 pt-2 pb-1">
          {crossOfficeSupported ? (
            <button
              ref={scopeChipRef}
              type="button"
              onClick={toggleScope}
              data-testid="command-palette-scope-chip"
              data-scope={scope}
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[11px] text-gray-600 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-800 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400"
              aria-label={`Toggle scope (currently ${scope === 'office' ? 'this office' : 'all offices'})`}
            >
              {scope === 'office' ? (
                <Building2 size={11} aria-hidden="true" />
              ) : (
                <Globe size={11} aria-hidden="true" />
              )}
              <span>
                {scope === 'office'
                  ? officeName
                    ? `Office: ${officeName}`
                    : 'This office'
                  : 'All offices'}
              </span>
            </button>
          ) : (
            <span
              data-testid="command-palette-scope-chip"
              data-scope={scope}
              data-readonly="true"
              className="inline-flex items-center gap-1.5 px-2 py-0.5 rounded-full border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50 text-[11px] text-gray-500 dark:text-gray-400"
            >
              <Building2 size={11} aria-hidden="true" />
              <span>
                {officeName ? `Office: ${officeName}` : 'This office'}
              </span>
            </span>
          )}
        </div>

        <ul
          className="max-h-[60vh] overflow-y-auto py-1"
          data-testid="command-palette-list"
        >
          {/* Recent ribbon — only renders when the query is empty and we
              have at least one resolvable recent. The flat keyboard index
              starts at the recent rows, so they participate in arrow nav. */}
          {showRecents && (
            <li data-testid="command-palette-section-recent-wrap">
              <div
                className="px-4 pt-3 pb-1 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
                data-testid="command-palette-section-recent"
              >
                Recent
              </div>
              <ul>
                {recentItems.map((item, i) => {
                  const flatIndex = i
                  const active = flatIndex === effectiveHighlight
                  return (
                    <li key={`recent-${item.id}`}>
                      <PaletteRow
                        item={item}
                        active={active}
                        leadingIcon={Clock}
                        onHover={() => setHighlightIndex(flatIndex)}
                        onActivate={() => runItem(item)}
                        testId={`command-palette-recent-${item.id}`}
                      />
                    </li>
                  )
                })}
              </ul>
            </li>
          )}
          {showEmptyState && (
            <li
              className="px-4 py-8 text-center"
              data-testid="command-palette-empty"
            >
              <SearchX
                size={20}
                className="mx-auto mb-2 text-gray-400 dark:text-gray-500"
                aria-hidden="true"
              />
              <div className="text-sm text-gray-600 dark:text-gray-300">
                No commands match
              </div>
              <div className="mt-1 text-[11px] text-gray-400 dark:text-gray-500">
                Try a tool name or <code className="font-mono">floor:</code>
              </div>
            </li>
          )}
          {grouped.map((group) => {
            const Icon = SECTION_ICON[group.section]
            return (
              <li key={group.section}>
                <div
                  className="px-4 pt-3 pb-1 flex items-center gap-1.5 text-[10px] font-semibold text-gray-400 dark:text-gray-500 uppercase tracking-wider"
                  data-testid={`command-palette-section-${group.section}`}
                >
                  <Icon size={11} aria-hidden="true" />
                  <span>{SECTION_LABELS[group.section]}</span>
                </div>
                <ul>
                  {group.items.map((item) => {
                    // Flat index in the navigable list. When the recents
                    // ribbon is showing, the keyboard list begins with
                    // those rows, so we offset by their length.
                    const filteredIndex = filtered.indexOf(item)
                    const flatIndex = showRecents
                      ? recentItems.length + filteredIndex
                      : filteredIndex
                    const active = flatIndex === effectiveHighlight
                    return (
                      <li key={item.id}>
                        <PaletteRow
                          item={item}
                          active={active}
                          leadingIcon={SECTION_ICON[item.section]}
                          onHover={() => setHighlightIndex(flatIndex)}
                          onActivate={() => runItem(item)}
                          testId={`command-palette-item-${item.id}`}
                        />
                      </li>
                    )
                  })}
                </ul>
              </li>
            )
          })}
          <CrossOfficeResultsGroup
            results={crossResults}
            highlightedId={crossHighlightKey}
            onHover={(key) => setCrossHighlightKey(key)}
            onPick={onCrossPick}
          />
        </ul>
      </div>
    </div>
  )
}

interface PaletteRowProps {
  item: CommandItem
  active: boolean
  leadingIcon: LucideIcon
  onHover: () => void
  onActivate: () => void
  testId: string
}

/**
 * One row in the palette list. Splitting the row into its own component
 * keeps the body's render tree readable and lets recents + groups share
 * the same exact markup — which is the whole point of the visual refresh.
 */
function PaletteRow({
  item,
  active,
  leadingIcon: Icon,
  onHover,
  onActivate,
  testId,
}: PaletteRowProps) {
  const shortcut = ACTION_SHORTCUT[item.id]
  return (
    <button
      type="button"
      data-testid={testId}
      data-active={active ? 'true' : 'false'}
      onMouseEnter={onHover}
      onClick={onActivate}
      className={`w-full text-left px-4 py-2 text-sm flex items-center gap-2 ${
        active
          ? 'bg-gray-100 dark:bg-gray-800 text-gray-900 dark:text-gray-100'
          : 'text-gray-800 dark:text-gray-100 hover:bg-gray-50 dark:hover:bg-gray-800/50'
      }`}
    >
      <Icon
        size={14}
        className="text-gray-500 dark:text-gray-400 flex-shrink-0"
        aria-hidden="true"
      />
      <span className="flex-1 min-w-0 truncate">{item.label}</span>
      {item.subtitle && (
        <span className="text-xs text-gray-400 dark:text-gray-500 flex-shrink-0">
          {item.subtitle}
        </span>
      )}
      {shortcut && (
        <kbd
          className="text-[10px] font-mono px-1.5 py-0.5 rounded border border-gray-200 dark:border-gray-700 text-gray-500 dark:text-gray-400 bg-gray-50 dark:bg-gray-800/70 flex-shrink-0"
          data-testid={`${testId}-shortcut`}
        >
          {shortcut}
        </kbd>
      )}
    </button>
  )
}
