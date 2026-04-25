import { Group, Rect, Text } from 'react-konva'
import type { SeatLabelStyle } from '../../../types/project'
import { truncateToWidth } from '../../../lib/textTruncate'

/**
 * Wave 16 — full rework of seat-label rendering.
 *
 * Background. Wave 15C introduced four label styles. Wave 15E refined
 * geometry (pixel snapping, AccommodationBadge keep-out, font stack)
 * but didn't address the underlying design debt: every style was
 * encoding the same datum more than once. The user complaint that
 * triggered this rework was "information is duplicated and words
 * overlap" — the words-overlap problem was a downstream symptom of the
 * duplication problem.
 *
 * The duplications, with chapter-and-verse from 15E:
 *
 *   - Card style:     dept text in the header + dept text in the body
 *                     subtitle (when no title) + dept-coloured 1px
 *                     border = three encodings of the same datum.
 *   - Avatar style:   initials chip (derived from name) RIGHT BESIDE
 *                     the full name = both encoding identity.
 *                     PLUS dept text under the name AND dept colour
 *                     fill on the chip = two encodings of dept.
 *   - Banner style:   left stripe in dept colour + uppercase dept
 *                     eyebrow above the name = two encodings of dept.
 *   - Pill style:     pill background tinted with dept colour + dept
 *                     name as a subtitle line = two encodings of dept.
 *   - Cross-cutting:  `deskId` rendered as a corner badge on every
 *                     desk while it ALSO appears in the hover card and
 *                     the Properties panel = three surfaces showing
 *                     the same id at the same time.
 *
 * The fix isn't "tighten the layout math more"; it's "render fewer
 * pieces of information." A 60×40 desk is the wrong real estate for
 * multi-row data — the hover card (`ElementHoverCard.tsx`) is the
 * portalled DOM surface that exists precisely to carry that depth.
 * The canvas labels are now glanceable identity only.
 *
 * THE ANTI-DUPLICATION RULES (enforced by tests in SeatLabel.test):
 *
 *   1. The department NAME is rendered as text *zero times* in every
 *      style. Department is encoded by colour only — the pill tint, the
 *      card's top accent strip, the banner's left stripe, the avatar
 *      chip fill. Users learn the colour map within minutes; if they
 *      can't recall a colour they hover for the card.
 *   2. The employee NAME is rendered *at most once* per style. The
 *      avatar variant uses an initials chip ALONE (no name beside it);
 *      every other variant uses the full name without initials.
 *   3. Title is rendered ONLY when `employee.title` is truthy. It NEVER
 *      falls back to department. If there's no title, no second line
 *      gets drawn — the seat reads as name-only.
 *   4. The `deskId` corner badge is opt-in via `CanvasSettings.showDeskIds`
 *      (default off). When on, the renderers continue to paint the badge;
 *      when off they don't. This module never renders the deskId itself.
 *
 * ── PER-STYLE LAYOUT CONTRACTS ──────────────────────────────────────
 *
 * Each style declares explicit "render fewer pieces" rules at narrow
 * sizes — the failure mode is to drop content, not to shrink everything
 * proportionally.
 *
 *   pill:
 *     baseline       — tinted pill, full name centred (semibold, 11).
 *     w<50 OR h<28   — initials only in dept colour (no chip).
 *
 *   card (block):
 *     baseline       — 4px solid dept-coloured top accent strip,
 *                      full name centred in body, 1px dept-coloured
 *                      outer border. Title line ONLY if employee.title
 *                      is truthy AND interior height >= 24.
 *     h<36           — drop the 4px strip; reduce to a 1px top-edge
 *                      accent. Border stays.
 *
 *   avatar (initials):
 *     baseline       — 24px circular initials chip in dept colour,
 *                      white initials, centred. NOTHING else.
 *     w<36           — 18px chip, still centred, still alone.
 *
 *   banner:
 *     baseline       — 4px solid dept-coloured left stripe, full name
 *                      centred in remaining body.
 *     w<50           — stripe drops to 3px. Name stays centred.
 *
 * Hover card carries: full name, department (with colour swatch),
 * title (if any), deskId, status (decommissioned/reserved/active),
 * accommodations. See `ElementHoverCard.tsx`.
 */

