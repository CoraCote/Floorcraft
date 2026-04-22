import { getDefaults } from '../../../lib/constants'
import type { LibraryItem } from './ElementLibrary'

/**
 * 24×18 inline SVG thumbnail for a library tile. Goal is `recognisable`,
 * not beautiful — a single primitive + minimal detail lines per shape.
 * Falls back to the legacy color-swatch rect for anything we haven't
 * explicitly styled.
 */
const W = 24
const H = 18

function bboxScale(itemW: number, itemH: number) {
  // Reserve 1px padding so strokes don't clip at the edge.
  const availW = W - 2
  const availH = H - 2
  const scale = Math.min(availW / itemW, availH / itemH)
  const w = itemW * scale
  const h = itemH * scale
  const x = (W - w) / 2
  const y = (H - h) / 2
  return { x, y, w, h }
}

interface Props {
  item: LibraryItem
}

export function LibraryPreview({ item }: Props) {
  const d = getDefaults(item.type, item.shape) || {
    width: 60, height: 60, fill: '#F3F4F6', stroke: '#6B7280',
  }
  const fill = d.fill
  const stroke = d.stroke

  const key = `${item.type}${item.shape ? `/${item.shape}` : ''}`

  // Special-cased silhouettes -------------------------------------------------
  if (item.type === 'ellipse' || item.type === 'table-round') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 2} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (item.type === 'table-oval') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <ellipse cx={W / 2} cy={H / 2} rx={W / 2 - 2} ry={H / 2 - 5} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/column') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <circle cx={W / 2} cy={H / 2} r={4} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/stairs') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={2} width={W - 4} height={H - 4} fill={fill} stroke={stroke} />
        <line x1={4} y1={7} x2={W - 4} y2={7} stroke={stroke} />
        <line x1={4} y1={10} x2={W - 4} y2={10} stroke={stroke} />
        <line x1={4} y1={13} x2={W - 4} y2={13} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/elevator') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={2} width={W - 4} height={H - 4} fill={fill} stroke={stroke} />
        <line x1={5} y1={5} x2={W - 5} y2={H - 5} stroke={stroke} />
        <line x1={W - 5} y1={5} x2={5} y2={H - 5} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/couch') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={5} width={W - 4} height={H - 7} fill={fill} stroke={stroke} rx={3} />
      </svg>
    )
  }

  if (key === 'decor/whiteboard') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={6} width={W - 4} height={H - 12} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/reception') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={3} width={W - 4} height={5} fill={fill} stroke={stroke} />
        <rect x={2} y={10} width={W - 4} height={5} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/kitchen-counter' || item.type === 'counter') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={5} width={W - 4} height={H - 10} fill={fill} stroke={stroke} />
        <line x1={W / 2} y1={5} x2={W / 2} y2={H - 5} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/fridge') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={6} y={2} width={W - 12} height={H - 4} fill={fill} stroke={stroke} />
        <line x1={6} y1={H / 2} x2={W - 6} y2={H / 2} stroke={stroke} />
      </svg>
    )
  }

  if (key === 'decor/armchair' || item.type === 'chair') {
    // Chair: rect seat + semicircle back.
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={4} y={8} width={W - 8} height={H - 10} fill={fill} stroke={stroke} rx={1} />
        <path d={`M 4,8 A 7 7 0 0 1 ${W - 4} 8`} fill="none" stroke={stroke} />
      </svg>
    )
  }

  if (key === 'desk/l-shape') {
    // L shape: two rects.
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={2} width={W - 4} height={6} fill={fill} stroke={stroke} />
        <rect x={2} y={8} width={10} height={H - 10} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (item.type === 'planter') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <circle cx={W / 2} cy={H / 2} r={5} fill={fill} stroke={stroke} />
      </svg>
    )
  }

  if (item.type === 'text-label' || item.type === 'free-text') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={2} width={W - 4} height={H - 4} fill="#F9FAFB" stroke={stroke} />
        <text
          x={W / 2}
          y={H / 2 + 4}
          textAnchor="middle"
          fontSize={11}
          fontWeight={700}
          fill={stroke}
        >T</text>
      </svg>
    )
  }

  if (item.type === 'line-shape') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <line x1={3} y1={H - 3} x2={W - 3} y2={3} stroke={stroke} strokeWidth={1.5} />
      </svg>
    )
  }

  if (item.type === 'arrow') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <defs>
          <marker id="lp-arrow-head" markerWidth={5} markerHeight={5} refX={4} refY={2.5} orient="auto">
            <path d="M 0 0 L 5 2.5 L 0 5 z" fill={stroke} />
          </marker>
        </defs>
        <line
          x1={3}
          y1={H / 2}
          x2={W - 5}
          y2={H / 2}
          stroke={stroke}
          strokeWidth={1.5}
          markerEnd="url(#lp-arrow-head)"
        />
      </svg>
    )
  }

  if (item.type === 'custom-shape') {
    return (
      <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
        <rect x={2} y={2} width={W - 4} height={H - 4} fill="#F9FAFB" stroke={stroke} strokeDasharray="2 2" />
      </svg>
    )
  }

  if (item.type === 'custom-svg' && item.svgSource) {
    // Render the user's uploaded SVG inline at preview size. We can't
    // guarantee its internal viewBox fills the 24×18 box, so we wrap it
    // in a container that pin-fills using CSS (object-fit style).
    // SECURITY: svgSource has already been sanitised at upload time
    // (sanitizeSvg strips <script>, on* handlers, foreignObject). Any
    // further exposure surface would be CSS / external resource refs,
    // which are mitigated by `display:block; overflow:hidden` and the
    // fact that the user uploaded this themselves.
    return (
      <span
        aria-hidden
        style={{
          display: 'inline-block',
          width: W,
          height: H,
          overflow: 'hidden',
          lineHeight: 0,
        }}
        // svgSource is sanitised above (sanitizeSvg); inlining is intentional
        // so the preview scales crisply with CSS instead of rasterising.
        dangerouslySetInnerHTML={{
          __html: item.svgSource.replace(
            /<svg\b/i,
            `<svg preserveAspectRatio="xMidYMid meet" width="${W}" height="${H}"`,
          ),
        }}
      />
    )
  }

  // Default: proportional rect matching the element's natural w/h (so a
  // long conference table reads as long, a square desk as square).
  const { x, y, w, h } = bboxScale(d.width, d.height)
  return (
    <svg width={W} height={H} viewBox={`0 0 ${W} ${H}`} aria-hidden>
      <rect x={x} y={y} width={w} height={h} fill={fill} stroke={stroke} rx={1} />
    </svg>
  )
}
