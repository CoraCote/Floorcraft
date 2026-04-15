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

export const CURSOR_COLORS = [
  '#3B82F6', '#EF4444', '#10B981', '#F59E0B',
  '#8B5CF6', '#EC4899', '#06B6D4', '#F97316',
] as const

export const UNASSIGNED_SEAT_FILL = '#E5E7EB'
export const UNASSIGNED_SEAT_STROKE = '#9CA3AF'
export const CONFLICT_COLOR = '#DC2626'
export const ALIGNMENT_GUIDE_COLOR = '#FF00FF'

export const ELEMENT_DEFAULTS: Record<string, { width: number; height: number; fill: string; stroke: string }> = {
  'table-round': { width: 80, height: 80, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-rect': { width: 120, height: 60, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-banquet': { width: 200, height: 60, fill: '#F3F4F6', stroke: '#6B7280' },
  'table-conference': { width: 240, height: 80, fill: '#F3F4F6', stroke: '#6B7280' },
  'chair': { width: 24, height: 24, fill: '#DBEAFE', stroke: '#3B82F6' },
  'sofa': { width: 80, height: 36, fill: '#DBEAFE', stroke: '#3B82F6' },
  'stool': { width: 20, height: 20, fill: '#DBEAFE', stroke: '#3B82F6' },
  'desk': { width: 72, height: 48, fill: '#FEF3C7', stroke: '#D97706' },
  'counter': { width: 120, height: 36, fill: '#FEF3C7', stroke: '#D97706' },
  'podium': { width: 36, height: 36, fill: '#E0E7FF', stroke: '#4F46E5' },
  'lectern': { width: 30, height: 30, fill: '#E0E7FF', stroke: '#4F46E5' },
  'stage': { width: 240, height: 120, fill: '#FEE2E2', stroke: '#B91C1C' },
  'bar': { width: 160, height: 40, fill: '#FED7AA', stroke: '#C2410C' },
  'reception': { width: 100, height: 40, fill: '#D1FAE5', stroke: '#059669' },
  'dance-floor': { width: 200, height: 200, fill: '#EDE9FE', stroke: '#7C3AED' },
  'custom-shape': { width: 100, height: 100, fill: '#F9FAFB', stroke: '#D1D5DB' },
  'divider': { width: 120, height: 4, fill: '#9CA3AF', stroke: '#6B7280' },
  'planter': { width: 40, height: 40, fill: '#D1FAE5', stroke: '#059669' },
}

export const TABLE_SEAT_DEFAULTS: Record<string, number> = {
  'table-round': 8,
  'table-rect': 6,
  'table-banquet': 16,
  'table-conference': 14,
}
