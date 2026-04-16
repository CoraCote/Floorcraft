import type React from 'react'
import type { CanvasElement, DeskElement, PrivateOfficeElement, DecorElement } from '../../../../types/elements'
import { TableRoundShape } from './TableRoundShape'
import { TableOvalShape } from './TableOvalShape'
import { DeskLShape } from './DeskLShape'
import { DeskCubicleShape } from './DeskCubicleShape'
import { PrivateOfficeUShape } from './PrivateOfficeUShape'
import { DecorArmchair } from './DecorArmchair'
import { DecorCouch } from './DecorCouch'
import { DecorReception } from './DecorReception'
import { DecorKitchenCounter } from './DecorKitchenCounter'
import { DecorFridge } from './DecorFridge'
import { DecorWhiteboard } from './DecorWhiteboard'
import { DecorColumn } from './DecorColumn'
import { DecorStairs } from './DecorStairs'
import { DecorElevator } from './DecorElevator'

/**
 * Returns a shape-variant renderer when a custom silhouette exists for this
 * type+shape combo, otherwise returns null (caller falls back to the
 * default rectangular renderer).
 */
export function getShapeRenderer(el: CanvasElement): React.FC<{ element: CanvasElement }> | null {
  // Tables
  if (el.type === 'table-round') return TableRoundShape as unknown as React.FC<{ element: CanvasElement }>
  if (el.type === 'table-oval')  return TableOvalShape  as unknown as React.FC<{ element: CanvasElement }>

  // Desks
  if ((el.type === 'desk' || el.type === 'hot-desk') && (el as DeskElement).shape === 'l-shape')
    return DeskLShape as unknown as React.FC<{ element: CanvasElement }>
  if ((el.type === 'desk' || el.type === 'hot-desk') && (el as DeskElement).shape === 'cubicle')
    return DeskCubicleShape as unknown as React.FC<{ element: CanvasElement }>

  // Private office
  if (el.type === 'private-office' && (el as PrivateOfficeElement).shape === 'u-shape')
    return PrivateOfficeUShape as unknown as React.FC<{ element: CanvasElement }>

  // Decor
  if (el.type === 'decor') {
    const shape = (el as DecorElement).shape
    switch (shape) {
      case 'armchair':        return DecorArmchair        as unknown as React.FC<{ element: CanvasElement }>
      case 'couch':           return DecorCouch           as unknown as React.FC<{ element: CanvasElement }>
      case 'reception':       return DecorReception       as unknown as React.FC<{ element: CanvasElement }>
      case 'kitchen-counter': return DecorKitchenCounter  as unknown as React.FC<{ element: CanvasElement }>
      case 'fridge':          return DecorFridge          as unknown as React.FC<{ element: CanvasElement }>
      case 'whiteboard':      return DecorWhiteboard      as unknown as React.FC<{ element: CanvasElement }>
      case 'column':          return DecorColumn          as unknown as React.FC<{ element: CanvasElement }>
      case 'stairs':          return DecorStairs          as unknown as React.FC<{ element: CanvasElement }>
      case 'elevator':        return DecorElevator        as unknown as React.FC<{ element: CanvasElement }>
    }
  }

  return null
}
