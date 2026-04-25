import { Group, Rect, Text } from 'react-konva'
import type { SeatLabelStyle } from '../../../types/project'
import { truncateToWidth } from '../../../lib/textTruncate'

/**
 * Wave 15C — shared seat-label component.
 *
 * The three seat renderers (`DeskElementRenderer`, `WorkstationRenderer`,
 * `PrivateOfficeRenderer`) used to each paint the assigned-employee label
 * inline, which meant every cosmetic tweak had to be duplicated three
 * times and drifted over time. This module pulls the per-seat label out
 * into one component with four switchable `style` variants, matching the
 * `SeatLabelStyle` union on `CanvasSettings`.
 *
 * The desk shape itself (the outer Rect, the corner desk-id, the drop-
 * target outline, the accommodation badge) stays in the renderers; this
 * component owns ONLY the "who sits here" layer and is passed the
 * usable interior width / height to lay itself out inside.
 *
 * Design references:
 *
 *   - `'pill'` is the pre-15C baseline. Default so upgrading doesn't
 *     change what existing users see; should be pixel-for-pixel
 *     equivalent to the old inline rendering.
 *   - `'card'` reaches for the todiagram / JSON-Crack aesthetic the
 *     user called out: solid department-coloured header strip with
 *     uppercase caps, crisp white body with centred name + subtitle,
 *     1px department-coloured border. Falls back gracefully on small
 *     seats by dropping the header.
 *   - `'avatar'` puts a circular initials chip next to the name — same
 *     department colour but used as identity, not tint. Good when
 *     scanning for a specific person rather than a role.
 *   - `'banner'` is the restrained option: a 4px left-edge accent
 *     stripe, a small uppercase eyebrow with the department, and the
 *     name in plain bold on the desk's cream fill. No coloured fill
 *     behind the name — the stripe alone carries the department cue.
 */

/**
 * Canvas-text colour for body copy. Matches `#1F2937` (Tailwind gray-800)
 * — the codebase's conventional "text on canvas" colour. The spec calls
 * this out explicitly because Konva doesn't pick up Tailwind classes and
 * a bare `"black"` reads too harsh against the cream desk fill.
 */
const BODY_TEXT = '#1F2937'
/** Gray-500; for subtitle / dept labels. */
const SUBTLE_TEXT = '#6B7280'
/** Gray-400; for the unassigned "Open" italic. */
const OPEN_TEXT = '#9CA3AF'
/** Fallback border/accent colour when no department colour is resolvable
 *  (unassigned seats, or an employee record with no department). */
const NEUTRAL_ACCENT = '#9CA3AF'

/** Minimum assigned-employee shape the label needs — the renderers already
 *  project the full `Employee` down to this before calling in. */
export interface SeatLabelEmployee {
  id: string
  name: string
  department: string | null
  /** Optional; some views call us with just id+name+dept. */
  title?: string | null
}

interface SeatLabelProps {
  style: SeatLabelStyle
  /** `null` means the seat is open/unassigned. */
  employee: SeatLabelEmployee | null
  /** Full-opacity department colour, or `null` if the employee has no
   *  department assigned (or no employee at all). */
  departmentColor: string | null
  /** Width of the usable label area (seat width minus any caller-reserved
   *  chrome like the id badge band). The label must stay inside this. */
  width: number
  /** Height of the usable label area. */
  height: number
  /** Top-left origin of the label area, relative to the caller's Group
   *  (which is already translated to the seat's centre). Default 0,0 —
   *  callers pass explicit values when a desk-id badge or dividers steal
   *  part of the seat. */
  x?: number
  y?: number
  /** When the outer seat has its own fill (e.g. desks paint a cream/yellow
   *  background), some styles draw on top of it; others (like `'card'`)
   *  want to paint their own white body over the desk fill. We pass the
   *  underlying fill so `'card'` can use a contrasting white without the
   *  caller having to know which style is active. */
  underlyingFill?: string
}

