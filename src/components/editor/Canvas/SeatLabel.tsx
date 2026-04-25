import { Group, Rect, Text } from 'react-konva'
import type { SeatLabelStyle } from '../../../types/project'
import { truncateToWidth } from '../../../lib/textTruncate'

/**
 * Wave 15C — shared seat-label component.
 * Wave 15E — refinement pass: no-overlap layout + crisp rendering.
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
 * ── 15E AUDIT ─────────────────────────────────────────────────────
 *
 * Collisions found before the refinement and how they're resolved:
 *
 * 1. Card-style header strip vs AccommodationBadge.
 *    The card draws an accent-coloured strip across the top 12px of the
 *    seat. AccommodationBadge is a 14px circle in the top-right at
 *    `(w/2 - 8, -h/2 + 8)` — exactly where the strip sits. Resolution:
 *    DeskRenderer queries `accommodationAnchorFor(style)` and pushes the
 *    badge below the strip when card is active.
 *
 * 2. Pill chip vs ID-badge band on small desks.
 *    The pill chip used to be centred on the full desk height; on a
 *    60×40 with the id-badge band claiming the top 11px the chip would
 *    encroach. Resolution: callers pass an interior x/y/w/h that's
 *    already inset past the id-badge band; `EDGE_PADDING` ensures we
 *    never draw within 4px of any edge of that interior region.
 *
 * 3. Half-pixel anti-aliasing.
 *    Konva does not snap fractional coordinates — `width/2` arithmetic
 *    leaves 0.5px residuals on odd-width seats. Resolution: every x/y/w/h
 *    expression in this file is wrapped in `Math.round(...)` via the `r()`
 *    helper. Konva still anti-aliases strokes, but the body geometry is
 *    now whole-pixel and rectangles read crisp.
 *
 * 4. Muddy department tint.
 *    The 0.18-alpha pill fill mixes the cream desk colour into the
 *    department colour and reads muddy at any zoom. Resolution: pill
 *    now stacks a 0.95-alpha white rect under a 0.30-alpha department
 *    colour rect over the desk fill, so the department colour reads
 *    cleanly without losing the soft "tinted" feel.
 *
 * 5. Default font family.
 *    Konva falls back to Arial when no fontFamily is supplied; the rest
 *    of the chrome uses Inter. Resolution: every Text node passes
 *    `fontFamily={LABEL_FONT}` so canvas labels match the toolbars.
 *
 * 6. Workstation slot degradation.
 *    Slot widths can drop below the legible threshold for the richer
 *    styles. Resolution: `containerWidth` prop drives explicit
 *    fallbacks — see `degradeStyle()`.
 *
 * Design references:
 *
 *   - `'pill'` is the pre-15C baseline. Default so upgrading doesn't
 *     change what existing users see.
 *   - `'card'` reaches for the todiagram / JSON-Crack aesthetic the
 *     user called out: solid department-coloured header strip with
 *     uppercase caps, crisp white body with centred name + subtitle,
 *     1px department-coloured border, soft drop shadow.
 *   - `'avatar'` puts a circular initials chip next to the name — same
 *     department colour but used as identity, not tint. 24px chip with
 *     a 1px white inset stroke for clean contrast on any desk fill.
 *   - `'banner'` is the restrained option: a 4px left-edge accent
 *     stripe, an uppercase eyebrow, and the name in plain bold. The
 *     stripe alone carries the department cue.
 */

/* ────────────────────────────────────────────────────────────────────
 * Cross-style constants (Wave 15E)
 * ────────────────────────────────────────────────────────────────── */

/** Top band reserved for the desk-id corner badge. The DeskRenderer
 *  shares this constant so the label area never starts above it. */
export const ID_BADGE_BAND_H = 11
/** Radius around the AccommodationBadge centre that no label content may
 *  cross. The badge is a 14px circle centred 8px inside the top-right
 *  corner; 16px around that gives a 1-2px breathing margin. */
export const ACCOMMODATION_BADGE_KEEPOUT = 16
/** Minimum padding from any edge of the label's interior rect to its
 *  drawn content. Prevents text from kissing the seat stroke. */
export const EDGE_PADDING = 4

/** Workstation slot width below which the richer styles degrade. Pulled
 *  out as constants so callers can mirror the thresholds in tests. */
export const NARROW_SLOT_W = 50
export const COMPACT_SLOT_W = 70

/** Canvas-text font stack. Mirrors the rest of the chrome so labels look
 *  native rather than falling through to Konva's default Arial. */
const LABEL_FONT = 'Inter, system-ui, -apple-system, sans-serif'

