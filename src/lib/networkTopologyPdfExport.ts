import { jsPDF } from 'jspdf'
import {
  TOPOLOGY_NODE_TYPES,
  TOPOLOGY_EDGE_TYPES,
  type NetworkTopology,
  type TopologyNode,
  type TopologyEdge,
  type TopologyNodeType,
  type TopologyEdgeType,
} from '../types/networkTopology'

/**
 * M6.4 — Network Topology PDF export.
 *
 * Produces a vendor-handoff document from the contents of the network
 * topology page (`/t/:teamSlug/o/:officeSlug/network`). The audience is
 * an IT supplier or Meraki integrator who needs:
 *
 *   1. A picture of the network — the same logical diagram the planner
 *      sees on the canvas, rasterised so it survives email + print.
 *   2. A device inventory they can quote against — node label, type,
 *      vendor/model/SKU/serial, status, and any floor-plan linkage so
 *      they know "AP-12 lives on the engineering loft".
 *   3. A connection manifest — what plugs into what, with the typed
 *      cable vocabulary (`10G SFP+`, `PoE`, `WAN`, etc.) so the supplier
 *      can pull the right SKUs without playing telephone over Slack.
 *   4. A legend — node color/icon vocabulary + edge stroke vocabulary,
 *      so a vendor reading the diagram cold doesn't need an internal
 *      glossary.
 *   5. A footer with timestamp + topology id for audit / re-orders.
 *
 * # Why a pure builder
 *
 * Capturing the canvas image is DOM-bound (react-flow lives in
 * `<div>`s). Building the PDF doesn't need to be — the builder takes a
 * pre-captured image data URL as an optional input, so tests can call
 * it without mounting react-flow + html-to-image. The DOM capture
 * lives in `captureTopologyImage.ts`; the page glues them together.
 *
 * Mirrors the wayfinding PDF idiom in `pdfExport.ts` (A4 landscape,
 * 28pt margins, raster image + tables) so a user moving between the
 * two exports sees a consistent visual language.
 */

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

export interface BuildNetworkTopologyPdfOptions {
  topology: NetworkTopology
  /**
   * Project / office name shown in the page title. The page already
   * has access to `useProjectStore.projectName`; this stays an explicit
   * input so the builder is independently testable.
   */
  projectName: string
  /**
   * Captured topology canvas as a data URL (PNG). Pass `null` to skip
   * the diagram section — the inventory + connections tables are still
   * useful on their own (e.g. when html-to-image fails or in a tests).
   */
  imageDataUrl: string | null
  /**
   * Aspect ratio of the captured image (width / height). Used to scale
   * the embedded diagram into the page bounds without distortion. If
   * omitted we fall back to the diagram's reserved area aspect ratio,
   * which matches the canvas card on the page (~2:1).
   */
  imageAspect?: number
  /**
   * Optional resolver for `node.floorElementId` → friendly location
   * label, e.g. `"AP-12 on Engineering loft"`. The page wires this to
   * its floors store; tests pass a no-op.
   */
  floorElementLabel?: (elementId: string) => string | null
  /** Override "now" for deterministic filenames + timestamp tests. */
  now?: Date
}

export interface NetworkTopologyPdfResult {
  blob: Blob
  fileName: string
}

/**
 * Build the PDF blob + a download filename. Called from the page when
 * the user clicks "Export PDF" — the page handles the actual capture
 * and download trigger.
 */
