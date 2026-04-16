import { create } from 'zustand'
import { nanoid } from 'nanoid'
import type { Employee } from '../types/employee'
import { DEPARTMENT_COLORS } from '../lib/constants'

interface EmployeeState {
  employees: Record<string, Employee>
  departmentColors: Record<string, string>
  searchQuery: string
  filterBy: 'all' | 'unassigned' | 'new-hires'
  sortBy: 'name' | 'department' | 'status'

  // Actions
  addEmployee: (data: Partial<Employee> & { name: string }) => string
  addEmployees: (employees: Array<Omit<Employee, 'id' | 'createdAt'>>) => void
  updateEmployee: (id: string, updates: Partial<Employee>) => void
  removeEmployee: (id: string) => void
  removeEmployees: (ids: string[]) => void
  setEmployees: (employees: Record<string, Employee>) => void
  assignEmployeeToSeat: (employeeId: string, seatId: string, floorId: string) => void
  unassignEmployee: (employeeId: string) => void
  setSearchQuery: (query: string) => void
  setFilterBy: (filter: EmployeeState['filterBy']) => void
  setSortBy: (sort: EmployeeState['sortBy']) => void
  setDepartmentColor: (department: string, color: string) => void

  // Computed
  getAssignedCount: () => number
  getUnassignedEmployees: () => Employee[]
  getEmployeesBySeat: (seatId: string) => Employee[]
  getDepartmentColor: (department: string) => string
  getFilteredEmployees: () => Employee[]
  getNewHires: () => Employee[]
  getEmployeesByFloor: (floorId: string) => Employee[]
  getDirectReports: (managerId: string) => Employee[]
}

