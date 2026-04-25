import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CSVImportDialog } from '../components/editor/RightSidebar/CSVImportDialog'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'

// Compact CSV fixture covering every row-status bucket the preview
// needs to render:
//   row 1 — Alice   → valid
//   row 2 — blank   → error (blank_name)
//   row 3 — Bob     → error (duplicate_email with Alice)
//   row 4 — Carol   → warning (invalid_status + invalid_start_date)
//   row 5 — Dave    → warning (manager_unresolved)
const CSV = [
  'name,email,status,start_date,manager',
  'Alice,alice@co.com,active,2024-01-15,',
  ',ghost@co.com,active,,',
  'Bob,alice@co.com,active,,Alice',
  'Carol,carol@co.com,nope,tomorrow,',
  'Dave,dave@co.com,active,,Nobody',
].join('\n')

function openDialog() {
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useUIStore.setState({ csvImportOpen: true, csvImportSummary: null })
}

function pasteAndContinue(text: string = CSV) {
  // Wave 16B: textarea moved into a <details> wrapper. Open the
  // disclosure first so the textarea is in the DOM.
  const summary = screen.getByText(/or paste csv directly/i)
  fireEvent.click(summary)
  const textarea = screen.getByPlaceholderText(/name,email/i) as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
}

beforeEach(() => {
  openDialog()
})

describe('CSVImportDialog — preview step', () => {
  it('transitions from upload to preview on Continue', () => {
    render(<CSVImportDialog />)
    expect(screen.getByRole('button', { name: /^continue$/i })).toBeInTheDocument()
    pasteAndContinue()
    // Preview renders the import button and a row table.
    expect(screen.getByRole('button', { name: /^import /i })).toBeInTheDocument()
    expect(screen.getByRole('table')).toBeInTheDocument()
  })

  it('preserves pasted text when Back is clicked', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    fireEvent.click(screen.getByRole('button', { name: /^back$/i }))
    // Re-open the textarea disclosure to inspect the persisted value.
    fireEvent.click(screen.getByText(/or paste csv directly/i))
    const textarea = screen.getByPlaceholderText(/name,email/i) as HTMLTextAreaElement
    expect(textarea.value).toBe(CSV)
  })

  it('selects valid and warning rows by default and leaves error rows unchecked', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // 5 total rows; Alice/Carol/Dave default-checked (valid + 2 warnings),
    // blank row + Bob unchecked (errors).
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes).toHaveLength(5)
    const checkedByLabel = checkboxes.map((c) => ({
      label: c.getAttribute('aria-label') ?? '',
      checked: c.checked,
    }))
    // Row 1 Alice — checked.
    expect(checkedByLabel[0].checked).toBe(true)
    // Row 2 blank_name — error → unchecked.
    expect(checkedByLabel[1].checked).toBe(false)
    // Row 3 duplicate_email — error → unchecked.
    expect(checkedByLabel[2].checked).toBe(false)
    // Row 4 Carol — warning → checked.
    expect(checkedByLabel[3].checked).toBe(true)
    // Row 5 Dave — warning → checked.
    expect(checkedByLabel[4].checked).toBe(true)
  })

  it('“Select all valid” checks valid + warning rows and leaves errors unchecked', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Mutate state first so the button has to produce a clean result.
    fireEvent.click(screen.getByRole('button', { name: /^clear selection$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^select all valid$/i }))
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[]
    expect(checkboxes[0].checked).toBe(true)  // Alice valid
    expect(checkboxes[1].checked).toBe(false) // blank error
    expect(checkboxes[2].checked).toBe(false) // dup error
    expect(checkboxes[3].checked).toBe(true)  // Carol warning
    expect(checkboxes[4].checked).toBe(true)  // Dave warning
  })

  it('count chip updates as the user toggles', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    expect(screen.getByText(/3 of 5 selected/)).toBeInTheDocument()
    // Toggle off Alice.
    fireEvent.click(screen.getAllByRole('checkbox')[0])
    expect(screen.getByText(/2 of 5 selected/)).toBeInTheDocument()
    // Toggle on blank-name error row.
    fireEvent.click(screen.getAllByRole('checkbox')[1])
    expect(screen.getByText(/3 of 5 selected/)).toBeInTheDocument()
  })

  it('Import commits only the selected rows', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Default: 3 checked (Alice + Carol + Dave). Click import.
    fireEvent.click(screen.getByRole('button', { name: /^import /i }))
    const employees = useEmployeeStore.getState().employees
    expect(Object.keys(employees)).toHaveLength(3)
    const names = Object.values(employees).map((e) => e.name).sort()
    expect(names).toEqual(['Alice', 'Carol', 'Dave'])
    // Summary modal got the imported count.
    expect(useUIStore.getState().csvImportSummary?.importedCount).toBe(3)
  })

  it('Import is disabled when nothing is selected', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    fireEvent.click(screen.getByRole('button', { name: /^clear selection$/i }))
    const btn = screen.getByRole('button', { name: /^import /i }) as HTMLButtonElement
    expect(btn.disabled).toBe(true)
  })

  it('shows an empty state when the parsed CSV has zero rows', () => {
    render(<CSVImportDialog />)
    // A header-only CSV parses to zero rows.
    pasteAndContinue('name,email\n')
    expect(screen.getByRole('status')).toHaveTextContent(/no data detected/i)
    expect(screen.getByRole('button', { name: /^back$/i })).toBeInTheDocument()
  })

  it('each row has an Include/Skip aria-label checkbox', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Alice is default-checked → label is "Skip row 1".
    expect(screen.getByRole('checkbox', { name: /skip row 1/i })).toBeInTheDocument()
    // Blank-name row is default-unchecked → "Include row 2".
    expect(screen.getByRole('checkbox', { name: /include row 2/i })).toBeInTheDocument()
  })

  it('renders a status badge per row using text + icon, not colour alone', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    // First row is header; row bodies start at index 1.
    expect(within(rows[1]).getByText(/valid/i)).toBeInTheDocument()
    expect(within(rows[2]).getByText(/error/i)).toBeInTheDocument()
    expect(within(rows[3]).getByText(/error/i)).toBeInTheDocument()
    expect(within(rows[4]).getByText(/warning/i)).toBeInTheDocument()
    expect(within(rows[5]).getByText(/warning/i)).toBeInTheDocument()
  })
})
