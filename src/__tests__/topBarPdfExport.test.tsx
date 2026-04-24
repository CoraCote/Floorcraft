/* eslint-disable @typescript-eslint/no-explicit-any */
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { TopBar } from '../components/editor/TopBar'
import { useProjectStore } from '../stores/projectStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useCanvasStore } from '../stores/canvasStore'
import { setActiveStage } from '../lib/stageRegistry'
import type Konva from 'konva'

// Stub the heavy PDF library so clicking the button doesn't try to
// rasterize or save anything in jsdom.
const { buildWayfindingPdfMock } = vi.hoisted(() => ({
  buildWayfindingPdfMock: vi.fn(() => new Blob(['%PDF-fake'], { type: 'application/pdf' })),
}))
vi.mock('../lib/pdfExport', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>
  return { ...actual, buildWayfindingPdf: buildWayfindingPdfMock }
})

function renderTopBar() {
  return render(
    <MemoryRouter initialEntries={['/t/acme/o/hq/map']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/*" element={<TopBar />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  buildWayfindingPdfMock.mockClear()
  setActiveStage(null)
  useProjectStore.setState({
    currentProject: {
      id: 'p1',
      ownerId: null,
      name: 'Acme HQ',
      slug: 'acme-hq',
      buildingName: null,
      floors: [],
      activeFloorId: 'f1',
      canvasSettings: {
        gridSize: 12, scale: 1, scaleUnit: 'ft',
        showGrid: true, showDimensions: false,
      },
      thumbnailUrl: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    currentOfficeRole: 'viewer',
  } as any)
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as any)
  useElementsStore.setState({ elements: {} } as any)
  useEmployeeStore.setState({ employees: {}, departmentColors: {} } as any)
  useCanvasStore.setState({
    settings: {
      gridSize: 12, scale: 1, scaleUnit: 'ft',
      showGrid: true, showDimensions: false,
    },
  } as any)
})

describe('TopBar: wayfinding PDF export menu item', () => {
  // Opens the unified File dropdown. Wave 8B collapsed the standalone
  // Export menu into the File menu, so callers walk through the File
  // trigger to reach the Export PDF / PNG items.
  function openExportMenu() {
    fireEvent.click(screen.getByTestId('file-menu-trigger'))
  }

  it('renders the Export PDF menu item for an editor', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    renderTopBar()
    openExportMenu()
    expect(
      screen.getByRole('menuitem', { name: /export pdf/i }),
    ).toBeInTheDocument()
  })

  it('hides the Export PDF menu item for a viewer', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderTopBar()
    openExportMenu()
    expect(
      screen.queryByRole('menuitem', { name: /export pdf/i }),
    ).not.toBeInTheDocument()
  })

  it('calls buildWayfindingPdf when clicked and the canvas is mounted', async () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    const fakeStage = { toDataURL: () => 'data:image/png;base64,AAAA' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    renderTopBar()

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /export pdf/i }))
    // FileMenu defers handler dispatch via queueMicrotask so the menu can
    // commit-close before the handler runs — flush microtasks before the
    // assertion.
    await Promise.resolve()
    expect(buildWayfindingPdfMock).toHaveBeenCalledTimes(1)
    const arg = (buildWayfindingPdfMock.mock.calls[0] as unknown[])[0] as {
      projectName: string
      floor: { name: string }
    }
    expect(arg.projectName).toBe('Acme HQ')
    expect(arg.floor.name).toBe('Floor 1')
  })
})
