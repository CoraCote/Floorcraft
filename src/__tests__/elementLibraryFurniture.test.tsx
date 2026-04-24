import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import { ElementLibrary } from '../components/editor/LeftSidebar/ElementLibrary'
import { useLibraryCollapse } from '../hooks/useLibraryCollapse'
import { useLibraryFavorites } from '../hooks/useLibraryFavorites'
import { useRecentLibraryItems } from '../hooks/useRecentLibraryItems'

// The library hides itself behind a view-only placard for non-editors.
// Tests don't need a real permission system to pass, so stub `useCan` to
// always return true — we're just checking that the new Furniture section
// + its four tiles render.
vi.mock('../hooks/useCan', () => ({
  useCan: () => true,
}))

describe('ElementLibrary — Furniture section', () => {
  beforeEach(() => {
    // Expand every category by default so the new Furniture section's
    // tiles render without clicking a chevron first.
    useLibraryCollapse.setState({
      collapsed: {
        Tables: false,
        Desks: false,
        Rooms: false,
        Seating: false,
        Structure: false,
        Facilities: false,
        Furniture: false,
        Other: false,
      },
    })
    useLibraryFavorites.setState({ favorites: new Set<string>() })
    useRecentLibraryItems.setState({ recents: [] })
  })

  it('renders a Furniture section heading', () => {
    render(<ElementLibrary />)
    // The section title is a button (chevron toggle) in the sidebar.
    expect(screen.getByRole('button', { name: /Furniture/i })).toBeInTheDocument()
  })

  it('renders Sofa, Plant, Printer, and Whiteboard tiles', () => {
    render(<ElementLibrary />)
    // Tiles carry their label as plain text inside the draggable wrapper.
    // Use getAllByText to tolerate duplicates (e.g. the existing decor/whiteboard)
    // and assert the new ones exist.
    expect(screen.getByText('Sofa')).toBeInTheDocument()
    expect(screen.getByText('Plant')).toBeInTheDocument()
    expect(screen.getByText('Printer')).toBeInTheDocument()
    // Whiteboard label may appear twice (the legacy decor/whiteboard tile
    // still exists under Facilities). The new Furniture-section tile is
    // enough; assert at least one.
    expect(screen.getAllByText('Whiteboard').length).toBeGreaterThanOrEqual(1)
  })

  it('the four new tiles are grouped under the Furniture section', () => {
    render(<ElementLibrary />)
    const heading = screen.getByRole('button', { name: /Furniture/i })
    // The section container wraps both the heading button and the grid of
    // tiles; walk up to the wrapping <div class="mb-3"> that contains both.
    const section = heading.closest('div.mb-3') as HTMLElement | null
    expect(section).not.toBeNull()
    const scope = within(section!)
    expect(scope.getByText('Sofa')).toBeInTheDocument()
    expect(scope.getByText('Plant')).toBeInTheDocument()
    expect(scope.getByText('Printer')).toBeInTheDocument()
    expect(scope.getByText('Whiteboard')).toBeInTheDocument()
  })
})
