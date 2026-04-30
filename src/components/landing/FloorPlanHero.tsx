/**
 * FloorPlanHero — a stylized architectural drawing of a tiny floor plan
 * that stands in for a product screenshot on the landing page.
 *
 * The Drafting Studio direction (Wave 21A) reframes this from a soft
 * pastel diagram to a *technical drawing*: cyan strokes, dimension
 * lines with mono callouts, a north arrow, and a labelled desk
 * annotation. The point is to telegraph "this is an architect's tool"
 * in a single glance — the previous version read as a generic SaaS
 * illustration.
 *
 * The viewBox is 720×440 and the illustration is purely decorative —
 * `aria-hidden` so it doesn't fight screen-reader focus with the
 * adjacent headline and CTA.
 */
export function FloorPlanHero() {
  // Two restrained desk fills — open-plan pods read as one neighborhood,
  // private offices as another. Soft enough to keep the line drawing as
  // the dominant signal.
  const deskOpen = 'rgba(34, 211, 238, 0.18)'   // cyan-400 @ 18%
  const deskPrivate = 'rgba(14, 116, 144, 0.18)' // cyan-700 @ 18%

  // Open-plan pod desks. Each desk is 50x26.
  const openDesks: Array<{ x: number; y: number }> = [
    { x: 130, y: 150 },
    { x: 130, y: 200 },
    { x: 130, y: 250 },
    { x: 200, y: 150 },
    { x: 200, y: 200 },
    { x: 200, y: 250 },
    { x: 290, y: 150 },
    { x: 290, y: 200 },
    { x: 290, y: 250 },
    { x: 360, y: 150 },
    { x: 360, y: 200 },
    { x: 360, y: 250 },
  ]

  // Private offices on the right — three rooms of one desk each.
  const privateOffices: Array<{ x: number; y: number }> = [
    { x: 540, y: 130 },
    { x: 540, y: 200 },
    { x: 540, y: 270 },
  ]

  // Stroke colors — sourced from CSS vars so dark mode flips cleanly.
  // Inline `style={{ stroke: ... }}` on each shape would re-evaluate the
  // var per element; using `currentColor` and a single wrapper `color:`
  // keeps the SVG as one token-driven block.
  return (
    <svg
      viewBox="0 0 720 440"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto text-[color:var(--color-blueprint-strong)] dark:text-[color:var(--color-blueprint)]"
      role="img"
      aria-hidden="true"
    >
      {/* Drafting paper background. The two-layer grid mirrors the
          editor canvas so the marketing surface feels of-a-piece with
          the product. */}
      <defs>
        <pattern id="hero-grid-fine" width="8" height="8" patternUnits="userSpaceOnUse">
          <path d="M 8 0 L 0 0 0 8" fill="none" stroke="var(--color-paper-line)" strokeWidth="0.5" />
        </pattern>
        <pattern id="hero-grid-major" width="48" height="48" patternUnits="userSpaceOnUse">
          <path d="M 48 0 L 0 0 0 48" fill="none" stroke="var(--color-paper-line)" strokeWidth="1" />
        </pattern>
        <marker
          id="hero-arrow-start"
          markerWidth="10"
          markerHeight="10"
          refX="6"
          refY="5"
          orient="auto-start-reverse"
          markerUnits="userSpaceOnUse"
        >
          <path d="M0,0 L0,10 L10,5 z" fill="currentColor" />
        </marker>
      </defs>

      <rect x="0" y="0" width="720" height="440" fill="var(--color-paper)" />
      <rect x="0" y="0" width="720" height="440" fill="url(#hero-grid-fine)" />
      <rect x="0" y="0" width="720" height="440" fill="url(#hero-grid-major)" />

      {/* Outer room — bold structural wall */}
      <rect
        x={64}
        y={88}
        width={592}
        height={264}
        fill="none"
        stroke="currentColor"
        strokeWidth={2.5}
      />

      {/* Interior partition between open plan and private offices */}
      <line x1={490} y1={88} x2={490} y2={352} stroke="currentColor" strokeWidth={2} />
      {/* Door cut in the partition (gap + arc) */}
      <line x1={490} y1={210} x2={490} y2={236} stroke="var(--color-paper)" strokeWidth={3} />
      <path
        d="M 490 210 A 26 26 0 0 1 516 236"
        fill="none"
        stroke="currentColor"
        strokeOpacity={0.5}
        strokeWidth={1}
      />

      {/* Private office partitions */}
      <line x1={490} y1={170} x2={656} y2={170} stroke="currentColor" strokeWidth={2} />
      <line x1={490} y1={250} x2={656} y2={250} stroke="currentColor" strokeWidth={2} />

      {/* Neighborhood zone — soft cyan tint behind open plan desks */}
      <rect
        x={104}
        y={130}
        width={376}
        height={150}
        fill={deskOpen}
        stroke="currentColor"
        strokeOpacity={0.4}
        strokeWidth={1}
        strokeDasharray="6 4"
      />

      {/* Open-plan desks */}
      {openDesks.map((d, i) => (
        <rect
          key={`open-${i}`}
          x={d.x}
          y={d.y}
          width={50}
          height={26}
          fill="var(--color-paper-raised)"
          stroke="currentColor"
          strokeWidth={1.25}
        />
      ))}

      {/* Private office desks */}
      {privateOffices.map((d, i) => (
        <rect
          key={`private-${i}`}
          x={d.x}
          y={d.y}
          width={88}
          height={28}
          fill={deskPrivate}
          stroke="currentColor"
          strokeWidth={1.25}
        />
      ))}

      {/* ───── Dimension line, top edge ─────
          Mono callout reads "32' — 6\"" — the kind of measurement an
          architect would write in. Tick marks at each end + double arrow
          mid-line. */}
      <g stroke="currentColor" strokeWidth={1}>
        <line x1={64} y1={62} x2={656} y2={62} />
        <line x1={64} y1={56} x2={64} y2={68} />
        <line x1={656} y1={56} x2={656} y2={68} />
        <line
          x1={68}
          y1={62}
          x2={324}
          y2={62}
          markerStart="url(#hero-arrow-start)"
        />
        <line
          x1={396}
          y1={62}
          x2={652}
          y2={62}
          markerEnd="url(#hero-arrow-start)"
        />
      </g>
      <text
        x={360}
        y={66}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="13"
        fontWeight="500"
        fill="currentColor"
      >
        32′ — 6″
      </text>

      {/* ───── Dimension line, right edge ───── */}
      <g stroke="currentColor" strokeWidth={1}>
        <line x1={684} y1={88} x2={684} y2={352} />
        <line x1={678} y1={88} x2={690} y2={88} />
        <line x1={678} y1={352} x2={690} y2={352} />
      </g>
      <text
        x={684}
        y={224}
        textAnchor="middle"
        fontFamily="var(--font-mono)"
        fontSize="13"
        fontWeight="500"
        fill="currentColor"
        transform="rotate(90, 684, 224)"
      >
        18′
      </text>

      {/* ───── Annotation callout pointing to a desk ───── */}
      <g stroke="currentColor" strokeWidth={1}>
        <line x1={290} y1={150} x2={300} y2={108} />
        <circle cx={290} cy={150} r={3} fill="currentColor" />
      </g>
      <g>
        <rect
          x={300}
          y={92}
          width={92}
          height={20}
          rx={2}
          fill="var(--color-paper-raised)"
          stroke="currentColor"
          strokeWidth={1}
        />
        <text
          x={346}
          y={106}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="11"
          fontWeight="500"
          fill="currentColor"
        >
          DESK-014 · M. ITO
        </text>
      </g>

      {/* ───── Compass / north arrow ───── */}
      <g transform="translate(98, 124)">
        <circle r={18} fill="var(--color-paper-raised)" stroke="currentColor" strokeWidth={1} />
        <path d="M 0 -12 L 4 6 L 0 2 L -4 6 Z" fill="currentColor" />
        <text
          y={-22}
          textAnchor="middle"
          fontFamily="var(--font-mono)"
          fontSize="10"
          fontWeight="600"
          fill="currentColor"
        >
          N
        </text>
      </g>

      {/* ───── Scale bar, bottom-left ───── */}
      <g transform="translate(98, 388)">
        <rect width={60} height={6} fill="var(--color-paper-raised)" stroke="currentColor" strokeWidth={1} />
        <rect width={20} height={6} fill="currentColor" />
        <rect x={40} width={20} height={6} fill="currentColor" />
        <text
          y={22}
          fontFamily="var(--font-mono)"
          fontSize="10"
          fontWeight="500"
          fill="currentColor"
        >
          0
        </text>
        <text
          x={60}
          y={22}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize="10"
          fontWeight="500"
          fill="currentColor"
        >
          10′
        </text>
        <text
          x={70}
          y={5}
          fontFamily="var(--font-mono)"
          fontSize="10"
          fontWeight="500"
          fill="currentColor"
          dominantBaseline="middle"
        >
          1 : 100
        </text>
      </g>

      {/* Title block, bottom-right — like the corner stamp on a real
          architectural sheet. */}
      <g transform="translate(540, 376)">
        <rect width={116} height={36} fill="var(--color-paper-raised)" stroke="currentColor" strokeWidth={1} />
        <text
          x={8}
          y={14}
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="500"
          fill="currentColor"
          opacity={0.7}
        >
          FLOOR · 03
        </text>
        <text
          x={8}
          y={28}
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="600"
          fill="currentColor"
        >
          NORTH WING
        </text>
        <text
          x={108}
          y={28}
          textAnchor="end"
          fontFamily="var(--font-mono)"
          fontSize="9"
          fontWeight="500"
          fill="currentColor"
          opacity={0.7}
        >
          A-101
        </text>
      </g>
    </svg>
  )
}
