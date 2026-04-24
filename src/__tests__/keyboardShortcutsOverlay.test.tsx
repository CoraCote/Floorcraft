import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { useUIStore } from '../stores/uiStore'
import { KeyboardShortcutsOverlay } from '../components/editor/KeyboardShortcutsOverlay'

/**
 * The overlay reads `open` from `uiStore.shortcutsOverlayOpen` and
 * renders nothing while closed, so each test toggles that flag via
 * `setShortcutsOverlayOpen(true)` and asserts on the dialog.
 *
 * `navigator.platform` is mocked per-test (configurable property) so
 * the macOS-vs-other code path can be exercised without leaking
 * across tests. The default `Linux x86_64` value yields `Ctrl`
 * labels; tests that need ⌘ flip it to `MacIntel` before render.
 */

function setPlatform(value: string) {
  Object.defineProperty(navigator, 'platform', {
    value,
    configurable: true,
  })
}

function openOverlay() {
  act(() => {
    useUIStore.getState().setShortcutsOverlayOpen(true)
  })
}

function closeOverlay() {
  act(() => {
    useUIStore.getState().setShortcutsOverlayOpen(false)
  })
}

describe('KeyboardShortcutsOverlay', () => {
  beforeEach(() => {
    closeOverlay()
    setPlatform('Linux x86_64')
  })

  afterEach(() => {
    closeOverlay()
    vi.restoreAllMocks()
  })

  it('renders nothing when shortcutsOverlayOpen is false', () => {
    render(<KeyboardShortcutsOverlay />)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('opens when shortcutsOverlayOpen flips to true', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: /keyboard shortcuts/i })).toBeInTheDocument()
  })

  it('auto-focuses the search input on open', async () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    // The focus call is queued via requestAnimationFrame so we wait
    // a tick before asserting.
    await act(async () => {
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()))
    })
    expect(document.activeElement).toBe(input)
  })

  it('filters by action substring', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'undo' } })
    expect(screen.getByText('Undo')).toBeInTheDocument()
    // Other unrelated actions should drop out
    expect(screen.queryByText('Lock / unlock')).toBeNull()
    expect(screen.queryByText('Toggle grid')).toBeNull()
  })

  it('filters by key substring (typing "cmd" matches several)', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'cmd' } })
    // Several Cmd-prefixed actions should still be visible
    expect(screen.getByText('Undo')).toBeInTheDocument()
    expect(screen.getByText('Select all')).toBeInTheDocument()
    expect(screen.getByText('Reset zoom')).toBeInTheDocument()
    // Non-Cmd actions should drop out
    expect(screen.queryByText('Toggle grid')).toBeNull()
    expect(screen.queryByText('Wall')).toBeNull()
  })

  it('shows an empty state when nothing matches', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'zzznotathing' } })
    // Both the aria-live count line and the empty-state body
    // contain "no shortcuts match" — assert both surfaces are
    // present so a refactor that drops one will fail loudly.
    expect(screen.getAllByText(/no shortcuts match/i).length).toBeGreaterThanOrEqual(1)
    expect(screen.getByText(/zzznotathing/)).toBeInTheDocument()
  })

  it('shows Ctrl labels on non-mac platforms', () => {
    setPlatform('Linux x86_64')
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    // At least one Ctrl pill should appear; ⌘ should not.
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('Ctrl')
    expect(dialog.textContent).not.toContain('\u2318')
  })

  it('shows ⌘ labels on macOS (mocked navigator.platform)', () => {
    setPlatform('MacIntel')
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const dialog = screen.getByRole('dialog')
    expect(dialog.textContent).toContain('\u2318')
    expect(dialog.textContent).not.toContain('Ctrl')
  })

  it('Escape closes the overlay', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    act(() => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }))
    })
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(useUIStore.getState().shortcutsOverlayOpen).toBe(false)
  })

  it('clicking the backdrop closes the overlay', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const dialog = screen.getByRole('dialog')
    fireEvent.click(dialog)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('Enter inside the search input does not close the overlay', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'undo' } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
  })

  it('reports the filter result count via aria-live', () => {
    render(<KeyboardShortcutsOverlay />)
    openOverlay()
    const input = screen.getByLabelText(/search keyboard shortcuts/i) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'undo' } })
    // Exactly one row matches the literal action "Undo"; the count
    // text is "1 shortcut".
    expect(screen.getByText(/1 shortcut(?!s)/i)).toBeInTheDocument()
  })
})
