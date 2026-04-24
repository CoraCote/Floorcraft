import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { ShareView } from '../components/editor/ShareView'
import { useShareLinksStore } from '../stores/shareLinksStore'
import { useEmployeeStore } from '../stores/employeeStore'
import { useFloorStore } from '../stores/floorStore'
import { useElementsStore } from '../stores/elementsStore'
import { useProjectStore } from '../stores/projectStore'
import { useUIStore } from '../stores/uiStore'

// Konva-backed children are stubbed because jsdom can't paint them.
// We still want to assert the share view's *layout* mounts the canvas
// in the right slot, so the stubs render cheap dummy `<div>`s with
// recognisable test IDs.
vi.mock('../components/editor/Canvas/CanvasStage', () => ({
  CanvasStage: () => <div data-testid="canvas-stage" />,
}))
vi.mock('../components/editor/Canvas/CanvasActionDock', () => ({
  CanvasActionDock: () => <div data-testid="canvas-action-dock" />,
}))
vi.mock('../components/editor/Minimap', () => ({
  Minimap: () => <div data-testid="minimap" />,
}))

function mount(path: string) {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <Routes>
        <Route path="/share/:officeSlug" element={<ShareView />} />
      </Routes>
    </MemoryRouter>,
  )
}

beforeEach(() => {
  useShareLinksStore.setState({ links: {} })
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useElementsStore.setState({ elements: {} })
  useProjectStore.setState({ currentOfficeRole: null, impersonatedRole: null })
  useUIStore.setState({ minimapVisible: true })
})

describe('ShareView canvas + embed mode', () => {
  it('mounts CanvasStage + header + StatusBar in full mode', () => {
    const { link } = useShareLinksStore.getState().create('office-1', 3600)
    mount(`/share/hq?t=${link.token}`)

    // Canvas is the centerpiece.
    expect(screen.getByTestId('canvas-stage')).toBeInTheDocument()
    // Full-mode header rendered.
    expect(screen.getByText('Floorcraft')).toBeInTheDocument()
    expect(screen.getByText('hq')).toBeInTheDocument()
    // Action dock + minimap mount in full mode (their stubs are present).
    expect(screen.getByTestId('canvas-action-dock')).toBeInTheDocument()
    expect(screen.getByTestId('minimap')).toBeInTheDocument()
    // No embed-mode footer in full mode.
    expect(screen.queryByTestId('share-view-embed-status')).toBeNull()
    expect(screen.queryByTestId('share-view-embed')).toBeNull()
  })

  it('strips the header and dock in embed mode and shows the watermark', () => {
    const { link } = useShareLinksStore.getState().create('office-1', 3600)
    mount(`/share/hq?t=${link.token}&embed=1`)

    // Canvas still mounts (this is the whole point of the share view).
    expect(screen.getByTestId('canvas-stage')).toBeInTheDocument()
    // Embed wrapper present.
    expect(screen.getByTestId('share-view-embed')).toBeInTheDocument()
    // Watermark / footer.
    const status = screen.getByTestId('share-view-embed-status')
    expect(status).toBeInTheDocument()
    // The header chrome ("Read-only · expires…") is hidden so the iframe
    // body is purely the visualization.
    expect(screen.queryByText(/read-only/i)).toBeNull()
    // ActionDock not mounted in embed mode.
    expect(screen.queryByTestId('canvas-action-dock')).toBeNull()
  })

  it('hides the minimap by default in embed mode', () => {
    const { link } = useShareLinksStore.getState().create('office-1', 3600)
    // Minimap starts visible (per uiStore default in beforeEach).
    expect(useUIStore.getState().minimapVisible).toBe(true)

    mount(`/share/hq?t=${link.token}&embed=1`)

    // Embed mode flips the minimap off so the iframe body is canvas-only.
    expect(useUIStore.getState().minimapVisible).toBe(false)
  })

  it('exposes an "Open full view" link from the embed footer', () => {
    const { link } = useShareLinksStore.getState().create('office-1', 3600)
    mount(`/share/hq?t=${link.token}&embed=1`)
    const openLink = screen.getByRole('link', { name: /open full view/i })
    expect(openLink).toBeInTheDocument()
    // Link drops the embed flag so the operator gets the full chrome.
    const href = openLink.getAttribute('href') ?? ''
    expect(href).toContain('/share/hq')
    expect(href).toContain(`t=${link.token}`)
    expect(href).not.toContain('embed=1')
  })

  it('still renders the invalid-token error in embed mode', () => {
    mount('/share/hq?t=bogus&embed=1')
    expect(screen.getByText(/link expired or invalid/i)).toBeInTheDocument()
    // Canvas should NOT mount when the token is invalid.
    expect(screen.queryByTestId('canvas-stage')).toBeNull()
  })
})
