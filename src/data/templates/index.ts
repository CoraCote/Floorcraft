import type { CanvasElement } from '../../types/elements'
import type { CanvasSettings } from '../../types/project'
import { DEFAULT_CANVAS_SETTINGS } from '../../types/project'
import { createWeddingReceptionTemplate } from './wedding-reception'
import { createCorporateBoardroomTemplate } from './corporate-boardroom'
import { createFineDiningTemplate } from './fine-dining'

export interface Template {
  id: string
  name: string
  category: 'wedding' | 'corporate' | 'restaurant' | 'classroom' | 'concert'
  description: string
  createElements: () => CanvasElement[]
  canvasSettings: CanvasSettings
}

export const TEMPLATES: Template[] = [
  {
    id: 'blank',
    name: 'Blank Canvas',
    category: 'wedding',
    description: 'Start from scratch',
    createElements: () => [],
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'wedding-reception',
    name: 'Wedding Reception',
    category: 'wedding',
    description: '10 round tables, head table, dance floor, stage, bar',
    createElements: createWeddingReceptionTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'corporate-boardroom',
    name: 'Corporate Boardroom',
    category: 'corporate',
    description: 'Conference table for 14, podium, projection screen',
    createElements: createCorporateBoardroomTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
  {
    id: 'fine-dining',
    name: 'Fine Dining',
    category: 'restaurant',
    description: '2-tops, 4-tops, banquet, bar, hostess station',
    createElements: createFineDiningTemplate,
    canvasSettings: DEFAULT_CANVAS_SETTINGS,
  },
]