export function buildNetworkTopologyPdf(
  opts: BuildNetworkTopologyPdfOptions,
): NetworkTopologyPdfResult {
  const {
    topology,
    projectName,
    imageDataUrl,
    imageAspect,
    floorElementLabel,
    now = new Date(),
  } = opts

  const doc = new jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' })
  const pageWidth = doc.internal.pageSize.getWidth()
  const pageHeight = doc.internal.pageSize.getHeight()
  const marginX = 28
  const marginY = 28
  const contentWidth = pageWidth - marginX * 2

  // ---- Page 1: header + diagram + legend ---------------------------------

  drawHeader(doc, projectName, topology, now, marginX, marginY)

  // Reserve the right column for the legend so a vendor sees the icon
  // vocabulary alongside the diagram. Mirrors `pdfExport.ts`'s layout.
  const legendColWidth = 180
  const legendX = pageWidth - marginX - legendColWidth
  const legendTop = marginY + 64

  drawLegend(doc, topology, legendX, legendTop, legendColWidth)

  // Diagram fills the left column.
  const diagramTop = marginY + 64
  const diagramLeft = marginX
  const diagramWidth = contentWidth - legendColWidth - 20
  const diagramHeightCap = pageHeight - diagramTop - marginY

  if (imageDataUrl) {
    const aspect = imageAspect && imageAspect > 0 ? imageAspect : diagramWidth / diagramHeightCap
    // Fit the image inside the reserved box without distortion. The
    // smaller of "as wide as the column" and "as tall as the column /
    // aspect" wins — guarantees the entire diagram is visible.
    let drawWidth = diagramWidth
    let drawHeight = drawWidth / aspect
    if (drawHeight > diagramHeightCap) {
      drawHeight = diagramHeightCap
      drawWidth = drawHeight * aspect
    }
    doc.setDrawColor(220, 220, 220)
    doc.rect(diagramLeft, diagramTop, drawWidth, drawHeight)
    doc.addImage(imageDataUrl, 'PNG', diagramLeft, diagramTop, drawWidth, drawHeight)
  } else {
    // No image → leave a placeholder note so the layout doesn't
    // collapse and the reader knows it isn't missing.
    doc.setDrawColor(220, 220, 220)
    doc.setFillColor(248, 250, 252)
    doc.rect(diagramLeft, diagramTop, diagramWidth, 200, 'FD')
    doc.setTextColor(140, 140, 140)
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.text(
      'Diagram unavailable in this export.',
      diagramLeft + diagramWidth / 2,
      diagramTop + 100,
      { align: 'center' },
    )
  }

  // ---- Page 2+: device inventory + connections ---------------------------

  doc.addPage('a4', 'landscape')
  drawHeader(doc, projectName, topology, now, marginX, marginY)

  const tablesTop = marginY + 64
  const cursorAfterDevices = drawDeviceInventory(
    doc,
    topology,
    floorElementLabel,
    marginX,
    tablesTop,
    contentWidth,
    pageHeight,
    marginY,
    projectName,
    now,
  )

  // Leave a 28pt gap between tables; if not enough room, push to a new
  // page. The connection table draws its own header on overflow.
  let connectionsTop = cursorAfterDevices + 28
  if (connectionsTop > pageHeight - marginY - 80) {
    doc.addPage('a4', 'landscape')
    drawHeader(doc, projectName, topology, now, marginX, marginY)
    connectionsTop = marginY + 64
  }

  drawConnections(
    doc,
    topology,
    marginX,
    connectionsTop,
    contentWidth,
    pageHeight,
    marginY,
    projectName,
    now,
  )

  // ---- Footer on every page ----------------------------------------------

  const totalPages = doc.getNumberOfPages()
  for (let i = 1; i <= totalPages; i++) {
    doc.setPage(i)
    drawFooter(doc, topology, i, totalPages, now, marginX, pageWidth, pageHeight, marginY)
  }

  const fileName = buildTopologyFileName(projectName, now)
  return { blob: doc.output('blob') as Blob, fileName }
}

// ---------------------------------------------------------------------------
// Header / footer
// ---------------------------------------------------------------------------

function drawHeader(
  doc: jsPDF,
  projectName: string,
  topology: NetworkTopology,
  now: Date,
  marginX: number,
  marginY: number,
): void {
  doc.setFontSize(18)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text(`${projectName} — Network topology`, marginX, marginY + 12)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(90, 90, 90)
  doc.text(`Generated ${formatTimestamp(now)}`, marginX, marginY + 28)

  const nodeCount = Object.keys(topology.nodes).length
  const edgeCount = Object.keys(topology.edges).length
  doc.text(
    `${nodeCount} device${nodeCount === 1 ? '' : 's'}, ${edgeCount} connection${
      edgeCount === 1 ? '' : 's'
    }`,
    marginX,
    marginY + 42,
  )
}

