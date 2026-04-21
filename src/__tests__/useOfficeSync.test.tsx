import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'

const { saveOffice, saveOfficeForce } = vi.hoisted(() => ({
  saveOffice: vi.fn(),
  saveOfficeForce: vi.fn(),
}))

vi.mock('../lib/offices/officeRepository', () => ({
  saveOffice: (...a: unknown[]) => saveOffice(...a),
  saveOfficeForce: (...a: unknown[]) => saveOfficeForce(...a),
}))

type ElementsState = { elements: Record<string, unknown> }
vi.mock('../stores/elementsStore', () => ({
  useElementsStore: (sel?: (s: ElementsState) => unknown) =>
    sel ? sel({ elements: {} }) : { elements: {} },
}))

type EmployeeState = { employees: Record<string, unknown>; departmentColors: Record<string, unknown> }
vi.mock('../stores/employeeStore', () => ({
  useEmployeeStore: (sel?: (s: EmployeeState) => unknown) =>
    sel ? sel({ employees: {}, departmentColors: {} }) : { employees: {}, departmentColors: {} },
}))

type FloorState = { floors: unknown[]; activeFloorId: null }
vi.mock('../stores/floorStore', () => ({
  useFloorStore: (sel?: (s: FloorState) => unknown) =>
    sel ? sel({ floors: [], activeFloorId: null }) : { floors: [], activeFloorId: null },
}))

type CanvasState = { settings: Record<string, unknown> }
vi.mock('../stores/canvasStore', () => ({
  useCanvasStore: (sel?: (s: CanvasState) => unknown) =>
    sel ? sel({ settings: {} }) : { settings: {} },
}))

vi.mock('../stores/projectStore', () => {
  const state: Record<string, unknown> = {
    saveState: 'idle',
    lastSavedAt: null,
    loadedVersion: 'v0',
    officeId: 'o1',
    conflict: null,
    setLoadedVersion: (v: string | null) => {
      state.loadedVersion = v
    },
    setSaveState: (s: string) => {
      state.saveState = s
    },
    setLastSavedAt: (at: string) => {
      state.lastSavedAt = at
    },
  }
  function hook(sel?: (s: Record<string, unknown>) => unknown) {
    return sel ? sel(state) : state
  }
  hook.setState = (u: ((s: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>) =>
    Object.assign(state, typeof u === 'function' ? u(state) : u)
  hook.getState = () => state
  return { useProjectStore: hook }
})

import { useOfficeSync } from '../lib/offices/useOfficeSync'

function Probe() {
  useOfficeSync()
  return null
}

describe('useOfficeSync', () => {
  beforeEach(() => {
    saveOffice.mockReset()
    saveOfficeForce.mockReset()
    vi.useFakeTimers()
  })

  it('debounces and skips the initial-mount snapshot', async () => {
    saveOffice.mockResolvedValue({ ok: true, updated_at: 'v1' })
    render(<Probe />)
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(saveOffice).not.toHaveBeenCalled()
  })
})
