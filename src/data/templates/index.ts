import type { CanvasElement } from '../../types/elements'
import type { CanvasSettings } from '../../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'
import { createOpenPlanOfficeTemplate } from './open-plan-office'
import { createMixedOfficeTemplate } from './mixed-office'
import { createExecutiveFloorTemplate } from './executive-floor'

export interface Template {
  id: string
  name: string
  category: 'office'
  description: string
  createElements: () => CanvasElement[]
  canvasSettings: CanvasSettings
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    category: 'office',
    description: 'Start from scratch',
    createElements: () => [],
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'open-plan-office',
    name: 'Open Plan Office',
    category: 'office',
    description: '~40 desks in clusters, 2 conference rooms, phone booths, kitchen',
    createElements: createOpenPlanOfficeTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'mixed-office',
    name: 'Mixed Office',
    category: 'office',
    description: '6 private offices, ~30 open desks, conference rooms, reception',
    createElements: createMixedOfficeTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'executive-floor',
    name: 'Executive Floor',
    category: 'office',
    description: '12 private offices, boardroom, executive lounge, admin desks',
    createElements: createExecutiveFloorTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
]
