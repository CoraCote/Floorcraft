/**
 * M2 — element-library tiles for the six IT-device types.
 *
 * Asserts:
 *   - the new "IT / Infrastructure" category exists in the library
 *   - all six tiles render with the expected sentence-case labels
 *   - each tile carries the canonical drag mime + a payload referencing
 *     the right element type, so a CanvasStage drop creates the right
 *     thing without library-side coupling.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within, fireEvent } from '@testing-library/react'
import {
  ElementLibrary,
  LIBRARY_DRAG_MIME,
} from '../components/editor/LeftSidebar/ElementLibrary'
import { useLibraryCollapse } from '../hooks/useLibraryCollapse'
import { useLibraryFavorites } from '../hooks/useLibraryFavorites'
import { useRecentLibraryItems } from '../hooks/useRecentLibraryItems'

vi.mock('../hooks/useCan', () => ({
  useCan: () => true,
}))

beforeEach(() => {
  // Expand every category by default so the new IT section's tiles
  // render immediately. The chevron-toggle test already pins persistence;
  // we just need every section open here so we can find the labels.
  useLibraryCollapse.setState({
    collapsed: {
      Tables: false,
      Desks: false,
      Rooms: false,
      Seating: false,
      Structure: false,
      Facilities: false,
      Furniture: false,
      'IT / Infrastructure': false,
      Other: false,
    },
  })
  useLibraryFavorites.setState({ favorites: new Set<string>() })
  useRecentLibraryItems.setState({ recents: [] })
})

describe('ElementLibrary — IT / Infrastructure tiles', () => {
  it('renders the IT / Infrastructure section heading', () => {
    render(<ElementLibrary />)
    expect(
      screen.getByRole('button', { name: /IT \/ Infrastructure/i }),
    ).toBeInTheDocument()
  })

  it('renders one tile per IT device type', () => {
    render(<ElementLibrary />)
    const heading = screen.getByRole('button', { name: /IT \/ Infrastructure/i })
    const section = heading.closest('div.mb-3') as HTMLElement
    const scope = within(section)
    // Six tiles, sentence-case, in the order the library declares them.
    expect(scope.getByText('Access point')).toBeInTheDocument()
    expect(scope.getByText('Network jack')).toBeInTheDocument()
    expect(scope.getByText('Display')).toBeInTheDocument()
    expect(scope.getByText('Video bar')).toBeInTheDocument()
    expect(scope.getByText('Badge reader')).toBeInTheDocument()
    expect(scope.getByText('Outlet')).toBeInTheDocument()
  })

  it('drag start writes the canonical mime + the right type into the payload', () => {
    render(<ElementLibrary />)
    const heading = screen.getByRole('button', { name: /IT \/ Infrastructure/i })
    const section = heading.closest('div.mb-3') as HTMLElement
    const scope = within(section)
    const tile = scope.getByRole('button', {
      name: /Add Access point element to canvas/i,
    })
    // jsdom's DataTransfer is intentionally minimal — provide a stub
    // that records what the drag handler tries to set, then assert.
    const data: Record<string, string> = {}
    const dataTransfer = {
      setData: (key: string, value: string) => {
        data[key] = value
      },
      effectAllowed: '',
    }
    fireEvent.dragStart(tile, { dataTransfer })
    expect(data[LIBRARY_DRAG_MIME]).toBeTruthy()
    const payload = JSON.parse(data[LIBRARY_DRAG_MIME])
    expect(payload.type).toBe('access-point')
    expect(payload.label).toBe('Access point')
  })
})
