import { describe, it, expect, beforeEach } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter, Route, Routes } from 'react-router-dom'
import { RosterPage } from '../components/editor/RosterPage'
import { useEmployeeStore } from '../stores/employeeStore'
import { useElementsStore } from '../stores/elementsStore'
import { useFloorStore } from '../stores/floorStore'
import { useProjectStore } from '../stores/projectStore'
import type { Employee } from '../types/employee'

function emp(over: Partial<Employee> & { id: string; name: string }): Employee {
  return {
    id: over.id,
    name: over.name,
    email: over.email ?? '',
    department: over.department ?? null,
    team: over.team ?? null,
    title: over.title ?? null,
    managerId: over.managerId ?? null,
    employmentType: over.employmentType ?? 'full-time',
    status: over.status ?? 'active',
    officeDays: over.officeDays ?? [],
    startDate: over.startDate ?? null,
    endDate: over.endDate ?? null,
    equipmentNeeds: over.equipmentNeeds ?? [],
    equipmentStatus: over.equipmentStatus ?? 'not-needed',
    photoUrl: over.photoUrl ?? null,
    tags: over.tags ?? [],
    seatId: over.seatId ?? null,
    floorId: over.floorId ?? null,
    createdAt: over.createdAt ?? new Date().toISOString(),
    leaveType: over.leaveType ?? null,
    expectedReturnDate: over.expectedReturnDate ?? null,
    coverageEmployeeId: over.coverageEmployeeId ?? null,
    leaveNotes: over.leaveNotes ?? null,
    departureDate: over.departureDate ?? null,
  } as Employee
}

function withinNextDays(offset: number) {
  const d = new Date()
  d.setDate(d.getDate() + offset)
  return d.toISOString().slice(0, 10)
}

beforeEach(() => {
  useElementsStore.setState({ elements: {} })
  useFloorStore.setState({
    floors: [{ id: 'f1', name: 'Floor 1', order: 0, elements: {} }],
    activeFloorId: 'f1',
  } as never)
  useEmployeeStore.setState({
    employees: {
      e1: emp({ id: 'e1', name: 'Alice', departureDate: withinNextDays(10) }),
      e2: emp({ id: 'e2', name: 'Bob' }),
      e3: emp({ id: 'e3', name: 'Carol', departureDate: withinNextDays(120) }),
    },
    departmentColors: {},
  } as never)
  useProjectStore.setState({ currentOfficeRole: 'editor' } as never)
})

function renderRoster() {
  return render(
    <MemoryRouter initialEntries={['/t/t1/o/o1/roster']}>
      <Routes>
        <Route path="/t/:teamSlug/o/:officeSlug/roster" element={<RosterPage />} />
      </Routes>
    </MemoryRouter>,
  )
}

// The status <select> includes an `<option>departed</option>` in every row,
// which jsdom folds into `.textContent`. So `/depart/` matches the whole row
// regardless of whether a badge is present. We identify the actual badge by
// its title attribute ("Departure date: …"), which is only set on the
// DepartingSoonBadge pill — never on surrounding chrome.
function findDepartureBadge(row: HTMLElement | null | undefined) {
  if (!row) return null
  return row.querySelector('[title^="Departure date:"]')
}

describe('Scheduled departure', () => {
  it('renders a "Departing" badge on rows with a near-future departureDate', () => {
    renderRoster()
    const row = screen.getByText('Alice').closest('tr')
    const badge = findDepartureBadge(row)
    expect(badge).not.toBeNull()
    expect(badge?.textContent?.toLowerCase()).toMatch(/depart/)
  })

  it('does not render a badge on rows without departureDate', () => {
    renderRoster()
    const row = screen.getByText('Bob').closest('tr')
    expect(findDepartureBadge(row)).toBeNull()
  })

  it('"Departing soon" filter chip narrows the table to upcoming departures within 30 days', () => {
    renderRoster()
    const chip = screen.getByRole('button', { name: /departing soon/i })
    act(() => {
      fireEvent.click(chip)
    })
    expect(screen.getByText('Alice')).toBeInTheDocument()
    expect(screen.queryByText('Bob')).not.toBeInTheDocument()
    expect(screen.queryByText('Carol')).not.toBeInTheDocument()
  })
})
