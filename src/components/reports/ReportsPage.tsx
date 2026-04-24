import { useMemo } from 'react'
import { useFloorStore } from '../../stores/floorStore'
import { useVisibleEmployees } from '../../hooks/useVisibleEmployees'
import { useCan } from '../../hooks/useCan'
import {
  floorUtilization,
  departmentHeadcount,
  unassignedEmployees,
} from '../../lib/reports/calculations'
import { utilizationCsv, headcountCsv, unassignedCsv, downloadCsv } from '../../lib/reports/csvExport'
import { UtilizationBar } from './UtilizationBar'

export function ReportsPage() {
  const canView = useCan('viewReports')
  const floors = useFloorStore((s) => s.floors)
  // Headcount still counts accurately (redaction preserves id/seatId/
  // department/status), but the unassigned table renders initials + blank
  // email so a viewer-role report consumer sees the same GDPR-safe view
  // as on the roster.
  const employees = useVisibleEmployees()

  const utilRows = useMemo(() => floorUtilization(floors), [floors])
  const deptRows = useMemo(() => departmentHeadcount(employees), [employees])
  const unassignedRows = useMemo(() => unassignedEmployees(employees), [employees])

  if (!canView) {
    return <div className="p-6 text-gray-600">Not authorized to view reports.</div>
  }

  return (
    <div className="p-6 space-y-6 max-w-5xl">
      <Card
        title="Floor utilization"
        onExport={() => downloadCsv('floor-utilization.csv', utilizationCsv(utilRows))}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className="py-2">Floor</th>
              <th>Assigned</th>
              <th>Capacity</th>
              <th className="w-1/3">Utilization</th>
            </tr>
          </thead>
          <tbody>
            {utilRows.map((r) => (
              <tr key={r.floorId} className="border-b border-gray-100">
                <td className="py-2">{r.floorName}</td>
                <td>{r.assigned}</td>
                <td>{r.capacity}</td>
                <td>
                  <div className="flex items-center gap-2">
                    <UtilizationBar percent={r.percent} />
                    <span className="text-xs text-gray-500 tabular-nums w-12 text-right">
                      {r.percent.toFixed(1)}%
                    </span>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title="Department headcount"
        onExport={() => downloadCsv('department-headcount.csv', headcountCsv(deptRows))}
      >
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left border-b border-gray-200">
              <th className="py-2">Department</th>
              <th>Count</th>
              <th>Assigned</th>
              <th>Assignment rate</th>
            </tr>
          </thead>
          <tbody>
            {deptRows.map((r) => (
              <tr key={r.department} className="border-b border-gray-100">
                <td className="py-2">{r.department}</td>
                <td>{r.count}</td>
                <td>{r.assigned}</td>
                <td>{r.assignmentRate.toFixed(1)}%</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <Card
        title={`Unassigned (${unassignedRows.length})`}
        onExport={() => downloadCsv('unassigned.csv', unassignedCsv(unassignedRows))}
      >
        {unassignedRows.length === 0 ? (
          <p className="text-sm text-gray-500">Everyone active has a seat.</p>
        ) : (
          <ul className="text-sm divide-y divide-gray-100 max-h-64 overflow-y-auto">
            {unassignedRows.map((r) => (
              <li key={r.id} className="py-1.5 flex items-center justify-between">
                <span>{r.name}</span>
                <span className="text-xs text-gray-500">{r.department ?? '—'}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function Card({ title, onExport, children }: { title: string; onExport: () => void; children: React.ReactNode }) {
  return (
    <section className="bg-white border border-gray-200 rounded p-4">
      <div className="flex items-center justify-between mb-3">
        <h2 className="text-base font-semibold">{title}</h2>
        <button
          onClick={onExport}
          className="text-xs px-2 py-1 border border-gray-200 rounded hover:bg-gray-50"
        >
          Export CSV
        </button>
      </div>
      {children}
    </section>
  )
}