/* ────────────────────────────────────────────────────────────────────
 * Cross-style constants
 * ────────────────────────────────────────────────────────────────── */

/** Top band reserved for the desk-id corner badge when `showDeskIds`
 *  is on. The DeskRenderer shares this constant so the label area
 *  never starts above it. (Wave 16: only meaningful when the user has
 *  opted into desk-id visibility; otherwise the label can use the
 *  full interior.) */
export const ID_BADGE_BAND_H = 11
/** Radius around the AccommodationBadge centre that no label content
 *  may cross. The badge is a 14px circle centred 8px inside the top-
 *  right corner; 16px around that gives a 1-2px breathing margin. */
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
/** Subtitle / supporting text — gray-500. Used for the optional
 *  `employee.title` line on the card style. */
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
 *  project the full `Employee` record down to this before calling in. */
export interface SeatLabelEmployee {
  id: string
  name: string
  department: string | null
  /** Optional; rendered as a subtitle on the `card` style ONLY when
   *  truthy. Other styles ignore it (the canvas is glanceable identity;
   *  rich employee data lives in the hover card). */
  title?: string | null
}

interface SeatLabelProps {
  style: SeatLabelStyle
  /** `null` means the seat is open/unassigned. */
  employee: SeatLabelEmployee | null
  /** Full-opacity department colour, or `null` if the employee has no
   *  department assigned (or no employee at all). */
  departmentColor: string | null
  /** Width of the usable label area. The label must stay inside this. */
  width: number
  /** Height of the usable label area. */
  height: number
  /** Top-left origin of the label area, relative to the caller's Group
   *  (which is already translated to the seat's centre). Default 0,0. */
  x?: number
  y?: number
  /** When the outer seat has its own fill, some styles draw on top of
   *  it; the card style wants to paint its own white body. */
  underlyingFill?: string
  /** Width of the visible container the label sits inside (slot width
   *  on a workstation, full desk width on a single desk). Drives the
   *  per-style narrow-size degradation rules. */
  containerWidth?: number
  /** When true, dim the whole label by ~15% — used while a drag is in
   *  flight so the DropTargetOutline reads as the dominant signal.
   *  Wave 16: also attenuates the dept-coloured border on the card
   *  style and the dept stripe on the banner so the dashed drop
   *  affordance stays the dominant edge cue. */
  attenuated?: boolean
}

/**
 * Per-style policy for where the AccommodationBadge should anchor.
 *
 * Wave 16: the card style's accent went from a 12px header strip to a
 * 4px top edge accent — small enough that the 14px badge centred 8px
 * inside the top-right corner no longer collides with it. All four
 * styles now use the legacy top-right anchor. The `'right-below-strip'`
 * variant is kept on the union for callers that pin against a future
 * style that might re-introduce a tall header.
 */
export type AccommodationBadgeAnchor = 'top-right' | 'right-below-strip'
// eslint-disable-next-line react-refresh/only-export-components
export function accommodationAnchorFor(
  _style: SeatLabelStyle,
): AccommodationBadgeAnchor {
  return 'top-right'
}

