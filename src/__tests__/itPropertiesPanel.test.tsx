/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * M2 — Properties panel sections for the six IT-device types.
 *
 * Each device type renders its own section with the right field labels,
 * and editing a field flushes through the elements store.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useEmployeeStore } from '../stores/employeeStore'
import type {
  CanvasElement,
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  VideoBarElement,
  BadgeReaderElement,
  OutletElement,
} from '../types/elements'

const baseStyle = { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 }
const baseProps = {
  x: 0,
  y: 0,
  width: 30,
  height: 30,
  rotation: 0,
  locked: false,
  groupId: null,
  zIndex: 1,
  label: '',
  visible: true,
  style: baseStyle,
}

function renderPanel() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/*" element={<PropertiesPanel />} />
      </Routes>
    </MemoryRouter>,
  )
}

function selectOne(id: string, el: CanvasElement) {
  useElementsStore.setState({ elements: { [id]: el } })
  useUIStore.setState({ selectedIds: [id] } as any)
}

beforeEach(() => {
  cleanup()
  useElementsStore.setState({ elements: {} })
  useEmployeeStore.setState({ employees: {} })
  useUIStore.setState({ selectedIds: [] } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useProjectStore.setState({
    currentOfficeRole: 'editor',
    impersonatedRole: null,
  } as any)
})

describe('PropertiesPanel — IT device sections', () => {
  it('access-point: renders the Access point section + every field', () => {
    const el: AccessPointElement = { id: 'ap1', type: 'access-point', ...baseProps }
    selectOne('ap1', el)
    renderPanel()
    // The type label appears in BOTH the Identity Type row AND the
    // section heading, so >=2 instances is the contract.
    expect(screen.getAllByText('Access point').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Model')).toBeInTheDocument()
    expect(screen.getByText('Serial number')).toBeInTheDocument()
    expect(screen.getByText('MAC address')).toBeInTheDocument()
    expect(screen.getByText('IP address')).toBeInTheDocument()
    expect(screen.getByText('Vendor')).toBeInTheDocument()
    expect(screen.getByText('Install date')).toBeInTheDocument()
    expect(screen.getByLabelText('Status')).toBeInTheDocument()
  })

  it('access-point: editing Model commits trim-on-blur to the store', () => {
    const el: AccessPointElement = { id: 'ap1', type: 'access-point', ...baseProps }
    selectOne('ap1', el)
    renderPanel()
    // Find the Model input via its label proximity — the section has a
    // <label>Model</label> followed by an <input>.
    const labels = screen.getAllByText('Model')
    const modelLabel = labels[0] as HTMLElement
    const input = modelLabel.parentElement!.querySelector('input') as HTMLInputElement
    fireEvent.change(input, { target: { value: '  Cisco Meraki MR46  ' } })
    fireEvent.blur(input)
    const stored = useElementsStore.getState().elements['ap1'] as AccessPointElement
    expect(stored.model).toBe('Cisco Meraki MR46')
  })

  it('access-point: editing Status commits the enum value', () => {
    const el: AccessPointElement = { id: 'ap1', type: 'access-point', ...baseProps }
    selectOne('ap1', el)
    renderPanel()
    const select = screen.getByLabelText('Status') as HTMLSelectElement
    fireEvent.change(select, { target: { value: 'broken' } })
    const stored = useElementsStore.getState().elements['ap1'] as AccessPointElement
    expect(stored.deviceStatus).toBe('broken')
  })

  it('network-jack: renders the Network jack section + cable category select', () => {
    const el: NetworkJackElement = { id: 'j1', type: 'network-jack', ...baseProps }
    selectOne('j1', el)
    renderPanel()
    expect(screen.getAllByText('Network jack').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Jack ID')).toBeInTheDocument()
    expect(screen.getByLabelText('Cable category')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Cable category'), { target: { value: 'cat6a' } })
    const stored = useElementsStore.getState().elements['j1'] as NetworkJackElement
    expect(stored.cableCategory).toBe('cat6a')
  })

  it('display: renders the Display section + screen size + connected device', () => {
    const el: DisplayElement = { id: 'd1', type: 'display', ...baseProps }
    selectOne('d1', el)
    renderPanel()
    expect(screen.getAllByText('Display').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Screen size (in)')).toBeInTheDocument()
    expect(screen.getByText('Connected device')).toBeInTheDocument()
  })

  it('video-bar: renders the Video bar section + platform select', () => {
    const el: VideoBarElement = { id: 'vb1', type: 'video-bar', ...baseProps }
    selectOne('vb1', el)
    renderPanel()
    expect(screen.getAllByText('Video bar').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByLabelText('Platform')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Platform'), { target: { value: 'zoom' } })
    const stored = useElementsStore.getState().elements['vb1'] as VideoBarElement
    expect(stored.platform).toBe('zoom')
  })

  it('badge-reader: renders the Badge reader section + Controls door field', () => {
    const el: BadgeReaderElement = { id: 'br1', type: 'badge-reader', ...baseProps }
    selectOne('br1', el)
    renderPanel()
    expect(screen.getAllByText('Badge reader').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByText('Controls door')).toBeInTheDocument()
  })

  it('outlet: renders the Outlet section + outlet type + voltage + circuit', () => {
    const el: OutletElement = { id: 'o1', type: 'outlet', ...baseProps }
    selectOne('o1', el)
    renderPanel()
    expect(screen.getAllByText('Outlet').length).toBeGreaterThanOrEqual(2)
    expect(screen.getByLabelText('Outlet type')).toBeInTheDocument()
    expect(screen.getByText('Voltage (V)')).toBeInTheDocument()
    expect(screen.getByText('Circuit')).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText('Outlet type'), { target: { value: 'quad' } })
    const stored = useElementsStore.getState().elements['o1'] as OutletElement
    expect(stored.outletType).toBe('quad')
  })
})
