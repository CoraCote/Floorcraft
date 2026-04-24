import { describe, it, expect, vi, beforeEach } from 'vitest'
import { act, render } from '@testing-library/react'
import React from 'react'

/**
 * Contract: `useOfficeSync` should ONLY debounce a save when the real
 * edit-slice payload changes. Pure UI state like `activeFloorId` must
 * never trigger a save on its own, and identity-different-but-value-
 * equal reference swaps (store rehydrate, shallow clones) must also be
 * skipped.
 *
 * We mock `saveOffice` and drive the real zustand stores directly,
 * matching the style of `neighborhoodAutoSave.test.ts`.
 */

const { saveOffice, saveOfficeForce } = vi.hoisted(() => ({
  saveOffice: vi.fn(),
  saveOfficeForce: vi.fn(),
}))

vi.mock('../lib/offices/officeRepository', () => ({
  saveOffice: (...a: unknown[]) => saveOffice(...a),
  saveOfficeForce: (...a: unknown[]) => saveOfficeForce(...a),
}))

import { useOfficeSync } from '../lib/offices/useOfficeSync'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'

function Probe() {
  useOfficeSync()
  return null
}

describe('useOfficeSync — saves only on real edits', () => {
  beforeEach(() => {
    saveOffice.mockReset()
    saveOfficeForce.mockReset()
    saveOffice.mockResolvedValue({ ok: true, updated_at: 'v-new' })
    vi.useFakeTimers()

    // Pristine stores. The floor store's module default contains one
    // floor; wipe to a deterministic shape with two floors so we can
    // switch between them without triggering other side effects.
    useElementsStore.setState({ elements: {} })
    useFloorStore.setState({
      floors: [
        { id: 'floor-a', name: 'Floor A', order: 0, elements: {} },
        { id: 'floor-b', name: 'Floor B', order: 1, elements: {} },
      ],
      activeFloorId: 'floor-a',
    })
    useProjectStore.setState({
      officeId: 'o1',
      loadedVersion: 'v0',
      saveState: 'idle',
      lastSavedAt: null,
      conflict: null,
    })
  })

  it('does NOT save when only activeFloorId changes (floor-switch is UI state)', () => {
    render(React.createElement(Probe))
    // Mount snapshot suppressed — now flip only activeFloorId.
    act(() => {
      useFloorStore.setState({ activeFloorId: 'floor-b' })
    })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(saveOffice).not.toHaveBeenCalled()
  })

  it('DOES save when an edit slice changes, and the saved payload carries the current activeFloorId', async () => {
    render(React.createElement(Probe))
    // Switch floors first (pure UI change — should not trigger a save).
    act(() => {
      useFloorStore.setState({ activeFloorId: 'floor-b' })
    })
    // Now make a real edit to elements.
    act(() => {
      useElementsStore.setState({
        elements: {
          e1: {
            id: 'e1',
            type: 'desk',
            x: 0,
            y: 0,
            width: 80,
            height: 50,
            rotation: 0,
            locked: false,
            groupId: null,
            zIndex: 1,
            label: 'Desk 1',
            visible: true,
            style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
            floorId: 'floor-b',
            seats: [],
          } as unknown as never,
        },
      })
    })
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2500)
    })
    expect(saveOffice).toHaveBeenCalledTimes(1)
    const [officeId, payload, version] = saveOffice.mock.calls[0]
    expect(officeId).toBe('o1')
    expect(version).toBe('v0')
    const typedPayload = payload as { activeFloorId: string; elements: Record<string, { id: string }> }
    // Payload still carries the current activeFloorId, so the office
    // remembers which floor the user was viewing when the edit landed.
    expect(typedPayload.activeFloorId).toBe('floor-b')
    expect(Object.keys(typedPayload.elements)).toEqual(['e1'])
    expect(typedPayload.elements.e1.id).toBe('e1')
  })

  it('does NOT save when a slice reference changes but the value is equal (shallow-cloned map)', () => {
    render(React.createElement(Probe))
    // Replace elements with a new object holding the same (empty) contents.
    act(() => {
      useElementsStore.setState({ elements: { ...useElementsStore.getState().elements } })
    })
    act(() => {
      vi.advanceTimersByTime(3000)
    })
    expect(saveOffice).not.toHaveBeenCalled()
  })
})
