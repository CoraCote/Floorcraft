/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * Wave 13A — distance-label coverage for <AlignmentGuides />.
 *
 * The dashed-line behaviour is already covered by `dragSnapAndRotation.test.ts`;
 * these tests pin down the additive pill-label surface: it renders only
 * when guide data carries a gap, reformats when the project unit flips,
 * and is properly `aria-hidden` for assistive tech.
 */
import { describe, it, expect, beforeAll, beforeEach } from 'vitest'
import { render } from '@testing-library/react'
import { Stage } from 'react-konva'
import { AlignmentGuides } from '../components/editor/Canvas/AlignmentGuides'
import { useCanvasStore } from '../stores/canvasStore'
import { DEFAULT_CANVAS_SETTINGS } from '../types/project'
import type { AlignmentGuide } from '../lib/geometry'

beforeAll(() => {
  const mockCtx = {
    scale: () => {},
    clearRect: () => {}, fillRect: () => {}, strokeRect: () => {},
    beginPath: () => {}, closePath: () => {}, moveTo: () => {}, lineTo: () => {},
    arc: () => {}, arcTo: () => {}, bezierCurveTo: () => {}, quadraticCurveTo: () => {},
    fill: () => {}, stroke: () => {}, save: () => {}, restore: () => {},
    translate: () => {}, rotate: () => {}, transform: () => {}, setTransform: () => {},
    drawImage: () => {},
    measureText: () => ({ width: 0, actualBoundingBoxAscent: 0, actualBoundingBoxDescent: 0 }),
    fillText: () => {}, strokeText: () => {},
    createLinearGradient: () => ({ addColorStop: () => {} }),
    createRadialGradient: () => ({ addColorStop: () => {} }),
    createPattern: () => ({}),
    getImageData: () => ({ data: new Uint8ClampedArray(4) }),
    putImageData: () => {},
    clip: () => {}, rect: () => {}, isPointInPath: () => false,
    canvas: { width: 0, height: 0 },
  } as unknown as CanvasRenderingContext2D
  HTMLCanvasElement.prototype.getContext = (() =>
    mockCtx) as unknown as HTMLCanvasElement['getContext']
})

function getTexts(stage: any): string[] {
  const texts: string[] = []
  for (const layer of stage.getLayers()) {
    layer.find('Text').forEach((t: any) => texts.push(t.text()))
  }
  return texts
}

function getGroups(stage: any): any[] {
  const groups: any[] = []
  for (const layer of stage.getLayers()) {
    layer.find('Group').forEach((g: any) => groups.push(g))
  }
  return groups
}

// A left-edge alignment guide: both rects aligned on X=100. Moving rect
// sits above (y=0..40), other sits below (y=100..140) — gap = 60 canvas
// units, midpoint y = 70.
function leftEdgeGuide(gap = 60, midpoint = 70): AlignmentGuide {
  return {
    orientation: 'vertical',
    position: 100,
    start: 0,
    end: 140,
    gap,
    gapMidpoint: midpoint,
  }
}

beforeEach(() => {
  useCanvasStore.setState({
    settings: { ...DEFAULT_CANVAS_SETTINGS, scale: 1, scaleUnit: 'ft' },
    stageScale: 1,
    stageX: 0,
    stageY: 0,
  } as any)
})

