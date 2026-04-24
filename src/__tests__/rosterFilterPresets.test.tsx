/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { useToastStore } from '../stores/toastStore'
import { RosterPage } from '../components/editor/RosterPage'
import {
  FILTER_PRESETS_STORAGE_KEY,
  MAX_FILTER_PRESETS,
  loadFilterPresets,
  saveFilterPresets,
} from '../lib/filterPresetsStorage'

/**
 * End-to-end-ish tests for the Saved filters dropdown wired into the
 * roster. We seed localStorage (or let the UI write to it) and assert
 * against: the dropdown list, the URL search after clicking a preset,
 * the store delete path, the "Save" disabled state, and the cap toast.
 *
 * The storage helper itself is covered in filterPresetsStorage.test.ts;
 * here we only care that the roster wires those transitions correctly.
 */

function LocationProbe() {
  const loc = useLocation()
  return <div data-testid="loc">{loc.search}</div>
}

function renderAtRoute(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route
          path="/t/:teamSlug/o/:officeSlug/roster"
          element={
            <>
              <RosterPage />
              <LocationProbe />
            </>
          }
        />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  localStorage.clear()
  useToastStore.setState({ items: [] })
  useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({
    employees: {
      e1: {
        id: 'e1', name: 'Alice', email: 'alice@example.com', department: 'Engineering', team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'active',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
      e2: {
        id: 'e2', name: 'Bob', email: 'bob@example.com', department: 'Sales', team: null,
        title: null, managerId: null, employmentType: 'full-time', status: 'on-leave',
        officeDays: [], startDate: null, endDate: null,
        equipmentNeeds: [], equipmentStatus: 'not-needed', photoUrl: null, tags: [], accommodations: [],
        seatId: null, floorId: null, leaveType: null, expectedReturnDate: null,
        coverageEmployeeId: null, leaveNotes: null, departureDate: null,
        pendingStatusChanges: [],
        createdAt: new Date().toISOString(),
      },
    },
  })
})

function openPresetsMenu() {
  // Idempotent: only clicks the trigger if the menu isn't already open.
  // Saving / deleting doesn't auto-close the menu, so a test that pokes
  // a control and then wants to re-assert shouldn't toggle the menu
  // shut on itself.
  const existing = screen.queryByRole('menu', { name: /Saved filter presets/i })
  if (existing) return
  const trigger = screen.getByRole('button', { name: /Saved filters/i })
  act(() => { fireEvent.click(trigger) })
}

describe('Roster filter presets — save flow', () => {
  it('disables the Save option when no filters are active', () => {
    renderAtRoute('/t/acme/o/hq/roster')
    openPresetsMenu()
    const saveBtn = screen.getByRole('button', { name: /Save current filters/i }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(true)
  })

  it('saves the current URL query and surfaces the preset in the menu', () => {
    // `window.prompt` is not implemented in jsdom — stub it so Save has a
    // name to persist. Real users get a browser dialog; here we just
    // shortcut the typed text.
    vi.spyOn(window, 'prompt').mockReturnValue('On-leave engineers')
    renderAtRoute('/t/acme/o/hq/roster?status=on-leave&dept=Sales')
    openPresetsMenu()
    const saveBtn = screen.getByRole('button', { name: /Save current filters/i }) as HTMLButtonElement
    expect(saveBtn.disabled).toBe(false)
    act(() => { fireEvent.click(saveBtn) })
    // Menu stays/reopens with the new preset visible.
    openPresetsMenu()
    expect(screen.getByRole('button', { name: /Apply preset On-leave engineers/i })).toBeTruthy()
    // Persisted.
    const stored = loadFilterPresets()
    expect(stored).toHaveLength(1)
    expect(stored[0].name).toBe('On-leave engineers')
    expect(stored[0].query).toContain('status=on-leave')
    expect(stored[0].query).toContain('dept=Sales')
  })

  it('applies a preset by rewriting the URL search', () => {
    saveFilterPresets([
      {
        id: 'p1',
        name: 'On-leave engineers',
        query: 'status=on-leave&dept=Sales',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    renderAtRoute('/t/acme/o/hq/roster')
    openPresetsMenu()
    const apply = screen.getByRole('button', { name: /Apply preset On-leave engineers/i })
    act(() => { fireEvent.click(apply) })
    const loc = screen.getByTestId('loc').textContent ?? ''
    expect(loc).toMatch(/status=on-leave/)
    expect(loc).toMatch(/dept=Sales/)
    // Bob is on-leave in Sales — he should be the only visible row.
    expect(screen.getByText('Bob')).toBeTruthy()
    expect(screen.queryByText('Alice')).toBeNull()
  })
})

describe('Roster filter presets — delete flow', () => {
  it('removes from both the dropdown and localStorage', () => {
    saveFilterPresets([
      {
        id: 'p1',
        name: 'Daily drivers',
        query: 'status=active',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    ])
    // confirm() is used by the delete button — auto-accept in tests.
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    renderAtRoute('/t/acme/o/hq/roster')
    openPresetsMenu()
    const del = screen.getByRole('button', { name: /Delete preset Daily drivers/i })
    act(() => { fireEvent.click(del) })
    expect(loadFilterPresets()).toEqual([])
    // Re-opening should show the empty-state copy rather than the entry.
    openPresetsMenu()
    expect(screen.queryByRole('button', { name: /Apply preset Daily drivers/i })).toBeNull()
  })
})

describe('Roster filter presets — cap', () => {
  it('purges the oldest with a toast when adding the 21st', () => {
    const seed = Array.from({ length: MAX_FILTER_PRESETS }, (_, i) => ({
      id: `p${i}`,
      name: `Preset ${i}`,
      query: `q=${i}`,
      createdAt: new Date(2026, 0, i + 1).toISOString(),
    }))
    saveFilterPresets(seed)
    vi.spyOn(window, 'prompt').mockReturnValue('Brand new')
    renderAtRoute('/t/acme/o/hq/roster?status=active')
    openPresetsMenu()
    const saveBtn = screen.getByRole('button', { name: /Save current filters/i })
    act(() => { fireEvent.click(saveBtn) })
    const stored = loadFilterPresets()
    expect(stored).toHaveLength(MAX_FILTER_PRESETS)
    // Oldest (p0) gone, newest present.
    expect(stored.find((p) => p.id === 'p0')).toBeFalsy()
    expect(stored.find((p) => p.name === 'Brand new')).toBeTruthy()
    // Toast explains what just happened.
    const toasts = useToastStore.getState().items
    expect(toasts.some((t) => /Preset 0/.test(t.title) || /Preset 0/.test(t.body ?? ''))).toBe(true)
  })
})

describe('Roster filter presets — storage boot', () => {
  it('ignores corrupt localStorage without crashing the page', () => {
    localStorage.setItem(FILTER_PRESETS_STORAGE_KEY, '{not json')
    // Should render without throwing — storage helper resets to [].
    renderAtRoute('/t/acme/o/hq/roster')
    openPresetsMenu()
    // Empty-state copy tells the user there's nothing saved yet.
    expect(screen.getByText(/No saved filters yet/i)).toBeTruthy()
  })
})
