import type { CanvasElement } from '../types/elements'
import type { LayerCategory } from '../stores/layerVisibilityStore'

/**
 * Map an element to one of the five layer categories used by the visibility
 * panel. The function is total over `CanvasElement`: any unknown / future
 * element type falls through to `'furniture'`, which is the safest default
 * (hiding "furniture" leaves the map's structure — walls, rooms, seating —
 * intact) and avoids an exhaustiveness-check compile error when a new
 * element type is added without updating this file.
 *
 * The grouping is intentional, not arbitrary:
 *
 *   - `walls`       wall + door + window — the structural shell of a floor.
 *                   Hiding this usually reveals furniture arrangement.
 *   - `seating`     assignable desks + multi-seat workstations + private
 *                   offices — every element that owns an employee/desk id.
 *   - `rooms`       conference rooms, phone booths, common areas (kitchens,
 *                   lounges) — named non-assignable spaces.
 *   - `furniture`   tables, decor (couches, columns, etc.), custom SVG,
 *                   background images — visual/physical but not part of the
 *                   shell or assignment schema.
 *   - `annotations` drawing primitives + text + arrows — purely editorial
 *                   markup that doesn't represent a physical object.
 *
 * See `LayerCategory` for the canonical ordering the sidebar renders.
 */
export function categoryForElement(el: CanvasElement): LayerCategory {
  switch (el.type) {
    // Structural shell
    case 'wall':
    case 'door':
    case 'window':
      return 'walls'

    // Assignable seating
    case 'desk':
    case 'hot-desk':
    case 'workstation':
    case 'private-office':
      return 'seating'

    // Named rooms / areas
    case 'conference-room':
    case 'phone-booth':
    case 'common-area':
      return 'rooms'

    // Annotations: drawing primitives + free text + arrows
    case 'rect-shape':
    case 'ellipse':
    case 'line-shape':
    case 'arrow':
    case 'free-text':
    case 'text-label':
      return 'annotations'

    // Everything else is "furniture" — tables, decor, custom SVG uploads,
    // background images, plus legacy/unknown types via the default branch.
    case 'table-rect':
    case 'table-conference':
    case 'table-round':
    case 'table-oval':
    case 'decor':
    case 'custom-svg':
    case 'custom-shape':
    case 'background-image':
    case 'chair':
    case 'counter':
    case 'divider':
    case 'planter':
    // Furniture catalog — decorative/context props. See
    // `src/types/elements.ts`. Grouped under the "furniture" toggle so
    // hiding furniture also hides these.
    // falls through
    case 'sofa':
    case 'plant':
    case 'printer':
    case 'whiteboard':
      return 'furniture'

    default:
      // Unknown / future element types land here. Returning 'furniture'
      // keeps them visible under the most general toggle rather than
      // orphaning them under a missing category.
      return 'furniture'
  }
}