describe('AlignmentGuides — distance labels', () => {
  it('renders no labels when there are no guides', () => {
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[]} />
      </Stage>,
    )
    expect(getTexts(stage)).toEqual([])
  })

  it('renders a distance label for a snapped guide with the project unit', () => {
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, scale: 1, scaleUnit: 'ft' },
    } as any)

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[leftEdgeGuide(60)]} />
      </Stage>,
    )
    // gap=60 canvas units * scale=1 → 60.0 ft with formatLength's 1-decimal
    // default for non-meter units.
    expect(getTexts(stage)).toContain('60.0 ft')
  })

  it('reformats the label when the project unit changes from ft to m', () => {
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, scale: 0.5, scaleUnit: 'm' },
    } as any)

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[leftEdgeGuide(60)]} />
      </Stage>,
    )
    // 60 canvas units * 0.5 scale = 30 meters → '30.00 m' (m uses 2 decimals).
    expect(getTexts(stage)).toContain('30.00 m')
  })

  it('falls through to px formatting when the project is un-calibrated', () => {
    useCanvasStore.setState({
      settings: { ...DEFAULT_CANVAS_SETTINGS, scale: 1, scaleUnit: 'px' },
    } as any)

    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[leftEdgeGuide(48)]} />
      </Stage>,
    )
    expect(getTexts(stage)).toContain('48.0 px')
  })

  it('marks the label group as aria-hidden for screen readers', () => {
    let stage: any
    const { container } = render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[leftEdgeGuide()]} />
      </Stage>,
    )
    // The label group carries aria-hidden. Konva's attrs bag preserves
    // arbitrary props so we read via `attrs` rather than the DOM.
    const groups = getGroups(stage)
    const labelGroups = groups.filter((g) => g.attrs['aria-hidden'] === true)
    expect(labelGroups.length).toBeGreaterThanOrEqual(1)
    // Defensive: `container` is referenced so the render isn't GCed too
    // aggressively in environments with eager cleanup.
    expect(container).toBeTruthy()
  })

  it('skips labels for guides whose dashed line is too short at current zoom', () => {
    // Short guide span: end - start = 4. At scale=1 that's 4 screen px,
    // well below the 20px threshold.
    const shortGuide: AlignmentGuide = {
      orientation: 'vertical',
      position: 100,
      start: 0,
      end: 4,
      gap: 10,
      gapMidpoint: 2,
    }
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[shortGuide]} />
      </Stage>,
    )
    // Line still renders, but no text label. If ANY '10.0 ft' showed up
    // the threshold guard is broken.
    expect(getTexts(stage)).not.toContain('10.0 ft')
  })

  it('renders labels that disappear when the guides array becomes empty', () => {
    let stage: any
    const { rerender } = render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[leftEdgeGuide(60)]} />
      </Stage>,
    )
    expect(getTexts(stage)).toContain('60.0 ft')

    rerender(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[]} />
      </Stage>,
    )
    expect(getTexts(stage)).toEqual([])
  })

  it('caps labels at one per orientation when many guides share the same axis', () => {
    // Three vertical guides at DIFFERENT positions (distinct alignments)
    // but all with gap info. The component should render at most ONE
    // label for the vertical axis — the nearest non-zero gap — instead
    // of three blue pills stacked on top of the canvas.
    const near: AlignmentGuide = {
      orientation: 'vertical',
      position: 100,
      start: 0,
      end: 140,
      gap: 20,
      gapMidpoint: 70,
    }
    const mid: AlignmentGuide = {
      orientation: 'vertical',
      position: 200,
      start: 0,
      end: 140,
      gap: 60,
      gapMidpoint: 70,
    }
    const far: AlignmentGuide = {
      orientation: 'vertical',
      position: 300,
      start: 0,
      end: 140,
      gap: 120,
      gapMidpoint: 70,
    }
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[far, near, mid]} />
      </Stage>,
    )
    const texts = getTexts(stage)
    // Only the nearest vertical alignment should get a label. 20 canvas
    // units at scale=1, ft → "20.0 ft".
    expect(texts).toEqual(['20.0 ft'])
  })

  it('deduplicates guides that share orientation + position', () => {
    // Two guides at the exact same line (e.g., a left-edge AND
    // center-X alignment that happened to land on the same X due to
    // coincident neighbour geometry) should collapse into one dashed
    // line and one label — not two stacked on top of each other.
    const a = leftEdgeGuide(40)
    const b = { ...leftEdgeGuide(40), gap: 80, gapMidpoint: 70 }
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[a, b]} />
      </Stage>,
    )
    // One dashed line (position=100) + one label at the smallest gap.
    const lines = stage.find('Line')
    expect(lines.length).toBe(1)
    const texts = getTexts(stage)
    // Smaller gap (40) wins over larger gap (80) per the dedup rule.
    expect(texts).toEqual(['40.0 ft'])
  })

  it('emits at most two labels total (one per orientation)', () => {
    // A horizontal + a vertical alignment = two labels max. Adding
    // additional guides on each axis must not push past two total.
    const v1: AlignmentGuide = {
      orientation: 'vertical',
      position: 100, start: 0, end: 140,
      gap: 20, gapMidpoint: 70,
    }
    const v2: AlignmentGuide = {
      orientation: 'vertical',
      position: 200, start: 0, end: 140,
      gap: 80, gapMidpoint: 70,
    }
    const h1: AlignmentGuide = {
      orientation: 'horizontal',
      position: 50, start: 0, end: 200,
      gap: 15, gapMidpoint: 100,
    }
    const h2: AlignmentGuide = {
      orientation: 'horizontal',
      position: 150, start: 0, end: 200,
      gap: 45, gapMidpoint: 100,
    }
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[v1, v2, h1, h2]} />
      </Stage>,
    )
    const texts = getTexts(stage).sort()
    // The two winners: smallest vertical gap (20) + smallest horizontal
    // gap (15). The two larger gaps are suppressed.
    expect(texts).toEqual(['15.0 ft', '20.0 ft'])
  })

  it('handles guides missing gap data without crashing', () => {
    // Legacy-style guide: no gap/gapMidpoint — should still render the
    // dashed line but skip the label. Covers hand-crafted callers and
    // ensures gap is a non-breaking addition.
    const legacy: AlignmentGuide = {
      orientation: 'horizontal',
      position: 50,
      start: 0,
      end: 100,
    }
    let stage: any
    render(
      <Stage width={400} height={400} ref={(s) => { stage = s }}>
        <AlignmentGuides guides={[legacy]} />
      </Stage>,
    )
    expect(getTexts(stage)).toEqual([])
  })
})

describe('findAlignmentGuides — gap propagation', () => {
  it('populates gap + midpoint on emitted guides so consumers can label', async () => {
    const { findAlignmentGuides } = await import('../lib/geometry')
    // Two desks left-aligned at x=100; vertical separation between them
    // is 60 canvas units (40 tall moving + 60 space + other at y=100).
    const moving = { x: 100, y: 0, width: 60, height: 40 }
    const other = { x: 100, y: 100, width: 60, height: 40 }
    const guides = findAlignmentGuides(moving, [other], 5)
    const leftEdge = guides.find(
      (g) => g.orientation === 'vertical' && g.position === 100,
    )
    expect(leftEdge).toBeDefined()
    expect(leftEdge!.gap).toBe(60)
    // Midpoint sits between aMax (40) and bMin (100) → 70.
    expect(leftEdge!.gapMidpoint).toBe(70)
  })

  it('returns gap=0 when the rects overlap on the perpendicular axis', async () => {
    const { findAlignmentGuides } = await import('../lib/geometry')
    // Both rects share Y range 0..40 → no vertical gap on a vertical guide.
    const moving = { x: 100, y: 0, width: 60, height: 40 }
    const other = { x: 100, y: 20, width: 60, height: 40 }
    const guides = findAlignmentGuides(moving, [other], 5)
    const leftEdge = guides.find(
      (g) => g.orientation === 'vertical' && g.position === 100,
    )
    expect(leftEdge).toBeDefined()
    expect(leftEdge!.gap).toBe(0)
  })
})
