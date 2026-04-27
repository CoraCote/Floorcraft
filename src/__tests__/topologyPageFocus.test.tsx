/**
 * M6.6 — `?focus=<nodeId>` query param handler on NetworkTopologyPage.
 *
 * The Floor Properties panel's "Open in topology" link navigates to
 * `/network?focus=<id>`. The page should:
 *
 *   1. Select the matching node (so the Properties panel opens for it).
 *   2. Strip the param from the URL so a back-button doesn't loop us
 *      back into focus mode.
 *
 * `TopologyCanvas` is mocked at the boundary because react-flow's
 * runtime needs measurement APIs JSDOM doesn't provide. The canvas
 * stub exposes the selected id back to the test via a data attribute
 * so the assertion is anchored on observable DOM rather than store
 * internals.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, cleanup, waitFor } from '@testing-library/react'
import { MemoryRouter, useSearchParams } from 'react-router-dom'

// The mock surfaces `selectedId` so the test can confirm the page
// passed the focused node down. We also need to know the URL's `focus`
// param has been cleared — that's read off `useSearchParams()` inside
// a small probe component.
vi.mock('../components/editor/networkTopology/TopologyCanvas', () => ({
  TopologyCanvas: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="topology-canvas-stub" data-selected-id={selectedId ?? ''} />
  ),
}))

// Properties panel renders a heavy form; mocking simplifies the assertion
// surface (we don't need to assert on the form here).
vi.mock('../components/editor/networkTopology/PropertiesPanel', () => ({
  PropertiesPanel: ({ selectedId }: { selectedId: string | null }) => (
    <div data-testid="topology-properties-stub" data-selected-id={selectedId ?? ''} />
  ),
}))

import { useNetworkTopologyStore } from '../stores/networkTopologyStore'
import { useProjectStore } from '../stores/projectStore'
import { createEmptyTopology } from '../types/networkTopology'
import { NetworkTopologyPage } from '../components/editor/NetworkTopologyPage'

const OFFICE = 'office-test'

beforeEach(() => {
  cleanup()
  useProjectStore.setState({
    officeId: OFFICE,
    currentOfficeRole: 'editor',
    impersonatedRole: null,
    saveState: 'saved',
    lastSavedAt: new Date().toISOString(),
  })
  // Seed two nodes so the canvas renders (not the empty state) and we
  // have a known target id to focus.
  const t = createEmptyTopology(OFFICE)
  t.nodes = {
    'node-A': {
      id: 'node-A',
      type: 'firewall',
      label: 'Firewall A',
      position: { x: 0, y: 0 },
    },
    'node-B': {
      id: 'node-B',
      type: 'access-point',
      label: 'AP B',
      position: { x: 0, y: 100 },
    },
  }
  useNetworkTopologyStore.setState({ topology: t })
})

function ParamProbe() {
  const [params] = useSearchParams()
  return <span data-testid="param-probe">{params.get('focus') ?? ''}</span>
}

describe('NetworkTopologyPage — ?focus= query param', () => {
  it('selects the matching node and removes the focus param from the URL', async () => {
    render(
      <MemoryRouter initialEntries={['/network?focus=node-B']}>
        <NetworkTopologyPage />
        <ParamProbe />
      </MemoryRouter>,
    )

    // Wait for the focus effect to fire and the URL to be cleaned up.
    await waitFor(() => {
      expect(screen.getByTestId('param-probe').textContent).toBe('')
    })

    expect(screen.getByTestId('topology-canvas-stub').getAttribute('data-selected-id')).toBe(
      'node-B',
    )
  })

  it('is a no-op when the focus id does not match any node', async () => {
    render(
      <MemoryRouter initialEntries={['/network?focus=does-not-exist']}>
        <NetworkTopologyPage />
        <ParamProbe />
      </MemoryRouter>,
    )

    await waitFor(() => {
      // The param is still cleaned up so the URL doesn't sit on a
      // stale focus across navigations, but no node is selected.
      expect(screen.getByTestId('param-probe').textContent).toBe('')
    })
    expect(screen.getByTestId('topology-canvas-stub').getAttribute('data-selected-id')).toBe('')
  })
})
