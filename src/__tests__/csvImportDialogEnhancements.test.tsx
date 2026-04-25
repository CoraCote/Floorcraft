import { describe, it, expect, beforeEach } from 'vitest'
import { render, screen, fireEvent, within } from '@testing-library/react'
import { CSVImportDialog } from '../components/editor/RightSidebar/CSVImportDialog'
import { useUIStore } from '../stores/uiStore'
import { useEmployeeStore } from '../stores/employeeStore'

// Same fixture used by csvImportDialogPreview, repeated here so this
// suite is self-contained.
const CSV = [
  'name,email,status,start_date,manager',
  'Alice,alice@co.com,active,2024-01-15,',
  ',ghost@co.com,active,,',
  'Bob,alice@co.com,active,,Alice',
  'Carol,carol@co.com,nope,tomorrow,',
  'Dave,dave@co.com,active,,Nobody',
].join('\n')

function pasteAndContinue(text: string = CSV) {
  // The textarea lives in a <details> now. Open it first.
  const summary = screen.getByText(/or paste csv directly/i)
  fireEvent.click(summary)
  const textarea = screen.getByPlaceholderText(/name,email/i) as HTMLTextAreaElement
  fireEvent.change(textarea, { target: { value: text } })
  fireEvent.click(screen.getByRole('button', { name: /^continue$/i }))
}

beforeEach(() => {
  useEmployeeStore.setState({ employees: {}, departmentColors: {} })
  useUIStore.setState({ csvImportOpen: true, csvImportSummary: null })
})

describe('CSVImportDialog — filter bar', () => {
  it('renders four pills with row counts', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    const group = screen.getByRole('group', { name: /row filter/i })
    expect(within(group).getByRole('button', { name: /^all \(5\)/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /^valid \(1\)/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /^warnings \(2\)/i })).toBeInTheDocument()
    expect(within(group).getByRole('button', { name: /^errors \(2\)/i })).toBeInTheDocument()
  })

  it('filters rows by status when a pill is clicked', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    fireEvent.click(screen.getByRole('button', { name: /^errors \(2\)/i }))
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    // Header + 2 error rows = 3.
    expect(rows).toHaveLength(3)
    expect(within(rows[1]).getByText(/error/i)).toBeInTheDocument()
    expect(within(rows[2]).getByText(/error/i)).toBeInTheDocument()
  })

  it('marks the active pill with aria-pressed', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    const errorsPill = screen.getByRole('button', { name: /^errors \(2\)/i })
    expect(errorsPill.getAttribute('aria-pressed')).toBe('false')
    fireEvent.click(errorsPill)
    expect(errorsPill.getAttribute('aria-pressed')).toBe('true')
  })

  it('preserves selection across filter changes', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Default: Alice (row 1) checked. Switch to Errors filter and back.
    expect(screen.getByText(/3 of 5 selected/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^errors \(2\)/i }))
    // Counter still says 3 of 5 — selection is index-based, not view-based.
    expect(screen.getByText(/3 of 5 selected/)).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /^all \(5\)/i }))
    expect(screen.getByText(/3 of 5 selected/)).toBeInTheDocument()
  })

  it('"Select all" with errors filter active selects only visible error rows', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    fireEvent.click(screen.getByRole('button', { name: /^clear selection$/i }))
    fireEvent.click(screen.getByRole('button', { name: /^errors \(2\)/i }))
    fireEvent.click(screen.getByRole('button', { name: /^select all$/i }))
    // Only the 2 error rows are now selected.
    expect(screen.getByText(/2 of 5 selected/)).toBeInTheDocument()
  })
})

describe('CSVImportDialog — inline edit', () => {
  it('lets the user edit a row name and re-runs validation', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Row 2 is the blank-name error. Click its name cell to edit.
    const editBtn = screen.getByRole('button', { name: /edit name "blank" for row 2/i })
    fireEvent.click(editBtn)
    const input = screen.getByRole('textbox', { name: /edit name for row 2/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Eve Smith' } })
    fireEvent.keyDown(input, { key: 'Enter' })

    // Re-validate fires on commit. Row 2 should now read as a Valid row.
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(within(rows[2]).getByText('Eve Smith')).toBeInTheDocument()
    expect(within(rows[2]).getByText(/valid/i)).toBeInTheDocument()
    // Filter pill counts updated: errors went from 2 to 1.
    expect(screen.getByRole('button', { name: /^errors \(1\)/i })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: /^valid \(2\)/i })).toBeInTheDocument()
  })

  it('lets the user fix an email typo and clears the duplicate-email error', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    // Row 3 (Bob) has alice@co.com — duplicate of row 1. Fix it.
    const editBtn = screen.getByRole('button', { name: /edit email "alice@co.com" for row 3/i })
    fireEvent.click(editBtn)
    const input = screen.getByRole('textbox', { name: /edit email for row 3/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'bob@co.com' } })
    fireEvent.blur(input)

    // Row 3 transitions from error → valid. Errors count drops by 1.
    expect(screen.getByRole('button', { name: /^errors \(1\)/i })).toBeInTheDocument()
  })

  it('Escape reverts an in-flight edit', () => {
    render(<CSVImportDialog />)
    pasteAndContinue()
    const editBtn = screen.getByRole('button', { name: /edit name "alice" for row 1/i })
    fireEvent.click(editBtn)
    const input = screen.getByRole('textbox', { name: /edit name for row 1/i }) as HTMLInputElement
    fireEvent.change(input, { target: { value: 'Should not commit' } })
    fireEvent.keyDown(input, { key: 'Escape' })

    // Row 1 still reads "Alice".
    const rows = within(screen.getByRole('table')).getAllByRole('row')
    expect(within(rows[1]).getByText('Alice')).toBeInTheDocument()
  })
})

describe('CSVImportDialog — headers matched banner', () => {
  it('shows the banner when an alias was applied', () => {
    render(<CSVImportDialog />)
    const aliasCSV = [
      'Full Name,Email Address,Job Title',
      'Jane Doe,jane@example.com,Engineer',
    ].join('\n')
    pasteAndContinue(aliasCSV)
    const banner = screen.getByTestId('alias-banner')
    expect(banner).toHaveTextContent(/headers matched/i)
    expect(banner).toHaveTextContent(/full name.*name/i)
    expect(banner).toHaveTextContent(/email address.*email/i)
  })

  it('shows the banner when first/last were concatenated', () => {
    render(<CSVImportDialog />)
    const csv = [
      'First Name,Last Name,Email',
      'Jane,Doe,jane@example.com',
    ].join('\n')
    pasteAndContinue(csv)
    const banner = screen.getByTestId('alias-banner')
    expect(banner).toHaveTextContent(/combined first_name.*last_name/i)
  })

  it('does NOT show the banner when canonical headers were used', () => {
    render(<CSVImportDialog />)
    pasteAndContinue('name,email\nJane,jane@example.com')
    expect(screen.queryByTestId('alias-banner')).toBeNull()
  })

  it('hides the banner when dismissed', () => {
    render(<CSVImportDialog />)
    pasteAndContinue('Full Name,Email\nJane Doe,jane@example.com')
    expect(screen.getByTestId('alias-banner')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: /dismiss headers matched notice/i }))
    expect(screen.queryByTestId('alias-banner')).toBeNull()
  })
})