function drawFooter(
  doc: jsPDF,
  topology: NetworkTopology,
  pageNum: number,
  totalPages: number,
  now: Date,
  marginX: number,
  pageWidth: number,
  pageHeight: number,
  marginY: number,
): void {
  doc.setFontSize(8)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(140, 140, 140)
  // Left: topology id (audit / re-order) + timestamp.
  doc.text(
    `${topology.id} · ${formatTimestamp(now)}`,
    marginX,
    pageHeight - marginY + 14,
  )
  // Right: page number.
  doc.text(
    `Page ${pageNum} of ${totalPages}`,
    pageWidth - marginX,
    pageHeight - marginY + 14,
    { align: 'right' },
  )
}

// ---------------------------------------------------------------------------
// Legend
// ---------------------------------------------------------------------------

const NODE_TYPE_LABEL: Record<TopologyNodeType, string> = {
  isp: 'ISP',
  'wan-switch': 'WAN switch',
  firewall: 'Firewall',
  cloud: 'Cloud',
  'core-switch': 'Core switch',
  'edge-switch': 'Edge switch',
  'access-point': 'Access point',
  'endpoint-group': 'Endpoints',
}

// Hex colors used in `topologyMeta.ts` for the canvas accents — duplicated
// here as RGB tuples because jsPDF doesn't accept Tailwind class names. If
// these drift from `NODE_META.accent`, the PDF legend stops matching the
// canvas and a vendor reading both side-by-side gets confused. Worth
// holding the line on this contract — see the top of `topologyMeta.ts`.
const NODE_TYPE_RGB: Record<TopologyNodeType, [number, number, number]> = {
  isp: [6, 182, 212],
  'wan-switch': [14, 165, 233],
  firewall: [244, 63, 94],
  cloud: [20, 184, 166],
  'core-switch': [139, 92, 246],
  'edge-switch': [59, 130, 246],
  'access-point': [16, 185, 129],
  'endpoint-group': [156, 163, 175],
}

const EDGE_TYPE_LABEL: Record<TopologyEdgeType, string> = {
  wan: 'WAN circuit',
  'sfp-10g': '10G SFP+ uplink',
  'fiber-10g': '10G fiber backbone',
  'sfp-distribution': '10G SFP+ distribution',
  poe: 'PoE + data',
  'cloud-mgmt': 'Cloud management',
}

const EDGE_TYPE_RGB: Record<TopologyEdgeType, [number, number, number]> = {
  wan: [6, 182, 212],
  'sfp-10g': [59, 130, 246],
  'fiber-10g': [34, 197, 94],
  'sfp-distribution': [139, 92, 246],
  poe: [96, 165, 250],
  'cloud-mgmt': [20, 184, 166],
}

const EDGE_TYPE_DASHED: Partial<Record<TopologyEdgeType, boolean>> = {
  'cloud-mgmt': true,
}

function drawLegend(
  doc: jsPDF,
  _topology: NetworkTopology,
  x: number,
  y: number,
  width: number,
): void {
  doc.setFontSize(11)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('Legend', x, y)

  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')

  let cursorY = y + 16

  // Node legend — colored swatch + type name. Iterate in canonical
  // layer order so the legend reads top-to-bottom the same way the
  // canvas reads visually (ISP at the top, endpoints at the bottom).
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('NODES', x, cursorY)
  cursorY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const type of TOPOLOGY_NODE_TYPES) {
    const [r, g, b] = NODE_TYPE_RGB[type]
    doc.setFillColor(r, g, b)
    doc.rect(x, cursorY - 7, 9, 9, 'F')
    doc.setTextColor(50, 50, 50)
    doc.text(NODE_TYPE_LABEL[type], x + 14, cursorY)
    cursorY += 13
  }

  cursorY += 6
  doc.setTextColor(80, 80, 80)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  doc.text('CONNECTIONS', x, cursorY)
  cursorY += 10

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  for (const type of TOPOLOGY_EDGE_TYPES) {
    const [r, g, b] = EDGE_TYPE_RGB[type]
    doc.setDrawColor(r, g, b)
    doc.setLineWidth(1.4)
    if (EDGE_TYPE_DASHED[type]) {
      doc.setLineDashPattern([3, 2], 0)
    } else {
      doc.setLineDashPattern([], 0)
    }
    doc.line(x, cursorY - 3, x + 22, cursorY - 3)
    doc.setTextColor(50, 50, 50)
    doc.text(EDGE_TYPE_LABEL[type], x + 28, cursorY)
    cursorY += 13
  }
  // Reset dash so subsequent draws on this page (none today, but
  // future-proof) don't inherit our dotted state.
  doc.setLineDashPattern([], 0)

  // Suppress an unused-param lint warning while keeping the topology
  // arg around for a future "show counts inline" affordance.
  void width
}