export const useEmployeeStore = create<EmployeeState>((set, get) => ({
  employees: {},
  departmentColors: {},
  searchQuery: '',
  filterBy: 'all',
  sortBy: 'name',

  addEmployee: (data) => {
    const id = nanoid()
    const employee: Employee = {
      id,
      name: data.name,
      email: data.email || '',
      department: data.department || null,
      team: data.team || null,
      title: data.title || null,
      managerId: data.managerId || null,
      employmentType: data.employmentType || 'full-time',
      officeDays: data.officeDays || [],
      startDate: data.startDate || null,
      endDate: data.endDate || null,
      equipmentNeeds: data.equipmentNeeds || [],
      equipmentStatus: data.equipmentStatus || 'not-needed',
      photoUrl: data.photoUrl || null,
      tags: data.tags || [],
      seatId: data.seatId || null,
      floorId: data.floorId || null,
      createdAt: new Date().toISOString(),
    }
    set((state) => ({
      employees: { ...state.employees, [id]: employee },
    }))
    if (employee.department) {
      get().getDepartmentColor(employee.department)
    }
    return id
  },

  addEmployees: (newEmployees) =>
    set((state) => {
      const next = { ...state.employees }
      const nextColors = { ...state.departmentColors }
      let colorIdx = Object.keys(nextColors).length

      for (const e of newEmployees) {
        const id = nanoid()
        next[id] = {
          id,
          name: e.name,
          email: e.email || '',
          department: e.department || null,
          team: e.team || null,
          title: e.title || null,
          managerId: e.managerId || null,
          employmentType: e.employmentType || 'full-time',
          officeDays: e.officeDays || [],
          startDate: e.startDate || null,
          endDate: e.endDate || null,
          equipmentNeeds: e.equipmentNeeds || [],
          equipmentStatus: e.equipmentStatus || 'not-needed',
          photoUrl: e.photoUrl || null,
          tags: e.tags || [],
          seatId: e.seatId || null,
          floorId: e.floorId || null,
          createdAt: new Date().toISOString(),
        }
        if (e.department && !nextColors[e.department]) {
          nextColors[e.department] = DEPARTMENT_COLORS[colorIdx % DEPARTMENT_COLORS.length]
          colorIdx++
        }
      }
      return { employees: next, departmentColors: nextColors }
    }),

  updateEmployee: (id, updates) =>
    set((state) => {
      const employee = state.employees[id]
      if (!employee) return state
      return { employees: { ...state.employees, [id]: { ...employee, ...updates } } }
    }),

  removeEmployee: (id) =>
    set((state) => {
      const { [id]: _, ...rest } = state.employees
      return { employees: rest }
    }),

  removeEmployees: (ids) =>
    set((state) => {
      const next = { ...state.employees }
      for (const id of ids) delete next[id]
      return { employees: next }
    }),

  setEmployees: (employees) => set({ employees }),

  assignEmployeeToSeat: (employeeId, seatId, floorId) =>
    set((state) => {
      const employee = state.employees[employeeId]
      if (!employee) return state
      return {
        employees: {
          ...state.employees,
          [employeeId]: { ...employee, seatId, floorId },
        },
      }
    }),

  unassignEmployee: (employeeId) =>
    set((state) => {
      const employee = state.employees[employeeId]
      if (!employee) return state
      return {
        employees: {
          ...state.employees,
          [employeeId]: { ...employee, seatId: null, floorId: null },
        },
      }
    }),

  setSearchQuery: (query) => set({ searchQuery: query }),
  setFilterBy: (filter) => set({ filterBy: filter }),
  setSortBy: (sort) => set({ sortBy: sort }),
  setDepartmentColor: (department, color) =>
    set((state) => ({
      departmentColors: { ...state.departmentColors, [department]: color },
    })),

  getAssignedCount: () =>
    Object.values(get().employees).filter((e) => e.seatId !== null).length,

  getUnassignedEmployees: () =>
    Object.values(get().employees).filter((e) => e.seatId === null),

  getEmployeesBySeat: (seatId) =>
    Object.values(get().employees).filter((e) => e.seatId === seatId),

  getDepartmentColor: (department) => {
    const state = get()
    if (state.departmentColors[department]) return state.departmentColors[department]
    const colorIdx = Object.keys(state.departmentColors).length
    const color = DEPARTMENT_COLORS[colorIdx % DEPARTMENT_COLORS.length]
    set((s) => ({ departmentColors: { ...s.departmentColors, [department]: color } }))
    return color
  },

  getFilteredEmployees: () => {
    const state = get()
    let employees = Object.values(state.employees)

    // Apply filterBy
    if (state.filterBy === 'unassigned') {
      employees = employees.filter((e) => e.seatId === null)
    } else if (state.filterBy === 'new-hires') {
      const thirtyDaysAgo = new Date()
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
      employees = employees.filter((e) => {
        if (!e.startDate) return false
        return new Date(e.startDate) >= thirtyDaysAgo
      })
    }

    // Apply search query
    if (state.searchQuery) {
      const q = state.searchQuery.toLowerCase()
      employees = employees.filter(
        (e) =>
          e.name.toLowerCase().includes(q) ||
          (e.email && e.email.toLowerCase().includes(q)) ||
          (e.department && e.department.toLowerCase().includes(q)) ||
          (e.team && e.team.toLowerCase().includes(q)) ||
          (e.title && e.title.toLowerCase().includes(q)) ||
          e.tags.some((t) => t.toLowerCase().includes(q))
      )
    }

    // Sort
    employees.sort((a, b) => {
      switch (state.sortBy) {
        case 'name':
          return a.name.localeCompare(b.name)
        case 'department':
          return (a.department || '').localeCompare(b.department || '')
        case 'status':
          return (a.seatId ? 1 : 0) - (b.seatId ? 1 : 0)
        default:
          return 0
      }
    })

    return employees
  },

  getNewHires: () => {
    const thirtyDaysAgo = new Date()
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30)
    return Object.values(get().employees).filter((e) => {
      if (!e.startDate) return false
      return new Date(e.startDate) >= thirtyDaysAgo
    })
  },

  getEmployeesByFloor: (floorId) =>
    Object.values(get().employees).filter((e) => e.floorId === floorId),

  getDirectReports: (managerId) =>
    Object.values(get().employees).filter((e) => e.managerId === managerId),
}))
