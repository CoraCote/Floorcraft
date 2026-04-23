import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CSVImportSummaryModal } from '../components/editor/CSVImportSummaryModal'
import { useUIStore } from '../stores/uiStore'
import type { ImportIssue } from '../lib/employeeCsv'

function issue(over: Partial<ImportIssue> = {}): ImportIssue {
  return {
    rowIndex: over.rowIndex ?? 1,
    reason: over.reason ?? 'blank_name',
    message: over.message ?? 'Missing name',
    raw: over.raw ?? { name: '' },
  }
}

beforeEach(() => {
  useUIStore.setState({ csvImportSummary: null })
})

describe('CSVImportSummaryModal', () => {
  it('renders nothing when there is no summary', () => {
    const { container } = render(<CSVImportSummaryModal />)
    expect(container).toBeEmptyDOMElement()
  })

  it('renders the imported / skipped / warning counts', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 197,
        skipped: [issue({ rowIndex: 3 })],
        warnings: [issue({ rowIndex: 7, reason: 'invalid_status' })],
      },
    })
    render(<CSVImportSummaryModal />)
    expect(screen.getByText(/197 imported/i)).toBeInTheDocument()
    expect(screen.getByText(/1 skipped/i)).toBeInTheDocument()
    expect(screen.getByText(/1 warning/i)).toBeInTheDocument()
  })

  it('lists each skipped and warning row with its reason', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 0,
        skipped: [issue({ rowIndex: 3, reason: 'blank_name' })],
        warnings: [issue({ rowIndex: 7, reason: 'invalid_status', message: 'Unknown status' })],
      },
    })
    render(<CSVImportSummaryModal />)
    expect(screen.getByText(/row 3/i)).toBeInTheDocument()
    expect(screen.getByText(/blank_name/i)).toBeInTheDocument()
    expect(screen.getByText(/row 7/i)).toBeInTheDocument()
    expect(screen.getByText(/invalid_status/i)).toBeInTheDocument()
  })

  it('download button calls downloadCSV with a filename and non-empty CSV', async () => {
    const calls: Array<{ filename: string; csv: string }> = []
    vi.doMock('../lib/employeeCsv', async () => {
      const actual = await vi.importActual<typeof import('../lib/employeeCsv')>('../lib/employeeCsv')
      return {
        ...actual,
        downloadCSV: (filename: string, csv: string) => {
          calls.push({ filename, csv })
          return true
        },
      }
    })
    vi.resetModules()
    const { CSVImportSummaryModal: FreshModal } = await import(
      '../components/editor/CSVImportSummaryModal'
    )
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 0,
        skipped: [issue({ rowIndex: 1 })],
        warnings: [],
      },
    })
    render(<FreshModal />)
    fireEvent.click(screen.getByRole('button', { name: /download skipped/i }))
    expect(calls).toHaveLength(1)
    expect(calls[0].filename).toMatch(/skipped.*\.csv$/i)
    expect(calls[0].csv).toContain('skip_reason')
    vi.doUnmock('../lib/employeeCsv')
  })

  it('Done button clears the summary', () => {
    useUIStore.setState({
      csvImportSummary: {
        importedCount: 1,
        skipped: [],
        warnings: [],
      },
    })
    render(<CSVImportSummaryModal />)
    fireEvent.click(screen.getByRole('button', { name: /^Done$/i }))
    expect(useUIStore.getState().csvImportSummary).toBeNull()
  })
})
