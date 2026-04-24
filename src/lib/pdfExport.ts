import { jsPDF } from 'jspdf'
import type Konva from 'konva'
import type { CanvasElement, ElementType } from '../types/elements'
import type { Floor } from '../types/floor'
import type { Employee } from '../types/employee'
import type { CanvasSettings } from '../types/project'
import { categoryForElement } from './layerCategory'

/**
 * Wayfinding PDF export — a one-page A4 landscape hand-out with title,
 * timestamp, scale indicator, a legend of element types, and a rasterised
 * snapshot of the floor plan. Separate from `exportPdf` (which is a pure
 * full-bleed canvas dump used by the Export modal) because facilities-
 * manager print-outs want the legend + header chrome, but the existing
 * dialog export does not.
 *
 * Intentionally raster-only: generating a vector PDF would require
 * re-rendering every canvas shape into jspdf primitives, which is high-
 * effort for a first version — YAGNI.
 */

export interface LegendEntry {
  /** Canonical element type (e.g. `"desk"`, `"wall"`). */
  type: ElementType | 'assigned-seats'
  /** Friendly label, e.g. `"Desk"`. */
  label: string
  /** Number of matching elements on the floor. */
  count: number
}

const ELEMENT_LABELS: Partial<Record<ElementType | 'assigned-seats', string>> = {
  wall: 'Wall',
  door: 'Door',
  window: 'Window',
  desk: 'Desk',
  'hot-desk': 'Hot desk',
  workstation: 'Workstation',
  'private-office': 'Private office',
  'conference-room': 'Conference room',
  'phone-booth': 'Phone booth',
  'common-area': 'Common area',
  chair: 'Chair',
  counter: 'Counter',
  'table-rect': 'Table',
  'table-conference': 'Conference table',
  'table-round': 'Round table',
  'table-oval': 'Oval table',
  divider: 'Divider',
  planter: 'Planter',
  'custom-shape': 'Custom shape',
  'background-image': 'Background image',
  decor: 'Decor',
  'custom-svg': 'Custom SVG',
  'assigned-seats': 'Assigned seats',
}

function humanize(type: ElementType | 'assigned-seats'): string {
  return ELEMENT_LABELS[type] ?? type
}

/**
 * Build the legend for a wayfinding PDF.
 *
 * Annotations (text labels, arrows, drawing primitives) are filtered out
 * because they aren't physical objects worth counting on a handout — they
 * are editorial overlay for the planner. Same rule as the layer-visibility
 * panel's "annotations" category.
 *
 * Entries are sorted by count descending, then alphabetically by type so
 * the legend reads "biggest-category first" with a stable tie-break.
 */
export function buildLegend(
  elements: CanvasElement[],
  employees: Employee[] = [],
): LegendEntry[] {
  const counts = new Map<ElementType, number>()
  for (const el of elements) {
    if (categoryForElement(el) === 'annotations') continue
    counts.set(el.type, (counts.get(el.type) ?? 0) + 1)
  }

  const entries: LegendEntry[] = Array.from(counts.entries()).map(
    ([type, count]) => ({ type, label: humanize(type), count }),
  )

  // Virtual "assigned seats" entry when we have roster data.
  if (employees.length > 0) {
    const assigned = employees.filter((e) => e.seatId !== null).length
    if (assigned > 0) {
      entries.push({
        type: 'assigned-seats',
        label: humanize('assigned-seats'),
        count: assigned,
      })
    }
  }

  entries.sort((a, b) => {
    if (b.count !== a.count) return b.count - a.count
    return a.label.localeCompare(b.label)
  })
  return entries
}

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isoDate(d: Date): string {
  // Use UTC to avoid timezone drift in filenames — two managers in
  // different TZs printing within the same minute should get the same name.
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * `<project-slug>-<floor-name>-<yyyy-mm-dd>.pdf`. Both name components
 * are slugified. If both slugify to empty we fall back to `"floorplan"`
 * so the download still has a sensible name.
 */
export function buildFileName(
  projectName: string,
  floorName: string,
  now: Date = new Date(),
): string {
  const parts = [slugify(projectName), slugify(floorName)].filter((p) => p.length > 0)
  const base = parts.length > 0 ? parts.join('-') : 'floorplan'
  return `${base}-${isoDate(now)}.pdf`
}

export interface BuildWayfindingPdfOptions {
  stage: Konva.Stage
  projectName: string
  floor: Pick<Floor, 'name'>
  elements: CanvasElement[]
  employees: Employee[]
  canvasSettings: CanvasSettings
  /** Override "now" for deterministic tests and filenames. */
  now?: Date
}

/**
 * Render a one-page A4 landscape wayfinding PDF. Returns a `Blob` so the
 * caller can either trigger a download or embed it (e.g. email attachment)
 * without buildWayfindingPdf knowing about the DOM.
 */
export function buildWayfindingPdf(opts: BuildWayfindingPdfOptions): Blob {
  const {
    stage,
    projectName,
    floor,
    elements,
    employees,
    canvasSettings,
    now = new Date(),
  } = opts

  // 2x pixel ratio keeps the rasterised canvas crisp when scaled to half
  // the A4 width without ballooning the PDF size. Higher DPI is a future
  // nicety; start small to keep print times snappy.
  const dataUrl = stage.toDataURL({ pixelRatio: 2 })

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()

  const marginX = 28
  const marginY = 28

  // --- Title ---
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(`${projectName} — ${floor.name}`, marginX, marginY + 12)

  // --- Metadata row: timestamp + scale indicator ---
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  const timestamp = now.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
  doc.text(`Generated ${timestamp}`, marginX, marginY + 28)

  // Scale: `1 canvas unit × scale` = one real unit. Express as a compact
  // fraction a facilities manager can sanity-check against a ruler.
  const scaleLabel = `Scale: 1 ${canvasSettings.scaleUnit} ≈ ${
    canvasSettings.scale > 0 ? (1 / canvasSettings.scale).toFixed(1) : '—'
  } px`
  doc.text(scaleLabel, marginX, marginY + 42)

  // --- Legend column (right side) ---
  const legend = buildLegend(elements, employees)
  const legendColWidth = 180
  const legendX = pageWidth - marginX - legendColWidth
  const legendTop = marginY + 12

  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('Legend', legendX, legendTop)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(50, 50, 50)

  let cursorY = legendTop + 16
  const rowHeight = 13
  for (const entry of legend) {
    doc.text(`${entry.label}`, legendX, cursorY)
    doc.text(`${entry.count}`, legendX + legendColWidth - 10, cursorY, )
    cursorY += rowHeight
  }
  if (legend.length === 0) {
    doc.setTextColor(140, 140, 140)
    doc.text('No elements', legendX, cursorY)
  }

  // --- Floor-plan image ---
  // Reserve room to the left of the legend for the canvas snapshot.
  const imgTop = marginY + 54
  const imgLeft = marginX
  const imgWidth = pageWidth - marginX * 2 - legendColWidth - 20
  const imgHeight = pageHeight - imgTop - marginY

  doc.setDrawColor(200, 200, 200)
  doc.rect(imgLeft, imgTop, imgWidth, imgHeight)
  doc.addImage(dataUrl, 'PNG', imgLeft, imgTop, imgWidth, imgHeight)

  return doc.output('blob') as Blob
}
