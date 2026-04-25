import { useCallback, useEffect, useRef, useState } from 'react'

/**
 * Wave 14C — shared dropdown behaviour.
 *
 * Small hook that centralises the things every top-bar dropdown needs:
 *  - open/close state
 *  - click-outside to close (mousedown, so it doesn't collide with the
 *    trigger's own click toggle)
 *  - Escape to close and refocus the trigger
 *  - arrow-key roving focus through the registered items (Up/Down,
 *    Home/End)
 *  - Tab closes (keeps focus from stranding on a hidden item)
 *
 * We keep this deliberately small — each dropdown still owns its own
 * DOM + grouping. The hook just returns the behaviour primitives the
 * dropdown body needs.
 *
 * FileMenu.tsx predates this hook and is intentionally NOT migrated in
 * this wave; the patterns are the same but the tests + snapshots around
 * it are stable and out of scope.
 */

interface UseDropdownMenuResult {
  open: boolean
  toggle: () => void
  close: () => void
  focusedIndex: number
  setFocusedIndex: (i: number) => void
  triggerRef: React.RefObject<HTMLButtonElement | null>
  /** Register an item element for a given index. Returns a ref callback. */
  registerItemRef: (index: number) => (el: HTMLElement | null) => void
  panelProps: {
    ref: React.RefObject<HTMLDivElement | null>
    onKeyDown: (e: React.KeyboardEvent<HTMLDivElement>) => void
  }
  triggerProps: {
    ref: React.RefObject<HTMLButtonElement | null>
    onKeyDown: (e: React.KeyboardEvent<HTMLButtonElement>) => void
    'aria-haspopup': 'menu'
    'aria-expanded': boolean
  }
}

export function useDropdownMenu(): UseDropdownMenuResult {
  const [open, setOpen] = useState(false)
  const [focusedIndex, setFocusedIndex] = useState(0)
  const panelRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)
  const itemRefs = useRef<Map<number, HTMLElement | null>>(new Map())

  const close = useCallback(() => setOpen(false), [])
  const toggle = useCallback(() => {
    setOpen((o) => !o)
    setFocusedIndex(0)
  }, [])

  // Click-outside. We scope the listener to `open` so it costs nothing
  // while the panel is closed.
  useEffect(() => {
    if (!open) return
    function onPointer(e: MouseEvent) {
      const target = e.target as Node
      if (panelRef.current?.contains(target)) return
      if (triggerRef.current?.contains(target)) return
      setOpen(false)
    }
    document.addEventListener('mousedown', onPointer)
    return () => document.removeEventListener('mousedown', onPointer)
  }, [open])

  // Move DOM focus onto the currently-focused item whenever the panel
  // opens or the index changes. Skipped while closed so opening the
  // menu programmatically (e.g. via test) doesn't steal focus at mount.
  useEffect(() => {
    if (!open) return
    const el = itemRefs.current.get(focusedIndex)
    if (el) el.focus()
  }, [open, focusedIndex])

  const registerItemRef = useCallback(
    (index: number) => (el: HTMLElement | null) => {
      if (el === null) {
        itemRefs.current.delete(index)
      } else {
        itemRefs.current.set(index, el)
      }
    },
    [],
  )

  const handlePanelKey = useCallback((e: React.KeyboardEvent<HTMLDivElement>) => {
    const count = itemRefs.current.size
    if (e.key === 'Escape') {
      e.preventDefault()
      setOpen(false)
      triggerRef.current?.focus()
      return
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setFocusedIndex((i) => (count === 0 ? 0 : (i + 1) % count))
      return
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault()
      setFocusedIndex((i) => (count === 0 ? 0 : (i - 1 + count) % count))
      return
    }
    if (e.key === 'Home') {
      e.preventDefault()
      setFocusedIndex(0)
      return
    }
    if (e.key === 'End') {
      e.preventDefault()
      setFocusedIndex(Math.max(0, count - 1))
      return
    }
    if (e.key === 'Tab') {
      // Don't preventDefault — let the browser move focus out naturally.
      setOpen(false)
    }
  }, [])

  const handleTriggerKey = useCallback((e: React.KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowDown' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault()
      setOpen(true)
      setFocusedIndex(0)
    }
  }, [])

  return {
    open,
    toggle,
    close,
    focusedIndex,
    setFocusedIndex,
    triggerRef,
    registerItemRef,
    panelProps: {
      ref: panelRef,
      onKeyDown: handlePanelKey,
    },
    triggerProps: {
      ref: triggerRef,
      onKeyDown: handleTriggerKey,
      'aria-haspopup': 'menu',
      'aria-expanded': open,
    },
  }
}
