export const GRID_SIZE_DEFAULT = 12
export const GRID_SNAP_THRESHOLD = 6
export const WALL_SNAP_THRESHOLD = 8
export const SEAT_DROP_THRESHOLD = 20

export const ZOOM_MIN = 0.1
export const ZOOM_MAX = 4.0
export const ZOOM_STEP = 0.1

export const UNDO_LIMIT = 50

export const ALIGNMENT_THRESHOLD = 5

export const GROUP_COLORS = [
  '#3B82F6', // blue
  '#EF4444', // red
  '#10B981', // emerald
  '#F59E0B', // amber
  '#8B5CF6', // violet
  '#EC4899', // pink
  '#06B6D4', // cyan
  '#F97316', // orange
  '#84CC16', // lime
  '#6366F1', // indigo
  '#14B8A6', // teal
  '#D946EF', // fuchsia
] as const

export const DEPARTMENT_COLORS = [
  '#3B82F6', // blue - Engineering
  '#8B5CF6', // violet - Design
  '#F59E0B', // amber - Marketing
  '#10B981', // emerald - Operations
  '#EF4444', // red - Sales
  '#EC4899', // pink - HR
  '#06B6D4', // cyan - Finance
  '#F97316', // orange - Legal
  '#84CC16', // lime - Support
  '#6366F1', // indigo - Product
  '#14B8A6', // teal - Data
  '#D946EF', // fuchsia - Executive
] as const

export const CURSOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
] as const

export const UNASSIGNED_SEAT_FILL = '#E5E7EB'
export const UNASSIGNED_SEAT_STROKE = '#9CA3AF'
export const CONFLICT_COLOR = '#DC2626'
export const ALIGNMENT_GUIDE_COLOR = '#FF00FF'

export const ELEMENT_DEFAULTS: Record<string, { width: number; height: number; fill: string; stroke: string }> = {
  'table-rect': { width: 120, height: 60, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-conference': { width: 240, height: 80, fill: '#F3F4F6', stroke: '#6B7280' },
  'chair': { width: 24, height: 24, fill: '#DBEAFE', stroke: '#3B82F6' },
  'desk': { width: 72, height: 48, fill: '#FEF3C7', stroke: '#D97706' },
  'counter': { width: 120, height: 36, fill: '#FEF3C7', stroke: '#D97706' },
  'custom-shape': { width: 100, height: 100, fill: '#F9FAFB', stroke: '#D1D5DB' },
  'divider': { width: 120, height: 4, fill: '#9CA3AF', stroke: '#6B7280' },
  'planter': { width: 40, height: 40, fill: '#D1FAE5', stroke: '#059669' },
  'hot-desk': { width: 72, height: 48, fill: '#FEF9C3', stroke: '#CA8A04' },
  'workstation': { width: 200, height: 60, fill: '#FEF3C7', stroke: '#D97706' },
  'private-office': { width: 120, height: 100, fill: '#EFF6FF', stroke: '#2563EB' },
  'conference-room': { width: 200, height: 140, fill: '#FEF3C7', stroke: '#F59E0B' },
  'phone-booth': { width: 60, height: 60, fill: '#F0FDF4', stroke: '#16A34A' },
  'common-area': { width: 160, height: 120, fill: '#DCFCE7', stroke: '#16A34A' },
}

export const TABLE_SEAT_DEFAULTS: Record<string, number> = {
  'table-rect': 6,
  'table-conference': 14,
}
