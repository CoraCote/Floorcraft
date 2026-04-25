import { useEffect, useMemo, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { HelpSearchPalette } from './HelpSearchPalette'
import { HELP_SECTIONS } from './helpSections'

/**
 * Single-page user guide + FAQ. Deliberately kept in one file with
 * inline content so contributors can search/grep for a phrase and land
 * on the exact spot to edit — no cross-file hunting. Content is grouped
 * into anchored sections that the sidebar TOC jumps to; an
 * IntersectionObserver-driven scroll-spy keeps the active section
 * highlighted in the TOC as the reader scrolls.
 *
 * Wave 12C added a live search filter (case-insensitive substring on
 * heading + body text) that hides whole sections AND collapses the TOC
 * to matches, plus a "What's new" section at the top, copy-to-clipboard
 * anchors on each `<h2>`, and a results-count `aria-live` chip.
 */

interface Section {
  id: string
  label: string
  icon: string
  // Plain-text representation of the body so the search filter can
  // match prose without traversing the rendered React tree.
  searchText: string
  body: React.ReactNode
}

// Anchor link to another section by id. Used inside the "What's new"
// bullets so each highlight links to deeper content where one exists.
function SectionLink({ to, children }: { to: string; children: React.ReactNode }) {
  return (
    <a
      href={`#${to}`}
      className="text-blue-600 dark:text-blue-400 hover:underline"
    >
      {children}
    </a>
  )
}

const sections: Section[] = [
  {
    id: 'whats-new',
    label: "What's new",
    icon: '✨',
    searchText:
      "what's new whats new drag empty canvas pan shortcut cheat sheet command palette canvas finder plan health pill broken refs capacity multi-select align distribute toolbar floor tabs drag-reorderable duplicate presentation mode fullscreen floor navigation cmd+f cmd+k question mark dark mode system toggle theme floating action dock zoom fit minimap hover cards element tooltip alignment distance labels px scale bar north arrow rotation context menu right-click arrange align object group landing refresh how it works hero stats team home dashboard stat strip recents 5-card sort filter inline roster bulk toolbar sticky pills csv preview flow two-step quick-filter pills swipe-to-dismiss toasts embed mode watermark file menu team switcher user menu save indicator cloud saving saved failed",
    body: (
      <div className="space-y-3">
        <p>
          The last few waves have packed in editor upgrades, a dashboard
          refresh, and an app-wide dark mode. The headlines:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Dark mode everywhere</strong> — toggle cycles light → dark →
            system from the user menu. See{' '}
            <SectionLink to="a11y-darkmode">Dark mode & accessibility</SectionLink>.
          </li>
          <li>
            <strong>Floating action dock</strong> on the canvas right edge with
            zoom in/out, fit-to-content, grid/minimap toggles, and presentation
            mode. Details in <SectionLink to="map-editor">Map editor</SectionLink>.
          </li>
          <li>
            <strong>Hover cards</strong> on canvas elements show name, type,
            and seat assignment after a brief dwell. Distance labels now
            annotate alignment guides while you drag.
          </li>
          <li>
            <strong>Rebuilt team home</strong> with a stat strip, Recents row,
            search (<kbd>/</kbd>), sort, and filter.{' '}
            <SectionLink to="team-home">Team home dashboard</SectionLink>.
          </li>
          <li>
            <strong>CSV import preview</strong> — a 2-step flow with per-row
            Valid / Warning / Error badges before you commit. See{' '}
            <SectionLink to="csv-import">CSV import preview</SectionLink>.
          </li>
          <li>
            <strong>Toaster polish</strong> — slide-in, hover-pause,
            swipe-right-to-dismiss. Tone-aware colors.{' '}
            <SectionLink to="notifications">Notifications</SectionLink>.
          </li>
          <li>
            Consolidated <strong>File / Team / User</strong> dropdowns in the
            top bar, with an inline save indicator. See{' '}
            <SectionLink to="account">Account, menus & save state</SectionLink>.
          </li>
          <li>
            <strong>Embed mode</strong> on share links (<code>?embed=1</code>)
            strips chrome for dashboard embeds.{' '}
            <SectionLink to="sharing">Sharing</SectionLink>.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'getting-started',
    label: 'Getting started',
    icon: '🚀',
    searchText:
      'getting started floorcraft floor-plan editor roster offices map demo office sign up create team three-minute tour drag desk library assign person status bar double-click row side drawer auto-save cloud icon saving saved save failed',
    body: (
      <div className="space-y-4">
        <p>
          Floorcraft is two things under one roof: a <strong>floor-plan
          editor</strong> for drawing offices, and a <strong>roster</strong> for
          tracking who works there. Every office has both, and the two views
          stay in sync — assign Jamie to Desk D-014 on the map and the roster
          shows her seat, and vice versa.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Three-minute tour</h3>
        <ol className="list-decimal pl-6 space-y-2 text-gray-700 dark:text-gray-200">
          <li>
            Sign up, create a team, then hit <strong>Demo office</strong> on the
            team home. You land on a pre-populated roster with ~18 people across
            four departments — managers, seats, on-leave folks, the works.
          </li>
          <li>
            Switch between the <strong>Map</strong> and <strong>Roster</strong>
            {' '}tabs at the top. Press <kbd>M</kbd> or <kbd>R</kbd> to jump
            between them without clicking.
          </li>
          <li>
            On the map, drag a desk from the left library onto the canvas,
            then drag a person from the right sidebar onto that desk to assign
            them. Their status bar updates at the bottom.
          </li>
          <li>
            On the roster, double-click any row to open the side drawer and
            edit every field — name, email, manager, office days, equipment.
          </li>
        </ol>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Offices auto-save two seconds after the last edit. The cloud icon on
          the top bar shows live status (<em>Saving…</em> / <em>Saved just now</em>{' '}
          / <em>Save failed</em>).
        </p>
      </div>
    ),
  },
  {
    id: 'teams-offices',
    label: 'Teams & offices',
    icon: '🏢',
    searchText:
      'teams offices workspace company department family create office demo office delete trash icon confirmation dialog inviting collaborators members invite email verification resend cooldown team role admin member office role owner hr editor space planner viewer permissions read-only',
    body: (
      <div className="space-y-4">
        <p>
          A <strong>team</strong> is your workspace — a company, a department,
          a family (we don't judge). Inside a team you have <strong>offices</strong>,
          which is where the floor plan + roster actually live.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Creating offices</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Create office</strong> — blank canvas, empty roster. Good if
            you want to draw from scratch.
          </li>
          <li>
            <strong>Demo office</strong> — pre-seeded with a floor plan and
            realistic demo employees. Perfect for exploring features before
            committing real data.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Deleting offices</h3>
        <p>
          On the team home, hover an office card — the trash icon in the top
          right corner opens a confirmation dialog. Deletion is permanent: the
          floor plan, roster, history, and share links all go.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Inviting collaborators</h3>
        <p>
          Open <strong>Team → Settings → Members</strong>. Invite by email;
          invitees land on a preview screen showing who invited them and which
          team they're joining, then get a verification link. Couldn't find the
          email? The signup "Check your email" screen has a{' '}
          <strong>Resend verification</strong> button with a 30-second cooldown.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Team vs office roles</h3>
        <p>
          Permissions come in two layers. The <strong>team role</strong>{' '}
          (<strong>Admin</strong> or <strong>Member</strong>) controls team
          settings, billing, and the ability to delete offices. Each office
          then has its own <strong>office role</strong>:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Owner</strong> — full access, including audit log, reports, and share-link generation.</li>
          <li><strong>HR Editor</strong> — edit the roster + view audit log + view reports. Cannot edit the map.</li>
          <li><strong>Space Planner</strong> — edit the map + view reports. Cannot edit the roster or see the audit log.</li>
          <li><strong>Viewer</strong> — read-only. Cannot edit, export, or view reports.</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Buttons for actions your role can't perform appear disabled with a
          tooltip ("Read-only access. Contact an editor to make changes").
        </p>
      </div>
    ),
  },
  {
    id: 'team-home',
    label: 'Team home dashboard',
    icon: '🏠',
    searchText:
      "team home dashboard identity header logo name summary 5-card stat strip offices employees seats occupancy members recents row recent 3 office cards grid search slash / shortcut sort dropdown name recently opened most employees highest occupancy filter dropdown all has unassigned empty first-run welcome empty state no-match new office button gated team_members role",
    body: (
      <div className="space-y-4">
        <p>
          The team home is the landing page for a team — the gateway into
          every office in that workspace. It's also where most "where do I
          start?" traffic lands, so the page has grown a proper dashboard
          feel.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">What you see</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Identity header</strong> — the team logo, name, and a
            one-line summary (office count, member count, etc).
          </li>
          <li>
            <strong>Stat strip</strong> — five cards across the top:{' '}
            <strong>Offices</strong>, <strong>Employees</strong>,{' '}
            <strong>Seats</strong>, <strong>Occupancy</strong>, and{' '}
            <strong>Members</strong>. Calculated live from the team's
            offices.
          </li>
          <li>
            <strong>Recents row</strong> — up to three most-recently-opened
            offices pinned above the full grid so returning is a single
            click.
          </li>
          <li>
            <strong>Office grid</strong> — everything the team owns, as cards.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Finding an office</h3>
        <p>
          Above the grid there's a <strong>search input</strong>{' '}
          (<kbd>/</kbd> focuses it from anywhere on the page), a{' '}
          <strong>sort dropdown</strong>{' '}
          (<em>Name</em> / <em>Recently opened</em> /{' '}
          <em>Most employees</em> / <em>Highest occupancy</em>), and a{' '}
          <strong>filter dropdown</strong>{' '}
          (<em>All</em> / <em>Has unassigned</em> / <em>Empty</em>).
        </p>
        <p>
          Empty states come in two flavors. First-run teams (no offices yet)
          see a welcoming call-to-action that explains offices and
          highlights the <strong>Create office</strong> button. Teams that
          filter or search their way to zero matches see a different "no
          matches — clear filters?" state, not the first-run one.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The <strong>+ New office</strong> button is gated on your team
          role — members without create permission (<code>team_members.role</code>{' '}
          check) see the button disabled with a tooltip explaining who to
          ask.
        </p>
      </div>
    ),
  },
  {
    id: 'map-editor',
    label: 'Map (floor plan editor)',
    icon: '🗺️',
    searchText:
      "map floor plan editor konva canvas tools left sidebar element library multi-floor undo redo grouping live collaboration drawing walls press w wall tool snap grid double-click enter finish run drag wall midpoint curve arc placing elements desks workstations private offices conference rooms phone booths kitchens doors windows decor plants couches ghost preview snap nearest wall not-allowed cursor multiple floors floor switcher add floor delete floor unassigned safe renames desk ids unique inline error properties panel selection editing click select shift-click marquee select ctrl+d duplicate arrow nudge ctrl+g group ctrl+l lock unlock moving rotating magenta alignment guides snap shift bypass rotate handle cardinal angles 0 45 90 135 180 225 270 315 angle badge drag empty canvas pan space-hold pan middle-mouse 4px threshold presentation mode fullscreen floor arrows spawn animation fade-in scale stagger prefers-reduced-motion hover card tooltip portal 200ms PII share viewer distance labels px inverse-zoom short guides skip align distribute floating toolbar AABB 2+ 3+ horizontal vertical context menu right-click edit arrange align object group lucide icons shortcut pills empty canvas select-all toggle grid scale bar north arrow rotatable canvasSettings northRotation real-world units cmd+f finder overlay dims non-matches enter shift+enter cycle floating action dock vertical pill zoom in out fit-to-content toggle grid minimap presentation topbar plan-health pill drawer jump-to-element orphan seats doors no wall floor reorder drag-and-drop tabs duplicate floor right-click strip seat assignments arrow-key roving left right home end first last element library search filter recents row hover tooltip 250ms drag-and-drop placement cursor",
    body: (
      <div className="space-y-4">
        <p>
          The map view is a Konva-backed canvas with tools in the left sidebar
          and an element library you drag from. It supports multi-floor plans,
          undo/redo, grouping, and live collaboration.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Panning &amp; zooming</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Click-drag empty canvas to pan</strong> with the Select
            tool — no need to swap to the hand tool first. A 4-pixel movement
            threshold distinguishes a pan from a click, so quick taps still
            deselect cleanly. <kbd>Shift</kbd>+drag on empty canvas still
            gives you a marquee selection.
          </li>
          <li>
            Hold <kbd>Space</kbd> + drag for the classic pan-tool feel; release
            to snap back to whatever tool you were using. Middle-mouse drag
            pans too.
          </li>
          <li>
            Scroll to zoom around the cursor. <kbd>Ctrl</kbd>+<kbd>0</kbd>{' '}
            resets to 100%.
          </li>
          <li>
            A <strong>floating action dock</strong> on the canvas right edge
            collects zoom in / zoom out / fit-to-content / toggle grid /
            toggle minimap / enter presentation mode buttons — the same
            actions are reachable by keyboard, but the dock is there for
            mouse-first workflows.
          </li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Drawing walls</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>Press <kbd>W</kbd> or click the Wall tool.</li>
          <li>Click to drop each wall segment endpoint. Double-click or press <kbd>Enter</kbd> to finish a run.</li>
          <li>Walls snap to the grid (toggle with <kbd>G</kbd>) and to existing wall endpoints.</li>
          <li>Drag a wall midpoint to curve it into an arc.</li>
        </ol>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Element library &amp; placement</h3>
        <p>
          Drag any tile from the left <strong>Element Library</strong> onto the
          canvas — desks, workstations, private offices, conference rooms, phone
          booths, kitchens, doors, windows, and decor (plants, couches, etc).
          Tiles drop at the cursor, not at the origin, so you can aim
          placements without a second drag.
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Search filter</strong> at the top of the library filters
            tiles by label or category — useful once the list is long.
          </li>
          <li>
            <strong>Recents row</strong> surfaces the last few elements you've
            used so repeat placements are one click away.
          </li>
          <li>
            Hover a tile for 250ms to get a richer tooltip with the element's
            description.
          </li>
          <li>
            <strong>Doors and windows</strong> show a dimmed ghost preview that
            tracks your cursor and snaps to the nearest wall. If you wander
            too far from any wall the cursor flips to <code>not-allowed</code>{' '}
            and clicking does nothing — we don't drop a door in open air.
          </li>
        </ul>
        <p>
          Newly placed elements fade in (a 0.92→1 scale over 180ms) with a
          short stagger when several arrive at once, up to 60 elements. The
          animation is skipped entirely if your OS reports{' '}
          <code>prefers-reduced-motion</code>.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Hover cards on elements</h3>
        <p>
          Hover a placed element for 200ms and a small portalled card appears
          with its name, type, and any seat assignment. The card is
          suppressed during a drag and while you're in presentation mode so
          it never interrupts the action. On read-only share views, personal
          details are gated — viewers without PII access see the element type
          but not who sits there.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Alignment guides &amp; distance labels</h3>
        <p>
          While you drag, magenta alignment guides appear as edges or centers
          line up with other elements on the floor. Each guide now carries a{' '}
          <strong>distance label</strong> showing the gap in pixels, rendered
          at a fixed readable size regardless of zoom thanks to inverse-zoom
          scaling. Very short guides (under ~20 screen pixels) skip the label
          rather than crowd the canvas.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Align / distribute toolbar</h3>
        <p>
          Select 2 or more elements and a floating pill appears just above
          the selection's bounding box. It offers <strong>align left /
          center / right</strong> and <strong>align top / middle /
          bottom</strong> buttons. With 3 or more elements selected, two
          distribute buttons appear too — <strong>distribute
          horizontally</strong> and <strong>distribute vertically</strong> —
          for equal-spacing a row or column with one click.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Context menu (right-click)</h3>
        <p>
          Right-click a selection to open a context menu organized into{' '}
          <strong>Edit</strong>, <strong>Arrange</strong>,{' '}
          <strong>Align</strong>, and <strong>Object</strong> groups, each
          item paired with a lucide icon and its keyboard-shortcut pill.
          Right-click empty canvas to get <strong>Select all</strong> and{' '}
          <strong>Toggle grid</strong> — the two commands you reach for when
          nothing is selected.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Scale bar &amp; north arrow</h3>
        <p>
          A scale bar pinned to the canvas translates on-screen pixels into
          real-world units so you can sanity-check that a 4m desk is actually
          4m wide. The companion north arrow is rotatable — grab it and
          spin to match your building's orientation (the angle is persisted
          on <code>canvasSettings.northRotation</code>).
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Multiple floors</h3>
        <p>
          The floor switcher lives at the bottom of the map. <strong>+ Add
          floor</strong> spins up an empty floor; <strong>drag a floor tab</strong>{' '}
          to reorder, and the right-click menu on a tab includes a{' '}
          <strong>Duplicate</strong> action that clones every element on the
          current floor into a new one — seat assignments are stripped from
          the copy so you can reseat from a clean slate. Each floor has its
          own elements and seat assignments but shares the same roster of
          people. Deleting a floor that has people assigned to desks on it
          shows the count in the confirmation dialog ("Floor 3 has 12
          assigned employees. They will be unassigned.") and frees those
          seats automatically.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Tab-strip keyboard: once a tab has focus, <kbd>←</kbd> / <kbd>→</kbd>{' '}
          cycle to the previous / next floor and <kbd>Home</kbd> /{' '}
          <kbd>End</kbd> jump to the first / last.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Safe renames</h3>
        <p>
          Desk IDs must be unique within a floor. Renaming a desk to a name
          already in use shows an inline error in the properties panel and
          blocks the save — no silent collisions.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Selection &amp; editing</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>Click to select; Shift-click to add to selection.</li>
          <li>Drag on empty canvas to marquee-select.</li>
          <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicates; arrow keys nudge (hold <kbd>Shift</kbd> for 10px).</li>
          <li><kbd>Ctrl</kbd>+<kbd>G</kbd> groups selected elements; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroups.</li>
          <li><kbd>Ctrl</kbd>+<kbd>L</kbd> locks/unlocks selection so it can't be moved accidentally.</li>
          <li>
            With 2+ items selected, a floating <strong>align / distribute
            toolbar</strong> appears with one-click left/center/right and
            equal-spacing controls.
          </li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Moving &amp; rotating</h3>
        <p>
          As you drag an element, <strong>magenta alignment guides</strong>{' '}
          appear whenever one of its edges or its center lines up with the
          edges or center of another element on the floor (within 5 pixels).
          The element snaps to that line so desks, tables, and rooms stay
          visually coherent without fiddling. Hold <kbd>Shift</kbd> while
          dragging to bypass the snap — useful when the guide is guessing
          wrong and you want pixel-exact placement.
        </p>
        <p>
          Grab the rotate handle on the selection border to turn an element.
          The handle <strong>clicks onto cardinal angles</strong> (0°, 45°,
          90°, 135°, 180°, 225°, 270°, 315°) when you come within 5° of one,
          and a floating <strong>angle badge</strong> next to the selection
          shows the current rotation in real time. Release to commit; the
          badge disappears. Multi-select works the same — the whole group
          rotates around its collective center.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Finder overlay</h3>
        <p>
          Press <kbd>Cmd</kbd>+<kbd>F</kbd> (or <kbd>Ctrl</kbd>+<kbd>F</kbd>{' '}
          on non-mac) to open the canvas finder. Type a name, label, or
          assigned employee and matches light up while the rest of the canvas
          dims. <kbd>Enter</kbd> cycles to the next match,{' '}
          <kbd>Shift</kbd>+<kbd>Enter</kbd> to the previous. <kbd>Esc</kbd>{' '}
          closes and restores the view.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Plan-health pill</h3>
        <p>
          A pill in the top bar lights up amber or red whenever the floor has
          something off — an orphaned seat reference, a door placed without
          a host wall, a room over capacity, a manager pointing at someone
          who was deleted. Click the pill to open a drawer listing each
          issue; clicking an issue jumps the canvas to the element in
          question so you can fix it without hunting.
        </p>
      </div>
    ),
  },
  {
    id: 'annotations',
    label: 'Annotations',
    icon: '🗒️',
    searchText:
      'annotations popover focus trap tab cycle esc close enter save shift+enter newline sticky header type remove button accessible keyboard notes callouts',
    body: (
      <div className="space-y-4">
        <p>
          Annotations are lightweight text callouts you can drop on the
          canvas to mark up a floor for a review or a handoff. Select the
          Annotation tool, click to place, and the popover opens for you to
          type the note.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Keyboard behavior</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><kbd>Tab</kbd> / <kbd>Shift</kbd>+<kbd>Tab</kbd> cycle focus within the popover — focus stays trapped so screen-reader users don't escape the edit context mid-note.</li>
          <li><kbd>Enter</kbd> saves and closes. <kbd>Shift</kbd>+<kbd>Enter</kbd> inserts a newline.</li>
          <li><kbd>Esc</kbd> closes without saving.</li>
          <li>The sticky header shows the annotation type and a remove button for quick deletion.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'presentation',
    label: 'Presentation mode',
    icon: '🎬',
    searchText:
      "presentation mode p keyboard fullscreen api hide chrome arrow keys navigate floors home end first last escape exit first-run hint floocraft.presentationHintSeen action dock enter review walkthrough",
    body: (
      <div className="space-y-4">
        <p>
          Presentation mode is for walking someone through a floor plan
          without the editor chrome getting in the way. Press <kbd>P</kbd>{' '}
          anywhere in the editor — or click the projector icon in the
          floating action dock — and the canvas goes <strong>fullscreen</strong>{' '}
          via the Fullscreen API, hides every toolbar, and leaves you with a
          clean, large-format view.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">While presenting</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><kbd>←</kbd> / <kbd>→</kbd> — previous / next floor.</li>
          <li><kbd>Home</kbd> / <kbd>End</kbd> — first / last floor.</li>
          <li><kbd>Esc</kbd> — exit presentation mode and restore the editor chrome.</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          The first time you enter presentation mode a small hint strip
          shows the keyboard cheat-sheet; after you dismiss it, we persist
          the acknowledgement in <code>localStorage</code> (key{' '}
          <code>floocraft.presentationHintSeen</code>) so it never
          reappears for that browser.
        </p>
      </div>
    ),
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: '👥',
    searchText:
      "roster spreadsheet people view filters bulk actions side drawer sort inline-edit stats bar chips total active on leave unassigned pending equipment ending soon departing soon in today quick-filter pills all unassigned on-leave recent joins missing equipment aria-live count summary chip editing rows inline edit click-to-edit blur commit name dept department title status enum double-click side drawer office days weekdays mwf tth hybrid remote leave metadata leave type expected return coverage buddy notes scheduled departure date status active on leave departed undo restore desk ctrl+z toast badges warnings amber rehire end-date pill departure pill on-leave ribbon manager dangling sticky bulk-action toolbar pinned bottom clear-selection chip checkboxes set-department set-status unassign delete export-selection import csv export csv preview validation",
    body: (
      <div className="space-y-4">
        <p>
          The roster is a spreadsheet-style people view with filters, bulk
          actions, and a side drawer for full-detail editing. Every column has
          sort and inline-edit support.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Quick-filter pills</h3>
        <p>
          A row of quick-filter pills above the table gives one-click access
          to the most common slices: <strong>All</strong>,{' '}
          <strong>Unassigned</strong>, <strong>On leave</strong>,{' '}
          <strong>Recent joins</strong>, and <strong>Missing equipment</strong>.
          An <code>aria-live</code> summary chip next to them announces the
          current count so screen-reader users hear the filter change as
          well as see it.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Stat chips</h3>
        <p>
          The chips at the top of the roster aren't just decoration — they're
          click-to-filter toggles.
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Total</strong> — clears status/seat/day/equip/preset chips but keeps your search, department, and floor filters.</li>
          <li><strong>Active / On leave</strong> — filter by status.</li>
          <li><strong>Unassigned</strong> — people without a seat.</li>
          <li><strong>Pending equipment</strong> — anyone whose equipment status is still pending (only shows when &gt; 0).</li>
          <li><strong>Ending soon</strong> — contracts or internships whose <code>endDate</code> is within the next 30 days (only shows when &gt; 0).</li>
          <li><strong>Departing soon</strong> — active employees with a scheduled <code>departureDate</code> inside the next 30 days (only shows when &gt; 0).</li>
          <li><strong>In today</strong> — people whose office-days cover today's weekday (weekdays only).</li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Editing rows</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Inline edit</strong> — click a name, department, title, or status cell to enter edit mode. Blur commits; Escape cancels. Status uses a select with the enum <strong>Active</strong> / <strong>On leave</strong> / <strong>Departed</strong>.</li>
          <li><strong>Side drawer</strong> — double-click a row. Covers every field, including office-day presets (Weekdays / MWF / TTh / Hybrid / Remote), leave metadata (type, expected return, coverage buddy, notes), and scheduled departure date.</li>
          <li><strong>Status</strong> — <strong>Active</strong>, <strong>On leave</strong>, or <strong>Departed</strong>. On-leave rows surface the leave type and expected-return date in the drawer; departed rows are kept for history.</li>
          <li><strong>Status = Departed</strong> — if the person still holds a seat, a prompt asks whether to unassign it too. Direct reports get their <code>managerId</code> cleared automatically.</li>
          <li><strong>Delete</strong> — row menu or bulk action. Always shows a confirmation with a name preview.</li>
          <li><strong>Undo after restore</strong> — if you delete an assigned desk and then <kbd>Ctrl</kbd>+<kbd>Z</kbd>, the desk comes back but the assignment is dropped on purpose. A toast reads <em>"Desk restored — Jane Doe's assignment not recovered. Reassign?"</em> and jumps you to that person on the roster.</li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Badges &amp; warnings</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Amber "rehire?"</strong> — two rows share a name and department. Catches duplicate imports.</li>
          <li><strong>End-date pill</strong> — shows "in N days" when within 30 days.</li>
          <li><strong>Departure pill</strong> — active employees with a scheduled <code>departureDate</code> inside 30 days get a dated "Departing" pill.</li>
          <li><strong>On-leave ribbon</strong> — rows with status On leave show the leave type + expected return at a glance.</li>
          <li><strong>Manager dangling</strong> — the person's manager no longer exists. The drawer offers a one-click Clear.</li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Bulk actions &amp; sticky toolbar</h3>
        <p>
          Select rows via the checkboxes and a <strong>sticky bulk-action
          toolbar</strong> pins to the bottom of the viewport with the
          actions you need: <strong>set-department</strong>,{' '}
          <strong>set-status</strong>, <strong>unassign</strong>,{' '}
          <strong>delete</strong>, <strong>export selection</strong>, plus
          a <strong>clear-selection</strong> chip for when you change your
          mind. Multi-selection is preserved across filter changes so you
          can assemble a batch across views.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Import &amp; export</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Import CSV</strong> — paste a CSV or upload a file, then step through the preview before committing. The preview is a full section of its own, see <SectionLink to="csv-import">CSV import preview</SectionLink>.</li>
          <li><strong>Export CSV</strong> — export all or just selected. Round-trips cleanly back through import.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'seating',
    label: 'Seat assignment',
    icon: '💺',
    searchText:
      'seat assignment bridge map roster desk workstation private office employees ways to assign drag person right-sidebar people panel onto desk click desk assign properties panel pick person import csv seat column desk id moving unassigning swap bumped notification roster to map seat column floor select desk',
    body: (
      <div className="space-y-4">
        <p>
          Seat assignment is the bridge between the map and the roster. Any
          Desk, Workstation, or Private Office can hold one or more employees.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Ways to assign</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>Drag a person from the right-sidebar People panel onto a desk on the map.</li>
          <li>Click a desk, then click <strong>Assign</strong> in its properties panel and pick the person.</li>
          <li>Import a CSV where the <code>seat</code> column matches a desk's ID (e.g. <code>D-014</code>).</li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Moving &amp; unassigning</h3>
        <p>
          Dragging an already-seated person to another desk swaps them in. If
          the target desk is occupied, the existing occupant is bumped back to
          unassigned (you'll see a notification).
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">From roster → map</h3>
        <p>
          Click the Seat column in the roster — it takes you to the map,
          switches to the right floor, and selects the desk. Fast way to
          answer "where does Jamie sit?".
        </p>
      </div>
    ),
  },
  {
    id: 'reports',
    label: 'Reports',
    icon: '📊',
    searchText:
      'reports tab top bar dashboard utilization floor utilization per-floor occupancy capacity desks workstations private offices red yellow green department headcount active employees grouped department sorted unassigned alphabetically exporting export csv snapshot owner hr editor space planner viewers stat strip headline occupancy seated unassigned departments sticky tab nav arrow-key roving empty state no employees',
    body: (
      <div className="space-y-4">
        <p>
          The <strong>Reports</strong> tab (top bar, next to Map and Roster) is
          a lightweight dashboard for pilot-scale utilization questions. It
          reads straight from the current office — no separate data pipeline.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Layout</h3>
        <p>
          A <strong>stat strip</strong> at the top of the page carries four
          headline numbers — <strong>Occupancy</strong>,{' '}
          <strong>Seated</strong>, <strong>Unassigned</strong>, and{' '}
          <strong>Departments</strong> — for an at-a-glance read. Below the
          strip, tabs switch between the detail views and{' '}
          <strong>stick to the top on scroll</strong> so you can jump
          between them without losing your place. Tabs support arrow-key
          roving (<kbd>←</kbd> / <kbd>→</kbd>) for keyboard users. If the
          office has no employees yet, Reports renders a friendly empty
          state directing you to the roster.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">What's in it</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Floor utilization</strong> — per-floor occupancy. Capacity
            counts desks as 1 seat, workstations by their <code>positions</code>,
            and private offices by the <code>capacity</code> you set on each
            one. A bar turns red below 50%, yellow below 80%, green otherwise.
          </li>
          <li>
            <strong>Department headcount</strong> — active employees grouped by
            department, sorted by count (with no-department people bucketed as
            "(None)").
          </li>
          <li>
            <strong>Unassigned</strong> — active employees who don't yet have a
            seat. Sorted alphabetically.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Exporting</h3>
        <p>
          Each section has its own <strong>Export CSV</strong> button so you
          can hand numbers to someone outside the tool. Exports are a snapshot
          of the current view; they're not signed or versioned.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Who can see it: Owner, HR Editor, and Space Planner. Viewers and
          unauthenticated visitors cannot.
        </p>
      </div>
    ),
  },
  {
    id: 'csv-import',
    label: 'CSV import preview',
    icon: '📥',
    searchText:
      'csv import preview two-step flow paste continue validate row valid warning error badges select-all-valid select-all clear back paste step preserved bulk controls employees roster bulk import',
    body: (
      <div className="space-y-4">
        <p>
          CSV import runs as a <strong>two-step flow</strong> so you can
          review exactly what will land before any data is written.
        </p>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Paste step</strong> — drop your CSV text (or upload a
            file) into the input and click <strong>Continue</strong>.
          </li>
          <li>
            <strong>Preview step</strong> — every row is validated and
            rendered in a table with a{' '}
            <strong>Valid</strong> / <strong>Warning</strong> /{' '}
            <strong>Error</strong> badge. Warnings are rows we can import
            but want to flag (duplicate name, unknown department);
            errors are rows that cannot be imported as-is and must be
            fixed before commit.
          </li>
        </ol>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Bulk selection</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Select all valid</strong> — the common case: commit only the rows that passed validation cleanly.</li>
          <li><strong>Select all</strong> — including warnings (errors stay blocked).</li>
          <li><strong>Clear</strong> — deselect everything.</li>
        </ul>
        <p>
          Hitting <strong>Back</strong> returns you to the paste step with
          your text preserved — no need to re-paste after fixing a typo in
          the source.
        </p>
      </div>
    ),
  },
  {
    id: 'command-palette',
    label: 'Command palette',
    icon: '⚡',
    searchText:
      'command palette cmd+k ctrl+k recents ribbon recently invoked scope chip home end first last result section icons lucide uppercase header files edit elements view tools empty state searchx no matches',
    body: (
      <div className="space-y-4">
        <p>
          Press <kbd>Cmd</kbd>+<kbd>K</kbd> (or <kbd>Ctrl</kbd>+<kbd>K</kbd>{' '}
          on non-mac) to open the command palette — every action in the
          editor, plus navigation and view commands, in one fuzzy-searchable
          list.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Organization</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            Commands are grouped into sections like <strong>Files</strong>,{' '}
            <strong>Edit</strong>, <strong>Elements</strong>,{' '}
            <strong>View</strong>, and <strong>Tools</strong>, each with a
            lucide section icon and an uppercase header.
          </li>
          <li>
            A <strong>scope chip</strong> at the top shows what the palette
            is currently filtered to (e.g. elements on this floor, or
            global).
          </li>
          <li>
            <strong>Recents ribbon</strong> — with an empty query, the top
            row shows the commands you've invoked most recently so repeating
            a workflow is one key away.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Keyboard</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><kbd>↑</kbd> / <kbd>↓</kbd> — move selection.</li>
          <li><kbd>Home</kbd> / <kbd>End</kbd> — jump to first / last result.</li>
          <li><kbd>Enter</kbd> — run the highlighted command.</li>
          <li><kbd>Esc</kbd> — close without running.</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          When your query matches nothing, a SearchX icon and a "No matches"
          message fill the results area — a deliberate empty state so you
          know the palette heard you, the term just didn't match anything.
        </p>
      </div>
    ),
  },
  {
    id: 'notifications',
    label: 'Notifications & toasts',
    icon: '🔔',
    searchText:
      'notifications toasts toaster slide-in right 180ms slide-out 160ms hover-pause auto-dismiss swipe right dismiss 40px threshold spring back tone-aware icons success warn warning error info colored left-border accent 8000ms errors 5000ms default prefers-reduced-motion translate',
    body: (
      <div className="space-y-4">
        <p>
          Transient feedback — "Saved", "Import complete", "Couldn't delete"
          — surfaces in the toaster in the bottom-right of the app. The
          toaster is keyboard-friendly, animation-aware, and gets out of
          your way fast.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Behavior</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Slide-in / slide-out</strong> — toasts slide in from the
            right (180ms) and slide out on dismiss (160ms). If your OS
            reports <code>prefers-reduced-motion</code>, the translate is
            dropped and the toast just fades.
          </li>
          <li>
            <strong>Hover-pause</strong> — hovering a toast pauses its
            auto-dismiss timer so you have time to read. Move away and the
            countdown resumes.
          </li>
          <li>
            <strong>Swipe-right to dismiss</strong> — grab a toast and drag
            right. Past the 40-pixel threshold it commits; inside the
            threshold it springs back.
          </li>
          <li>
            <strong>Tone-aware</strong> — <em>success</em> /{' '}
            <em>warning</em> / <em>error</em> / <em>info</em> each get a
            themed icon and a colored left-border accent.
          </li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Auto-dismiss is 5000ms for most tones and 8000ms for errors —
          errors linger longer so they don't vanish before you read them.
        </p>
      </div>
    ),
  },
  {
    id: 'account',
    label: 'Account, menus & save state',
    icon: '👤',
    searchText:
      'account menu topbar top bar dropdown file menu consolidated project export share groups team switcher dropdown sections switch team manage help footer initials avatar blue-dot active indicator search input 9+ teams identity cluster user menu account profile theme-toggle row inline help user guide keyboard shortcuts overlay destructive red sign out save indicator saved saving save failed cloud icon',
    body: (
      <div className="space-y-4">
        <p>
          The top bar has four identity-adjacent dropdowns that cover most
          non-editor actions. Each has been refreshed for consistency and
          keyboard accessibility.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">File menu</h3>
        <p>
          A single <strong>File</strong> dropdown replaces the string of
          inline buttons that used to live in the top bar. Inside, the
          commands are grouped into <strong>Project</strong>,{' '}
          <strong>Export</strong>, and <strong>Share</strong> sections so
          "where do I export PDF again?" becomes a single click.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Team switcher</h3>
        <p>
          The team switcher lives in the identity cluster on the right side
          of the top bar. Inside, teams are grouped into{' '}
          <strong>Switch team</strong>, <strong>Manage</strong>,{' '}
          <strong>Help</strong>, and a footer. Each team has an initials
          avatar; the currently active team is marked with a blue dot. Once
          you're in 9 or more teams a search input appears at the top of
          the menu.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">User menu</h3>
        <p>
          Open your avatar in the top-right for the user menu.
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Account section</strong> — your profile link plus an
            inline <strong>theme toggle</strong> row that cycles{' '}
            light → dark → system.
          </li>
          <li>
            <strong>Help section</strong> — User guide (this page) and{' '}
            <strong>Keyboard shortcuts</strong> (opens the overlay directly
            instead of dumping you on a help anchor).
          </li>
          <li>
            <strong>Sign out</strong> — destructive red, pinned at the
            bottom, clearly separated from the rest.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Save indicator</h3>
        <p>
          Next to the File menu, a cloud icon doubles as a live save-state
          indicator:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Saved Xs ago</strong> — steady-state, all committed.</li>
          <li><strong>Saving…</strong> — a write is in flight.</li>
          <li><strong>Save failed</strong> — the last write errored; click to retry.</li>
        </ul>
      </div>
    ),
  },
  {
    id: 'audit-log',
    label: 'Audit log',
    icon: '📋',
    searchText:
      'audit log compliance review employees added updated deleted seat assignments floor lifecycle csv imports actor action target metadata filters action employee.delete csv.import owner hr editor append-only',
    body: (
      <div className="space-y-4">
        <p>
          The audit log captures meaningful mutations for compliance-friendly
          review: employees added/updated/deleted, seat assignments, floor
          lifecycle events, and CSV imports. Each entry records the actor,
          action, target, and a small metadata blob.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Filters</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Actor</strong> — filter to a specific user ID.</li>
          <li><strong>Action</strong> — filter to a specific event type (e.g. <code>employee.delete</code>, <code>csv.import</code>).</li>
        </ul>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Who can see it: Owner and HR Editor. The log is append-only — no one
          can edit or delete entries from the UI, and the database policies
          block UPDATE/DELETE as well.
        </p>
      </div>
    ),
  },
  {
    id: 'sharing',
    label: 'Sharing & read-only view',
    icon: '🔗',
    searchText:
      'sharing read-only links owners public link roster sign-in url snapshot contractor recruiter exec creating link share top bar create share link token revoke audit events scope share view full chrome canvas embed mode ?embed=1 watermark status bar minimap default off pii gated',
    body: (
      <div className="space-y-4">
        <p>
          Owners can generate a public read-only link so anyone with the URL
          can see the office without signing in — useful for contractors,
          recruiters, execs, or dashboard embeds.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Creating a link</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>On the map, open <strong>Share</strong> from the File menu (top bar).</li>
          <li>Click <strong>Create share link</strong>. The URL is of the form <code>/shared/&lt;office-id&gt;/&lt;token&gt;</code>.</li>
          <li>Copy the link. Anyone with it opens straight into the read-only view — no sign-in required.</li>
        </ol>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Share view vs embed mode</h3>
        <p>
          The share link opens into a <strong>read-only canvas</strong> with
          full chrome — top bar, floor switcher, minimap — so the viewer can
          navigate floors and zoom the way you can in the editor. Selection,
          placement, and all writes are disabled.
        </p>
        <p>
          Append <code>?embed=1</code> to the URL for <strong>embed mode</strong>:
          no chrome at all, just the canvas plus a small watermark status
          bar. The minimap defaults off in embed mode because most embeds
          are small and the mini eats valuable real estate — the viewer can
          re-enable it from the action dock. Embed mode is what to use when
          iframing the plan into a Notion page, intranet dashboard, or
          README.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Revoking</h3>
        <p>
          Hit <strong>Revoke</strong> in the same panel. The token is marked
          revoked immediately; subsequent visits show "This share link isn't
          valid."
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Personal details on hover cards are PII-gated for share viewers:
          they see element type and generic labels but not who sits there.
          Both create and revoke emit audit events.
        </p>
      </div>
    ),
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    icon: '⌨️',
    searchText:
      'keyboard shortcuts cheat sheet overlay search filter keys actions cmd vs ctrl mac detection aria-live count editing ctrl+z undo ctrl+shift+z redo ctrl+d duplicate ctrl+a select all delete del ctrl+g group ctrl+l lock unlock tools v select w wall r rectangle e ellipse t text view ctrl+plus minus zoom in out ctrl+0 reset g toggle grid p presentation m roster general escape deselect cancel question mark cheat sheet arrow nudge cmd cmd+k command palette cmd+f canvas finder space pan slash / focus search team home',
    body: (
      <div className="space-y-4">
        <p>
          Press <kbd>?</kbd> anywhere in the editor to pop the cheat sheet
          overlay. The overlay has a search filter at the top so you can
          narrow the list by keyword, and it detects your platform — Macs
          see <kbd>⌘</kbd> pills while everything else shows <kbd>Ctrl</kbd>.
          An <code>aria-live</code> region announces the match count as you
          type. The highlights:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Editing</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Undo</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Redo</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>D</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Duplicate</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>A</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Select all</dd><br />
              <dt className="inline"><kbd>Del</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Delete selected</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>G</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Group</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>L</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Lock / unlock</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">Tools</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>V</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Select</dd><br />
              <dt className="inline"><kbd>W</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Wall</dd><br />
              <dt className="inline"><kbd>R</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Rectangle</dd><br />
              <dt className="inline"><kbd>E</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Ellipse</dd><br />
              <dt className="inline"><kbd>T</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Text</dd><br />
              <dt className="inline">Hold <kbd>Space</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Temporary pan</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">View</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>-</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Zoom in / out</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>0</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Reset zoom</dd><br />
              <dt className="inline"><kbd>G</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Toggle grid</dd><br />
              <dt className="inline"><kbd>P</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Presentation mode</dd><br />
              <dt className="inline"><kbd>M</kbd> / <kbd>R</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Map / Roster</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 dark:text-gray-100 mb-1.5">General</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Cmd</kbd>+<kbd>K</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Command palette</dd><br />
              <dt className="inline"><kbd>Cmd</kbd>+<kbd>F</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Canvas finder (map)</dd><br />
              <dt className="inline"><kbd>Esc</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Deselect / cancel</dd><br />
              <dt className="inline"><kbd>?</kbd></dt><dd className="inline text-gray-600 dark:text-gray-300"> — Show cheat sheet</dd><br />
              <dt className="inline">Arrow keys</dt><dd className="inline text-gray-600 dark:text-gray-300"> — Nudge 1px (Shift = 10px)</dd>
            </dl>
          </div>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-3">
          On macOS, use <kbd>Cmd</kbd> wherever <kbd>Ctrl</kbd> appears.
        </p>
      </div>
    ),
  },
  {
    id: 'a11y-darkmode',
    label: 'Dark mode & accessibility',
    icon: '🌓',
    searchText:
      "dark mode light theme system aware toggle cycle user menu paired classes tailwind landing page sticky backdrop-blurred nav wordmark pricing help sign in anchors hero stats tabular-nums teams seats floors how it works draw seat share three-step numbered circles connector line 2x3 feature grid multi-floor orchestration live presence cursors presentation mode footer columns product resources company a11y accessibility skip-link aria tabs aria-live save state focus rings primitives 104 components paired",
    body: (
      <div className="space-y-4">
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Dark mode</h3>
        <p>
          Floorcraft has an app-wide dark mode — over a hundred components
          were paired so every surface, border, and focus ring has a dark
          counterpart. Open the user menu (top-right avatar) and use the
          theme toggle row to cycle <strong>Light → Dark → System</strong>.
          The System option follows your OS preference and flips
          automatically when it changes.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Accessibility</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Skip link</strong> — the first focusable element on
            every page jumps straight to the main content, so keyboard users
            don't tab through the whole nav every page load.
          </li>
          <li>
            <strong>Proper tabs</strong> — Reports, the roster filters, and
            other tab groups use the ARIA tabs pattern with arrow-key
            roving and a focus indicator.
          </li>
          <li>
            <strong>aria-live regions</strong> — save state, count chips,
            toast tone, and the copy-link confirmation on this page all
            announce politely to screen readers.
          </li>
          <li>
            <strong>Focus rings</strong> — every primitive (buttons, inputs,
            chips) has a visible, high-contrast focus ring that works in
            both light and dark mode.
          </li>
          <li>
            <strong>Reduced motion</strong> — spawn animations, toaster
            translates, and similar flourishes check{' '}
            <code>prefers-reduced-motion</code> and scale back to a simple
            fade when the OS asks.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Landing page</h3>
        <p>
          The public landing page got a refresh alongside dark mode. The
          top nav is sticky and backdrop-blurred, with the wordmark,{' '}
          <em>Pricing</em>, <em>Help</em>, <em>Sign in</em> anchors, and a
          theme toggle. The hero now includes a stats row (with{' '}
          <code>tabular-nums</code> so the numbers don't jitter) showing
          total teams using Floorcraft, seats planned, and floors. A{' '}
          <strong>How it works</strong> section walks through{' '}
          <em>Draw → Seat → Share</em> as a three-step explainer with
          numbered circles joined by a connector line. Below that, a 2×3
          feature grid covers Multi-floor orchestration, Live presence
          cursors, Presentation mode, and the rest. The footer has
          Product / Resources / Company columns.
        </p>
      </div>
    ),
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: '❓',
    searchText:
      "faq frequently asked questions create first office data saved automatically two people edited same office optimistic locking conflict modal undo delete csv duplicate employees rehire badge departed leave parental leave coverage stat chips ending soon align desks rotate angle export floor plan image png pdf change email password admin owner schedule departure dark mode theme toggle embed share link iframe toasts swipe dismiss presentation mode fullscreen",
    body: (
      <div className="space-y-5">
        <FaqItem q="How do I create my first office?">
          After signing up, you'll be guided to create a team. On the team home
          page, click <strong>Create office</strong> for a blank canvas or{' '}
          <strong>Demo office</strong> for a pre-populated example with real
          employees and seat assignments.
        </FaqItem>

        <FaqItem q="Is my data saved automatically?">
          Yes — every edit auto-saves two seconds after you stop interacting.
          The cloud icon in the top bar shows the current state: Saving…,
          Saved just now, or Save failed (with click-to-retry). You never need
          to press a save button.
        </FaqItem>

        <FaqItem q="Two people edited the same office at the same time — what happens?">
          We use optimistic locking on each save. If your teammate saved after
          you loaded, your next save surfaces a Conflict modal showing both
          versions; you can <strong>Overwrite</strong> to force your copy or{' '}
          <strong>Reload</strong> to take theirs. The overwritten version is
          kept in server-side history, so nothing is truly lost.
        </FaqItem>

        <FaqItem q="Can I undo a delete?">
          Yes — for elements and employees that were deleted during a session,
          <kbd>Ctrl</kbd>+<kbd>Z</kbd> restores them. A deleted office itself
          is not recoverable from the UI, so the confirmation dialog explicitly
          calls that out.
        </FaqItem>

        <FaqItem q="How does CSV import handle duplicate employees?">
          Rows are matched by email when present, otherwise by name + department.
          Exact matches update the existing employee; new rows get added. The
          preview screen shows you the plan before you commit.
        </FaqItem>

        <FaqItem q="What does the amber 'rehire?' badge mean?">
          Two active employees share the same name and department. This often
          happens after a CSV re-import where the tool couldn't match the
          returning employee. Click the row to review; either merge manually
          or mark one as Departed.
        </FaqItem>

        <FaqItem q="Someone just left the company — what's the right flow?">
          Set their Status to <strong>Departed</strong>. The roster will ask
          whether to also free their seat (the default answer is yes). Their
          record sticks around for history; direct reports get their managerId
          cleared automatically so manager lookups don't go stale.
        </FaqItem>

        <FaqItem q="Can I have more than one floor?">
          Yes. Use the floor switcher at the bottom of the map view to add,
          rename, reorder, or delete floors. Each floor has its own elements
          but shares the roster, so a single employee can be seated on any
          floor.
        </FaqItem>

        <FaqItem q="Does this work offline?">
          The editor keeps working as long as the page stays loaded, but saves
          require a connection. If a save fails the UI retries with backoff;
          if you close the tab while offline, unsaved changes are lost.
        </FaqItem>

        <FaqItem q="How do I share a read-only view with someone who doesn't have an account?">
          Open <strong>Share</strong> in the top bar (Owner role required),
          click <strong>Create share link</strong>, and copy the URL. The
          recipient opens it and sees the roster as a static table — no sign-in
          needed. Hit <strong>Revoke</strong> in the same panel when the link
          is no longer needed. See the Sharing section above for details.
        </FaqItem>

        <FaqItem q="I signed up but never got the verification email.">
          The "Check your email" screen has a <strong>Resend verification
          email</strong> button right below the message. It enforces a
          30-second cooldown to avoid double-sends. If it still doesn't arrive,
          check spam; otherwise the email service may be misconfigured — file
          an issue.
        </FaqItem>

        <FaqItem q="Who gets to see the Reports and Audit log?">
          Reports: Owner, HR Editor, and Space Planner. Viewers cannot.{' '}
          Audit log: Owner and HR Editor only. Unauthorized roles see a{' '}
          "Not authorized" message; the Reports / Audit log nav pills also hide
          themselves when the action isn't permitted.
        </FaqItem>

        <FaqItem q="What's the difference between Admin and Owner?">
          <strong>Admin</strong> and <strong>Member</strong> are{' '}
          <em>team-level</em> roles — they decide who can manage billing,
          invite collaborators, and delete offices at the team level.{' '}
          <strong>Owner</strong>, <strong>HR Editor</strong>,{' '}
          <strong>Space Planner</strong>, and <strong>Viewer</strong> are{' '}
          <em>office-level</em> roles that govern what you can do inside a
          specific office. A team Admin isn't automatically an office Owner —
          check the office permissions.
        </FaqItem>

        <FaqItem q="How do I schedule someone's departure without deleting them yet?">
          Open the side drawer on their row and set <strong>Departure
          date</strong>. Their status stays Active but they pick up a "Departing
          in N days" pill and count toward the <em>Departing soon</em> stat
          chip. On the actual departure date, flip their status to Departed
          (which prompts to unassign their seat).
        </FaqItem>

        <FaqItem q="Someone is on parental leave — where do I capture coverage?">
          Set their status to On leave. The drawer exposes <strong>Leave
          type</strong>, <strong>Expected return</strong>,{' '}
          <strong>Coverage employee</strong>, and <strong>Notes</strong>. The
          row gets an On-leave ribbon showing type + return at a glance.
        </FaqItem>

        <FaqItem q="Why do some stat chips disappear?">
          Chips for conditions with zero matches (Pending equipment, Ending
          soon) hide themselves rather than showing as greyed zeros. A "0
          Pending equipment" chip reads like a false alarm; hiding the chip
          until something's actually pending keeps the bar honest.
        </FaqItem>

        <FaqItem q="What counts as 'Ending soon'?">
          Any employee whose <code>endDate</code> is within the next 30 days.
          Contractors and interns usually populate this; full-time hires leave
          it blank.
        </FaqItem>

        <FaqItem q="How do I align desks precisely to each other?">
          Just drag — when the element's edge or center gets within 5 pixels
          of another element's edge or center, a magenta guide line appears
          and the element snaps to it. Dragging a new desk next to an
          existing row is how most alignment gets done. If the snap is
          fighting you, hold <kbd>Shift</kbd> while dragging to turn it off
          and drop pixel-exact.
        </FaqItem>

        <FaqItem q="How do I rotate an element to a specific angle?">
          Click to select, then grab the rotate handle that hovers above the
          selection. The handle snaps to cardinal angles (0°, 45°, 90°,
          135°, 180°, 225°, 270°, 315°) with a 5° tolerance, and a floating
          badge next to the selection shows the live angle in degrees while
          you drag. Release when the badge reads what you want. Multi-select
          rotates the whole group around its collective center.
        </FaqItem>

        <FaqItem q="Can I export a floor plan as an image?">
          Yes — <strong>Export</strong> in the top bar offers PNG and PDF.
          Exports use your current zoom + selection + presentation settings,
          so hide whatever you don't want to print first.
        </FaqItem>

        <FaqItem q="How do I change my email or password?">
          Open <strong>Account</strong> from the top-right menu. Password
          changes go through a verification email; email changes update after
          confirming on the new address.
        </FaqItem>

        <FaqItem q="How do I turn on dark mode?">
          Open the user menu (top-right avatar) and use the theme toggle
          row. It cycles <strong>Light → Dark → System</strong>; the{' '}
          <em>System</em> option tracks your OS preference and flips
          automatically. See <SectionLink to="a11y-darkmode">Dark mode &amp; accessibility</SectionLink>.
        </FaqItem>

        <FaqItem q="Can I embed the floor plan in another page?">
          Yes — create a share link, then append{' '}
          <code>?embed=1</code> to the URL. Embed mode drops the chrome,
          keeps the canvas, and shows a small watermark status bar. Great
          for iframes in Notion, intranet dashboards, or a README.
          Full details in{' '}
          <SectionLink to="sharing">Sharing & read-only view</SectionLink>.
        </FaqItem>

        <FaqItem q="A toast is blocking the button I need — can I dismiss it faster?">
          Hover over it to pause the auto-dismiss while you read, then
          swipe it to the right to dismiss immediately. Pushing past the
          40-pixel threshold commits the dismiss; anything under that and
          the toast springs back. See{' '}
          <SectionLink to="notifications">Notifications &amp; toasts</SectionLink>.
        </FaqItem>

        <FaqItem q="How do I give a presentation of a floor plan?">
          Press <kbd>P</kbd> or use the projector button in the floating
          action dock to enter presentation mode. The canvas goes
          fullscreen, chrome is hidden, and <kbd>←</kbd> / <kbd>→</kbd>{' '}
          walk through floors. <kbd>Esc</kbd> exits. A first-run hint
          appears once and is then remembered via{' '}
          <code>floocraft.presentationHintSeen</code>.
        </FaqItem>

        <FaqItem q="I still can't find what I'm looking for.">
          File an issue or email support — we read every one. Including the
          team name and office name (from the URL) helps us repro fast.
        </FaqItem>
      </div>
    ),
  },
]

function FaqItem({ q, children }: { q: string; children: React.ReactNode }) {
  return (
    <details className="group border-l-2 border-gray-200 dark:border-gray-800 pl-4 py-1 hover:border-blue-400">
      <summary className="cursor-pointer font-medium text-gray-900 dark:text-gray-100 list-none flex items-center gap-2">
        <span className="text-gray-400 dark:text-gray-500 group-open:rotate-90 transition-transform">▸</span>
        {q}
      </summary>
      <div className="mt-2 text-gray-700 dark:text-gray-200 text-sm leading-relaxed">{children}</div>
    </details>
  )
}

/**
 * Header `<h2>` for each section. Clicking the inline `#` icon copies the
 * deep-link URL to the clipboard and surfaces a brief aria-live
 * confirmation so screen-reader and sighted users alike get feedback.
 */
function SectionHeading({
  id,
  icon,
  label,
  onCopy,
}: {
  id: string
  icon: string
  label: string
  onCopy: (id: string) => void
}) {
  return (
    <h2
      id={`heading-${id}`}
      className="group text-2xl font-semibold text-gray-900 dark:text-gray-100 mb-4 flex items-center gap-2 scroll-mt-20"
    >
      <span aria-hidden>{icon}</span>
      <a
        href={`#${id}`}
        className="hover:underline"
        onClick={(e) => {
          // Plain navigation still works (browsers handle the hash) but
          // we additionally write the absolute URL to the clipboard so
          // sharing is one click instead of two.
          e.preventDefault()
          onCopy(id)
        }}
      >
        {label}
      </a>
      <button
        type="button"
        onClick={() => onCopy(id)}
        aria-label={`Copy link to ${label}`}
        className="opacity-0 group-hover:opacity-100 focus:opacity-100 text-gray-400 dark:text-gray-500 hover:text-blue-600 dark:hover:text-blue-400 text-base font-normal transition-opacity"
      >
        #
      </button>
    </h2>
  )
}

export function HelpPage() {
  const [activeId, setActiveId] = useState(sections[0].id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})
  const [paletteOpen, setPaletteOpen] = useState(false)
  const [query, setQuery] = useState('')
  // `copyMsg` drives the aria-live confirmation chip after an anchor
  // copy; it auto-clears after a short timeout so a screen reader gets
  // the announcement without permanent visible noise.
  const [copyMsg, setCopyMsg] = useState('')

  const trimmedQuery = query.trim().toLowerCase()
  const filteredSections = useMemo(() => {
    if (!trimmedQuery) return sections
    return sections.filter((s) => {
      const haystack = `${s.label} ${s.searchText}`.toLowerCase()
      return haystack.includes(trimmedQuery)
    })
  }, [trimmedQuery])

  const matchCount = filteredSections.length
  const isFiltered = trimmedQuery.length > 0

  // cmd-K / ctrl-K opens the section search palette. Scoped to this
  // page; the listener is unmounted when you navigate away.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        setPaletteOpen(true)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // Scroll-spy via IntersectionObserver. We track all visible section
  // refs and pick whichever one's top has crossed the rootMargin band
  // most recently — this matches the user's intuition of "the section
  // I'm reading right now". Falls back to the first section when nothing
  // is intersecting (e.g. the user is at the very top above all
  // sections).
  useEffect(() => {
    if (typeof IntersectionObserver === 'undefined') return
    const visible = new Set<string>()
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            visible.add(entry.target.id)
          } else {
            visible.delete(entry.target.id)
          }
        }
        // Pick the first visible section in document order.
        for (const s of sections) {
          if (visible.has(s.id)) {
            setActiveId(s.id)
            return
          }
        }
      },
      {
        // Bias toward the top of the viewport: a section becomes
        // "active" once its top hits ~120px below the page top, which
        // accounts for the fixed header without flipping prematurely.
        rootMargin: '-120px 0px -60% 0px',
        threshold: 0,
      },
    )
    for (const s of sections) {
      const el = sectionRefs.current[s.id]
      if (el) observer.observe(el)
    }
    return () => observer.disconnect()
  }, [])

  // Auto-clear the copy-confirmation aria-live message after a short
  // moment so the announcement fires once and the chip fades.
  useEffect(() => {
    if (!copyMsg) return
    const id = window.setTimeout(() => setCopyMsg(''), 1800)
    return () => window.clearTimeout(id)
  }, [copyMsg])

  const handleCopyAnchor = (id: string) => {
    const url = `${window.location.origin}${window.location.pathname}#${id}`
    // Update the URL hash so back/forward stays consistent with what
    // the user just copied.
    if (typeof window.history?.replaceState === 'function') {
      window.history.replaceState(null, '', `#${id}`)
    }
    const announce = () => setCopyMsg('Link copied')
    const announceFail = () => setCopyMsg('Copy failed')
    try {
      const clip = navigator.clipboard
      if (clip && typeof clip.writeText === 'function') {
        clip
          .writeText(url)
          .then(announce)
          .catch(announceFail)
        return
      }
    } catch {
      // fall through to fallback below
    }
    // No clipboard API (older browsers / locked-down contexts): still
    // give the user feedback that the URL is now in the address bar.
    announce()
  }

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-gray-800/50">
      <header className="border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold text-gray-900 dark:text-gray-100 hover:text-blue-600 dark:hover:text-blue-400">
            Floorcraft
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/dashboard" className="text-gray-700 dark:text-gray-200 hover:text-blue-600 dark:hover:text-blue-400">
              Dashboard
            </Link>
            <Link
              to="/account"
              className="px-3 py-1.5 border rounded hover:bg-gray-50 dark:hover:bg-gray-800/50 text-gray-700 dark:text-gray-200"
            >
              Account
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 md:gap-10">
        {/*
          Mobile (< md): the TOC collapses into a <details> block at
          the top of the page so the reader doesn't have to scroll past
          a stack of nav links to reach content.
        */}
        <details className="md:hidden -mb-2 rounded border border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-800/50 text-sm">
          <summary className="cursor-pointer select-none px-3 py-2 text-gray-700 dark:text-gray-200 font-medium flex items-center justify-between">
            <span>On this page</span>
            <span className="text-xs text-gray-500 dark:text-gray-400 font-normal">
              {filteredSections.length} sections
            </span>
          </summary>
          <div className="px-2 pb-2">
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search help…"
              aria-label="Search help"
              className="w-full mb-2 px-2 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500"
            />
            <nav
              role="navigation"
              aria-label="Table of contents"
              className="space-y-0.5"
            >
              {filteredSections.map((s) => (
                <a
                  key={s.id}
                  href={`#${s.id}`}
                  className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                    activeId === s.id
                      ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                      : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                  }`}
                >
                  <span aria-hidden>{s.icon}</span>
                  {s.label}
                </a>
              ))}
              {filteredSections.length === 0 && (
                <div className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">
                  No sections match.{' '}
                  <button
                    type="button"
                    onClick={() => setQuery('')}
                    className="text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    Clear
                  </button>
                </div>
              )}
            </nav>
          </div>
        </details>

        {/* Desktop sticky sidebar TOC */}
        <aside className="hidden md:block md:sticky md:top-6 md:self-start">
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search help…"
            aria-label="Search help"
            className="w-full mb-3 px-2.5 py-1.5 text-sm rounded border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-900 text-gray-700 dark:text-gray-200 placeholder:text-gray-400 dark:placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500/30 focus:border-blue-400"
          />
          <div className="text-xs uppercase tracking-wide text-gray-500 dark:text-gray-400 mb-2 flex items-center justify-between">
            <span>On this page</span>
            <span
              role="status"
              aria-live="polite"
              className="text-[11px] normal-case tracking-normal text-gray-400 dark:text-gray-500"
            >
              {isFiltered
                ? matchCount === 1
                  ? '1 section matches'
                  : `${matchCount} sections match`
                : ''}
            </span>
          </div>
          <div className="text-xs text-gray-400 dark:text-gray-500 mb-3">
            Press{' '}
            <kbd className="px-1 py-0.5 rounded border border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900 text-gray-600 dark:text-gray-300">
              ⌘K
            </kbd>{' '}
            to search
          </div>
          <nav
            role="navigation"
            aria-label="Table of contents"
            className="space-y-0.5 text-sm"
          >
            {filteredSections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                  activeId === s.id
                    ? 'bg-blue-50 dark:bg-blue-950/40 text-blue-700 dark:text-blue-300 font-medium'
                    : 'text-gray-700 dark:text-gray-200 hover:bg-gray-100 dark:hover:bg-gray-800'
                }`}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </a>
            ))}
            {filteredSections.length === 0 && (
              <div className="px-2 py-2 text-sm text-gray-500 dark:text-gray-400">
                No sections match.{' '}
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="text-blue-600 dark:text-blue-400 hover:underline"
                >
                  Clear
                </button>
              </div>
            )}
          </nav>
        </aside>

        <main className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-gray-100 mb-2">User guide</h1>
          <p className="text-gray-600 dark:text-gray-300 mb-6 max-w-2xl">
            Everything you need to design an office, populate a roster, and
            keep both in sync. Use the sidebar to jump around, or scroll top
            to bottom.
          </p>

          {/* aria-live confirmation for "copied!" — visible chip too */}
          <div
            role="status"
            aria-live="polite"
            className={`min-h-[20px] mb-4 text-xs ${copyMsg ? 'text-green-600 dark:text-green-400' : 'text-transparent'}`}
          >
            {copyMsg || ''}
          </div>

          {filteredSections.length === 0 ? (
            <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-8 text-center text-gray-500 dark:text-gray-400">
              <div className="text-base mb-2">No sections match "{query}".</div>
              <button
                type="button"
                onClick={() => setQuery('')}
                className="text-blue-600 dark:text-blue-400 hover:underline text-sm"
              >
                Clear search
              </button>
            </div>
          ) : (
            filteredSections.map((s) => (
              <section
                key={s.id}
                id={s.id}
                ref={(el) => {
                  sectionRefs.current[s.id] = el
                }}
                className="mb-14 scroll-mt-20"
                aria-labelledby={`heading-${s.id}`}
              >
                <SectionHeading
                  id={s.id}
                  icon={s.icon}
                  label={s.label}
                  onCopy={handleCopyAnchor}
                />
                <div className="prose prose-sm max-w-none text-gray-700 dark:text-gray-200 leading-relaxed">
                  {s.body}
                </div>
              </section>
            ))
          )}

          <footer className="mt-20 pt-6 border-t border-gray-200 dark:border-gray-800 text-sm text-gray-500 dark:text-gray-400">
            <p>
              Guide out of date?{' '}
              <a
                href="https://github.com/rcasto123/Floorcraft/issues/new"
                className="text-blue-600 dark:text-blue-400 hover:underline"
                target="_blank"
                rel="noreferrer"
              >
                File an issue
              </a>{' '}
              and we'll fix it.
            </p>
          </footer>
        </main>
      </div>

      <HelpSearchPalette
        open={paletteOpen}
        onClose={() => setPaletteOpen(false)}
        sections={HELP_SECTIONS}
      />
    </div>
  )
}
