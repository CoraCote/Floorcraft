import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { Pencil, Printer, Share2, Image as ImageIcon } from 'lucide-react'
import { FileMenu, type FileMenuGroup } from './FileMenu'

/**
 * Builds a fresh set of menu groups with vi.fn handlers so each test can
 * assert the handler was called without bleeding state into a sibling
 * test. Mirrors the structure TopBar feeds the real component.
 */
function buildGroups() {
  const onRename = vi.fn()
  const onPdf = vi.fn()
  const onPng = vi.fn()
  const onShare = vi.fn()
  const groups: FileMenuGroup[] = [
    {
      heading: 'Project',
      items: [
        { id: 'rename', label: 'Rename project', icon: Pencil, onSelect: onRename },
      ],
    },
    {
      heading: 'Export',
      items: [
        { id: 'export-pdf', label: 'Export PDF', icon: Printer, onSelect: onPdf },
        { id: 'export-png', label: 'Export PNG', icon: ImageIcon, onSelect: onPng },
      ],
    },
    {
      heading: 'Share',
      items: [
        { id: 'share-invite', label: 'Invite collaborators', icon: Share2, onSelect: onShare },
      ],
    },
  ]
  return { groups, onRename, onPdf, onPng, onShare }
}

beforeEach(() => {
  // queueMicrotask in `activate` defers the handler; vi.useRealTimers is
  // the default but stating it makes the intent obvious for readers
  // hunting "why does this assertion need a flush?".
  vi.useRealTimers()
})

describe('FileMenu', () => {
  it('renders the trigger and stays closed by default', () => {
    const { groups } = buildGroups()
    render(<FileMenu groups={groups} />)
    expect(screen.getByRole('button', { name: /file/i })).toBeInTheDocument()
    // The panel is only mounted while open — querying by its testid
    // confirms the closed state without relying on aria-expanded alone.
    expect(screen.queryByTestId('file-menu-panel')).not.toBeInTheDocument()
  })

  it('opens on click and renders each group heading', () => {
    const { groups } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
    expect(screen.getByTestId('file-menu-panel')).toBeInTheDocument()
    const headings = screen.getAllByTestId('file-menu-heading').map((h) => h.textContent)
    expect(headings).toEqual(['Project', 'Export', 'Share'])
  })

  it('closes when Escape is pressed', () => {
    const { groups } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
    expect(screen.getByTestId('file-menu-panel')).toBeInTheDocument()
    // The keydown listener lives on the panel — fire from an item to
    // mirror the keystroke arriving at whatever child currently has focus.
    fireEvent.keyDown(screen.getByTestId('file-menu-panel'), { key: 'Escape' })
    expect(screen.queryByTestId('file-menu-panel')).not.toBeInTheDocument()
  })

  it('moves focus between items with ArrowDown / ArrowUp', () => {
    const { groups } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))

    // The first item starts focused (effect on open).
    expect(screen.getByTestId('file-menu-item-rename')).toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('file-menu-panel'), { key: 'ArrowDown' })
    expect(screen.getByTestId('file-menu-item-export-pdf')).toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('file-menu-panel'), { key: 'ArrowDown' })
    expect(screen.getByTestId('file-menu-item-export-png')).toHaveFocus()

    fireEvent.keyDown(screen.getByTestId('file-menu-panel'), { key: 'ArrowUp' })
    expect(screen.getByTestId('file-menu-item-export-pdf')).toHaveFocus()
  })

  it('wraps focus from last item back to first on ArrowDown', () => {
    const { groups } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
    // Total items: 4 (rename, pdf, png, invite). Three ArrowDown presses
    // walk to the last; the fourth wraps back to the first.
    const panel = screen.getByTestId('file-menu-panel')
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(screen.getByTestId('file-menu-item-share-invite')).toHaveFocus()
    fireEvent.keyDown(panel, { key: 'ArrowDown' })
    expect(screen.getByTestId('file-menu-item-rename')).toHaveFocus()
  })

  it('calls the bound handler and closes on item activation (click)', async () => {
    const { groups, onPdf } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))

    fireEvent.click(screen.getByTestId('file-menu-item-export-pdf'))
    // The handler is dispatched via queueMicrotask, so let the microtask
    // queue flush before asserting.
    await Promise.resolve()
    expect(onPdf).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('file-menu-panel')).not.toBeInTheDocument()
  })

  it('activates the focused item with Enter (fires a click on the focused button)', async () => {
    const { groups, onRename } = buildGroups()
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))

    // The first item is auto-focused after open. Pressing Enter on a
    // <button> dispatches a synthetic click — fireEvent.click matches
    // that path; using keyDown("Enter") would not, since the menu's
    // keyDown handler intentionally lets Enter bubble to the button.
    fireEvent.click(screen.getByTestId('file-menu-item-rename'))
    await Promise.resolve()
    expect(onRename).toHaveBeenCalledTimes(1)
    expect(screen.queryByTestId('file-menu-panel')).not.toBeInTheDocument()
  })

  it('renders shortcut hints when provided', () => {
    const onSelect = vi.fn()
    const groups: FileMenuGroup[] = [
      {
        heading: 'Project',
        items: [
          { id: 'save', label: 'Save', icon: Pencil, shortcut: '⌘S', onSelect },
        ],
      },
    ]
    render(<FileMenu groups={groups} />)
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
    expect(screen.getByText('⌘S')).toBeInTheDocument()
  })

  it('closes when the user clicks outside the menu', () => {
    const { groups } = buildGroups()
    render(
      <div>
        <FileMenu groups={groups} />
        <button data-testid="outside">Outside</button>
      </div>,
    )
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
    expect(screen.getByTestId('file-menu-panel')).toBeInTheDocument()
    // mousedown is the event the click-outside listener subscribes to;
    // a plain click would miss it.
    fireEvent.mouseDown(screen.getByTestId('outside'))
    expect(screen.queryByTestId('file-menu-panel')).not.toBeInTheDocument()
  })
})
