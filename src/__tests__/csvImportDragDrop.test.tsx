import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react'
import { CSVImportDialog } from '../components/editor/RightSidebar/CSVImportDialog'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'

beforeEach(() => {
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useUIStore.setState({ csvImportOpen: true, csvImportSummary: null })
})

/**
 * Build a fake DataTransfer that getAttribute / files / dropEffect work
 * against — jsdom doesn't expose a real one. Only the props the
 * component actually reads need to exist.
 */
function fakeDataTransfer(files: File[]) {
  return {
    files,
    items: files.map((f) => ({ kind: 'file', getAsFile: () => f })),
    types: ['Files'],
    dropEffect: 'none',
    effectAllowed: 'all',
  }
}

describe('CSVImportDialog — drop zone', () => {
  it('renders the idle drop zone state with the expected copy', () => {
    render(<CSVImportDialog />)
    const zone = screen.getByTestId('csv-drop-zone')
    expect(zone.getAttribute('data-state')).toBe('idle')
    expect(zone).toHaveTextContent(/drop your csv here/i)
    expect(zone).toHaveTextContent(/first row should be column headers/i)
  })

  it('switches to drag-over state on dragenter and back on dragleave', () => {
    render(<CSVImportDialog />)
    const zone = screen.getByTestId('csv-drop-zone')

    fireEvent.dragEnter(zone, { dataTransfer: fakeDataTransfer([]) })
    expect(zone.getAttribute('data-state')).toBe('drag-over')
    expect(zone).toHaveTextContent(/release to upload/i)

    fireEvent.dragLeave(zone, { dataTransfer: fakeDataTransfer([]) })
    expect(zone.getAttribute('data-state')).toBe('idle')
  })

  it('does not flicker when dragging over child elements (depth-counted)', () => {
    render(<CSVImportDialog />)
    const zone = screen.getByTestId('csv-drop-zone')

    // dragenter on the zone itself.
    fireEvent.dragEnter(zone, { dataTransfer: fakeDataTransfer([]) })
    expect(zone.getAttribute('data-state')).toBe('drag-over')

    // A nested dragenter (e.g. crossing into a child) bumps depth to 2.
    fireEvent.dragEnter(zone, { dataTransfer: fakeDataTransfer([]) })
    // A single dragleave drops depth to 1 — should still be drag-over.
    fireEvent.dragLeave(zone, { dataTransfer: fakeDataTransfer([]) })
    expect(zone.getAttribute('data-state')).toBe('drag-over')

    // The final dragleave drops to 0 → idle.
    fireEvent.dragLeave(zone, { dataTransfer: fakeDataTransfer([]) })
    expect(zone.getAttribute('data-state')).toBe('idle')
  })

  it('reads a dropped CSV file and shows the file-loaded state', async () => {
    // Stub FileReader so we can resolve the file content synchronously.
    const csv = 'name,email\nJane,jane@example.com'
    const originalFR = global.FileReader
    class StubReader {
      result: string | null = null
      onload: ((ev: { target: { result: string } }) => void) | null = null
      readAsText() {
        this.result = csv
        Promise.resolve().then(() => {
          this.onload?.({ target: { result: csv } })
        })
      }
    }
    // @ts-expect-error overriding global
    global.FileReader = StubReader

    try {
      render(<CSVImportDialog />)
      const zone = screen.getByTestId('csv-drop-zone')
      const file = new File([csv], 'people.csv', { type: 'text/csv' })

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: fakeDataTransfer([file]) })
      })

      await waitFor(() => {
        expect(zone.getAttribute('data-state')).toBe('file-loaded')
      })
      expect(zone).toHaveTextContent('people.csv')
      // Continue should now be enabled because csvText is populated.
      const continueBtn = screen.getByRole('button', {
        name: /^continue$/i,
      }) as HTMLButtonElement
      expect(continueBtn.disabled).toBe(false)
    } finally {
      global.FileReader = originalFR
    }
  })

  it('Replace button clears the loaded file', async () => {
    const csv = 'name,email\nJane,jane@example.com'
    const originalFR = global.FileReader
    class StubReader {
      onload: ((ev: { target: { result: string } }) => void) | null = null
      readAsText() {
        Promise.resolve().then(() => {
          this.onload?.({ target: { result: csv } })
        })
      }
    }
    // @ts-expect-error overriding the global FileReader with a partial stub for the test
    global.FileReader = StubReader

    try {
      render(<CSVImportDialog />)
      const zone = screen.getByTestId('csv-drop-zone')
      const file = new File([csv], 'people.csv', { type: 'text/csv' })

      await act(async () => {
        fireEvent.drop(zone, { dataTransfer: fakeDataTransfer([file]) })
      })
      await waitFor(() => {
        expect(zone.getAttribute('data-state')).toBe('file-loaded')
      })

      // Two role="button"s match /replace/ once a file is loaded —
      // the drop zone wrapper (aria-label "Click to replace…") and the
      // explicit "Replace" mini-button. Pick the inner one by text.
      fireEvent.click(screen.getByText('Replace'))
      expect(zone.getAttribute('data-state')).toBe('idle')
    } finally {
      global.FileReader = originalFR
    }
  })

  it('triggers the file picker via Enter and Space keys', () => {
    render(<CSVImportDialog />)
    const zone = screen.getByTestId('csv-drop-zone')
    const input = zone.querySelector('input[type="file"]') as HTMLInputElement
    const clickSpy = vi.spyOn(input, 'click')

    fireEvent.keyDown(zone, { key: 'Enter' })
    expect(clickSpy).toHaveBeenCalledTimes(1)
    fireEvent.keyDown(zone, { key: ' ' })
    expect(clickSpy).toHaveBeenCalledTimes(2)
  })
})

describe('CSVImportDialog — template download', () => {
  it('exposes a Download template link in the upload step', () => {
    render(<CSVImportDialog />)
    const link = screen.getByRole('button', { name: /download template/i })
    expect(link).toBeInTheDocument()
  })
})
