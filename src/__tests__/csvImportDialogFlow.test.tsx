import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent } from '@testing-library/react'
import { CSVImportDialog } from '../components/editor/RightSidebar/CSVImportDialog'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'

const CSV = [
  'name,email,status,start_date,manager',
  'Alice,alice@co.com,active,2024-01-15,',
  ',ghost@co.com,active,,',
  'Bob,alice@co.com,active,,Alice',
  'Carol,carol@co.com,nope,tomorrow,',
  'Dave,dave@co.com,active,,Nobody',
].join('\n')

beforeEach(() => {
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useUIStore.setState({
    csvImportOpen: true,
    csvImportSummary: null,
  })
})

describe('CSVImportDialog flow', () => {
  it('imports the valid rows and opens a summary modal with skipped + warnings', () => {
    render(<CSVImportDialog />)

    // Wave 16B: paste textarea now lives in a <details>; click to open.
    fireEvent.click(screen.getByText(/or paste csv directly/i))
    const textarea = screen.getByPlaceholderText(/name,email/i) as HTMLTextAreaElement
    fireEvent.change(textarea, { target: { value: CSV } })

    fireEvent.click(screen.getByRole('button', { name: /continue/i }))
    // Include every row so the post-commit summary still shows both
    // structural skips (blank_name, duplicate_email). The new preview
    // step leaves error rows unchecked by default; "Select all" puts us
    // back to the pre-Wave-13B behaviour that this test was built for.
    fireEvent.click(screen.getByRole('button', { name: /^select all$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^import /i }))

    // Dialog closed, summary modal set.
    expect(useUIStore.getState().csvImportOpen).toBe(false)
    const summary = useUIStore.getState().csvImportSummary
    expect(summary).not.toBeNull()

    // Alice + Carol + Dave import (3). Bob skipped (duplicate email with Alice).
    // Blank row skipped (blank_name). Carol has two warnings (invalid_status,
    // invalid_start_date). Dave has one warning (manager_unresolved).
    expect(summary!.importedCount).toBe(3)
    expect(summary!.skipped.map((s) => s.reason).sort()).toEqual([
      'blank_name',
      'duplicate_email',
    ])
    expect(summary!.warnings.map((w) => w.reason).sort()).toEqual([
      'invalid_start_date',
      'invalid_status',
      'manager_unresolved',
    ])

    // Store should have 3 employees.
    expect(Object.keys(useEmployeeStore.getState().employees)).toHaveLength(3)
  })
})
