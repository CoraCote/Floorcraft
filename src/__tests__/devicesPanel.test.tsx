/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { DevicesPanel } from '../components/editor/RightSidebar/DevicesPanel'
import { RightSidebar } from '../components/editor/RightSidebar/RightSidebar'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useUIStore } from '../stores/uiStore'
import type {
  AccessPointElement,
  NetworkJackElement,
  DisplayElement,
  BaseElement,
  CanvasElement,
} from '../types/elements'

// `focusElements` reaches into the Konva stage registry which isn't
// mounted in JSDOM. Mock it so we can assert the call without dragging
// in the canvas runtime.
const { focusElementsMock } = vi.hoisted(() => ({
  focusElementsMock: vi.fn((_ids: string[]) => true),
}))
vi.mock('../lib/focusElements', () => ({ focusElements: focusElementsMock }))

// `downloadCSV` triggers a real <a download> click in the DOM. Mock so
// the test stays headless.
const { downloadCSVMock } = vi.hoisted(() => ({
  downloadCSVMock: vi.fn(() => true),
}))
vi.mock('../lib/employeeCsv', async () => {
  const actual = await vi.importActual<typeof import('../lib/employeeCsv')>(
    '../lib/employeeCsv',
  )
  return {
    ...actual,
    downloadCSV: downloadCSVMock,
  }
})

// Audit emit hits supabase via the project store. Mock to a no-op.
vi.mock('../lib/audit', () => ({ emit: vi.fn() }))

// Permission hook — we can override the return per test by reassigning
// the implementation. Default to "can view".
const { useCanMock } = vi.hoisted(() => ({
  useCanMock: vi.fn((_action: string) => true),
}))
vi.mock('../hooks/useCan', () => ({ useCan: useCanMock }))

function baseFields<T extends BaseElement['type']>(id: string, type: T): BaseElement {
  return {
    id,
    type,
    x: 0,
    y: 0,
    width: 40,
    height: 40,
    rotation: 0,
    locked: false,
    groupId: null,
    zIndex: 1,
    label: '',
    visible: true,
    style: { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 },
  }
}

function makeAP(over: Partial<AccessPointElement> = {}): AccessPointElement {
  return {
    ...baseFields(over.id ?? 'ap1', 'access-point'),
    type: 'access-point',
    model: 'Cisco Meraki MR46',
    serialNumber: 'AP-SN-1',
    macAddress: 'aa:bb:cc:dd:ee:ff',
    ipAddress: '10.0.0.1',
    vendor: 'Cisco',
    installDate: null,
    deviceStatus: 'live',
    ...over,
  }
}

function makeJack(over: Partial<NetworkJackElement> = {}): NetworkJackElement {
  return {
    ...baseFields(over.id ?? 'jk1', 'network-jack'),
    type: 'network-jack',
    jackId: 'J-101',
    cableCategory: 'cat6a',
    upstreamSwitchLabel: 'SW-A',
    upstreamSwitchPort: '24',
    serialNumber: null,
    installDate: null,
    deviceStatus: 'broken',
    ...over,
  }
}

function makeDisplay(over: Partial<DisplayElement> = {}): DisplayElement {
  return {
    ...baseFields(over.id ?? 'd1', 'display'),
    type: 'display',
    model: 'Samsung QM55',
    serialNumber: 'D-SN-1',
    ipAddress: null,
    vendor: 'Samsung',
    installDate: null,
    screenSizeInches: 55,
    connectedDevice: 'MTR Logitech Rally',
    deviceStatus: 'live',
    ...over,
  }
}

function setActiveFloorElements(elements: Record<string, CanvasElement>) {
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useElementsStore.setState({ elements } as any)
}

beforeEach(() => {
  focusElementsMock.mockClear()
  downloadCSVMock.mockClear()
  useCanMock.mockReset()
  useCanMock.mockImplementation(() => true)
  setActiveFloorElements({})
  useUIStore.setState({ selectedIds: [], rightSidebarTab: 'devices' } as any)
})

describe('DevicesPanel — empty state', () => {
  it('renders the empty-state copy when no IT devices are on the active floor', () => {
    render(<DevicesPanel />)
    expect(screen.getByText('No devices on this floor')).toBeTruthy()
    expect(screen.getByText(/access point/i)).toBeTruthy()
  })

  it('disables the Export CSV button when no devices are present', () => {
    render(<DevicesPanel />)
    const btn = screen.getByTestId('devices-export-csv') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })
})

describe('DevicesPanel — populated', () => {
  it('shows a count and the per-layer stat strip', () => {
    setActiveFloorElements({
      ap1: makeAP(),
      jk1: makeJack(),
      d1: makeDisplay(),
    })
    render(<DevicesPanel />)
    // Stat strip labels
    expect(screen.getByText('Network')).toBeTruthy()
    expect(screen.getByText('AV')).toBeTruthy()
    expect(screen.getByText('Security')).toBeTruthy()
    expect(screen.getByText('Power')).toBeTruthy()
  })

  it('lists each device row by id', () => {
    setActiveFloorElements({
      ap1: makeAP(),
      jk1: makeJack(),
    })
    render(<DevicesPanel />)
    expect(screen.getByTestId('device-row-ap1')).toBeTruthy()
    expect(screen.getByTestId('device-row-jk1')).toBeTruthy()
  })
})

