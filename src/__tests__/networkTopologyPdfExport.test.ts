import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  buildNetworkTopologyPdf,
  buildTopologyFileName,
} from '../lib/networkTopologyPdfExport'
import {
  createEmptyTopology,
  type NetworkTopology,
  type TopologyEdge,
  type TopologyNode,
} from '../types/networkTopology'

/**
 * jspdf is mocked the same way `pdfExport.test.ts` mocks it — capture every
 * call so we can assert what sections the builder writes without rasterising.
 * Pages are tracked via `addPage` / `setPage` so we can verify multi-page
 * behaviour for the inventory + connections tables.
 */
const jsPdfCalls: Array<{ method: string; args: unknown[]; page: number }> = []
let currentPage = 1
let totalPages = 1

vi.mock('jspdf', () => {
  class FakePdf {
    internal = {
      pageSize: {
        getWidth: () => 841.89,
        getHeight: () => 595.28,
      },
    }
    setFontSize(size: number) {
      jsPdfCalls.push({ method: 'setFontSize', args: [size], page: currentPage })
    }
    setFont(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setFont', args, page: currentPage })
    }
    setTextColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setTextColor', args, page: currentPage })
    }
    setDrawColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setDrawColor', args, page: currentPage })
    }
    setFillColor(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setFillColor', args, page: currentPage })
    }
    setLineWidth(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setLineWidth', args, page: currentPage })
    }
    setLineDashPattern(...args: unknown[]) {
      jsPdfCalls.push({ method: 'setLineDashPattern', args, page: currentPage })
    }
    text(text: string, x: number, y: number, opts?: unknown) {
      jsPdfCalls.push({ method: 'text', args: [text, x, y, opts], page: currentPage })
    }
    rect(...args: unknown[]) {
      jsPdfCalls.push({ method: 'rect', args, page: currentPage })
    }
    roundedRect(...args: unknown[]) {
      jsPdfCalls.push({ method: 'roundedRect', args, page: currentPage })
    }
    line(...args: unknown[]) {
      jsPdfCalls.push({ method: 'line', args, page: currentPage })
    }
    addImage(dataUrl: string, fmt: string, x: number, y: number, w: number, h: number) {
      jsPdfCalls.push({
        method: 'addImage',
        args: [dataUrl, fmt, x, y, w, h],
        page: currentPage,
      })
    }
    getTextWidth(text: string) {
      // 4pt per char is a generous-but-deterministic approximation —
      // wide enough that none of our test strings get truncated, narrow
      // enough that the truncation path stays exercisable when we
      // explicitly pass a tight column.
      return text.length * 4
    }
    addPage() {
      totalPages++
      currentPage = totalPages
      jsPdfCalls.push({ method: 'addPage', args: [], page: currentPage })
    }
    setPage(n: number) {
      currentPage = n
      jsPdfCalls.push({ method: 'setPage', args: [n], page: currentPage })
    }
    getNumberOfPages() {
      return totalPages
    }
    output(kind: string): Blob {
      jsPdfCalls.push({ method: 'output', args: [kind], page: currentPage })
      return new Blob(['%PDF-fake'], { type: 'application/pdf' })
    }
  }
  return { jsPDF: FakePdf, default: FakePdf }
})

function node(
  id: string,
  type: TopologyNode['type'],
  overrides: Partial<TopologyNode> = {},
): TopologyNode {
  return {
    id,
    type,
    label: id,
    position: { x: 0, y: 0 },
    status: 'planned',
    ...overrides,
  }
}

function edge(
  id: string,
  source: string,
  target: string,
  type: TopologyEdge['type'],
  overrides: Partial<TopologyEdge> = {},
): TopologyEdge {
  return { id, source, target, type, label: null, ...overrides }
}

function topologyWith(
  nodes: TopologyNode[],
  edges: TopologyEdge[] = [],
): NetworkTopology {
  const t = createEmptyTopology('office-1')
  for (const n of nodes) t.nodes[n.id] = n
  for (const e of edges) t.edges[e.id] = e
  return t
}

beforeEach(() => {
  jsPdfCalls.length = 0
  currentPage = 1
  totalPages = 1
})

const NOW = new Date('2026-04-27T14:30:00Z')

describe('buildTopologyFileName', () => {
  it('slugifies project name and appends ISO date', () => {
    expect(buildTopologyFileName('Acme HQ', NOW)).toBe(
      'acme-hq-network-topology-2026-04-27.pdf',
    )
  })
  it('falls back to "topology" when project name slugifies empty', () => {
    expect(buildTopologyFileName('   ', NOW)).toBe(
      'topology-network-topology-2026-04-27.pdf',
    )
  })
  it('UTC-stable across timezones', () => {
    // 23:30 UTC on Apr 27 is still Apr 27 in UTC.
    const d = new Date('2026-04-27T23:30:00Z')
    expect(buildTopologyFileName('foo', d)).toBe(
      'foo-network-topology-2026-04-27.pdf',
    )
  })
})