// ---------------------------------------------------------------------------
// Device inventory table
// ---------------------------------------------------------------------------

interface InventoryRow {
  type: TopologyNodeType
  label: string
  vendor: string
  model: string
  sku: string
  serial: string
  status: string
  location: string
}

function buildInventoryRows(
  topology: NetworkTopology,
  floorElementLabel?: (elementId: string) => string | null,
): InventoryRow[] {
  const nodes = Object.values(topology.nodes)
  // Sort by canonical layer order then label so the inventory mirrors
  // the diagram top-to-bottom and a vendor cross-referencing the
  // canvas finds rows in the order they expect.
  const typeOrder = new Map(TOPOLOGY_NODE_TYPES.map((t, i) => [t, i]))
  nodes.sort((a, b) => {
    const oa = typeOrder.get(a.type) ?? 99
    const ob = typeOrder.get(b.type) ?? 99
    if (oa !== ob) return oa - ob
    return a.label.localeCompare(b.label)
  })

  return nodes.map((n) => ({
    type: n.type,
    label: n.label || '(unnamed)',
    vendor: n.vendor ?? '',
    model: n.model ?? '',
    sku: n.sku ?? '',
    serial: n.serialNumber ?? '',
    status: n.status ?? '',
    location: n.floorElementId
      ? floorElementLabel?.(n.floorElementId) ?? n.floorElementId
      : '',
  }))
}

