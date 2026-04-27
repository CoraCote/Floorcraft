import { useEffect, useId, useRef, useState } from 'react'
import { ChevronDown, FileText } from 'lucide-react'

/**
 * Wave 8B — TopBar File menu.
 *
 * Consolidates the small army of TopBar action buttons (rename, the Export
 * dropdown, the Share dropdown) into a single Linear/JSON-Crack-style
 * "File" menu. Each item is a plain handler so TopBar owns the actual
 * effects (PDF export, share dialog, etc.) and this component stays a
 * pure presentational menu.
 *
 * Items are grouped — Project, Export, Share — with small uppercase
 * headers. Permission-gated items (PDF/PNG behind viewReports, view-only
 * link behind editMap) are passed in conditionally; the menu renders only
 * the items it receives.
 */

export type FileMenuItem = {
  /** Stable id, used for keyboard focus tracking + test selectors. */
  id: string
  label: string
  icon: React.ComponentType<{ size?: number; 'aria-hidden'?: boolean }>
  /** Optional shortcut hint (e.g. "⌘S"). Rendered right-aligned. */
  shortcut?: string
  onSelect: () => void
}

export type FileMenuGroup = {
  /** Uppercase header above the group. Optional for a leading group. */
  heading?: string
  items: FileMenuItem[]
}

type FileMenuProps = {
  groups: FileMenuGroup[]
  /** Test seam — id for the menu trigger button. */
  triggerId?: string
}

export function FileMenu({ groups, triggerId }: FileMenuProps) {
  const [open, setOpen] = useState(false)
  // Index into the flattened item list for arrow-key focus.
  const [focusedIndex, setFocusedIndex] = useState(0)
  const containerRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([])
  const menuId = useId()

  // Flatten the groups so arrow keys move through items in visual order
  // without bouncing off heading rows.
  const flatItems = groups.flatMap((g) => g.items)

  // Close on click outside. Mirrors the lightweight pattern used by
  // ViewAsMenu / UserMenu — a single mousedown listener on the document,
  // gated on a ref check.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  // Focus the active item whenever the menu is open and the index moves.
  // Skipped while closed so opening doesn't steal focus during e.g. SSR.
  useEffect(() => {
    if (!open) return
    const el = itemRefs.current[focusedIndex]
    if (el) el.focus()
  }, [open, focusedIndex])

  // Reset focus to the first item whenever the menu opens. We could roll
  // this into the trigger's onClick, but the menu also opens via the
  // trigger's keyboard handler (ArrowDown/Enter/Space) — handling it once
  // here in an effect keeps the two paths in sync.

  function openMenu() {
    setOpen(true)
    // Always start with the first item focused. Doing it here (rather
    // than in an effect on `open`) keeps state transitions synchronous
    // so the lint rule against "setState in effect" stays satisfied.
    setFocusedIndex(0)
  }

  function handleTriggerKey(e: React.KeyboardEvent<HTMLButtonElement>) {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      openMenu()
    }
  }

  function handleMenuKey(e: React.KeyboardEvent<HTMLDivElement>) {
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (i + 1) % flatItems.length)
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (i - 1 + flatItems.length) % flatItems.length)
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setFocusedIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setFocusedIndex(flatItems.length - 1)
      return
    }
    // Tab traps inside the menu — we close + return to the trigger so
    // tabbing past the menu doesn't strand focus on a hidden element.
    if (e.key === 'Tab') {
      setOpen(false)
    }
  }

  function activate(item: FileMenuItem) {
    setOpen(false)
    // Defer the handler so React commits the close before any modal/popover
    // opens — without this, click-outside on a freshly-opened modal would
    // fire on the same tick and immediately close it.
    queueMicrotask(() => item.onSelect())
  }

  // Pre-compute each group's starting offset in the flat item list so the
  // render path can map (groupIndex, itemIndex) -> globalIndex without
  // mutating a counter during render.
  const groupOffsets: number[] = []
  for (let i = 0, offset = 0; i < groups.length; i += 1) {
    groupOffsets.push(offset)
    offset += groups[i].items.length
  }

  return (
    <div className="relative" ref={containerRef}>
      <button
        ref={triggerRef}
        id={triggerId}
        type="button"
        onClick={() => {
          if (open) {
            setOpen(false)
          } else {
            openMenu()
          }
        }}
        onKeyDown={handleTriggerKey}
        className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 rounded"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls={open ? menuId : undefined}
        data-testid="file-menu-trigger"
      >
        <FileText size={14} aria-hidden="true" />
        File
        <ChevronDown size={14} aria-hidden="true" />
      </button>
      {open && (
        <div
          id={menuId}
          role="menu"
          aria-label="File"
          onKeyDown={handleMenuKey}
          className="absolute left-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow dark:bg-gray-900 dark:border-gray-800 dark:shadow-black/40 z-50 py-1"
          data-testid="file-menu-panel"
        >
          {groups.map((group, gi) => (
            <div key={group.heading ?? `group-${gi}`}>
              {gi > 0 && (
                <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
              )}
              {group.heading && (
                <div
                  className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
                  data-testid="file-menu-heading"
                >
                  {group.heading}
                </div>
              )}
              {group.items.map((item, ii) => {
                const idx = groupOffsets[gi] + ii
                const Icon = item.icon
                return (
                  <button
                    key={item.id}
                    ref={(el) => {
                      itemRefs.current[idx] = el
                    }}
                    role="menuitem"
                    type="button"
                    tabIndex={focusedIndex === idx ? 0 : -1}
                    onClick={() => activate(item)}
                    onMouseEnter={() => setFocusedIndex(idx)}
                    className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
                    data-testid={`file-menu-item-${item.id}`}
                  >
                    <Icon size={14} aria-hidden={true} />
                    <span className="flex-1">{item.label}</span>
                    {item.shortcut && (
                      <kbd className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">
                        {item.shortcut}
                      </kbd>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

