import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import { MessageSquare } from 'lucide-react'
import { PanelHeader } from '../components/editor/RightSidebar/PanelHeader'
import { PanelSection } from '../components/editor/RightSidebar/PanelSection'
import { PanelEmptyState } from '../components/editor/RightSidebar/PanelEmptyState'

/**
 * Smoke coverage for the three Wave 17D shared sidebar primitives. These
 * components carry zero business logic; the point of the tests is to lock
 * in the contract the callers depend on — count pill renders when provided,
 * empty-state icon + title render, section subtitle is optional, etc.
 */

describe('PanelHeader', () => {
  it('renders the title', () => {
    render(<PanelHeader title="Annotations" />)
    expect(screen.getByRole('heading', { level: 2, name: 'Annotations' })).toBeInTheDocument()
  })

  it('shows the count pill when count is provided', () => {
    render(<PanelHeader title="Annotations" count={3} />)
    const pill = screen.getByTestId('panel-header-count')
    expect(pill.textContent).toBe('3')
  })

  it('hides the count pill when count is undefined', () => {
    render(<PanelHeader title="Reports" />)
    expect(screen.queryByTestId('panel-header-count')).not.toBeInTheDocument()
  })

  it('renders a zero count when explicitly passed', () => {
    // Callers opt in to showing 0 by passing it explicitly. The pill only
    // disappears when the count is omitted (undefined) — otherwise a "0"
    // tells the user the panel is intentionally empty rather than loading.
    render(<PanelHeader title="Insights" count={0} />)
    const pill = screen.getByTestId('panel-header-count')
    expect(pill.textContent).toBe('0')
  })

  it('renders the actions slot', () => {
    render(
      <PanelHeader
        title="Reports"
        actions={<button type="button">Open</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Open' })).toBeInTheDocument()
  })

  it('renders the optional subtitle', () => {
    render(<PanelHeader title="Reports" subtitle="Drill into dashboards" />)
    expect(screen.getByText('Drill into dashboards')).toBeInTheDocument()
  })
})

describe('PanelSection', () => {
  it('renders the title and children', () => {
    render(
      <PanelSection title="Severity">
        <div>Inside</div>
      </PanelSection>,
    )
    expect(screen.getByRole('heading', { level: 3, name: 'Severity' })).toBeInTheDocument()
    expect(screen.getByText('Inside')).toBeInTheDocument()
  })

  it('renders the optional subtitle', () => {
    render(
      <PanelSection title="Severity" subtitle="Open issues by impact">
        <div />
      </PanelSection>,
    )
    expect(screen.getByText('Open issues by impact')).toBeInTheDocument()
  })

  it('exposes an accessible region label defaulting to the title', () => {
    render(
      <PanelSection title="Reports">
        <div />
      </PanelSection>,
    )
    expect(screen.getByRole('region', { name: 'Reports' })).toBeInTheDocument()
  })

  it('uses the explicit ariaLabel when provided', () => {
    render(
      <PanelSection title="Reports" ariaLabel="Quick reports">
        <div />
      </PanelSection>,
    )
    expect(screen.getByRole('region', { name: 'Quick reports' })).toBeInTheDocument()
  })
})

describe('PanelEmptyState', () => {
  it('renders the icon, title, and body', () => {
    render(
      <PanelEmptyState
        icon={MessageSquare}
        title="No annotations yet"
        body="Drop a pin on the canvas to start."
      />,
    )
    const root = screen.getByTestId('panel-empty-state')
    expect(root).toBeInTheDocument()
    expect(screen.getByText('No annotations yet')).toBeInTheDocument()
    expect(screen.getByText('Drop a pin on the canvas to start.')).toBeInTheDocument()
  })

  it('omits the body when none is passed', () => {
    render(<PanelEmptyState icon={MessageSquare} title="Empty" />)
    expect(screen.getByText('Empty')).toBeInTheDocument()
  })

  it('renders the action slot', () => {
    render(
      <PanelEmptyState
        icon={MessageSquare}
        title="Empty"
        action={<button type="button">Add</button>}
      />,
    )
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument()
  })
})