function drawDeviceInventory(
  doc: jsPDF,
  topology: NetworkTopology,
  floorElementLabel: ((id: string) => string | null) | undefined,
  marginX: number,
  topY: number,
  contentWidth: number,
  pageHeight: number,
  marginY: number,
  projectName: string,
  now: Date,
): number {
  const rows = buildInventoryRows(topology, floorElementLabel)

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('Device inventory', marginX, topY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`${rows.length} device${rows.length === 1 ? '' : 's'}`, marginX + 130, topY)

  if (rows.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(140, 140, 140)
    doc.text('No devices in this topology yet.', marginX, topY + 22)
    return topY + 36
  }

  // Column layout. Widths sum to `contentWidth` (788pt on A4 landscape
  // with 28pt margins). Tweaking the proportions: type tile is fixed
  // narrow, label gets the most room, vendor/model/sku are even, serial
  // is wider for ~16-char serials, status is narrow, location stretches.
  const colWidths = [
    72, // type
    140, // label
    78, // vendor
    96, // model
    72, // sku
    104, // serial
    66, // status
    contentWidth - 72 - 140 - 78 - 96 - 72 - 104 - 66, // location (remainder)
  ]
  const headers = [
    'Type',
    'Label',
    'Vendor',
    'Model',
    'SKU',
    'Serial',
    'Status',
    'Floor location',
  ]

  let cursorY = topY + 18
  cursorY = drawTableHeader(doc, headers, colWidths, marginX, cursorY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const rowHeight = 16
  for (const row of rows) {
    if (cursorY + rowHeight > pageHeight - marginY - 30) {
      doc.addPage('a4', 'landscape')
      drawHeader(doc, projectName, topology, now, marginX, marginY)
      cursorY = marginY + 64 + 18
      cursorY = drawTableHeader(doc, headers, colWidths, marginX, cursorY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
    }

    drawTypePill(doc, row.type, marginX, cursorY - 10, colWidths[0] - 8)

    const cells = [
      '', // type rendered as a pill, leave the text cell blank
      row.label,
      row.vendor || '—',
      row.model || '—',
      row.sku || '—',
      row.serial || '—',
      row.status || '—',
      row.location || '—',
    ]
    let cellX = marginX
    for (let i = 0; i < cells.length; i++) {
      if (i !== 0) {
        doc.setTextColor(40, 40, 40)
        doc.text(truncate(doc, cells[i], colWidths[i] - 6), cellX + 3, cursorY)
      }
      cellX += colWidths[i]
    }

    // Subtle row separator.
    doc.setDrawColor(235, 235, 235)
    doc.line(marginX, cursorY + 4, marginX + contentWidth, cursorY + 4)

    cursorY += rowHeight
  }

  return cursorY
}

function drawTypePill(
  doc: jsPDF,
  type: TopologyNodeType,
  x: number,
  y: number,
  maxWidth: number,
): void {
  const [r, g, b] = NODE_TYPE_RGB[type]
  doc.setFillColor(r, g, b)
  // jsPDF roundedRect: x, y, w, h, rx, ry, style
  doc.roundedRect(x + 3, y, maxWidth, 12, 3, 3, 'F')
  doc.setTextColor(255, 255, 255)
  doc.setFontSize(8)
  doc.setFont('helvetica', 'bold')
  const label = NODE_TYPE_LABEL[type]
  doc.text(truncate(doc, label, maxWidth - 6), x + 6, y + 8)
}

// ---------------------------------------------------------------------------
// Connections table
// ---------------------------------------------------------------------------

interface ConnectionRow {
  source: string
  sourceType: TopologyNodeType | '—'
  target: string
  targetType: TopologyNodeType | '—'
  type: TopologyEdgeType
  label: string
}

function buildConnectionRows(topology: NetworkTopology): ConnectionRow[] {
  const nodeMap = new Map<string, TopologyNode>()
  for (const n of Object.values(topology.nodes)) nodeMap.set(n.id, n)

  const edges = Object.values(topology.edges)
  const typeOrder = new Map(TOPOLOGY_NODE_TYPES.map((t, i) => [t, i]))
  edges.sort((a, b) => {
    const sa = nodeMap.get(a.source)
    const sb = nodeMap.get(b.source)
    const ta = nodeMap.get(a.target)
    const tb = nodeMap.get(b.target)
    const oa = sa ? typeOrder.get(sa.type) ?? 99 : 99
    const ob = sb ? typeOrder.get(sb.type) ?? 99 : 99
    if (oa !== ob) return oa - ob
    const la = (sa?.label ?? a.source).localeCompare(sb?.label ?? b.source)
    if (la !== 0) return la
    return (ta?.label ?? a.target).localeCompare(tb?.label ?? b.target)
  })

  return edges.map((e: TopologyEdge) => {
    const s = nodeMap.get(e.source)
    const t = nodeMap.get(e.target)
    return {
      source: s?.label ?? e.source,
      sourceType: s?.type ?? '—',
      target: t?.label ?? e.target,
      targetType: t?.type ?? '—',
      type: e.type,
      label: e.label ?? '',
    }
  })
}

function drawConnections(
  doc: jsPDF,
  topology: NetworkTopology,
  marginX: number,
  topY: number,
  contentWidth: number,
  pageHeight: number,
  marginY: number,
  projectName: string,
  now: Date,
): number {
  const rows = buildConnectionRows(topology)

  doc.setFontSize(13)
  doc.setFont('helvetica', 'bold')
  doc.setTextColor(20, 20, 20)
  doc.text('Connections', marginX, topY)
  doc.setFontSize(9)
  doc.setFont('helvetica', 'normal')
  doc.setTextColor(120, 120, 120)
  doc.text(`${rows.length} connection${rows.length === 1 ? '' : 's'}`, marginX + 100, topY)

  if (rows.length === 0) {
    doc.setFontSize(10)
    doc.setFont('helvetica', 'italic')
    doc.setTextColor(140, 140, 140)
    doc.text('No connections in this topology yet.', marginX, topY + 22)
    return topY + 36
  }

  const typeColWidth = 130
  const labelColWidth = 130
  const remaining = contentWidth - typeColWidth - labelColWidth
  const colWidths = [remaining / 2, remaining / 2, typeColWidth, labelColWidth]
  const headers = ['From', 'To', 'Connection', 'Notes']

  let cursorY = topY + 18
  cursorY = drawTableHeader(doc, headers, colWidths, marginX, cursorY)

  doc.setFont('helvetica', 'normal')
  doc.setFontSize(9)
  const rowHeight = 16
  for (const row of rows) {
    if (cursorY + rowHeight > pageHeight - marginY - 30) {
      doc.addPage('a4', 'landscape')
      drawHeader(doc, projectName, topology, now, marginX, marginY)
      cursorY = marginY + 64 + 18
      cursorY = drawTableHeader(doc, headers, colWidths, marginX, cursorY)
      doc.setFont('helvetica', 'normal')
      doc.setFontSize(9)
    }

    let cellX = marginX
    const fromText =
      row.sourceType === '—'
        ? row.source
        : `${row.source} (${NODE_TYPE_LABEL[row.sourceType]})`
    const toText =
      row.targetType === '—'
        ? row.target
        : `${row.target} (${NODE_TYPE_LABEL[row.targetType]})`

    doc.setTextColor(40, 40, 40)
    doc.text(truncate(doc, fromText, colWidths[0] - 6), cellX + 3, cursorY)
    cellX += colWidths[0]
    doc.text(truncate(doc, toText, colWidths[1] - 6), cellX + 3, cursorY)
    cellX += colWidths[1]

    // Connection cell: colored swatch + readable label.
    const [r, g, b] = EDGE_TYPE_RGB[row.type]
    doc.setFillColor(r, g, b)
    doc.roundedRect(cellX + 3, cursorY - 8, 18, 10, 2, 2, 'F')
    doc.setTextColor(40, 40, 40)
    doc.text(
      truncate(doc, EDGE_TYPE_LABEL[row.type], colWidths[2] - 28),
      cellX + 26,
      cursorY,
    )
    cellX += colWidths[2]

    doc.setTextColor(80, 80, 80)
    doc.text(truncate(doc, row.label || '—', colWidths[3] - 6), cellX + 3, cursorY)

    doc.setDrawColor(235, 235, 235)
    doc.line(marginX, cursorY + 4, marginX + contentWidth, cursorY + 4)

    cursorY += rowHeight
  }

  return cursorY
}

// ---------------------------------------------------------------------------
// Shared table helpers
// ---------------------------------------------------------------------------

function drawTableHeader(
  doc: jsPDF,
  headers: string[],
  widths: number[],
  startX: number,
  y: number,
): number {
  doc.setFillColor(243, 244, 246)
  const totalWidth = widths.reduce((s, w) => s + w, 0)
  doc.rect(startX, y - 11, totalWidth, 16, 'F')

  doc.setFont('helvetica', 'bold')
  doc.setFontSize(8)
  doc.setTextColor(70, 70, 70)
  let x = startX
  for (let i = 0; i < headers.length; i++) {
    doc.text(headers[i].toUpperCase(), x + 3, y)
    x += widths[i]
  }
  return y + 12
}

/**
 * Truncate text to fit within `maxWidth` (in pt) using the doc's current
 * font + size. Appends an ellipsis when truncation occurred. jsPDF's
 * `splitTextToSize` would word-wrap, but we want single-line cells —
 * the table uses a fixed row height and wrapping would clip into the
 * next row.
 */
function truncate(doc: jsPDF, text: string, maxWidth: number): string {
  if (!text) return ''
  if (doc.getTextWidth(text) <= maxWidth) return text
  const ellipsis = '…'
  let lo = 0
  let hi = text.length
  while (lo < hi) {
    const mid = Math.floor((lo + hi + 1) / 2)
    const candidate = text.slice(0, mid) + ellipsis
    if (doc.getTextWidth(candidate) <= maxWidth) {
      lo = mid
    } else {
      hi = mid - 1
    }
  }
  return text.slice(0, lo) + ellipsis
}

// ---------------------------------------------------------------------------
// Filename + timestamp
// ---------------------------------------------------------------------------

function slugify(input: string): string {
  return input
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function isoDate(d: Date): string {
  const y = d.getUTCFullYear()
  const m = String(d.getUTCMonth() + 1).padStart(2, '0')
  const day = String(d.getUTCDate()).padStart(2, '0')
  return `${y}-${m}-${day}`
}

/**
 * `<project-slug>-network-topology-<yyyy-mm-dd>.pdf`. Same shape as
 * `buildExportFilename` but explicit about the topology suffix so a
 * user with both a wayfinding PDF + a topology PDF in their downloads
 * folder can tell them apart at a glance.
 */
export function buildTopologyFileName(projectName: string, now: Date = new Date()): string {
  const slug = slugify(projectName)
  const base = slug.length > 0 ? slug : 'topology'
  return `${base}-network-topology-${isoDate(now)}.pdf`
}

function formatTimestamp(d: Date): string {
  return d.toISOString().slice(0, 16).replace('T', ' ') + ' UTC'
}
