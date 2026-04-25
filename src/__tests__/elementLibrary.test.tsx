/**
 * Wave 12B component tests for the left-sidebar ElementLibrary polish:
 * search filter, recent row, hover tooltip, active-tool highlight.
 *
 * Sibling test files (`elementLibraryFurniture.test.tsx`, `libraryRecents.test.tsx`)
 * exercise other slices of the same component — keep this one focused on
 * the Wave 12B surface so failures point at the right diff.
 */
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  act,
  cleanup,
  within,
} from '@testing-library/react'
import { ElementLibrary } from '../components/editor/LeftSidebar/ElementLibrary'
import { useLibraryCollapse } from '../hooks/useLibraryCollapse'
import { useLibraryFavorites } from '../hooks/useLibraryFavorites'
import { useRecentLibraryItems } from '../hooks/useRecentLibraryItems'
import { useCanvasStore } from '../stores/canvasStore'
import {
  ELEMENT_LIBRARY_RECENTS_KEY,
  clearRecents,
} from '../lib/elementLibraryRecents'

vi.mock('../hooks/useCan', () => ({
  useCan: () => true,
}))

function expandAllCategories() {
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
}

describe('ElementLibrary — Wave 12B polish', () => {
  beforeEach(() => {
    expandAllCategories()
    useLibraryFavorites.setState({ favorites: new Set<string>() })
    useRecentLibraryItems.setState({ recents: [] })
    useCanvasStore.setState({ activeTool: 'select' })
    clearRecents()
    localStorage.removeItem(ELEMENT_LIBRARY_RECENTS_KEY)
    vi.useRealTimers()
  })

  afterEach(() => {
    cleanup()
  })

  describe('search filter', () => {
    it('filters tiles by name (case-insensitive substring)', () => {
      render(<ElementLibrary />)
      const search = screen.getByLabelText('Filter elements') as HTMLInputElement
      fireEvent.change(search, { target: { value: 'desk' } })
      // "Desk", "Hot Desk", "L-Shape Desk", "Reception Desk" should be visible.
      expect(screen.getAllByText(/desk/i).length).toBeGreaterThan(0)
      // A non-matching label like "Sofa" should disappear.
      expect(screen.queryByText('Sofa')).not.toBeInTheDocument()
    })

    it('hides empty groups under filter (only matching categories render)', () => {
      render(<ElementLibrary />)
      const search = screen.getByLabelText('Filter elements') as HTMLInputElement
      fireEvent.change(search, { target: { value: 'sofa' } })
      // Furniture group remains because it has a matching tile.
      expect(screen.getByRole('button', { name: /Furniture/i })).toBeInTheDocument()
      // Tables / Rooms have no matches and should be gone.
      expect(screen.queryByRole('button', { name: /^Tables$/i })).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: /^Rooms$/i })).not.toBeInTheDocument()
    })

    it('shows the empty-result placard when nothing matches and Clear resets', () => {
      render(<ElementLibrary />)
      const search = screen.getByLabelText('Filter elements') as HTMLInputElement
      fireEvent.change(search, { target: { value: 'zzznomatch' } })
      expect(screen.getByText('No elements match')).toBeInTheDocument()
      fireEvent.click(screen.getByRole('button', { name: 'Clear' }))
      expect(search.value).toBe('')
      // After clearing, regular categories return.
      expect(screen.getByRole('button', { name: /^Tables$/i })).toBeInTheDocument()
    })

    it('Esc clears a non-empty query (without blurring)', () => {
      render(<ElementLibrary />)
      const search = screen.getByLabelText('Filter elements') as HTMLInputElement
      fireEvent.change(search, { target: { value: 'desk' } })
      search.focus()
      expect(document.activeElement).toBe(search)
      fireEvent.keyDown(search, { key: 'Escape' })
      expect(search.value).toBe('')
      expect(document.activeElement).toBe(search)
    })
  })

  describe('recents row', () => {
    it('is hidden when no recents are stored', () => {
      render(<ElementLibrary />)
      expect(screen.queryByText(/^Recent$/)).not.toBeInTheDocument()
    })

    it('appears after a tile click bumps the recents list', () => {
      render(<ElementLibrary />)
      // "Sofa" is a unique label so we can find its tile reliably.
      const sofa = screen.getByText('Sofa')
      fireEvent.click(sofa)
      expect(screen.getByText('Recent')).toBeInTheDocument()
      // The recent group should now contain a Sofa tile too — there will
      // therefore be two Sofa labels (one in Furniture, one in Recent).
      expect(screen.getAllByText('Sofa').length).toBeGreaterThanOrEqual(2)
    })

    it('persists the click into floocraft.elementLibrary.recent localStorage', () => {
      render(<ElementLibrary />)
      fireEvent.click(screen.getByText('Sofa'))
      const raw = localStorage.getItem(ELEMENT_LIBRARY_RECENTS_KEY)
      expect(raw).not.toBeNull()
      const parsed = JSON.parse(raw!)
      expect(Array.isArray(parsed)).toBe(true)
      expect(parsed[0].label).toBe('Sofa')
    })
  })

  describe('hover tooltip', () => {
    it('appears after a 250ms dwell and disappears on mouse-leave', () => {
      vi.useFakeTimers()
      render(<ElementLibrary />)
      const sofa = screen.getByText('Sofa')
      // The draggable wrapper is the tile container two levels up.
      const tile = sofa.closest('[role="button"]') as HTMLElement
      expect(tile).not.toBeNull()
      fireEvent.mouseEnter(tile)
      // No tooltip yet.
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
      act(() => {
        vi.advanceTimersByTime(260)
      })
      expect(screen.getByRole('tooltip')).toBeInTheDocument()
      fireEvent.mouseLeave(tile)
      expect(screen.queryByRole('tooltip')).not.toBeInTheDocument()
    })
  })

  describe('active-tool highlight', () => {
    it('applies the strong highlight class when activeTool matches a tile type', () => {
      // The canvas's `activeTool` union doesn't currently include element
      // factory types like "desk" — but the predicate uses string equality
      // for forward-compatibility, so we cast through `unknown` to wedge a
      // synthetic match for the assertion.
      useCanvasStore.setState({
        activeTool: 'desk' as unknown as ReturnType<
          typeof useCanvasStore.getState
        >['activeTool'],
      })
      render(<ElementLibrary />)
      // First "Desk" tile — its wrapper carries the active highlight class.
      const desk = screen.getAllByText('Desk')[0]
      const tile = desk.closest('[role="button"]') as HTMLElement
      expect(tile.className).toContain('bg-blue-50')
    })
  })

  describe('a11y', () => {
    it('search input exposes aria-label="Filter elements"', () => {
      render(<ElementLibrary />)
      expect(
        screen.getByLabelText('Filter elements'),
      ).toBeInTheDocument()
    })

    it('tiles have role="button" and a descriptive aria-label', () => {
      render(<ElementLibrary />)
      const sofaSection = screen
        .getByRole('button', { name: /Furniture/i })
        .closest('div.mb-3') as HTMLElement
      const tile = within(sofaSection).getByRole('button', {
        name: /Sofa.*click to place at centre/i,
      })
      expect(tile).toBeInTheDocument()
    })
  })
})
