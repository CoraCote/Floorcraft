import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'
import { useUIStore } from '../../stores/uiStore'
import { useFloorStore } from '../../stores/floorStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import {
  filterCommandItems,
  SECTION_LABELS,
  SECTION_ORDER,
  type CommandItem,
  type CommandSection,
} from '../../lib/commandPaletteFilter'

/** People section is capped so a 2000-employee roster doesn't flood the DOM. */
const MAX_PEOPLE_RESULTS = 8

/**
 * Cmd+K / Ctrl+K / "/" quick-action palette.
 *
 * Mounted inside ProjectShell (so it only activates on an office route,
 * not on the landing / auth pages). Opens via `uiStore.commandPaletteOpen`,
 * closes on Escape, click-outside, Enter, or any action run. While open,
 * the modal ref-count is bumped so other global hotkeys stand down.
 *
 * Result model: one flat list of {section, label, run} items built once
 * per open-state + store snapshot, filtered by a case-insensitive
 * substring match (see `filterCommandItems`). Sections are rendered with
 * a thin header label and keyboard navigation treats the list as one
 * continuous sequence (Arrow-Up / Arrow-Down across sections, Tab jumps
 * to the next section's first item).
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
  const setExportDialogOpen = useUIStore((s) => s.setExportDialogOpen)
  const presentationMode = useUIStore((s) => s.presentationMode)
  const setPresentationMode = useUIStore((s) => s.setPresentationMode)

  const navigate = useNavigate()
  const { teamSlug, officeSlug } = useParams<{
    teamSlug: string
    officeSlug: string
  }>()

  const employees = useVisibleEmployees()
  const floors = useFloorStore((s) => s.floors)
  const setActiveFloor = useFloorStore((s) => s.setActiveFloor)

  const [query, setQuery] = useState('')
  const [highlightIndex, setHighlightIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)

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

  // Build the full item catalogue. Rebuilt on every render; the
  // dependency set is small and the cost is dominated by the People
  // slice which we cap via `MAX_PEOPLE_RESULTS` below.
  const items = useMemo<CommandItem[]>(() => {
    const next: CommandItem[] = []
    const basePath = teamSlug && officeSlug ? `/t/${teamSlug}/o/${officeSlug}` : null

    // --- Navigate -------------------------------------------------------
    if (basePath) {
      next.push(
        {
          id: 'nav-map',
          section: 'navigate',
          label: 'Go to Map',
          run: () => {
            navigate(`${basePath}/map`)
            close()
          },
        },
        {
          id: 'nav-roster',
          section: 'navigate',
          label: 'Go to Roster',
          run: () => {
            navigate(`${basePath}/roster`)
            close()
          },
        },
        {
          id: 'nav-reports',
          section: 'navigate',
          label: 'Go to Reports',
          run: () => {
            navigate(`${basePath}/reports`)
            close()
          },
        },
      )
    }
    if (teamSlug) {
      next.push({
        id: 'nav-team-settings',
        section: 'navigate',
        label: 'Go to Team Settings',
        run: () => {
          navigate(`/t/${teamSlug}/settings`)
          close()
        },
      })
    }

    // --- People (respecting PII redaction) -----------------------------
    // We read from `useVisibleEmployees`, which returns the redacted
    // projection when the viewer lacks `viewPII`. Filtering happens AFTER
    // redaction, so a viewer who types a full name won't accidentally
    // reveal who exists in the roster.
    const peopleList = Object.values(employees)
    // Pre-filter by the current query here so the cap applies to the
    // matching slice, not the first N of the full roster.
    const q = query.trim().toLowerCase()
    const matchingPeople = q
      ? peopleList.filter((e) => e.name.toLowerCase().includes(q))
      : peopleList
    for (const emp of matchingPeople.slice(0, MAX_PEOPLE_RESULTS)) {
      next.push({
        id: `person-${emp.id}`,
        section: 'people',
        label: emp.name,
        subtitle: emp.department || emp.title || undefined,
        run: () => {
          if (!basePath) return
          // Opens the roster page with a pre-selected employee. The
          // roster drawer reads `?employee=<id>` on mount (handled in
          // RosterPage).
          navigate(`${basePath}/roster?employee=${emp.id}`)
          close()
        },
      })
    }

    // --- Floors --------------------------------------------------------
    const sortedFloors = [...floors].sort((a, b) => a.order - b.order)
    for (const floor of sortedFloors) {
      next.push({
        id: `floor-${floor.id}`,
        section: 'floors',
        label: `Switch to ${floor.name}`,
        run: () => {
          setActiveFloor(floor.id)
          close()
        },
      })
    }

    // --- Actions -------------------------------------------------------
    next.push({
      id: 'action-export',
      section: 'actions',
      label: 'Export PDF',
      run: () => {
        setExportDialogOpen(true)
        close()
      },
    })
    next.push({
      id: 'action-export-png',
      section: 'actions',
      label: 'Export PNG',
      run: () => {
        setExportDialogOpen(true)
        close()
      },
    })
    next.push({
      id: 'action-presentation',
      section: 'actions',
      label: presentationMode
        ? 'Exit presentation mode'
        : 'Toggle presentation mode',
      run: () => {
        setPresentationMode(!presentationMode)
        close()
      },
    })

    return next
  }, [
    teamSlug,
    officeSlug,
    employees,
    floors,
    navigate,
    setActiveFloor,
    setExportDialogOpen,
    setPresentationMode,
    presentationMode,
    query,
    close,
  ])

  const filtered = useMemo(() => filterCommandItems(items, query), [items, query])

  // Clamp the highlight to the filtered range inline rather than in an
  // effect. When the query changes and the highlighted row falls outside
  // the new list, we show index 0 as active — users expect the first
  // match to be selected after typing. Keyboard nav still updates
  // `highlightIndex` directly, and because the effective value is
  // derived each render we never need to setState in response to a
  // derived value.
  const effectiveHighlight =
    highlightIndex >= filtered.length ? 0 : highlightIndex

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      e.preventDefault()
      close()
      return
    }
    if (e.key === 'Enter') {
      e.preventDefault()
      const item = filtered[effectiveHighlight]
      if (item) item.run()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setHighlightIndex((i) => {
        const base = i >= filtered.length ? 0 : i
        return filtered.length ? (base + 1) % filtered.length : 0
      })
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setHighlightIndex((i) => {
        const base = i >= filtered.length ? 0 : i
        return filtered.length
          ? (base - 1 + filtered.length) % filtered.length
          : 0
      })
      return
    }
    if (e.key === 'Tab') {
      // Cycle to the first item of the next section (wrapping at the end).
      // No-op when everything is in one section.
      e.preventDefault()
      if (filtered.length === 0) return
      const currentSection = filtered[effectiveHighlight]?.section
      // Walk forward from the current highlight until we hit a different
      // section. If we hit the end, wrap to index 0.
      let idx = effectiveHighlight
      for (let i = 1; i <= filtered.length; i++) {
        const candidate = (effectiveHighlight + i) % filtered.length
        if (filtered[candidate].section !== currentSection) {
          idx = candidate
          break
        }
      }
      setHighlightIndex(idx)
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
        className="bg-white rounded-xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden"
        onClick={(e) => e.stopPropagation()}
        onKeyDown={handleKeyDown}
      >
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Jump to anything…"
          aria-label="Command palette search"
          data-testid="command-palette-input"
          className="w-full px-4 py-3 text-sm border-b border-gray-200 outline-none"
        />
        <ul
          className="max-h-[60vh] overflow-y-auto py-1"
          data-testid="command-palette-list"
        >
          {grouped.length === 0 && (
            <li className="px-4 py-6 text-center text-sm text-gray-500">
              No matches.
            </li>
          )}
          {grouped.map((group) => (
            <li key={group.section}>
              <div
                className="px-4 pt-3 pb-1 text-[11px] font-semibold text-gray-400 uppercase tracking-wide"
                data-testid={`command-palette-section-${group.section}`}
              >
                {SECTION_LABELS[group.section]}
              </div>
              <ul>
                {group.items.map((item) => {
                  const flatIndex = filtered.indexOf(item)
                  const active = flatIndex === effectiveHighlight
                  return (
                    <li key={item.id}>
                      <button
                        type="button"
                        data-testid={`command-palette-item-${item.id}`}
                        data-active={active ? 'true' : 'false'}
                        onMouseEnter={() => setHighlightIndex(flatIndex)}
                        onClick={() => item.run()}
                        className={`w-full text-left px-4 py-2 text-sm ${
                          active
                            ? 'bg-blue-50 text-blue-900'
                            : 'text-gray-800 hover:bg-gray-50'
                        }`}
                      >
                        <div>{item.label}</div>
                        {item.subtitle && (
                          <div className="text-xs text-gray-500">
                            {item.subtitle}
                          </div>
                        )}
                      </button>
                    </li>
                  )
                })}
              </ul>
            </li>
          ))}
        </ul>
      </div>
    </div>
  )
}
