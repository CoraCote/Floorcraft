/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M6.6 — Floor PropertiesPanel "Topology" section.
 *
 * For an IT-device floor element (the six from M1 — only `'access-point'`
 * has a topology equivalent today), the panel renders one of:
 *
 *   1. "Linked to topology node 'AP A'" + "Open in topology" link,
 *      when some topology node references this element id.
 *   2. "Add to network topology" button, when nothing references the
 *      element AND the element type has a compatible topology node
 *      type (today: only `access-point`).
 *
 * The "Add to network topology" path creates a new topology node and
 * links it in one action. We assert on the store after the click
 * because that's the round-trip the user observes — the panel's
 * "linked" state re-renders off the store on the next paint.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useNetworkTopologyStore } from '../stores/networkTopologyStore'
import { createEmptyTopology } from '../types/networkTopology'
import type { AccessPointElement } from '../types/elements'

const OFFICE = 'office-test'

function makeAP(id: string, opts: Partial<AccessPointElement> = {}): AccessPointElement {
  return {
    id,
    type: 'access-point',
    x: 0,
    y: 0,
    width: 30,
    height: 30,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: id,
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
    serialNumber: null,
    ...opts,
  }
}

beforeEach(() => {
  useProjectStore.setState({
    officeId: OFFICE,
    currentOfficeRole: 'editor',
    impersonatedRole: null,
  } as any)
  useElementsStore.setState({ elements: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useNetworkTopologyStore.setState({ topology: createEmptyTopology(OFFICE) })
})

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/t/team/o/office/map']}>
      <PropertiesPanel />
    </MemoryRouter>,
  )
}

describe('Floor Properties — Topology section', () => {
  it('shows "Linked to topology node" when a topology node references this element', () => {
    const ap = makeAP('ap-1', { label: 'AP-12' })
    useElementsStore.setState({ elements: { 'ap-1': ap } })
    useUIStore.setState({ selectedIds: ['ap-1'] } as any)

    // Seed a topology node that references the element.
    useNetworkTopologyStore.getState().addNode({
      id: 'topo-1',
      type: 'access-point',
      label: 'Topology AP A',
      position: { x: 0, y: 0 },
    })
    useNetworkTopologyStore.getState().linkNodeToElement('topo-1', 'ap-1')

    renderPanel()
    expect(screen.getByText(/linked to topology node/i)).toBeInTheDocument()
    expect(screen.getByText(/topology ap a/i)).toBeInTheDocument()
    expect(screen.getByTestId('floor-properties-open-in-topology')).toBeInTheDocument()
  })

  it('shows the "Add to network topology" CTA when the AP is not yet linked', () => {
    const ap = makeAP('ap-1', { label: 'AP-12' })
    useElementsStore.setState({ elements: { 'ap-1': ap } })
    useUIStore.setState({ selectedIds: ['ap-1'] } as any)

    renderPanel()
    expect(screen.getByTestId('floor-properties-add-to-topology')).toBeInTheDocument()
  })

  it('"Add to network topology" creates a topology node and links it', () => {
    const ap = makeAP('ap-1', {
      label: 'AP-12',
      model: 'CW9176I',
      serialNumber: 'Q3CD-001',
      vendor: 'Cisco Meraki',
    })
    useElementsStore.setState({ elements: { 'ap-1': ap } })
    useUIStore.setState({ selectedIds: ['ap-1'] } as any)

    renderPanel()
    fireEvent.click(screen.getByTestId('floor-properties-add-to-topology'))

    const t = useNetworkTopologyStore.getState().topology!
    const nodes = Object.values(t.nodes)
    expect(nodes).toHaveLength(1)
    const created = nodes[0]
    expect(created.type).toBe('access-point')
    expect(created.floorElementId).toBe('ap-1')
    // Pre-fill from the element's IT-device fields. The user can edit
    // these afterwards in the topology Properties panel; the seed
    // values save them the work of retyping.
    expect(created.serialNumber).toBe('Q3CD-001')
    expect(created.model).toBe('CW9176I')
    expect(created.vendor).toBe('Cisco Meraki')
  })
})
