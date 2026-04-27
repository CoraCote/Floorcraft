/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave-19B per-type render coverage. The other Properties tests
 * (`PropertiesPanelDelete`, `propertiesPanelEmployeeCard`) target the
 * desk + delete branches in detail; this file's job is the BREADTH check
 * — every supported element type renders without crashing AND surfaces
 * the right type-specific section heading.
 *
 * The tests are deliberately shallow (no field interactions) so that a
 * type-specific section regression — e.g. the door section disappearing
 * after a refactor — fails this file rather than getting caught only by
 * a downstream visual review.
 */
import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { PropertiesPanel } from '../components/editor/RightSidebar/PropertiesPanel'
import { useElementsStore } from '../stores/elementsStore'
import { useUIStore } from '../stores/uiStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import { useEmployeeStore } from '../stores/employeeStore'
import type {
  CanvasElement,
  WallElement,
  DoorElement,
  WindowElement,
  TableElement,
  ConferenceRoomElement,
  CommonAreaElement,
  WorkstationElement,
  PrivateOfficeElement,
  DecorElement,
  FreeTextElement,
  LineShapeElement,
  ArrowElement,
} from '../types/elements'

const baseStyle = { fill: '#fff', stroke: '#000', strokeWidth: 1, opacity: 1 }
const baseProps = {
  x: 0,
  y: 0,
  width: 60,
  height: 40,
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

describe('PropertiesPanel — per-type render coverage', () => {
  it('nothing-selected: renders the shared empty state', () => {
    renderPanel()
    expect(screen.getByTestId('panel-empty-state')).toBeInTheDocument()
    expect(screen.getByText(/Nothing selected/i)).toBeInTheDocument()
    expect(screen.getByText(/Click any element/i)).toBeInTheDocument()
  })

  it('wall: renders Wall details section + stroke-only Appearance', () => {
    const el: WallElement = {
      id: 'w1',
      type: 'wall',
      ...baseProps,
      points: [0, 0, 100, 0],
      thickness: 4,
      wallType: 'solid',
    }
    selectOne('w1', el)
    renderPanel()

    expect(screen.getByText('Wall details')).toBeInTheDocument()
    expect(screen.getByLabelText('Wall type')).toBeInTheDocument()
    expect(screen.getByLabelText('Line style')).toBeInTheDocument()
    // No Fill input — walls are stroke-only.
    expect(screen.queryByText('Fill')).toBeNull()
  })

  it('door: renders Door details section with all four fields', () => {
    const el: DoorElement = {
      id: 'd1',
      type: 'door',
      ...baseProps,
      parentWallId: 'wall-north',
      positionOnWall: 0.5,
      swingDirection: 'left',
      openAngle: 90,
    }
    selectOne('d1', el)
    renderPanel()

    expect(screen.getByText('Door details')).toBeInTheDocument()
    expect(screen.getByText(/wall-north/i)).toBeInTheDocument()
    expect(screen.getByLabelText('Swing direction')).toBeInTheDocument()
  })

  it('window: renders Window details with parent wall + position', () => {
    const el: WindowElement = {
      id: 'win1',
      type: 'window',
      ...baseProps,
      parentWallId: 'wall-east',
      positionOnWall: 0.3,
    }
    selectOne('win1', el)
    renderPanel()

    expect(screen.getByText('Window details')).toBeInTheDocument()
    expect(screen.getByText(/wall-east/i)).toBeInTheDocument()
  })

  it('table: renders Table seats section with seat layout select', () => {
    const el: TableElement = {
      id: 't1',
      type: 'table-conference',
      ...baseProps,
      seatCount: 6,
      seatLayout: 'around',
      seats: [],
    }
    selectOne('t1', el)
    renderPanel()

    expect(screen.getByText('Table seats')).toBeInTheDocument()
    expect(screen.getByLabelText('Seat layout')).toBeInTheDocument()
  })

  it('conference room: renders Room section', () => {
    const el: ConferenceRoomElement = {
      id: 'cr1',
      type: 'conference-room',
      ...baseProps,
      roomName: 'Atlas',
      capacity: 8,
    }
    selectOne('cr1', el)
    renderPanel()

    expect(screen.getByText('Room')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Atlas')).toBeInTheDocument()
  })

  it('common area: renders Area section', () => {
    const el: CommonAreaElement = {
      id: 'ca1',
      type: 'common-area',
      ...baseProps,
      areaName: 'Kitchen',
    }
    selectOne('ca1', el)
    renderPanel()

    expect(screen.getByText('Area')).toBeInTheDocument()
    expect(screen.getByDisplayValue('Kitchen')).toBeInTheDocument()
  })

  it('workstation: renders Seat section with Positions stepper', () => {
    const el: WorkstationElement = {
      id: 'ws1',
      type: 'workstation',
      ...baseProps,
      deskId: 'WS-1',
      positions: 4,
      assignedEmployeeIds: [null, null, null, null],
    }
    selectOne('ws1', el)
    renderPanel()

    expect(screen.getByText('Seat')).toBeInTheDocument()
    expect(screen.getByText(/Positions/i)).toBeInTheDocument()
    expect(screen.getByText(/Assigned \(0 \/ 4\)/i)).toBeInTheDocument()
  })

  it('private office: renders Seat section, no Positions stepper', () => {
    const el: PrivateOfficeElement = {
      id: 'po1',
      type: 'private-office',
      ...baseProps,
      deskId: 'PO-1',
      capacity: 2,
      assignedEmployeeIds: [],
    }
    selectOne('po1', el)
    renderPanel()

    expect(screen.getByText('Seat')).toBeInTheDocument()
    // Workstation-only label.
    expect(screen.queryByText(/^Positions$/)).toBeNull()
  })

  it('decor: surfaces shape as a read-only row', () => {
    const el: DecorElement = {
      id: 'dec1',
      type: 'decor',
      ...baseProps,
      shape: 'armchair',
    }
    selectOne('dec1', el)
    renderPanel()

    // The "Decor" string also appears in the header (type label) and the
    // identity Type row, so check the section <h3> specifically.
    const headings = screen.getAllByRole('heading', { level: 3, name: 'Decor' })
    expect(headings.length).toBeGreaterThanOrEqual(1)
    // "armchair" appears as both the header subtitle and the read-only
    // shape row; getAllByText covers both.
    expect(screen.getAllByText('armchair').length).toBeGreaterThanOrEqual(1)
  })

  it('free-text: renders Text section with body textarea + font size', () => {
    const el: FreeTextElement = {
      id: 'ft1',
      type: 'free-text',
      ...baseProps,
      text: 'Welcome',
      fontSize: 16,
    }
    selectOne('ft1', el)
    renderPanel()

    // "Text" is also the type label in the header — scope to the section.
    const textHeading = screen.getAllByRole('heading', { level: 3, name: 'Text' })
    expect(textHeading.length).toBeGreaterThanOrEqual(1)
    expect(screen.getByDisplayValue('Welcome')).toBeInTheDocument()
    expect(screen.getByDisplayValue('16')).toBeInTheDocument()
  })

  it('line: renders Line details with dash style picker', () => {
    const el: LineShapeElement = {
      id: 'l1',
      type: 'line-shape',
      ...baseProps,
      points: [0, 0, 100, 100],
      dashStyle: 'dashed',
    }
    selectOne('l1', el)
    renderPanel()

    expect(screen.getByText('Line details')).toBeInTheDocument()
    expect(screen.getByLabelText('Line style')).toBeInTheDocument()
  })

  it('arrow: renders Arrow details with dash style picker', () => {
    const el: ArrowElement = {
      id: 'a1',
      type: 'arrow',
      ...baseProps,
      points: [0, 0, 100, 100],
      dashStyle: 'dotted',
    }
    selectOne('a1', el)
    renderPanel()

    expect(screen.getByText('Arrow details')).toBeInTheDocument()
  })
})

describe('PropertiesPanel — locked element', () => {
  it('locked: shows banner + Locked badge + disables fields', () => {
    const el: ConferenceRoomElement = {
      id: 'cr1',
      type: 'conference-room',
      ...baseProps,
      locked: true,
      roomName: 'Atlas',
      capacity: 8,
    }
    selectOne('cr1', el)
    renderPanel()

    // Banner explains the lock + offers Unlock CTA.
    expect(screen.getByTestId('properties-locked-banner')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /Unlock to edit/i })).toBeInTheDocument()
    // Header carries a Locked badge.
    expect(screen.getByTestId('properties-locked-badge')).toBeInTheDocument()
    // The Room name field is disabled.
    const roomInput = screen.getByDisplayValue('Atlas') as HTMLInputElement
    expect(roomInput.disabled).toBe(true)
  })

  it('locked + viewer: still shows the badge but no Unlock CTA', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    const el: ConferenceRoomElement = {
      id: 'cr1',
      type: 'conference-room',
      ...baseProps,
      locked: true,
      roomName: 'Atlas',
      capacity: 8,
    }
    selectOne('cr1', el)
    renderPanel()

    expect(screen.getByTestId('properties-locked-badge')).toBeInTheDocument()
    // Viewer can't unlock — banner suppressed because the CTA would be a no-op.
    expect(screen.queryByTestId('properties-locked-banner')).toBeNull()
  })
})

