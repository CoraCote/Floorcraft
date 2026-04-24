/**
 * FloorPlanHero — a stylized SVG illustration of a tiny floor plan that
 * stands in for a product screenshot on the landing page. Hand-placed
 * rectangles give the viewer a one-glance "this is what you'll build"
 * preview without committing to a literal screenshot (which would go
 * stale every time the editor UI shifts).
 *
 * The viewBox is 640×360 and the illustration is purely decorative —
 * aria-hidden so it doesn't fight screen-reader focus with the adjacent
 * headline and CTA.
 */
export function FloorPlanHero() {
  // Desk tint palette — kept soft so the illustration reads as a diagram
  // rather than a heatmap. The three hues loosely mirror the
  // "neighborhood" coloring inside the real editor.
  const deskBlue = '#BFDBFE'
  const deskGreen = '#BBF7D0'
  const deskAmber = '#FDE68A'

  // Each desk is a 40x22 rect. Varying the fill keeps the grid from
  // reading as a spreadsheet.
  const desks: Array<{ x: number; y: number; fill: string }> = [
    // Left pod (blue)
    { x: 90, y: 110, fill: deskBlue },
    { x: 90, y: 150, fill: deskBlue },
    { x: 90, y: 190, fill: deskBlue },
    // Center pod (green)
    { x: 270, y: 130, fill: deskGreen },
    { x: 270, y: 170, fill: deskGreen },
    { x: 320, y: 130, fill: deskGreen },
    { x: 320, y: 170, fill: deskGreen },
    // Right pod (amber)
    { x: 490, y: 120, fill: deskAmber },
    { x: 490, y: 160, fill: deskAmber },
    { x: 490, y: 200, fill: deskAmber },
  ]

  return (
    <svg
      viewBox="0 0 640 360"
      preserveAspectRatio="xMidYMid meet"
      className="w-full h-auto"
      role="img"
      aria-hidden="true"
      style={{ filter: 'drop-shadow(0 10px 20px rgba(15, 23, 42, 0.08))' }}
    >
      {/* Outer room */}
      <rect
        x={20}
        y={20}
        width={600}
        height={320}
        rx={12}
        ry={12}
        fill="#F9FAFB"
        stroke="#D1D5DB"
        strokeWidth={2}
      />

      {/* Neighborhood zones (soft fills, dashed borders) */}
      <rect
        x={60}
        y={80}
        width={150}
        height={180}
        rx={8}
        ry={8}
        fill="#DBEAFE"
        fillOpacity={0.45}
        stroke="#60A5FA"
        strokeWidth={1.25}
        strokeDasharray="5 4"
      />
      <rect
        x={240}
        y={100}
        width={160}
        height={160}
        rx={8}
        ry={8}
        fill="#DCFCE7"
        fillOpacity={0.45}
        stroke="#34D399"
        strokeWidth={1.25}
        strokeDasharray="5 4"
      />
      <rect
        x={440}
        y={90}
        width={150}
        height={180}
        rx={8}
        ry={8}
        fill="#FEF3C7"
        fillOpacity={0.5}
        stroke="#FBBF24"
        strokeWidth={1.25}
        strokeDasharray="5 4"
      />

      {/* Interior wall segments — split the room into zones */}
      <line x1={225} y1={70} x2={225} y2={290} stroke="#9CA3AF" strokeWidth={2} />
      <line x1={415} y1={70} x2={415} y2={290} stroke="#9CA3AF" strokeWidth={2} />
      {/* A short corridor wall near the bottom left */}
      <line x1={60} y1={280} x2={200} y2={280} stroke="#9CA3AF" strokeWidth={2} />

      {/* Desks */}
      {desks.map((d, i) => (
        <rect
          key={i}
          x={d.x}
          y={d.y}
          width={40}
          height={22}
          rx={3}
          ry={3}
          fill={d.fill}
          stroke="#6B7280"
          strokeOpacity={0.35}
          strokeWidth={1}
        />
      ))}

      {/* Subtle grid dots in the unlabelled middle-bottom — suggests the
          editor grid without dominating. */}
      {Array.from({ length: 5 }).map((_, i) => (
        <circle
          key={`dot-${i}`}
          cx={260 + i * 20}
          cy={230}
          r={1.5}
          fill="#CBD5E1"
        />
      ))}
    </svg>
  )
}
