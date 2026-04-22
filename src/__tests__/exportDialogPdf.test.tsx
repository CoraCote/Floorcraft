import { describe, it, expect, vi, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import type Konva from 'konva'
import { ExportDialog } from '../components/editor/ExportDialog'
import { useUIStore } from '../stores/uiStore'
import { useProjectStore } from '../stores/projectStore'
import { setActiveStage } from '../lib/stageRegistry'
import type { Project } from '../types/project'

// Hoisted mocks so the export libraries never touch the real DOM
// (no jsPDF.save, no download, no canvas rasterising).
const { exportPdfMock, exportPngMock } = vi.hoisted(() => ({
  exportPdfMock: vi.fn(),
  exportPngMock: vi.fn(),
}))
vi.mock('../lib/exportPdf', () => ({ exportPdf: exportPdfMock }))
vi.mock('../lib/exportPng', () => ({ exportPng: exportPngMock }))

function openDialog(projectName = 'my-plan') {
  const project: Project = {
    id: 'p1',
    ownerId: 'u1',
    name: projectName,
    slug: projectName,
    buildingName: null,
    floors: [],
    activeFloorId: '',
    canvasSettings: {
      gridSize: 12,
      scale: 1,
      scaleUnit: 'ft',
      showGrid: true,
      showDimensions: false,
    },
    thumbnailUrl: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  }
  useProjectStore.setState({ currentProject: project })
  useUIStore.setState({ exportDialogOpen: true })
}

function closeDialog() {
  useUIStore.setState({ exportDialogOpen: false })
}

describe('ExportDialog PDF + PNG wiring', () => {
  beforeEach(() => {
    exportPdfMock.mockReset()
    exportPngMock.mockReset()
    setActiveStage(null)
    closeDialog()
  })

  it('clicking PDF Floor Plan calls exportPdf with stage + project filename', () => {
    const fakeStage = { __brand: 'stage' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    openDialog('office-plan')
    render(<ExportDialog />)

    fireEvent.click(screen.getByRole('button', { name: /PDF Floor Plan/i }))

    expect(exportPdfMock).toHaveBeenCalledTimes(1)
    const [stageArg, opts] = exportPdfMock.mock.calls[0]
    expect(stageArg).toBe(fakeStage)
    expect(opts.fileName).toBe('office-plan.pdf')
    expect(opts.dpi).toBe(300)
    // Dialog closes on success.
    expect(useUIStore.getState().exportDialogOpen).toBe(false)
  })

  it('clicking PNG Image calls exportPng with stage + project filename', () => {
    const fakeStage = { __brand: 'stage' } as unknown as Konva.Stage
    setActiveStage(fakeStage)
    openDialog('office-plan')
    render(<ExportDialog />)

    fireEvent.click(screen.getByRole('button', { name: /PNG Image/i }))

    expect(exportPngMock).toHaveBeenCalledTimes(1)
    const [stageArg, opts] = exportPngMock.mock.calls[0]
    expect(stageArg).toBe(fakeStage)
    expect(opts.fileName).toBe('office-plan.png')
    expect(useUIStore.getState().exportDialogOpen).toBe(false)
  })

  it('shows a friendly error and keeps the dialog open when no canvas is mounted', () => {
    // No setActiveStage — registry returns null.
    openDialog()
    render(<ExportDialog />)

    fireEvent.click(screen.getByRole('button', { name: /PDF Floor Plan/i }))

    expect(exportPdfMock).not.toHaveBeenCalled()
    expect(useUIStore.getState().exportDialogOpen).toBe(true)
    expect(screen.getByRole('alert')).toHaveTextContent(/Open a floor plan/i)
  })
})