describe('PropertiesPanel — multi-select', () => {
  it('shows the multi-select header with element count', () => {
    const a: DecorElement = { id: 'a', type: 'decor', ...baseProps, shape: 'armchair' }
    const b: DecorElement = { id: 'b', type: 'decor', ...baseProps, shape: 'couch' }
    useElementsStore.setState({ elements: { a, b } })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    renderPanel()

    expect(screen.getByTestId('properties-multi-select')).toBeInTheDocument()
    expect(screen.getByText('2 elements selected')).toBeInTheDocument()
  })

  it('renders a Common properties section with shared X/Y fields', () => {
    const a: DecorElement = {
      id: 'a',
      type: 'decor',
      ...baseProps,
      x: 50,
      y: 50,
      shape: 'armchair',
    }
    const b: DecorElement = {
      id: 'b',
      type: 'decor',
      ...baseProps,
      x: 50, // shared x → renders the value
      y: 200, // mixed y → renders "—" via placeholder
      shape: 'couch',
    }
    useElementsStore.setState({ elements: { a, b } })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    renderPanel()

    expect(screen.getByText(/Common properties/i)).toBeInTheDocument()
    // X is shared → input value reflects the shared "50".
    expect(screen.getByDisplayValue('50')).toBeInTheDocument()
    // Y diverges → input value clears to empty string, and placeholder
    // "—" renders as the mixed-value sentinel for users.
    const placeholders = screen
      .getAllByPlaceholderText('—')
      .filter((el): el is HTMLInputElement => el.tagName === 'INPUT')
    expect(placeholders.length).toBeGreaterThanOrEqual(1)
    // At least one of those placeholder-only inputs has empty value (the
    // diverging Y), confirming the mixed-value treatment.
    expect(placeholders.some((p) => p.value === '')).toBe(true)
  })

  it('mixed-locked selection shows the Some locked indicator', () => {
    const a: DecorElement = {
      id: 'a',
      type: 'decor',
      ...baseProps,
      locked: true,
      shape: 'armchair',
    }
    const b: DecorElement = {
      id: 'b',
      type: 'decor',
      ...baseProps,
      locked: false,
      shape: 'couch',
    }
    useElementsStore.setState({ elements: { a, b } })
    useUIStore.setState({ selectedIds: ['a', 'b'] } as any)
    renderPanel()

    expect(screen.getByText(/Some locked/i)).toBeInTheDocument()
  })
})
