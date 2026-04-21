import { Group, Rect, Text, Line } from 'react-konva'
import type { DeskElement, WorkstationElement, PrivateOfficeElement } from '../../../types/elements'
import { isDeskElement, isWorkstationElement } from '../../../types/elements'
import { useUIStore } from '../../../stores/uiStore'
import { useEmployeeStore } from '../../../stores/employeeStore'

interface DeskRendererProps {
  element: DeskElement | WorkstationElement | PrivateOfficeElement
}

export function DeskRenderer({ element }: DeskRendererProps) {
  const selectedIds = useUIStore((s) => s.selectedIds)
  const isSelected = selectedIds.includes(element.id)
  const employees = useEmployeeStore((s) => s.employees)
  const getDepartmentColor = useEmployeeStore((s) => s.getDepartmentColor)

  if (isDeskElement(element)) {
    return <DeskElementRenderer element={element} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
  }

  if (isWorkstationElement(element)) {
    return <WorkstationRenderer element={element} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
  }

  return <PrivateOfficeRenderer element={element as PrivateOfficeElement} isSelected={isSelected} employees={employees} getDepartmentColor={getDepartmentColor} />
}

// --- Desk / Hot-Desk ---

interface DeskElementRendererProps {
  element: DeskElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null }>
  getDepartmentColor: (department: string) => string
}

function DeskElementRenderer({ element, isSelected, employees, getDepartmentColor }: DeskElementRendererProps) {
  const employee = element.assignedEmployeeId ? employees[element.assignedEmployeeId] : null
  const departmentColor = employee?.department ? getDepartmentColor(employee.department) : null
  const isHotDesk = element.type === 'hot-desk'
  const fillColor = isHotDesk ? '#FEF9C3' : '#FEF3C7'
  const borderColor = isSelected ? '#3B82F6' : (departmentColor || '#9CA3AF')
  const borderDash = employee ? undefined : [4, 4]

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={fillColor}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : 1.5}
        cornerRadius={4}
        dash={borderDash}
        opacity={element.style.opacity}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 3}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {employee ? (
        <>
          {/* Employee name */}
          <Text
            text={employee.name}
            x={-element.width / 2 + 4}
            y={-5}
            width={element.width - 8}
            align="center"
            fontSize={11}
            fontStyle="bold"
            fill="#1F2937"
            listening={false}
          />
          {/* Department */}
          <Text
            text={employee.department || ''}
            x={-element.width / 2 + 4}
            y={8}
            width={element.width - 8}
            align="center"
            fontSize={9}
            fill="#6B7280"
            listening={false}
          />
        </>
      ) : (
        <Text
          text="Open"
          x={-element.width / 2 + 4}
          y={-4}
          width={element.width - 8}
          align="center"
          fontSize={11}
          fontStyle="italic"
          fill="#9CA3AF"
          listening={false}
        />
      )}
    </Group>
  )
}

// --- Workstation (bench style) ---

interface WorkstationRendererProps {
  element: WorkstationElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null }>
  getDepartmentColor: (department: string) => string
}

function WorkstationRenderer({ element, isSelected, employees, getDepartmentColor }: WorkstationRendererProps) {
  const slotWidth = element.width / element.positions
  const borderColor = isSelected ? '#3B82F6' : element.style.stroke

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill={element.style.fill}
        stroke={borderColor}
        strokeWidth={isSelected ? 2.5 : element.style.strokeWidth}
        cornerRadius={4}
        opacity={element.style.opacity}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 3}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {/* Divider lines between positions */}
      {Array.from({ length: element.positions - 1 }, (_, i) => {
        const lineX = -element.width / 2 + slotWidth * (i + 1)
        return (
          <Line
            key={`divider-${i}`}
            points={[lineX, -element.height / 2 + 14, lineX, element.height / 2 - 4]}
            stroke="#D1D5DB"
            strokeWidth={1}
            listening={false}
          />
        )
      })}

      {/* Position slots */}
      {Array.from({ length: element.positions }, (_, i) => {
        const employeeId = element.assignedEmployeeIds[i] || null
        const employee = employeeId ? employees[employeeId] : null
        const slotX = -element.width / 2 + slotWidth * i
        const deptColor = employee?.department ? getDepartmentColor(employee.department) : null

        return (
          <Group key={`slot-${i}`}>
            {/* Department color indicator dot */}
            {deptColor && (
              <Rect
                x={slotX + 2}
                y={element.height / 2 - 5}
                width={slotWidth - 4}
                height={2}
                fill={deptColor}
                cornerRadius={1}
                listening={false}
              />
            )}
            <Text
              text={employee ? employee.name.split(' ')[0] : 'Open'}
              x={slotX}
              y={-2}
              width={slotWidth}
              align="center"
              fontSize={10}
              fontStyle={employee ? 'normal' : 'italic'}
              fill={employee ? '#1F2937' : '#9CA3AF'}
              listening={false}
            />
          </Group>
        )
      })}
    </Group>
  )
}

// --- Private Office ---

interface PrivateOfficeRendererProps {
  element: PrivateOfficeElement
  isSelected: boolean
  employees: Record<string, { id: string; name: string; department: string | null }>
  getDepartmentColor: (department: string) => string
}

function PrivateOfficeRenderer({ element, isSelected, employees, getDepartmentColor }: PrivateOfficeRendererProps) {
  const assignedEmployees = element.assignedEmployeeIds
    .map((id) => employees[id])
    .filter(Boolean)
  const borderColor = isSelected ? '#3B82F6' : element.style.stroke
  const firstDeptColor = assignedEmployees[0]?.department
    ? getDepartmentColor(assignedEmployees[0].department)
    : null

  return (
    <Group rotation={element.rotation} listening={!element.locked}>
      <Rect
        x={-element.width / 2}
        y={-element.height / 2}
        width={element.width}
        height={element.height}
        fill="#EFF6FF"
        stroke={isSelected ? '#3B82F6' : (firstDeptColor || borderColor)}
        strokeWidth={isSelected ? 3 : 2}
        cornerRadius={6}
        opacity={element.style.opacity}
      />

      {/* Desk ID */}
      <Text
        text={element.deskId}
        x={-element.width / 2 + 4}
        y={-element.height / 2 + 4}
        width={element.width - 8}
        align="left"
        fontSize={9}
        fill="#9CA3AF"
        listening={false}
      />

      {assignedEmployees.length > 0 ? (
        <>
          {assignedEmployees.map((emp, i) => (
            <Text
              key={emp.id}
              text={emp.name}
              x={-element.width / 2 + 8}
              y={-8 + i * 16}
              width={element.width - 16}
              align="center"
              fontSize={12}
              fontStyle="bold"
              fill="#1E3A5F"
              listening={false}
            />
          ))}
        </>
      ) : (
        <Text
          text="Open"
          x={-element.width / 2 + 8}
          y={-4}
          width={element.width - 16}
          align="center"
          fontSize={12}
          fontStyle="italic"
          fill="#9CA3AF"
          listening={false}
        />
      )}
    </Group>
  )
}
