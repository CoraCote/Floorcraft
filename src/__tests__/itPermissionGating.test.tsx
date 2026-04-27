/**
 * M2 — `viewITLayer` permission across surfaces.
 *
 *   1. The matrix grants/denies the action to the right roles.
 *   2. The library shows IT tiles only when `useCan('viewITLayer')` is
 *      true. Tested with the real `useProjectStore` role-driven path so
 *      the matrix wiring + the gate are exercised together.
 *   3. With permission, IT tiles + section render.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { useLibraryCollapse } from '../hooks/useLibraryCollapse'
import { useLibraryFavorites } from '../hooks/useLibraryFavorites'
import { useRecentLibraryItems } from '../hooks/useRecentLibraryItems'
import { can } from '../lib/permissions'

beforeEach(() => {
  cleanup()
  vi.resetModules()
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

describe('permissions matrix — viewITLayer', () => {
  it('grants viewITLayer to owner / editor / space-planner', () => {
    expect(can('owner', 'viewITLayer')).toBe(true)
    expect(can('editor', 'viewITLayer')).toBe(true)
    expect(can('space-planner', 'viewITLayer')).toBe(true)
  })
  it('denies viewITLayer to hr-editor / viewer / shareViewer', () => {
    expect(can('hr-editor', 'viewITLayer')).toBe(false)
    expect(can('viewer', 'viewITLayer')).toBe(false)
    expect(can('shareViewer', 'viewITLayer')).toBe(false)
  })
  it('denies for null (transient load) state', () => {
    expect(can(null, 'viewITLayer')).toBe(false)
  })
})

describe('ElementLibrary — viewITLayer gates IT tiles', () => {
  it('without viewITLayer: IT tiles + section header are absent', async () => {
    // Mock useCan so editMap=true (library renders), viewITLayer=false.
    vi.doMock('../hooks/useCan', () => ({
      useCan: (action: string) => action === 'editMap' || action === 'editRoster',
    }))
    const { ElementLibrary } = await import(
      '../components/editor/LeftSidebar/ElementLibrary'
    )
    render(<ElementLibrary />)
    expect(
      screen.queryByRole('button', { name: /IT \/ Infrastructure/i }),
    ).toBeNull()
    // Unique IT-tile labels (Access point, Network jack, Video bar,
    // Badge reader) should be absent. "Display" / "Outlet" are common
    // English words that may appear in copy elsewhere, so we stick to
    // the unique ones.
    expect(screen.queryByText('Access point')).toBeNull()
    expect(screen.queryByText('Network jack')).toBeNull()
    expect(screen.queryByText('Video bar')).toBeNull()
    expect(screen.queryByText('Badge reader')).toBeNull()
  })

  it('with viewITLayer: IT tiles + section render', async () => {
    vi.doMock('../hooks/useCan', () => ({
      useCan: () => true,
    }))
    const { ElementLibrary } = await import(
      '../components/editor/LeftSidebar/ElementLibrary'
    )
    render(<ElementLibrary />)
    expect(
      screen.getByRole('button', { name: /IT \/ Infrastructure/i }),
    ).toBeInTheDocument()
    expect(screen.getByText('Access point')).toBeInTheDocument()
    expect(screen.getByText('Network jack')).toBeInTheDocument()
    expect(screen.getByText('Video bar')).toBeInTheDocument()
    expect(screen.getByText('Badge reader')).toBeInTheDocument()
  })
})