/**
 * Derive up-to-two-letter initials from the employee's display name.
 * Mirrors the contract in the spec: split on whitespace, take the first
 * letter of each of the first two tokens, uppercase. Handles single-
 * word names (returns one letter) and empty names (returns `'?'`).
 */
function deriveInitials(name: string): string {
  const tokens = name.trim().split(/\s+/).filter(Boolean)
  if (tokens.length === 0) return '?'
  return tokens
    .slice(0, 2)
    .map((t) => t[0] ?? '')
    .join('')
    .toUpperCase()
}

export function SeatLabel(props: SeatLabelProps) {
  const { style, width, height } = props
  // Degenerate sizes (e.g. a workstation slot barely wide enough for a
  // letter) can't usefully host any style. Bail early so we never emit a
  // Konva node with a negative dimension — Konva would clamp but it
  // still reads as a stray rectangle in the corner.
  if (width < 10 || height < 10) return null
  switch (style) {
    case 'card':
      return <CardLabel {...props} />
    case 'avatar':
      return <AvatarLabel {...props} />
    case 'banner':
      return <BannerLabel {...props} />
    case 'pill':
    default:
      return <PillLabel {...props} />
  }
}

/* ────────────────────────────────────────────────────────────────────
 * Style 1 — PILL (baseline)
 *
 * The legacy rendering: a department-tinted pill (~18% alpha) centred
 * on the label area with the employee name in 11px bold and the
 * department as a 9px subtitle when there's vertical room. For the
 * open state we show an italic "Open" in gray-400, matching the rest
 * of the codebase's placeholder styling.
 *
 * Keeping this as a component (rather than a no-op fallthrough) so the
 * refactor is testable: a consumer can mount `<SeatLabel style="pill"
 * … />` and assert the same visual tree as the pre-refactor renderer.
 * ────────────────────────────────────────────────────────────────── */
function PillLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const padX = 4
  const chipInnerPadX = 6
  const chipW = Math.max(20, width - 8)
  const chipCenterX = x + width / 2
  const chipCenterY = y + height / 2
  const nameMaxPx = chipW - chipInnerPadX * 2

  if (!employee) {
    return (
      <Text
        text="Open"
        x={x + padX}
        y={chipCenterY - 6}
        width={width - padX * 2}
        align="center"
        fontSize={11}
        fontStyle="italic"
        fill={OPEN_TEXT}
        listening={false}
      />
    )
  }

  const displayName = truncateToWidth(employee.name, nameMaxPx, 11)
  const displayDept = employee.department
    ? truncateToWidth(employee.department, nameMaxPx, 9)
    : ''
  const hasRoomForDept = height >= 44

  return (
    <Group
      clipX={x}
      clipY={y}
      clipWidth={width}
      clipHeight={height}
      listening={false}
    >
      {departmentColor && (
        <Rect
          x={chipCenterX - chipW / 2}
          y={chipCenterY - 10}
          width={chipW}
          height={20}
          fill={departmentColor}
          opacity={0.18}
          cornerRadius={10}
          listening={false}
        />
      )}
      <Text
        text={displayName}
        x={chipCenterX - chipW / 2}
        y={chipCenterY - 6}
        width={chipW}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fill={BODY_TEXT}
        listening={false}
      />
      {displayDept && hasRoomForDept && (
        <Text
          text={displayDept}
          x={chipCenterX - chipW / 2}
          y={chipCenterY + 7}
          width={chipW}
          align="center"
          fontSize={9}
          fill={SUBTLE_TEXT}
          listening={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 2 — CARD (todiagram-style)
 *
 * A miniature card that fills the label area:
 *
 *   ┌────────────────────────┐  ← 1px department border
 *   │ ████ ENGINEERING ████ │  ← 11px solid header strip, white caps
 *   ├────────────────────────┤
 *   │        Jane Doe        │  ← 11px semibold name
 *   │        Engineer        │  ← 9px dept/title subtitle
 *   └────────────────────────┘
 *
 * The header strip uses the full department colour; the caller's seat
 * fill still shows around the card body (we don't repaint the fill —
 * the card IS the seat when this style is active). At small sizes
 * (< 60w or < 36h) we drop the header to a thin 2px coloured top
 * border so the name still fits legibly — a degraded state rather
 * than hiding the card entirely.
 *
 * For unassigned seats we keep the same outline but with a dashed
 * neutral border and an italic "Open" in the body, matching the
 * open-state idiom used elsewhere.
 * ────────────────────────────────────────────────────────────────── */
function CardLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
  underlyingFill = '#FFFFFF',
}: SeatLabelProps) {
  const accent = departmentColor ?? NEUTRAL_ACCENT
  const HEADER_H = 12
  const hasHeader = width >= 60 && height >= 36
  const padX = 6
  const bodyTop = y + (hasHeader ? HEADER_H : 2)
  const bodyH = height - (hasHeader ? HEADER_H : 2)
  const bodyCenterY = bodyTop + bodyH / 2

  if (!employee) {
    // Empty-state card — dashed neutral border, white body, italic Open.
    // The header strip is intentionally omitted for the empty state: the
    // card's job is to surface an identity and there isn't one.
    return (
      <Group listening={false}>
        <Rect
          x={x}
          y={y}
          width={width}
          height={height}
          fill={underlyingFill}
          stroke={NEUTRAL_ACCENT}
          strokeWidth={1}
          dash={[4, 4]}
          cornerRadius={4}
          listening={false}
        />
        <Text
          text="Open"
          x={x + padX}
          y={y + height / 2 - 6}
          width={width - padX * 2}
          align="center"
          fontSize={11}
          fontStyle="italic"
          fill={OPEN_TEXT}
          listening={false}
        />
      </Group>
    )
  }

  const subtitle = employee.title || employee.department || ''
  const displayName = truncateToWidth(employee.name, width - padX * 2, 11)
  const displaySubtitle = subtitle
    ? truncateToWidth(subtitle, width - padX * 2, 9)
    : ''
  const headerLabel = employee.department
    ? employee.department.toUpperCase()
    : 'DESK'
  const displayHeader = truncateToWidth(headerLabel, width - padX * 2, 8)
  const hasRoomForSubtitle = bodyH >= 24

  return (
    <Group
      clipX={x}
      clipY={y}
      clipWidth={width}
      clipHeight={height}
      listening={false}
    >
      {/* White body — painted under the header so the header reads as
          sitting on top of a clean sheet even when the outer seat has
          a cream/yellow fill. */}
      <Rect
        x={x}
        y={y}
        width={width}
        height={height}
        fill={underlyingFill}
        stroke={accent}
        strokeWidth={1}
        cornerRadius={4}
        listening={false}
      />
      {hasHeader ? (
        <>
          {/* Header strip. A separate Rect with a smaller cornerRadius
              (matching the outer 4) so the strip doesn't bleed outside
              the card at the corners — Konva doesn't do per-corner
              radii on Rect so we live with the minor mismatch at the
              bottom edge, which is hidden behind the body text anyway. */}
          <Rect
            x={x}
            y={y}
            width={width}
            height={HEADER_H}
            fill={accent}
            cornerRadius={[4, 4, 0, 0]}
            listening={false}
          />
          <Text
            text={displayHeader}
            x={x + padX}
            y={y + 2}
            width={width - padX * 2}
            align="left"
            fontSize={8}
            fontStyle="bold"
            letterSpacing={0.8}
            fill="#FFFFFF"
            listening={false}
          />
        </>
      ) : (
        // Degraded state — a 2px coloured top border instead of the
        // full header strip. Conveys the same "this belongs to X
        // department" signal with 1/6th the height cost.
        <Rect
          x={x}
          y={y}
          width={width}
          height={2}
          fill={accent}
          listening={false}
        />
      )}
      <Text
        text={displayName}
        x={x + padX}
        y={bodyCenterY - (hasRoomForSubtitle ? 9 : 6)}
        width={width - padX * 2}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fill={BODY_TEXT}
        listening={false}
      />
      {displaySubtitle && hasRoomForSubtitle && (
        <Text
          text={displaySubtitle}
          x={x + padX}
          y={bodyCenterY + 4}
          width={width - padX * 2}
          align="center"
          fontSize={9}
          fill={SUBTLE_TEXT}
          listening={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 3 — AVATAR (initials chip)
 *
 * A circular initials chip on the left with the name (and dept
 * subtitle) to its right:
 *
 *   ╭──╮  Jane Doe
 *   │JD│  Engineering
 *   ╰──╯
 *
 * The circle uses the department colour at 80% alpha so a cluster of
 * same-department seats reads as a band of colour at a glance. We
 * deliberately don't load remote profile photos: the Image loading
 * surface area in Konva (CORS, flash-of-missing-asset, cache
 * invalidation on employee update) is too much scope for a cosmetic
 * option. Initials are deterministic and never need async.
 *
 * When the seat is too narrow for chip + text side-by-side (< 50w)
 * we fall through to a centred layout: chip stacks above a centred
 * name. This keeps the style functional on workstation slots without
 * needing a per-renderer escape hatch.
 *
 * Open state: dashed 22px circle + "Open" italic, same empty-state
 * language as the other styles.
 * ────────────────────────────────────────────────────────────────── */
function AvatarLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const CHIP_D = 22
  const padX = 4
  const centerY = y + height / 2
  const tight = width < 50

  if (!employee) {
    // Dashed empty chip + "Open". Mirror the side-by-side vs. stacked
    // decision from the assigned path so the empty state looks at home
    // on both desks and narrow workstation slots.
    const chipX = tight ? x + width / 2 - CHIP_D / 2 : x + padX
    const chipY = tight ? centerY - CHIP_D - 2 : centerY - CHIP_D / 2
    return (
      <Group listening={false}>
        <Rect
          x={chipX}
          y={chipY}
          width={CHIP_D}
          height={CHIP_D}
          cornerRadius={CHIP_D / 2}
          stroke={NEUTRAL_ACCENT}
          strokeWidth={1}
          dash={[3, 3]}
          fill="transparent"
          listening={false}
        />
        {tight ? (
          <Text
            text="Open"
            x={x + padX}
            y={centerY + 2}
            width={width - padX * 2}
            align="center"
            fontSize={10}
            fontStyle="italic"
            fill={OPEN_TEXT}
            listening={false}
          />
        ) : (
          <Text
            text="Open"
            x={chipX + CHIP_D + 6}
            y={centerY - 5}
            width={width - (CHIP_D + 6 + padX * 2)}
            align="left"
            fontSize={10}
            fontStyle="italic"
            fill={OPEN_TEXT}
            listening={false}
          />
        )}
      </Group>
    )
  }

  const accent = departmentColor ?? NEUTRAL_ACCENT
  const initials = deriveInitials(employee.name)

  if (tight) {
    // Stacked layout for narrow seats. The chip rides in the top half,
    // the name centres in the bottom — we lose the subtitle here because
    // a 3-line stack on a short seat looks cramped and the department
    // cue is already carried by the chip colour.
    const chipX = x + width / 2 - CHIP_D / 2
    const chipY = y + 2
    const nameY = chipY + CHIP_D + 2
    const displayName = truncateToWidth(employee.name.split(' ')[0], width - padX * 2, 10)
    return (
      <Group listening={false}>
        <Rect
          x={chipX}
          y={chipY}
          width={CHIP_D}
          height={CHIP_D}
          cornerRadius={CHIP_D / 2}
          fill={accent}
          opacity={0.8}
          listening={false}
        />
        <Text
          text={initials}
          x={chipX}
          y={chipY + 5}
          width={CHIP_D}
          align="center"
          fontSize={10}
          fontStyle="bold"
          fill="#FFFFFF"
          listening={false}
        />
        <Text
          text={displayName}
          x={x + padX}
          y={nameY}
          width={width - padX * 2}
          align="center"
          fontSize={10}
          fontStyle="bold"
          fill={BODY_TEXT}
          listening={false}
        />
      </Group>
    )
  }

  // Side-by-side layout: chip on the left, name (and dept) stacked on
  // the right. The name area width is whatever remains after the chip.
  const chipX = x + padX
  const chipY = centerY - CHIP_D / 2
  const textX = chipX + CHIP_D + 6
  const textW = Math.max(10, width - (textX - x) - padX)
  const displayName = truncateToWidth(employee.name, textW, 11)
  const displayDept = employee.department
    ? truncateToWidth(employee.department, textW, 8)
    : ''
  const hasRoomForDept = height >= 30
  return (
    <Group listening={false}>
      <Rect
        x={chipX}
        y={chipY}
        width={CHIP_D}
        height={CHIP_D}
        cornerRadius={CHIP_D / 2}
        fill={accent}
        opacity={0.8}
        listening={false}
      />
      <Text
        text={initials}
        x={chipX}
        y={chipY + 5}
        width={CHIP_D}
        align="center"
        fontSize={10}
        fontStyle="bold"
        fill="#FFFFFF"
        listening={false}
      />
      <Text
        text={displayName}
        x={textX}
        y={centerY - (hasRoomForDept && displayDept ? 10 : 6)}
        width={textW}
        align="left"
        fontSize={11}
        fontStyle="bold"
        fill={BODY_TEXT}
        listening={false}
      />
      {displayDept && hasRoomForDept && (
        <Text
          text={displayDept}
          x={textX}
          y={centerY + 2}
          width={textW}
          align="left"
          fontSize={8}
          fill={SUBTLE_TEXT}
          listening={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 4 — BANNER (left accent stripe)
 *
 * The most restrained of the four. A 4px vertical accent stripe on
 * the left edge in the department colour, an uppercase eyebrow
 * above the name (`ENGINEERING`), and the name in plain bold on
 * the desk's natural cream fill:
 *
 *   ▌ENGINEERING
 *   ▌Jane Doe
 *
 * No tinted pill, no card body, no circular chip — the stripe alone
 * carries the department cue. This is the one to pick if the user
 * finds the other three too decorative and wants the canvas to feel
 * more like a CAD drawing than a dashboard.
 *
 * Open state: gray stripe + "Open" italic centred on the desk.
 * ────────────────────────────────────────────────────────────────── */
function BannerLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const STRIPE_W = 4
  const padX = 4
  const textX = x + STRIPE_W + padX
  const textW = Math.max(10, width - (STRIPE_W + padX * 2))
  const stripeColor = departmentColor ?? NEUTRAL_ACCENT
  const centerY = y + height / 2

  return (
    <Group listening={false}>
      <Rect
        x={x}
        y={y}
        width={STRIPE_W}
        height={height}
        fill={stripeColor}
        opacity={employee ? 1 : 0.5}
        listening={false}
      />
      {employee ? (
        (() => {
          const displayName = truncateToWidth(employee.name, textW, 11)
          const displayDept = employee.department
            ? truncateToWidth(employee.department.toUpperCase(), textW, 8)
            : ''
          const hasEyebrowRoom = height >= 28 && displayDept
          return (
            <>
              {hasEyebrowRoom && (
                <Text
                  text={displayDept}
                  x={textX}
                  y={centerY - 11}
                  width={textW}
                  align="left"
                  fontSize={8}
                  fontStyle="bold"
                  letterSpacing={0.8}
                  fill={SUBTLE_TEXT}
                  listening={false}
                />
              )}
              <Text
                text={displayName}
                x={textX}
                y={hasEyebrowRoom ? centerY - 1 : centerY - 6}
                width={textW}
                align="left"
                fontSize={11}
                fontStyle="bold"
                fill={BODY_TEXT}
                listening={false}
              />
            </>
          )
        })()
      ) : (
        <Text
          text="Open"
          x={textX}
          y={centerY - 6}
          width={textW}
          align="left"
          fontSize={11}
          fontStyle="italic"
          fill={OPEN_TEXT}
          listening={false}
        />
      )}
    </Group>
  )
}
