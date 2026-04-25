import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { FloorSwitcher } from '../components/editor/FloorSwitcher'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'

// Permission gate: every reorder/duplicate action is edit-gated, so make
// the test environment "editor" by default.
vi.mock('../hooks/useCan', () => ({
  useCan: () => true,
}))

// Audit emission writes to the supabase backend by default. Stub it so
// no network calls fire during the test.
vi.mock('../lib/auditRepository', () => ({
  insertEvent: vi.fn().mockResolvedValue(undefined),
}))

// Wave 15D: the FloorSwitcher row now hosts the OfficeSwitcher,
// which resolves teamSlug → id via supabase and lists offices via
// the repository. Stub both so this test stays focused on floor-tab
// behaviour and doesn't trigger any network round-trip.
vi.mock('../lib/supabase', () => ({
  supabase: {
    from: () => ({
      select: () => ({
        eq: () => ({
          maybeSingle: () =>
            Promise.resolve({ data: { id: 'team-1' }, error: null }),
        }),
      }),
    }),
  },
}))
vi.mock('../lib/offices/officeRepository', () => ({
  listOffices: () => Promise.resolve([]),
}))

beforeEach(() => {
  useFloorStore.setState({
    floors: [
      { id: 'a', name: 'Ground', order: 0, elements: {} },
      { id: 'b', name: 'Two', order: 1, elements: {} },
      { id: 'c', name: 'Three', order: 2, elements: {} },
    ],
    activeFloorId: 'a',
  })
  useElementsStore.setState({ elements: {} })
})

describe('FloorSwitcher — reorder + duplicate', () => {
  it('renders tabs in `order` sequence', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    const tabs = screen.getAllByRole('tab')
    expect(tabs.map((t) => t.textContent)).toEqual(['Ground', 'Two', 'Three'])
  })

  it('context menu shows Duplicate between Rename and Delete', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    const tab = screen.getByRole('tab', { name: 'Two' })
    fireEvent.contextMenu(tab, { clientX: 50, clientY: 50 })

    // Three menu items in order: Rename, Duplicate, Delete.
    const rename = screen.getByRole('button', { name: 'Rename' })
    const duplicate = screen.getByRole('button', { name: 'Duplicate' })
    const del = screen.getByRole('button', { name: 'Delete' })
    expect(rename).toBeInTheDocument()
    expect(duplicate).toBeInTheDocument()
    expect(del).toBeInTheDocument()

    // Verify physical DOM order: rename → duplicate → delete (siblings of
    // the same parent menu container).
    const items = Array.from(rename.parentElement!.children)
    expect(items.indexOf(rename)).toBeLessThan(items.indexOf(duplicate))
    expect(items.indexOf(duplicate)).toBeLessThan(items.indexOf(del))
  })

  it('clicking Duplicate creates a new floor and switches to it', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Ground' }), {
      clientX: 10,
      clientY: 10,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    const state = useFloorStore.getState()
    // Floor count goes 3 → 4
    expect(state.floors.length).toBe(4)
    // The duplicate is named "Ground copy" and is the active floor.
    const newActive = state.floors.find((f) => f.id === state.activeFloorId)
    expect(newActive?.name).toBe('Ground copy')
  })

  it('Duplicate inserts the clone immediately after the source', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    // Right-click on the middle tab "Two".
    fireEvent.contextMenu(screen.getByRole('tab', { name: 'Two' }), {
      clientX: 10,
      clientY: 10,
    })
    fireEvent.click(screen.getByRole('button', { name: 'Duplicate' }))

    const sorted = [...useFloorStore.getState().floors].sort(
      (x, y) => x.order - y.order,
    )
    expect(sorted.map((f) => f.name)).toEqual([
      'Ground',
      'Two',
      'Two copy',
      'Three',
    ])
  })

  it('drag-and-drop reorders tabs', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    const tabs = screen.getAllByRole('tab')
    const threeTab = tabs[2] // "Three" (id=c)
    const groundTab = tabs[0] // "Ground" (id=a)

    // jsdom's DataTransfer is partial — wire enough of it for our handlers
    // (setData/getData/types/effectAllowed/dropEffect).
    const store: Record<string, string> = {}
    const dataTransfer = {
      setData: (type: string, value: string) => {
        store[type] = value
      },
      getData: (type: string) => store[type] ?? '',
      get types() {
        return Object.keys(store)
      },
      effectAllowed: '',
      dropEffect: '',
    }

    // Drag "Three" (last) over the left half of "Ground" (first) — should
    // land at index 0. We use the left-half-of-first case because jsdom's
    // synthetic DragEvent drops the clientX init prop in some jsdom
    // versions; targeting the left half means the default clientX=0 still
    // computes to "before this tab" and the test stays deterministic.
    fireEvent.dragStart(threeTab, { dataTransfer })

    const groundWrapper = groundTab.parentElement as HTMLElement
    vi.spyOn(groundWrapper, 'getBoundingClientRect').mockReturnValue({
      x: 0,
      y: 0,
      left: 0,
      right: 80,
      top: 0,
      bottom: 30,
      width: 80,
      height: 30,
      toJSON: () => ({}),
    })

    fireEvent.dragOver(groundWrapper, { dataTransfer, clientX: 5, clientY: 10 })
    fireEvent.drop(groundWrapper, { dataTransfer, clientX: 5, clientY: 10 })

    const sorted = [...useFloorStore.getState().floors].sort(
      (x, y) => x.order - y.order,
    )
    // 'c' moved to index 0; 'a' and 'b' shift right.
    expect(sorted.map((f) => f.id)).toEqual(['c', 'a', 'b'])
  })

  it('shows insertion caret while dragging over a non-self tab', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    const tabs = screen.getAllByRole('tab')

    const store: Record<string, string> = {}
    const dataTransfer = {
      setData: (type: string, value: string) => {
        store[type] = value
      },
      getData: (type: string) => store[type] ?? '',
      get types() {
        return Object.keys(store)
      },
      effectAllowed: '',
      dropEffect: '',
    }

    fireEvent.dragStart(tabs[0], { dataTransfer })

    const targetWrapper = tabs[2].parentElement as HTMLElement
    vi.spyOn(targetWrapper, 'getBoundingClientRect').mockReturnValue({
      x: 200,
      y: 0,
      left: 200,
      right: 280,
      top: 0,
      bottom: 30,
      width: 80,
      height: 30,
      toJSON: () => ({}),
    })

    fireEvent.dragOver(targetWrapper, {
      dataTransfer,
      clientX: 210, // left half — caret renders before this tab
      clientY: 10,
    })

    // Caret element exists somewhere in the tablist during the drag.
    const carets = screen.getAllByTestId('floor-drop-caret')
    expect(carets.length).toBeGreaterThanOrEqual(1)
  })

  it('sets aria-dropeffect on the tablist while a drag is in progress', () => {
    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <FloorSwitcher />
      </MemoryRouter>,
    )
    const tabs = screen.getAllByRole('tab')
    const tablist = screen.getByRole('tablist')

    expect(tablist.getAttribute('aria-dropeffect')).toBeNull()

    const store: Record<string, string> = {}
    const dataTransfer = {
      setData: (type: string, value: string) => {
        store[type] = value
      },
      getData: (type: string) => store[type] ?? '',
      get types() {
        return Object.keys(store)
      },
      effectAllowed: '',
      dropEffect: '',
    }
    fireEvent.dragStart(tabs[0], { dataTransfer })

    expect(tablist.getAttribute('aria-dropeffect')).toBe('move')
  })
})