describe('DevicesPanel — search', () => {
  it('filters by IP address', () => {
    setActiveFloorElements({
      ap1: makeAP({ ipAddress: '10.0.0.1' }),
      ap2: makeAP({ id: 'ap2', ipAddress: '10.0.0.2', model: 'OtherModel' }),
    })
    render(<DevicesPanel />)
    const search = screen.getByLabelText('Search devices') as HTMLInputElement
    fireEvent.change(search, { target: { value: '10.0.0.1' } })
    expect(screen.getByTestId('device-row-ap1')).toBeTruthy()
    expect(screen.queryByTestId('device-row-ap2')).toBeNull()
  })

  it('filters by model', () => {
    setActiveFloorElements({
      ap1: makeAP({ model: 'Cisco Meraki MR46' }),
      ap2: makeAP({ id: 'ap2', model: 'Aruba 535' }),
    })
    render(<DevicesPanel />)
    const search = screen.getByLabelText('Search devices') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'aruba' } })
    expect(screen.queryByTestId('device-row-ap1')).toBeNull()
    expect(screen.getByTestId('device-row-ap2')).toBeTruthy()
  })

  it('filters by serial number', () => {
    setActiveFloorElements({
      ap1: makeAP({ serialNumber: 'SN-AAA' }),
      ap2: makeAP({ id: 'ap2', serialNumber: 'SN-BBB' }),
    })
    render(<DevicesPanel />)
    const search = screen.getByLabelText('Search devices') as HTMLInputElement
    fireEvent.change(search, { target: { value: 'aaa' } })
    expect(screen.getByTestId('device-row-ap1')).toBeTruthy()
    expect(screen.queryByTestId('device-row-ap2')).toBeNull()
  })

  it('filters by MAC fragment', () => {
    setActiveFloorElements({
      ap1: makeAP({ macAddress: 'aa:bb:cc:11:22:33' }),
      ap2: makeAP({ id: 'ap2', macAddress: 'dd:ee:ff:44:55:66' }),
    })
    render(<DevicesPanel />)
    const search = screen.getByLabelText('Search devices') as HTMLInputElement
    fireEvent.change(search, { target: { value: '11:22' } })
    expect(screen.getByTestId('device-row-ap1')).toBeTruthy()
    expect(screen.queryByTestId('device-row-ap2')).toBeNull()
  })
})

describe('DevicesPanel — pill filters', () => {
  it('layer filter narrows the list', () => {
    setActiveFloorElements({
      ap1: makeAP(),     // network
      jk1: makeJack(),   // network
      d1: makeDisplay(), // av
    })
    render(<DevicesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /^AV/ }))
    expect(screen.queryByTestId('device-row-ap1')).toBeNull()
    expect(screen.queryByTestId('device-row-jk1')).toBeNull()
    expect(screen.getByTestId('device-row-d1')).toBeTruthy()
  })

  it('status filter narrows the list', () => {
    setActiveFloorElements({
      ap1: makeAP({ deviceStatus: 'live' }),
      jk1: makeJack({ deviceStatus: 'broken' }),
    })
    render(<DevicesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /^Broken/ }))
    expect(screen.queryByTestId('device-row-ap1')).toBeNull()
    expect(screen.getByTestId('device-row-jk1')).toBeTruthy()
  })

  it('layer + status filters compose (AND)', () => {
    setActiveFloorElements({
      ap1: makeAP({ deviceStatus: 'live' }),
      jk1: makeJack({ deviceStatus: 'broken' }),
      d1: makeDisplay({ deviceStatus: 'broken' }),
    })
    render(<DevicesPanel />)
    fireEvent.click(screen.getByRole('button', { name: /^Network/ }))
    fireEvent.click(screen.getByRole('button', { name: /^Broken/ }))
    expect(screen.queryByTestId('device-row-ap1')).toBeNull() // network but live
    expect(screen.getByTestId('device-row-jk1')).toBeTruthy() // network + broken
    expect(screen.queryByTestId('device-row-d1')).toBeNull() // broken but av
  })
})

describe('DevicesPanel — interactions', () => {
  it('clicking a row calls focusElements and selects the element', () => {
    setActiveFloorElements({ ap1: makeAP() })
    render(<DevicesPanel />)
    fireEvent.click(screen.getByTestId('device-row-ap1'))
    expect(focusElementsMock).toHaveBeenCalledWith(['ap1'])
    expect(useUIStore.getState().selectedIds).toEqual(['ap1'])
  })

  it('Export CSV invokes the download helper with all devices on the floor', () => {
    setActiveFloorElements({
      ap1: makeAP(),
      jk1: makeJack(),
    })
    render(<DevicesPanel />)
    fireEvent.click(screen.getByTestId('devices-export-csv'))
    expect(downloadCSVMock).toHaveBeenCalledTimes(1)
    const call = downloadCSVMock.mock.calls[0] as unknown as [string, string]
    const [filename, csv] = call
    expect(filename).toMatch(/^floorcraft-devices-floor-1-\d{4}-\d{2}-\d{2}\.csv$/)
    expect(csv).toContain('Cisco Meraki MR46')
    expect(csv).toContain('J-101')
  })
})

describe('RightSidebar — Devices tab gating', () => {
  it('hides the Devices tab when permission check returns false', () => {
    useCanMock.mockImplementation(() => false)
    render(<RightSidebar />)
    expect(screen.queryByRole('tab', { name: /Devices/ })).toBeNull()
  })

  it('shows the Devices tab when permission check returns true', () => {
    useCanMock.mockImplementation(() => true)
    render(<RightSidebar />)
    expect(screen.getByRole('tab', { name: /Devices/ })).toBeTruthy()
  })
})
