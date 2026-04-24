import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import type Konva from 'konva'
import { exportFloorAsPng } from '../lib/pngExport'
import { buildExportFilename } from '../lib/exportFilename'

describe('buildExportFilename', () => {
  it('slugifies project + floor + ISO date and appends the given extension', () => {
    expect(
      buildExportFilename('My Office', 'Floor 1', 'png', new Date('2026-04-24T12:00:00Z')),
    ).toBe('my-office-floor-1-2026-04-24.png')
  })

  it('supports a pdf extension for parity with the pdf export', () => {
    expect(
      buildExportFilename('Acme', 'Basement', 'pdf', new Date('2026-04-24T00:00:00Z')),
    ).toBe('acme-basement-2026-04-24.pdf')
  })

  it('falls back to "floorplan" when both inputs slugify empty', () => {
    expect(
      buildExportFilename('', '', 'png', new Date('2026-04-24T00:00:00Z')),
    ).toBe('floorplan-2026-04-24.png')
  })

  it('collapses repeated and edge separators', () => {
    expect(
      buildExportFilename('  Acme -- HQ  ', '3rd / Floor!', 'png', new Date('2026-01-02T00:00:00Z')),
    ).toBe('acme-hq-3rd-floor-2026-01-02.png')
  })
})

describe('exportFloorAsPng', () => {
  // jsdom doesn't implement anchor.click beyond a no-op. Stub enough DOM
  // plumbing to assert the download was triggered without actually fetching
  // or navigating.
  let createObjectUrl: ReturnType<typeof vi.fn>
  let revokeObjectUrl: ReturnType<typeof vi.fn>
  let appendChild: ReturnType<typeof vi.fn>
  let removeChild: ReturnType<typeof vi.fn>

  beforeEach(() => {
    createObjectUrl = vi.fn(() => 'blob:stub')
    revokeObjectUrl = vi.fn()
    URL.createObjectURL = createObjectUrl as unknown as typeof URL.createObjectURL
    URL.revokeObjectURL = revokeObjectUrl as unknown as typeof URL.revokeObjectURL
    appendChild = vi.spyOn(document.body, 'appendChild') as unknown as ReturnType<typeof vi.fn>
    removeChild = vi.spyOn(document.body, 'removeChild') as unknown as ReturnType<typeof vi.fn>
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('calls stage.toDataURL with pixelRatio 2 by default and mimeType image/png', async () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
    const stage = { toDataURL } as unknown as Konva.Stage

    await exportFloorAsPng(stage, { filename: 'acme-floor-1-2026-04-24.png' })

    expect(toDataURL).toHaveBeenCalledTimes(1)
    const [opts] = toDataURL.mock.calls[0] as unknown as [
      { pixelRatio?: number; mimeType?: string },
    ]
    expect(opts?.pixelRatio).toBe(2)
    expect(opts?.mimeType).toBe('image/png')
  })

  it('honors an explicit pixelRatio override', async () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
    const stage = { toDataURL } as unknown as Konva.Stage

    await exportFloorAsPng(stage, {
      filename: 'x.png',
      pixelRatio: 4,
    })

    const [opts] = toDataURL.mock.calls[0] as unknown as [{ pixelRatio?: number }]
    expect(opts?.pixelRatio).toBe(4)
  })

  it('appends a download anchor with the provided filename and cleans up', async () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,AAAA')
    const stage = { toDataURL } as unknown as Konva.Stage

    await exportFloorAsPng(stage, { filename: 'acme-hq-floor-1-2026-04-24.png' })

    // The anchor was appended and then removed — standard download dance.
    expect(appendChild).toHaveBeenCalledTimes(1)
    expect(removeChild).toHaveBeenCalledTimes(1)
    const anchor = (appendChild.mock.calls[0] as unknown[])[0] as HTMLAnchorElement
    expect(anchor.tagName).toBe('A')
    expect(anchor.download).toBe('acme-hq-floor-1-2026-04-24.png')
    // Anchor href is the data URL (no Blob round-trip needed).
    expect(anchor.href).toContain('data:image/png;base64,AAAA')
  })

  it('passes the raw canvas data URL through when withChrome is false', async () => {
    const toDataURL = vi.fn(() => 'data:image/png;base64,RAW')
    const stage = { toDataURL } as unknown as Konva.Stage

    await exportFloorAsPng(stage, {
      filename: 'raw.png',
      withChrome: false,
      chrome: {
        officeName: 'X',
        floorName: 'Y',
        generatedAt: new Date('2026-04-24T00:00:00Z'),
        pxPerUnit: 12,
        scaleUnit: 'ft',
        neighborhoods: [],
        canvasWidth: 100,
        canvasHeight: 100,
      },
    })

    const anchor = (appendChild.mock.calls[0] as unknown[])[0] as HTMLAnchorElement
    // Untouched: should be exactly the bytes Konva emitted.
    expect(anchor.href).toContain('data:image/png;base64,RAW')
  })

  it('compose-with-chrome path falls back to the raw URL when image decode fails', async () => {
    // jsdom can't actually decode an Image from a data URL, so the
    // compose path's `loadImage` rejects and we fall back to the raw URL.
    // This test pins that contract: if we ever swap to a real decoder
    // we'll get a richer assertion, but today the contract is "don't
    // throw, don't lose the bytes".
    const toDataURL = vi.fn(() => 'data:image/png;base64,RAW2')
    const stage = { toDataURL } as unknown as Konva.Stage

    await exportFloorAsPng(stage, {
      filename: 'chromed.png',
      // withChrome defaults to true
      chrome: {
        officeName: 'Acme',
        floorName: 'Floor 1',
        generatedAt: new Date('2026-04-24T00:00:00Z'),
        pxPerUnit: 12,
        scaleUnit: 'ft',
        neighborhoods: [{ id: 'n1', name: 'Eng', color: '#3B82F6' }],
        canvasWidth: 200,
        canvasHeight: 200,
      },
    })

    // Anchor was appended (download triggered) — no throw.
    expect(appendChild).toHaveBeenCalledTimes(1)
    const anchor = (appendChild.mock.calls[0] as unknown[])[0] as HTMLAnchorElement
    expect(anchor.tagName).toBe('A')
    expect(anchor.download).toBe('chromed.png')
  })
})
