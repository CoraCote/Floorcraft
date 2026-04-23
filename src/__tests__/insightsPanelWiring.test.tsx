/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { InsightsPanel } from '../components/editor/RightSidebar/InsightsPanel'
import { useInsightsStore } from '../stores/insightsStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useEmployeeStore } from '../stores/employeeStore'
import type { Insight } from '../types/insights'
import type { DeskElement } from '../types/elements'

// Mock focusElements so we can assert what the panel dispatches — the
// helper itself is already covered by its own tests, and this keeps the
// integration test from dragging in the stage registry + zoomToFit wiring.
const { focusElementsMock } = vi.hoisted(() => ({
  focusElementsMock: vi.fn((_ids: string[]) => true),
}))
vi.mock('../lib/focusElements', () => ({ focusElements: focusElementsMock }))

function desk(id: string): DeskElement {
  return {
    id,
    type: 'desk',
    x: 0,
    y: 0,
    width: 40,
    height: 20,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 0,
    label: id,
    visible: true,
    assignedEmployeeId: null,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  } as DeskElement
}

function makeInsight(overrides: Partial<Insight> = {}): Insight {
  return {
    id: 'i1',
    category: 'utilization',
    severity: 'warning',
    title: 'Test insight',
    narrative: 'An important issue has been detected.',
    relatedElementIds: ['d1', 'd2'],
    relatedEmployeeIds: [],
    actions: [],
    timestamp: Date.now(),
    dismissed: false,
    ...overrides,
  }
}

beforeEach(() => {
  focusElementsMock.mockClear()
  useElementsStore.setState({ elements: { d1: desk('d1'), d2: desk('d2') } } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useEmployeeStore.setState({ employees: {} } as any)
  // Seed one insight so it renders unconditionally (the panel also
  // triggers a debounced analysis, but we don't care about the auto-run
  // for these interaction assertions).
  useInsightsStore.setState({
    insights: [],
    lastAnalyzedAt: Date.now(),
    isAnalyzing: false,
    filter: {
      categories: new Set(['utilization', 'proximity', 'onboarding', 'moves', 'equipment', 'trends']),
      severities: new Set(['critical', 'warning', 'info']),
      showDismissed: false,
    },
  } as any)
})

describe('InsightsPanel wiring', () => {
  it('clicking the card body calls focusElements with the related ids', () => {
    useInsightsStore.setState({ insights: [makeInsight()] } as any)
    render(<InsightsPanel />)

    // The card surface itself is the clickable element; its title is
    // the stablest selector.
    fireEvent.click(screen.getByText('Test insight'))

    expect(focusElementsMock).toHaveBeenCalledWith(['d1', 'd2'])
  })

  it('navigate/highlight/assign action buttons all route through focusElements', () => {
    useInsightsStore.setState({
      insights: [
        makeInsight({
          actions: [
            { label: 'Open', type: 'navigate', payload: {} },
            { label: 'Mark', type: 'highlight', payload: {} },
            { label: 'Assign', type: 'assign', payload: {} },
          ],
        }),
      ],
    } as any)
    render(<InsightsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Open' }))
    fireEvent.click(screen.getByRole('button', { name: 'Mark' }))
    fireEvent.click(screen.getByRole('button', { name: 'Assign' }))

    expect(focusElementsMock).toHaveBeenCalledTimes(3)
    // All three calls target the same insight's related ids.
    for (const call of focusElementsMock.mock.calls) {
      expect(call[0]).toEqual(['d1', 'd2'])
    }
  })

  it('external action opens the payload URL in a new tab without calling focusElements', () => {
    const openSpy = vi.spyOn(window, 'open').mockImplementation(() => null)
    useInsightsStore.setState({
      insights: [
        makeInsight({
          actions: [{ label: 'Docs', type: 'external', payload: { url: 'https://example.com' } }],
        }),
      ],
    } as any)
    render(<InsightsPanel />)

    fireEvent.click(screen.getByRole('button', { name: 'Docs' }))
    expect(openSpy).toHaveBeenCalledWith('https://example.com', '_blank', 'noopener,noreferrer')
    expect(focusElementsMock).not.toHaveBeenCalled()
    openSpy.mockRestore()
  })
})