/**
 * Workstation slot degradation. Below the configured thresholds the
 * heavier styles fall back to lighter ones so the slot stays legible.
 *   - Card → Pill below COMPACT_SLOT_W (70px) — the card needs
 *     headroom for the strip + name + (optional) title row; the pill
 *     is a clean fallback that still carries the dept tint.
 *   - Avatar self-degrades inside its renderer (chip diameter shrinks
 *     to 18px below 36px width); always centred, never side-by-side.
 *   - Banner stays banner — the stripe-and-name idiom reads well at
 *     narrow widths; `BannerLabel` shrinks the stripe to 3px on its own.
 *   - Pill stays pill (and self-degrades to initials-only at <50w/<28h).
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
 * Style 1 — PILL
 *
 * Identity:    full employee name (11 semibold), centred.
 * Dept signal: pill background tint (white-under-tint stack so the
 *              colour reads cleanly over the cream desk fill).
 * NO subtitle. The tint IS the dept signal. If the user can't read
 * a colour they hover for the card.
 *
 * Narrow-size degradation: at width<50 OR height<28, render initials
 * only in dept colour (no pill). This is a "render fewer pieces" rule
 * — never a "shrink everything proportionally" rule.
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

  // Tight-mode: initials only, no chip. Workstation slots and tiny
  // desks live here — the pill chrome wouldn't fit and the full name
  // wouldn't be legible at this size, so we degrade by content rather
  // than by size.
  const tight = width < 50 || height < 28
  if (tight) {
    const initials = deriveInitials(employee.name)
    const accent = departmentColor ?? NEUTRAL_ACCENT
    return (
      <Text
        text={initials}
        x={r(x)}
        y={r(chipCenterY - 6)}
        width={r(width)}
        align="center"
        fontSize={11}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill={accent}
        listening={false}
        perfectDrawEnabled={false}
      />
    )
  }

  const displayName = truncateToWidth(employee.name, nameMaxPx, 11)

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
          {/* White lift under the tint so the colour reads cleanly
              over the cream desk fill rather than blending muddy. */}
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
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 2 — CARD (block-style accent + name)
 *
 * Identity:    full employee name (11 semibold), centred in body.
 * Dept signal: 4px solid dept-coloured top accent strip + 1px dept
 *              border (coherent edge styling, NOT a separate encoding).
 * Subtitle:    ONLY when `employee.title` is truthy AND body height
 *              is at least 24px. Never falls back to department text.
 *
 * Narrow-size degradation: when the seat is below 36px tall, drop the
 * 4px strip and use a 1px top-edge accent instead. The border stays
 * (it's the only edge cue at that size).
 * ────────────────────────────────────────────────────────────────── */
function CardLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
  underlyingFill = CARD_BODY_FILL,
  attenuated,
}: SeatLabelProps) {
  const accent = departmentColor ?? NEUTRAL_ACCENT
  const STRIP_H = 4
  const hasFullStrip = height >= 36
  const padX = 6
  const bodyTop = r(y + (hasFullStrip ? STRIP_H : 1))
  const bodyH = r(height - (hasFullStrip ? STRIP_H : 1))
  const bodyCenterY = r(bodyTop + bodyH / 2)
  // When a drag is in flight, soften the dept edge so the dashed
  // DropTargetOutline reads as the dominant signal. (`attenuated`
  // also wraps the whole label in a 0.85-opacity Group, but the
  // border deserves its own pull-back so the drop affordance pops.)
  const borderOpacity = attenuated ? 0.4 : 1

  if (!employee) {
    // Empty-state card — dashed neutral border, no strip, italic Open.
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

  const displayName = truncateToWidth(employee.name, width - padX * 2, 11)
  // `employee.title` ONLY — never falls back to department. The dept
  // is already encoded by the strip + border; rendering it as text
  // again was the duplication this rework removed.
  const subtitle = employee.title ? employee.title : ''
  const displaySubtitle = subtitle
    ? truncateToWidth(subtitle, width - padX * 2, 9)
    : ''
  const hasRoomForSubtitle = !!displaySubtitle && bodyH >= 24

  return (
    <Group
      clipX={r(x)}
      clipY={r(y)}
      clipWidth={r(width)}
      clipHeight={r(height)}
      listening={false}
    >
      {/* White body with a soft drop shadow + 1px dept-coloured border.
          The border is coherent edge styling for the strip — it makes
          the card read as a single shape rather than a strip + a body. */}
      <Rect
        x={r(x)}
        y={r(y)}
        width={r(width)}
        height={r(height)}
        fill={underlyingFill}
        stroke={accent}
        strokeWidth={1}
        opacity={borderOpacity}
        cornerRadius={4}
        shadowColor="rgba(15,23,42,0.08)"
        shadowBlur={2}
        shadowOffsetY={1}
        shadowOpacity={1}
        listening={false}
        perfectDrawEnabled={false}
      />
      {/* Top accent — full 4px strip at normal size, 1px at <36h. The
          strip alone IS the department signal; no header text. */}
      <Rect
        x={r(x)}
        y={r(y)}
        width={r(width)}
        height={hasFullStrip ? STRIP_H : 1}
        fill={accent}
        opacity={borderOpacity}
        cornerRadius={hasFullStrip ? [4, 4, 0, 0] : 0}
        listening={false}
        perfectDrawEnabled={false}
      />
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
      {hasRoomForSubtitle && (
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
 * Style 3 — AVATAR (initials chip alone)
 *
 * Identity:    24px circular chip in dept colour with white initials,
 *              centred in the seat. Nothing else — no name beside it,
 *              no dept text below. The chip IS the identity for users
 *              who want the canvas to read as a plan diagram, not a
 *              seating roster.
 *
 * Narrow-size degradation: chip diameter shrinks to 18px below 36px
 * width. Never drops below that — the chip is the entire identity at
 * any size and must remain visible.
 * ────────────────────────────────────────────────────────────────── */
function AvatarLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
}: SeatLabelProps) {
  const tightChip = width < 36 || height < 28
  const CHIP_D = tightChip ? 18 : 24
  const centerX = r(x + width / 2)
  const centerY = r(y + height / 2)
  const chipX = r(centerX - CHIP_D / 2)
  const chipY = r(centerY - CHIP_D / 2)

  if (!employee) {
    // Dashed empty chip — no surrounding text. The hover card reports
    // "Unassigned" / "Seat open"; no need to write it on the canvas.
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
        <Text
          text="Open"
          x={r(x)}
          y={r(centerY - 5)}
          width={r(width)}
          align="center"
          fontSize={tightChip ? 8 : 10}
          fontStyle="italic"
          fontFamily={LABEL_FONT}
          fill={OPEN_TEXT}
          listening={false}
          perfectDrawEnabled={false}
        />
      </Group>
    )
  }

  const accent = departmentColor ?? NEUTRAL_ACCENT
  const initials = deriveInitials(employee.name)
  // Vertical text inset inside the chip — tuned so the initials sit
  // optically centred for both sizes. (The 11/9 split tracks the chip
  // diameters; tweaking either without the other introduces drift.)
  const textInsetY = tightChip ? 4 : 6
  const initialsFontSize = tightChip ? 9 : 11

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
        y={r(chipY + textInsetY)}
        width={CHIP_D}
        align="center"
        fontSize={initialsFontSize}
        fontStyle="bold"
        fontFamily={LABEL_FONT}
        fill="#FFFFFF"
        listening={false}
        perfectDrawEnabled={false}
      />
    </Group>
  )
}

/* ────────────────────────────────────────────────────────────────────
 * Style 4 — BANNER (left accent stripe + name)
 *
 * Identity:    full employee name (11 semibold), centred vertically
 *              in the body to the right of the stripe.
 * Dept signal: 4px solid dept-coloured stripe on the LEFT edge.
 *              The stripe IS the dept signal — no eyebrow text.
 *
 * Narrow-size degradation: stripe drops to 3px below 50px container
 * width. Never disappears. Name stays.
 * ────────────────────────────────────────────────────────────────── */
function BannerLabel({
  employee,
  departmentColor,
  width,
  height,
  x = 0,
  y = 0,
  containerWidth,
  attenuated,
}: SeatLabelProps) {
  // Stripe shrinks on narrow slots so it doesn't dominate the column.
  const STRIPE_W =
    containerWidth !== undefined && containerWidth < NARROW_SLOT_W ? 3 : 4
  const padX = EDGE_PADDING
  const textX = r(x + STRIPE_W + padX)
  const textW = r(Math.max(10, width - (STRIPE_W + padX * 2)))
  const stripeColor = departmentColor ?? NEUTRAL_ACCENT
  const centerY = r(y + height / 2)
  // Soften the stripe under a drag so the dashed drop outline pops.
  const stripeOpacity = attenuated ? 0.5 : employee ? 1 : 0.5

  return (
    <Group listening={false}>
      <Rect
        x={r(x)}
        y={r(y)}
        width={STRIPE_W}
        height={r(height)}
        fill={stripeColor}
        opacity={stripeOpacity}
        listening={false}
        perfectDrawEnabled={false}
      />
      {employee ? (
        (() => {
          const displayName = truncateToWidth(employee.name, textW, 11)
          return (
            <Text
              text={displayName}
              x={textX}
              y={r(centerY - 6)}
              width={textW}
              align="left"
              fontSize={11}
              fontStyle="bold"
              fontFamily={LABEL_FONT}
              fill={BODY_TEXT}
              listening={false}
              perfectDrawEnabled={false}
            />
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
