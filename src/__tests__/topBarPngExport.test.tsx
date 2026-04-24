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

// Stub the PNG export module so jsdom doesn't have to cope with anchor
// clicks or object URLs — the module has its own focused test.
const { exportFloorAsPngMock } = vi.hoisted(() => ({
  exportFloorAsPngMock: vi.fn(() => Promise.resolve()),
}))
vi.mock('../lib/pngExport', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>
  return { ...actual, exportFloorAsPng: exportFloorAsPngMock }
})

// The PDF export path is exercised in its own test and would otherwise
// pull jspdf into this render.
vi.mock('../lib/pdfExport', async (importActual) => {
  const actual = (await importActual()) as Record<string, unknown>
  return {
    ...actual,
    buildWayfindingPdf: vi.fn(() => new Blob(['%PDF-fake'], { type: 'application/pdf' })),
  }
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
  exportFloorAsPngMock.mockClear()
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

describe('TopBar: PNG export menu item', () => {
  // Opens the Export dropdown. The PDF/PNG quick-export buttons were
  // collapsed into a menu to reclaim horizontal space in the TopBar —
  // tests have to open the menu before the items become queryable.
  function openExportMenu() {
    fireEvent.click(screen.getByRole('button', { name: /^export/i }))
  }

  it('renders the Export PNG menu item for an editor (has viewReports)', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    renderTopBar()
    openExportMenu()
    expect(
      screen.getByRole('menuitem', { name: /export png/i }),
    ).toBeInTheDocument()
  })

  it('hides the Export PNG menu item for a viewer (lacks viewReports)', () => {
    useProjectStore.setState({ currentOfficeRole: 'viewer' } as any)
    renderTopBar()
    openExportMenu()
    expect(
      screen.queryByRole('menuitem', { name: /export png/i }),
    ).not.toBeInTheDocument()
  })

  it('invokes exportFloorAsPng with the active stage and a project/floor/date filename', () => {
    useProjectStore.setState({ currentOfficeRole: 'editor' } as any)
    const fakeStage = { toDataURL: () => 'data:image/png;base64,AAAA' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    renderTopBar()

    openExportMenu()
    fireEvent.click(screen.getByRole('menuitem', { name: /export png/i }))
    expect(exportFloorAsPngMock).toHaveBeenCalledTimes(1)
    const [stageArg, opts] = exportFloorAsPngMock.mock.calls[0] as unknown as [
      Konva.Stage,
      { filename: string },
    ]
    expect(stageArg).toBe(fakeStage)
    // Filename pattern: <project>-<floor>-<YYYY-MM-DD>.png
    expect(opts.filename).toMatch(/^acme-hq-floor-1-\d{4}-\d{2}-\d{2}\.png$/)
  })
})
