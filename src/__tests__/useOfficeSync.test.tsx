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
vi.mock('../stores/elementsStore', () => ({
  useElementsStore: ((sel: ((s: { elements: Record<string, unknown> }) => unknown) | undefined) =>
    sel ? sel({ elements: {} }) : { elements: {} }) as ((sel?: ((s: { elements: Record<string, unknown> }) => unknown)) => unknown),
}))
vi.mock('../stores/employeeStore', () => ({
  useEmployeeStore: ((sel: ((s: { employees: Record<string, unknown>; departmentColors: Record<string, unknown> }) => unknown) | undefined) =>
    sel ? sel({ employees: {}, departmentColors: {} }) : { employees: {}, departmentColors: {} }) as ((sel?: ((s: { employees: Record<string, unknown>; departmentColors: Record<string, unknown> }) => unknown)) => unknown),
}))
vi.mock('../stores/floorStore', () => ({
  useFloorStore: ((sel: ((s: { floors: unknown[]; activeFloorId: null }) => unknown) | undefined) =>
    sel ? sel({ floors: [], activeFloorId: null }) : { floors: [], activeFloorId: null }) as ((sel?: ((s: { floors: unknown[]; activeFloorId: null }) => unknown)) => unknown),
}))
vi.mock('../stores/canvasStore', () => ({
  useCanvasStore: ((sel: ((s: { settings: Record<string, unknown> }) => unknown) | undefined) =>
    sel ? sel({ settings: {} }) : { settings: {} }) as ((sel?: ((s: { settings: Record<string, unknown> }) => unknown)) => unknown),
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
  const hook = (sel: ((s: Record<string, unknown>) => unknown) | undefined) => (sel ? sel(state) : state)
  ;(hook as Record<string, unknown>).setState = (u: ((s: Record<string, unknown>) => Record<string, unknown>) | Record<string, unknown>) => Object.assign(state, typeof u === 'function' ? u(state) : u)
  ;(hook as Record<string, unknown>).getState = () => state
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