describe('buildNetworkTopologyPdf', () => {
  it('writes title with project name and section headings', () => {
    const t = topologyWith([
      node('n1', 'isp'),
      node('n2', 'firewall'),
    ])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'Acme HQ',
      imageDataUrl: 'data:image/png;base64,AAAA',
      floorElementLabel: () => null,
      now: NOW,
    })
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    expect(texts.some((t) => /Acme HQ/.test(t) && /Network topology/i.test(t))).toBe(true)
    expect(texts.some((t) => /Device inventory/i.test(t))).toBe(true)
    expect(texts.some((t) => /Connections/i.test(t))).toBe(true)
    expect(texts.some((t) => /Legend/i.test(t))).toBe(true)
  })

  it('embeds the captured image when imageDataUrl is provided', () => {
    const t = topologyWith([node('n1', 'isp')])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: 'data:image/png;base64,XXXX',
      now: NOW,
    })
    const images = jsPdfCalls.filter((c) => c.method === 'addImage')
    expect(images.length).toBe(1)
    expect(images[0].args[0]).toBe('data:image/png;base64,XXXX')
  })

  it('falls through to a tables-only export when imageDataUrl is null', () => {
    const t = topologyWith([node('n1', 'isp')])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: null,
      now: NOW,
    })
    expect(jsPdfCalls.some((c) => c.method === 'addImage')).toBe(false)
    // The placeholder note replaces the image so the reader knows what
    // happened.
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    expect(texts.some((t) => /diagram unavailable/i.test(t))).toBe(true)
  })

  it('renders devices in canonical layer order (ISP first, endpoints last)', () => {
    const t = topologyWith([
      node('n3', 'access-point', { label: 'AP-3' }),
      node('n1', 'isp', { label: 'ISP-Comcast' }),
      node('n2', 'firewall', { label: 'FW-Edge' }),
      node('n4', 'endpoint-group', { label: 'Laptops' }),
    ])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: null,
      now: NOW,
    })
    // Device label cells are written in row order. We assert the index
    // of each known label is monotonically increasing in canonical
    // type order.
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    const idxIsp = texts.indexOf('ISP-Comcast')
    const idxFw = texts.indexOf('FW-Edge')
    const idxAp = texts.indexOf('AP-3')
    const idxEnd = texts.indexOf('Laptops')
    expect(idxIsp).toBeGreaterThan(-1)
    expect(idxFw).toBeGreaterThan(idxIsp)
    expect(idxAp).toBeGreaterThan(idxFw)
    expect(idxEnd).toBeGreaterThan(idxAp)
  })

  it('renders the connections table with friendly source/target labels', () => {
    const t = topologyWith(
      [
        node('n1', 'isp', { label: 'Comcast 1Gbps' }),
        node('n2', 'firewall', { label: 'MX450' }),
      ],
      [edge('e1', 'n1', 'n2', 'wan', { label: 'WAN1' })],
    )
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: null,
      now: NOW,
    })
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    // Source rendered as "Label (Type)"
    expect(texts.some((t) => /Comcast 1Gbps/.test(t) && /ISP/.test(t))).toBe(true)
    expect(texts.some((t) => /MX450/.test(t) && /Firewall/.test(t))).toBe(true)
    // Notes column ("WAN1")
    expect(texts.some((t) => /WAN1/.test(t))).toBe(true)
  })

  it('shows empty-state copy when there are no devices or connections', () => {
    const t = topologyWith([])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: null,
      now: NOW,
    })
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    expect(texts.some((t) => /No devices/i.test(t))).toBe(true)
    expect(texts.some((t) => /No connections/i.test(t))).toBe(true)
  })

  it('uses the floorElementLabel callback for the location column', () => {
    const t = topologyWith([
      node('n1', 'access-point', { label: 'AP-12', floorElementId: 'el-12' }),
    ])
    const lookup = vi.fn((id: string) =>
      id === 'el-12' ? 'AP-12 on Engineering loft' : null,
    )
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'p',
      imageDataUrl: null,
      floorElementLabel: lookup,
      now: NOW,
    })
    expect(lookup).toHaveBeenCalledWith('el-12')
    const texts = jsPdfCalls
      .filter((c) => c.method === 'text')
      .map((c) => c.args[0] as string)
    expect(texts.some((t) => /Engineering loft/.test(t))).toBe(true)
  })

  it('paginates: every page gets a header and a footer', () => {
    const t = topologyWith([node('n1', 'isp')])
    buildNetworkTopologyPdf({
      topology: t,
      projectName: 'Acme',
      imageDataUrl: null,
      now: NOW,
    })
    // Header = title text mentioning the project + "Network topology".
    const headerTexts = jsPdfCalls.filter(
      (c) =>
        c.method === 'text' &&
        typeof c.args[0] === 'string' &&
        /Acme/.test(c.args[0] as string) &&
        /Network topology/i.test(c.args[0] as string),
    )
    expect(headerTexts.length).toBeGreaterThanOrEqual(2)

    // Footer = page indicator on each page.
    const footerTexts = jsPdfCalls.filter(
      (c) =>
        c.method === 'text' &&
        typeof c.args[0] === 'string' &&
        /Page \d+ of \d+/.test(c.args[0] as string),
    )
    expect(footerTexts.length).toBeGreaterThanOrEqual(2)
  })

  it('returns a PDF blob with a sensible filename', () => {
    const t = topologyWith([node('n1', 'isp')])
    const result = buildNetworkTopologyPdf({
      topology: t,
      projectName: 'Acme HQ',
      imageDataUrl: null,
      now: NOW,
    })
    expect(result.blob).toBeInstanceOf(Blob)
    expect(result.blob.type).toBe('application/pdf')
    expect(result.fileName).toBe('acme-hq-network-topology-2026-04-27.pdf')
  })
})
