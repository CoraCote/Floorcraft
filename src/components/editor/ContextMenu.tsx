import { useUIStore } from '../../stores/uiStore'
import { useElementsStore } from '../../stores/elementsStore'
import { useCanvasStore } from '../../stores/canvasStore'
import { deleteElements } from '../../lib/seatAssignment'
import { alignElements } from '../../lib/alignment'
import { useEffect, useMemo, useRef, useState } from 'react'
import { useShallow } from 'zustand/react/shallow'
import {
  Copy,
  Trash2,
  Lock,
  Unlock,
  Pencil,
  ChevronsUp,
  ChevronUp,
  ChevronDown,
  ChevronsDown,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  MousePointer2,
  Grid3x3,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'

/**
 * Group + item structures for the polished context menu. Items are
 * built up declaratively per render based on selection state — groups
 * with no surviving items are hidden entirely so the menu never shows
 * a header floating above an empty section.
 */
type MenuItem = {
  id: string
  label: string
  icon: LucideIcon
  shortcut?: string
  onClick: () => void
}
type MenuGroup = {
  id: string
  heading: string
  items: MenuItem[]
}

/**
 * Polished right-click context menu.
 *
 * Design notes:
 *  - Mirrors the FileMenu / View dropdown pattern in TopBar so the editor
 *    has one menu vocabulary: 10px uppercase group headings, 14px lucide
 *    icon + 13px label + right-aligned `<kbd>` shortcut, hairline group
 *    dividers, focus-visible rings, role="menu"/"menuitem".
 *  - Roving tabindex keeps Arrow/Home/End navigation contained to the
 *    menu while Enter activates the focused row and Escape closes.
 *  - Actions are gated on what the underlying stores actually expose.
 *    No Cut/Copy/Paste appear because the project has no clipboard
 *    plumbing yet (per the "don't invent actions" rule); when that
 *    lands those rows can drop into the existing Edit group.
 */
export function ContextMenu() {
  const contextMenu = useUIStore((s) => s.contextMenu)
  const setContextMenu = useUIStore((s) => s.setContextMenu)
  const selectedIds = useUIStore((s) => s.selectedIds)
  const setSelectedIds = useUIStore((s) => s.setSelectedIds)
  const clearSelection = useUIStore((s) => s.clearSelection)
  const setEditingLabelId = useUIStore((s) => s.setEditingLabelId)
  const {
    duplicateElements,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    updateElement,
  } = useElementsStore(
    useShallow((s) => ({
      duplicateElements: s.duplicateElements,
      bringToFront: s.bringToFront,
      sendToBack: s.sendToBack,
      bringForward: s.bringForward,
      sendBackward: s.sendBackward,
      updateElement: s.updateElement,
    })),
  )
  const elements = useElementsStore((s) => s.elements)
  const ref = useRef<HTMLDivElement>(null)

  // Roving focus index across the flattened item list. Reset whenever
  // the menu re-opens (different position, different elementId).
  const [focusIndex, setFocusIndex] = useState(0)
  useEffect(() => {
    setFocusIndex(0)
  }, [contextMenu?.x, contextMenu?.y, contextMenu?.elementId])

  // Click-outside + Escape handling. The original menu closed on any
  // window click — we keep that, but also wire Escape so keyboard
  // users can dismiss without stabbing for the mouse.
  useEffect(() => {
    if (!contextMenu) return
    const onPointer = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setContextMenu(null)
      }
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.stopPropagation()
        setContextMenu(null)
      }
    }
    // Use mousedown so the menu closes before the underlying click
    // bubbles up to canvas handlers (matches the TopBar dropdown
    // pattern in TopBar.tsx).
    window.addEventListener('mousedown', onPointer)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('mousedown', onPointer)
      window.removeEventListener('keydown', onKey)
    }
  }, [contextMenu, setContextMenu])

  const groups = useMemo<MenuGroup[]>(() => {
    if (!contextMenu) return []
    const el = contextMenu.elementId ? elements[contextMenu.elementId] : null
    const targetIds = selectedIds.length
      ? selectedIds
      : el
        ? [el.id]
        : []
    const isMulti = selectedIds.length >= 2

    const close = () => setContextMenu(null)

    // Empty-canvas right-click: only floor-level actions make sense.
    if (!el && !targetIds.length) {
      return [
        {
          id: 'canvas',
          heading: 'Canvas',
          items: [
            {
              id: 'select-all',
              label: 'Select all',
              icon: MousePointer2,
              shortcut: 'Ctrl+A',
              onClick: () => {
                setSelectedIds(Object.keys(elements))
                close()
              },
            },
            {
              id: 'toggle-grid',
              label: 'Toggle grid',
              icon: Grid3x3,
              shortcut: 'G',
              onClick: () => {
                useCanvasStore.getState().toggleGrid()
                close()
              },
            },
          ],
        },
      ]
    }

    const out: MenuGroup[] = []

    // ───── Edit ─────
    // Cut/Copy/Paste deliberately omitted: there is no clipboard store
    // backing them yet. Duplicate + Delete already cover the dominant
    // mouse-driven flows; keyboard users have Ctrl+D / Delete.
    out.push({
      id: 'edit',
      heading: 'Edit',
      items: [
        {
          id: 'duplicate',
          label: 'Duplicate',
          icon: Copy,
          shortcut: 'Ctrl+D',
          onClick: () => {
            const newIds = duplicateElements(targetIds)
            setSelectedIds(newIds)
            close()
          },
        },
        {
          id: 'delete',
          label: 'Delete',
          icon: Trash2,
          shortcut: 'Del',
          onClick: () => {
            deleteElements(targetIds)
            clearSelection()
            close()
          },
        },
      ],
    })

    // ───── Arrange ─────
    // Z-order ops act on a single element at a time in the underlying
    // store, so we apply them in selection order. The shortcuts mirror
    // common design-tool conventions even though no global hotkeys are
    // wired yet — listing them sets expectations and primes future
    // hotkey work.
    out.push({
      id: 'arrange',
      heading: 'Arrange',
      items: [
        {
          id: 'bring-front',
          label: 'Bring to front',
          icon: ChevronsUp,
          shortcut: 'Ctrl+Shift+]',
          onClick: () => {
            for (const id of targetIds) bringToFront(id)
            close()
          },
        },
        {
          id: 'bring-forward',
          label: 'Bring forward',
          icon: ChevronUp,
          shortcut: 'Ctrl+]',
          onClick: () => {
            for (const id of targetIds) bringForward(id)
            close()
          },
        },
        {
          id: 'send-backward',
          label: 'Send backward',
          icon: ChevronDown,
          shortcut: 'Ctrl+[',
          onClick: () => {
            for (const id of targetIds) sendBackward(id)
            close()
          },
        },
        {
          id: 'send-back',
          label: 'Send to back',
          icon: ChevronsDown,
          shortcut: 'Ctrl+Shift+[',
          onClick: () => {
            for (const id of targetIds) sendToBack(id)
            close()
          },
        },
      ],
    })

    // ───── Align ─────
    // Only meaningful with 2+ selected — `alignElements` itself bails
    // below that threshold. Hide the whole group rather than rendering
    // disabled rows so the menu stays compact for the common single-
    // select case.
    if (isMulti) {
      out.push({
        id: 'align',
        heading: 'Align',
        items: [
          {
            id: 'align-left',
            label: 'Align left',
            icon: AlignStartVertical,
            onClick: () => {
              alignElements(selectedIds, 'left')
              close()
            },
          },
          {
            id: 'align-h-center',
            label: 'Align center',
            icon: AlignCenterVertical,
            onClick: () => {
              alignElements(selectedIds, 'h-center')
              close()
            },
          },
          {
            id: 'align-right',
            label: 'Align right',
            icon: AlignEndVertical,
            onClick: () => {
              alignElements(selectedIds, 'right')
              close()
            },
          },
          {
            id: 'align-top',
            label: 'Align top',
            icon: AlignStartHorizontal,
            onClick: () => {
              alignElements(selectedIds, 'top')
              close()
            },
          },
          {
            id: 'align-v-center',
            label: 'Align middle',
            icon: AlignCenterHorizontal,
            onClick: () => {
              alignElements(selectedIds, 'v-center')
              close()
            },
          },
          {
            id: 'align-bottom',
            label: 'Align bottom',
            icon: AlignEndHorizontal,
            onClick: () => {
              alignElements(selectedIds, 'bottom')
              close()
            },
          },
        ],
      })
    }

    // ───── Object ─────
    // Lock / Rename are per-element ops and only make sense when we
    // have a concrete `el` from the right-click target.
    if (el) {
      const objectItems: MenuItem[] = []
      objectItems.push({
        id: 'toggle-lock',
        label: el.locked ? 'Unlock' : 'Lock',
        icon: el.locked ? Unlock : Lock,
        shortcut: 'Ctrl+L',
        onClick: () => {
          for (const id of targetIds) {
            const t = elements[id]
            if (t) updateElement(id, { locked: !el.locked })
          }
          close()
        },
      })
      // Rename is only useful when the element supports a label — every
      // BaseElement has `label`, so this is universal, but we still
      // hide it when a multi-select would clobber different names.
      if (selectedIds.length <= 1) {
        objectItems.push({
          id: 'rename',
          label: 'Rename',
          icon: Pencil,
          shortcut: 'F2',
          onClick: () => {
            setEditingLabelId(el.id)
            close()
          },
        })
      }
      out.push({ id: 'object', heading: 'Object', items: objectItems })
    }

    return out
  }, [
    contextMenu,
    elements,
    selectedIds,
    duplicateElements,
    bringToFront,
    sendToBack,
    bringForward,
    sendBackward,
    updateElement,
    setSelectedIds,
    setContextMenu,
    setEditingLabelId,
    clearSelection,
  ])

  // Flatten for keyboard navigation. Re-derived alongside groups so
  // arrow keys move past hidden groups without indexing tricks.
  const flatItems = useMemo(
    () => groups.flatMap((g) => g.items),
    [groups],
  )

  // Focus the active row when the index changes. Using the data-id
  // selector keeps the DOM lookup local to the menu wrapper instead
  // of leaking refs out of the render loop.
  useEffect(() => {
    if (!contextMenu) return
    if (!ref.current) return
    const el = ref.current.querySelector<HTMLButtonElement>(
      `button[data-menu-index="${focusIndex}"]`,
    )
    el?.focus()
  }, [focusIndex, contextMenu, flatItems.length])

  if (!contextMenu) return null
  if (!flatItems.length) return null

  const onKeyDown = (e: React.KeyboardEvent<HTMLDivElement>) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusIndex((i) => (i + 1) % flatItems.length)
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusIndex((i) => (i - 1 + flatItems.length) % flatItems.length)
    } else if (e.key === 'Home') {
      e.preventDefault()
      setFocusIndex(0)
    } else if (e.key === 'End') {
      e.preventDefault()
      setFocusIndex(flatItems.length - 1)
    }
    // Enter / Space activation rides on the native <button> behavior;
    // the parent listener handles Escape so it bubbles out cleanly.
  }

  let runningIndex = 0
  return (
    <div
      ref={ref}
      role="menu"
      aria-label="Canvas context menu"
      tabIndex={-1}
      onKeyDown={onKeyDown}
      onClick={(e) => e.stopPropagation()}
      onContextMenu={(e) => e.preventDefault()}
      className="fixed z-50 min-w-[200px] py-1 rounded-md border border-gray-200 bg-white shadow-xl dark:border-gray-700 dark:bg-gray-900 dark:shadow-black/40"
      style={{ left: contextMenu.x, top: contextMenu.y }}
    >
      {groups.map((group, gi) => (
        <div key={group.id}>
          {gi > 0 && (
            <div
              role="separator"
              className="my-1 h-px bg-gray-100 dark:bg-gray-800"
            />
          )}
          <div
            // 10px tracking-wider uppercase headers match the FileMenu /
            // View dropdown styling so the editor speaks one menu dialect.
            className="px-3 pt-1.5 pb-0.5 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500"
          >
            {group.heading}
          </div>
          {group.items.map((item) => {
            const Icon = item.icon
            const idx = runningIndex++
            return (
              <button
                key={item.id}
                role="menuitem"
                data-menu-index={idx}
                tabIndex={idx === focusIndex ? 0 : -1}
                onClick={item.onClick}
                onMouseEnter={() => setFocusIndex(idx)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-sm text-gray-700 hover:bg-gray-50 focus:bg-gray-50 focus:outline-none focus-visible:ring-1 focus-visible:ring-blue-400 dark:text-gray-200 dark:hover:bg-gray-800/60 dark:focus:bg-gray-800/60"
              >
                <Icon size={14} aria-hidden="true" className="text-gray-500 dark:text-gray-400" />
                <span className="flex-1">{item.label}</span>
                {item.shortcut && (
                  <kbd className="ml-4 font-mono text-[10px] text-gray-400 dark:text-gray-500">
                    {item.shortcut}
                  </kbd>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </div>
  )
}