describe('FloorSwitcher — viewer mode', () => {
  it('viewers do not get a draggable affordance', async () => {
    // Re-mock useCan to return false for this test only. We have to use
    // doMock + dynamic import because the top-level vi.mock applies to
    // every test in the file.
    vi.resetModules()
    vi.doMock('../hooks/useCan', () => ({ useCan: () => false }))
    vi.doMock('../lib/auditRepository', () => ({
      insertEvent: vi.fn().mockResolvedValue(undefined),
    }))
    // Wave 15D: the OfficeSwitcher inside the FloorSwitcher row needs
    // both supabase + the office repo stubbed, otherwise its
    // teamSlug → id lookup tries to hit the network at mount.
    vi.doMock('../lib/supabase', () => ({
      supabase: {
        from: () => ({
          select: () => ({
            eq: () => ({
              maybeSingle: () =>
                Promise.resolve({ data: { id: 'team-1' }, error: null }),
            }),
          }),
        }),
      },
    }))
    vi.doMock('../lib/offices/officeRepository', () => ({
      listOffices: () => Promise.resolve([]),
    }))
    const { FloorSwitcher: ViewerFloorSwitcher } = await import(
      '../components/editor/FloorSwitcher'
    )

    useFloorStore.setState({
      floors: [
        { id: 'a', name: 'Ground', order: 0, elements: {} },
        { id: 'b', name: 'Two', order: 1, elements: {} },
      ],
      activeFloorId: 'a',
    })

    render(
      <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
        <ViewerFloorSwitcher />
      </MemoryRouter>,
    )
    const tablist = screen.getByRole('tablist')
    const tabs = within(tablist).getAllByRole('tab')
    for (const t of tabs) {
      expect(t.getAttribute('draggable')).toBe('false')
    }

    vi.doUnmock('../hooks/useCan')
    vi.doUnmock('../lib/auditRepository')
    vi.doUnmock('../lib/supabase')
    vi.doUnmock('../lib/offices/officeRepository')
  })
})