/** Body text colour — Tailwind gray-800. */
const BODY_TEXT = '#1F2937'
/** Subtitle / dept label — gray-500. */
const SUBTLE_TEXT = '#6B7280'
/** Empty-state italic — gray-400. */
const OPEN_TEXT = '#9CA3AF'
/** Fallback border / accent for unassigned-or-unknown-department seats. */
const NEUTRAL_ACCENT = '#9CA3AF'
/** Body-fill on the card style. Light only — canvas isn't rendered in
 *  dark mode currently. */
const CARD_BODY_FILL = '#FFFFFF'

/** Pixel-snap helper. Wraps `Math.round` so call sites read tight. */
function r(n: number): number {
  return Math.round(n)
}

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
   *  (which is already translated to the seat's centre). Default 0,0. */
  x?: number
  y?: number
  /** When the outer seat has its own fill, some styles draw on top of it;
   *  others (like `'card'`) want to paint their own white body. */
  underlyingFill?: string
  /** Width of the visible container the label sits inside (slot width on a
   *  workstation, full desk width on a single desk). When narrower than the
   *  rich-style thresholds the label degrades to a compatible style. */
  containerWidth?: number
  /** When true, dim the whole label by ~15% — used while a drag is in
   *  flight so the DropTargetOutline reads as the dominant signal. */
  attenuated?: boolean
}

/**
 * Per-style policy for where the AccommodationBadge should anchor.
 * Card draws an opaque top strip that the badge would collide with;
 * pushing the badge below the strip is the cleaner fix versus shrinking
 * the strip away from the corner. Other styles keep the legacy top-right.
 */
export type AccommodationBadgeAnchor = 'top-right' | 'right-below-strip'
// eslint-disable-next-line react-refresh/only-export-components
export function accommodationAnchorFor(
  style: SeatLabelStyle,
): AccommodationBadgeAnchor {
  return style === 'card' ? 'right-below-strip' : 'top-right'
}

/**
 * Workstation slot degradation. Below the configured thresholds the
 * heavier styles fall back to lighter ones so the slot stays legible.
 *   - Card → Pill below COMPACT_SLOT_W (70px) — the header strip and body
 *     text both need that headroom; the pill is the cleanest fallback.
 *   - Avatar self-degrades inside its renderer (stacked layout under
 *     50px, chip-only under 60px+32h), so no remap here.
 *   - Banner stays banner at every width — the stripe-and-name idiom
 *     actually reads BETTER at narrow widths than the centred pill, and
 *     `BannerLabel` shrinks the stripe to 3px and drops the eyebrow on
 *     its own when the container is narrow.
 *   - Pill stays pill.
 */
function degradeStyle(
  style: SeatLabelStyle,
  containerWidth: number | undefined,
): SeatLabelStyle {
  if (containerWidth === undefined) return style
  if (containerWidth < COMPACT_SLOT_W && style === 'card') return 'pill'
  return style
}

/**
 * Derive up-to-two-letter initials from the employee's display name.
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
  const { width, height, containerWidth, attenuated } = props
  // Degenerate sizes can't usefully host any style. Bail early so we
  // never emit a Konva node with a negative dimension.
  if (width < 10 || height < 10) return null
  const effectiveStyle = degradeStyle(props.style, containerWidth)
  const inner = (() => {
    switch (effectiveStyle) {
      case 'card':
        return <CardLabel {...props} style="card" />
      case 'avatar':
        return <AvatarLabel {...props} style="avatar" />
      case 'banner':
        return <BannerLabel {...props} style="banner" />
      case 'pill':
      default:
        return <PillLabel {...props} style="pill" />
    }
  })()
  // Drag-attenuation wrap — drops everything by 15% so the dashed
  // DropTargetOutline reads as the dominant signal.
  if (attenuated) {
    return (
      <Group opacity={0.85} listening={false}>
        {inner}
      </Group>
    )
  }
  return inner
}

/* ────────────────────────────────────────────────────────────────────
 * Style 1 — PILL (baseline, refined)
 *
 * 15E: stacked white-under-tint instead of muddy 0.18 fill, true-pill
 *      cornerRadius, pixel-snapped geometry, Inter font.
 * ────────────────────────────────────────────────────────────────── */
function PillLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const padX = EDGE_PADDING
  const chipInnerPadX = 6
  const chipW = Math.max(20, width - padX * 2)
  const chipH = Math.min(20, Math.max(14, height - 4))
  const chipCenterX = r(x + width / 2)
  const chipCenterY = r(y + height / 2)
  const nameMaxPx = chipW - chipInnerPadX * 2

  if (!employee) {
    return (
      <Text
        text="Open"
        x={r(x + padX)}
        y={r(chipCenterY - 6)}
        width={r(width - padX * 2)}
        align="center"
        fontSize={11}
        fontStyle="italic"
        fontFamily={LABEL_FONT}
        fill={OPEN_TEXT}
        listening={false}
        perfectDrawEnabled={false}
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
      clipX={r(x)}
      clipY={r(y)}
      clipWidth={r(width)}
      clipHeight={r(height)}
      listening={false}
    >
      {departmentColor && (
        <>
          {/* White lift under the tint so the colour reads cleanly over
              the cream desk fill rather than blending muddy. */}
          <Rect
            x={r(chipCenterX - chipW / 2)}
            y={r(chipCenterY - chipH / 2)}
            width={r(chipW)}
            height={r(chipH)}
            fill="#FFFFFF"
            opacity={0.92}
            cornerRadius={r(chipH / 2)}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Rect
            x={r(chipCenterX - chipW / 2)}
            y={r(chipCenterY - chipH / 2)}
            width={r(chipW)}
            height={r(chipH)}
            fill={departmentColor}
            opacity={0.3}
            cornerRadius={r(chipH / 2)}
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      )}
      <Text
        text={displayName}
        x={r(chipCenterX - chipW / 2)}
        y={r(chipCenterY - 6)}
        width={r(chipW)}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill={BODY_TEXT}
        listening={false}
        perfectDrawEnabled={false}
      />
      {displayDept && hasRoomForDept && (
        <Text
          text={displayDept}
          x={r(chipCenterX - chipW / 2)}
          y={r(chipCenterY + 7)}
          width={r(chipW)}
          align="center"
          fontSize={9}
          fontFamily={LABEL_FONT}
          fill={SUBTLE_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 2 — CARD (todiagram-style, refined)
 *
 * 15E: pixel-snapped, soft drop-shadow on the body, header strip stays
 *      a clean accent block (AccommodationBadge gets pushed below the
 *      strip via accommodationAnchorFor), subtitle suppressed when the
 *      body is shorter than 24px so the name keeps breathing room.
 * ────────────────────────────────────────────────────────────────── */
function CardLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
  underlyingFill = CARD_BODY_FILL,
}: SeatLabelProps) {
  const accent = departmentColor ?? NEUTRAL_ACCENT
  const HEADER_H = 12
  const hasHeader = width >= 60 && height >= 36
  const padX = 6
  const bodyTop = r(y + (hasHeader ? HEADER_H : 2))
  const bodyH = r(height - (hasHeader ? HEADER_H : 2))
  const bodyCenterY = r(bodyTop + bodyH / 2)

  if (!employee) {
    // Empty-state card — dashed neutral border, white body, italic Open.
    return (
      <Group listening={false}>
        <Rect
          x={r(x)}
          y={r(y)}
          width={r(width)}
          height={r(height)}
          fill={underlyingFill}
          stroke={NEUTRAL_ACCENT}
          strokeWidth={1}
          dash={[4, 4]}
          cornerRadius={4}
          listening={false}
          perfectDrawEnabled={false}
        />
        <Text
          text="Open"
          x={r(x + padX)}
          y={r(y + height / 2 - 6)}
          width={r(width - padX * 2)}
          align="center"
          fontSize={11}
          fontStyle="italic"
          fontFamily={LABEL_FONT}
          fill={OPEN_TEXT}
          listening={false}
          perfectDrawEnabled={false}
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
      clipX={r(x)}
      clipY={r(y)}
      clipWidth={r(width)}
      clipHeight={r(height)}
      listening={false}
    >
      {/* White body with a soft drop shadow — gives the card a deliberate
          "lifted off the canvas" feel at zoom-in without bleeding at
          zoom-out. */}
      <Rect
        x={r(x)}
        y={r(y)}
        width={r(width)}
        height={r(height)}
        fill={underlyingFill}
        stroke={accent}
        strokeWidth={1}
        cornerRadius={4}
        shadowColor="rgba(15,23,42,0.08)"
        shadowBlur={2}
        shadowOffsetY={1}
        shadowOpacity={1}
        listening={false}
        perfectDrawEnabled={false}
      />
      {hasHeader ? (
        <>
          <Rect
            x={r(x)}
            y={r(y)}
            width={r(width)}
            height={HEADER_H}
            fill={accent}
            cornerRadius={[4, 4, 0, 0]}
            listening={false}
            perfectDrawEnabled={false}
          />
          <Text
            text={displayHeader}
            x={r(x + padX)}
            y={r(y + 2)}
            width={r(width - padX * 2)}
            align="left"
            fontSize={8}
            fontStyle="bold"
            fontFamily={LABEL_FONT}
            letterSpacing={0.8}
            fill="#FFFFFF"
            listening={false}
            perfectDrawEnabled={false}
          />
        </>
      ) : (
        // Degraded state — a 2px coloured top border instead of the
        // full header strip.
        <Rect
          x={r(x)}
          y={r(y)}
          width={r(width)}
          height={2}
          fill={accent}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
      <Text
        text={displayName}
        x={r(x + padX)}
        y={r(bodyCenterY - (hasRoomForSubtitle ? 9 : 6))}
        width={r(width - padX * 2)}
        align="center"
        fontSize={11}
        fontStyle="600"
        fontFamily={LABEL_FONT}
        fill={BODY_TEXT}
        listening={false}
        perfectDrawEnabled={false}
      />
      {displaySubtitle && hasRoomForSubtitle && (
        <Text
          text={displaySubtitle}
          x={r(x + padX)}
          y={r(bodyCenterY + 4)}
          width={r(width - padX * 2)}
          align="center"
          fontSize={9}
          fontFamily={LABEL_FONT}
          fill={SUBTLE_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 3 — AVATAR (initials chip, refined)
 *
 * 15E: 24px chip (was 22) with a 1px white inset stroke so it reads
 *      cleanly against any seat fill, 11px semibold initials, opaque
 *      department colour (no opacity reduction — the chip IS the
 *      identity). Width-gated fallbacks for narrow workstation slots.
 * ────────────────────────────────────────────────────────────────── */
function AvatarLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const CHIP_D = 24
  const padX = EDGE_PADDING
  const centerY = r(y + height / 2)
  // < 50px → stacked layout (chip above, name below or chip-only)
  // < 60px → drop the name entirely and centre the chip
  const tight = width < 50
  const ultraTight = width < 60 && height < 32

  if (!employee) {
    // Dashed empty chip + "Open"
    const chipX = tight ? r(x + width / 2 - CHIP_D / 2) : r(x + padX)
    const chipY = tight ? r(centerY - CHIP_D - 2) : r(centerY - CHIP_D / 2)
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
          perfectDrawEnabled={false}
        />
        {tight ? (
          <Text
            text="Open"
            x={r(x + padX)}
            y={r(centerY + 2)}
            width={r(width - padX * 2)}
            align="center"
            fontSize={10}
            fontStyle="italic"
            fontFamily={LABEL_FONT}
            fill={OPEN_TEXT}
            listening={false}
            perfectDrawEnabled={false}
          />
        ) : (
          <Text
            text="Open"
            x={r(chipX + CHIP_D + 6)}
            y={r(centerY - 5)}
            width={r(width - (CHIP_D + 6 + padX * 2))}
            align="left"
            fontSize={10}
            fontStyle="italic"
            fontFamily={LABEL_FONT}
            fill={OPEN_TEXT}
            listening={false}
            perfectDrawEnabled={false}
          />
        )}
      </Group>
    )
  }

  const accent = departmentColor ?? NEUTRAL_ACCENT
  const initials = deriveInitials(employee.name)

  // Ultra-tight: just the chip, centred. No name (won't be legible).
  if (ultraTight) {
    const chipX = r(x + width / 2 - CHIP_D / 2)
    const chipY = r(y + height / 2 - CHIP_D / 2)
    return (
      <Group listening={false}>
        <Rect
          x={chipX}
          y={chipY}
          width={CHIP_D}
          height={CHIP_D}
          cornerRadius={CHIP_D / 2}
          fill={accent}
          stroke="#FFFFFF"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
        <Text
          text={initials}
          x={chipX}
          y={r(chipY + 6)}
          width={CHIP_D}
          align="center"
          fontSize={11}
          fontStyle="bold"
          fontFamily={LABEL_FONT}
          fill="#FFFFFF"
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>
    )
  }

  if (tight) {
    // Stacked layout for narrow seats.
    const chipX = r(x + width / 2 - CHIP_D / 2)
    const chipY = r(y + 2)
    const nameY = r(chipY + CHIP_D + 2)
    const displayName = truncateToWidth(
      employee.name.split(' ')[0],
      width - padX * 2,
      10,
    )
    return (
      <Group listening={false}>
        <Rect
          x={chipX}
          y={chipY}
          width={CHIP_D}
          height={CHIP_D}
          cornerRadius={CHIP_D / 2}
          fill={accent}
          stroke="#FFFFFF"
          strokeWidth={1}
          listening={false}
          perfectDrawEnabled={false}
        />
        <Text
          text={initials}
          x={chipX}
          y={r(chipY + 6)}
          width={CHIP_D}
          align="center"
          fontSize={11}
          fontStyle="bold"
          fontFamily={LABEL_FONT}
          fill="#FFFFFF"
          listening={false}
          perfectDrawEnabled={false}
        />
        <Text
          text={displayName}
          x={r(x + padX)}
          y={nameY}
          width={r(width - padX * 2)}
          align="center"
          fontSize={10}
          fontStyle="bold"
          fontFamily={LABEL_FONT}
          fill={BODY_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>
    )
  }

  // Side-by-side: chip on the left, name + dept on the right.
  const chipX = r(x + padX)
  const chipY = r(centerY - CHIP_D / 2)
  const textX = r(chipX + CHIP_D + 6)
  const textW = r(Math.max(10, width - (textX - x) - padX))
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
        stroke="#FFFFFF"
        strokeWidth={1}
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        text={initials}
        x={chipX}
        y={r(chipY + 6)}
        width={CHIP_D}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill="#FFFFFF"
        listening={false}
        perfectDrawEnabled={false}
      />
      <Text
        text={displayName}
        x={textX}
        y={r(centerY - (hasRoomForDept && displayDept ? 10 : 6))}
        width={textW}
        align="left"
        fontSize={11}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill={BODY_TEXT}
        listening={false}
        perfectDrawEnabled={false}
      />
      {displayDept && hasRoomForDept && (
        <Text
          text={displayDept}
          x={textX}
          y={r(centerY + 2)}
          width={textW}
          align="left"
          fontSize={8}
          fontFamily={LABEL_FONT}
          fill={SUBTLE_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 4 — BANNER (left accent stripe, refined)
 *
 * 15E: pixel-snapped, stripe drops to 3px on narrow slots, centred
 *      vertical block, eyebrow gated by both height AND container width.
 * ────────────────────────────────────────────────────────────────── */
function BannerLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
  containerWidth,
}: SeatLabelProps) {
  // Stripe shrinks on narrow slots so it doesn't dominate the column.
  const STRIPE_W =
    containerWidth !== undefined && containerWidth < NARROW_SLOT_W ? 3 : 4
  const padX = EDGE_PADDING
  const textX = r(x + STRIPE_W + padX)
  const textW = r(Math.max(10, width - (STRIPE_W + padX * 2)))
  const stripeColor = departmentColor ?? NEUTRAL_ACCENT
  const centerY = r(y + height / 2)

  return (
    <Group listening={false}>
      <Rect
        x={r(x)}
        y={r(y)}
        width={STRIPE_W}
        height={r(height)}
        fill={stripeColor}
        opacity={employee ? 1 : 0.5}
        listening={false}
        perfectDrawEnabled={false}
      />
      {employee ? (
        (() => {
          const displayName = truncateToWidth(employee.name, textW, 11)
          const displayDept = employee.department
            ? truncateToWidth(employee.department.toUpperCase(), textW, 8)
            : ''
          // Drop the eyebrow on narrow slots even if the seat is tall
          // — there isn't horizontal room for both the dept text and a
          // legible name.
          const hasEyebrowRoom =
            height >= 28 &&
            !!displayDept &&
            (containerWidth === undefined || containerWidth >= COMPACT_SLOT_W)
          return (
            <>
              {hasEyebrowRoom && (
                <Text
                  text={displayDept}
                  x={textX}
                  y={r(centerY - 11)}
                  width={textW}
                  align="left"
                  fontSize={8}
                  fontStyle="bold"
                  fontFamily={LABEL_FONT}
                  letterSpacing={0.8}
                  fill={SUBTLE_TEXT}
                  listening={false}
                  perfectDrawEnabled={false}
                />
              )}
              <Text
                text={displayName}
                x={textX}
                y={hasEyebrowRoom ? r(centerY - 1) : r(centerY - 6)}
                width={textW}
                align="left"
                fontSize={11}
                fontStyle="bold"
                fontFamily={LABEL_FONT}
                fill={BODY_TEXT}
                listening={false}
                perfectDrawEnabled={false}
              />
            </>
          )
        })()
      ) : (
        <Text
          text="Open"
          x={textX}
          y={r(centerY - 6)}
          width={textW}
          align="left"
          fontSize={11}
          fontStyle="italic"
          fontFamily={LABEL_FONT}
          fill={OPEN_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      )}
    </Group>
  )
}
