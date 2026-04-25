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
      "what's new whats new drag empty canvas pan shortcut cheat sheet command palette canvas finder plan health pill broken refs capacity multi-select align distribute toolbar floor tabs drag-reorderable duplicate presentation mode fullscreen floor navigation cmd+f cmd+k question mark",
    body: (
      <div className="space-y-3">
        <p>
          Recent waves shipped a stack of editor upgrades. The highlights:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <strong>Drag empty canvas to pan</strong> — no need to switch tools
            first. See <SectionLink to="map-editor">Map editor</SectionLink>.
          </li>
          <li>
            Press <kbd>?</kbd> for the shortcut cheat sheet. Full reference in{' '}
            <SectionLink to="shortcuts">Keyboard shortcuts</SectionLink>.
          </li>
          <li>
            Press <kbd>Cmd</kbd>+<kbd>F</kbd> for the canvas finder — type a
            label to highlight matching elements.
          </li>
          <li>
            Press <kbd>Cmd</kbd>+<kbd>K</kbd> for the command palette — every
            action in one searchable list.
          </li>
          <li>
            The <strong>plan health pill</strong> in the top bar surfaces
            broken references and capacity issues at a glance.
          </li>
          <li>
            Multi-select shows a floating <strong>align / distribute toolbar</strong>{' '}
            so you can line up rows of desks in one click.
          </li>
          <li>
            Floor tabs are now drag-reorderable; each has a{' '}
            <strong>Duplicate</strong> action to clone a layout to a new floor.
          </li>
          <li>
            <strong>Presentation mode</strong> goes fullscreen with{' '}
            <kbd>←</kbd> / <kbd>→</kbd> floor navigation.
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
    id: 'map-editor',
    label: 'Map (floor plan editor)',
    icon: '🗺️',
    searchText:
      "map floor plan editor konva canvas tools left sidebar element library multi-floor undo redo grouping live collaboration drawing walls press w wall tool snap grid double-click enter finish run drag wall midpoint curve arc placing elements desks workstations private offices conference rooms phone booths kitchens doors windows decor plants couches ghost preview multiple floors floor switcher add floor delete floor unassigned safe renames desk ids unique inline error properties panel selection editing click select shift-click marquee select ctrl+d duplicate arrow nudge ctrl+g group ctrl+l lock unlock moving rotating magenta alignment guides snap shift bypass rotate handle cardinal angles 0 45 90 135 180 225 270 315 angle badge drag empty canvas pan space-hold pan presentation mode fullscreen floor arrows",
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
            <strong>Drag empty canvas</strong> to pan with the select tool —
            no need to swap to the hand tool first.
          </li>
          <li>
            Hold <kbd>Space</kbd> + drag for the classic pan-tool feel; release
            to snap back to whatever tool you were using.
          </li>
          <li>
            Scroll to zoom around the cursor. <kbd>Ctrl</kbd>+<kbd>0</kbd>{' '}
            resets to 100%.
          </li>
        </ul>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Drawing walls</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>Press <kbd>W</kbd> or click the Wall tool.</li>
          <li>Click to drop each wall segment endpoint. Double-click or press <kbd>Enter</kbd> to finish a run.</li>
          <li>Walls snap to the grid (toggle with <kbd>G</kbd>) and to existing wall endpoints.</li>
          <li>Drag a wall midpoint to curve it into an arc.</li>
        </ol>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Placing elements</h3>
        <p>
          Drag any tile from the left <strong>Element Library</strong> onto the
          canvas — desks, workstations, private offices, conference rooms, phone
          booths, kitchens, doors, windows, and decor (plants, couches, etc).
          Doors and windows show a ghost preview that snaps to the nearest wall
          as you hover.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Multiple floors</h3>
        <p>
          The floor switcher lives at the bottom of the map. <strong>+ Add
          floor</strong> spins up an empty floor; <strong>drag a floor tab</strong>{' '}
          to reorder, and the right-click menu on a tab includes a{' '}
          <strong>Duplicate</strong> action to clone the current layout into a
          new floor. Each floor has its own elements and seat assignments but
          shares the same roster of people. Deleting a floor that has people
          assigned to desks on it shows the count in the confirmation dialog
          ("Floor 3 has 12 assigned employees. They will be unassigned.") and
          frees those seats automatically.
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

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Finder &amp; presentation</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>
            <kbd>Cmd</kbd>+<kbd>F</kbd> opens the <strong>canvas finder</strong>:
            type a label and matching elements light up while everything else
            dims. <kbd>Enter</kbd> cycles to the next match.
          </li>
          <li>
            <kbd>P</kbd> toggles <strong>presentation mode</strong> — the
            canvas goes fullscreen, chrome retracts, and <kbd>←</kbd> /{' '}
            <kbd>→</kbd> walk through floors.
          </li>
          <li>
            The <strong>plan health pill</strong> in the top bar lights up
            amber/red when something needs attention — broken seat references,
            over-capacity rooms, dangling managers — and opens a drawer listing
            each issue with a jump-to link.
          </li>
        </ul>
      </div>
    ),
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: '👥',
    searchText:
      "roster spreadsheet people view filters bulk actions side drawer sort inline-edit stats bar chips total active on leave unassigned pending equipment ending soon departing soon in today editing rows inline edit double-click side drawer office days weekdays mwf tth hybrid remote leave metadata leave type expected return coverage buddy notes scheduled departure date status active on leave departed undo restore desk ctrl+z toast badges warnings amber rehire end-date pill departure pill on-leave ribbon manager dangling bulk actions checkboxes set-department set-status unassign delete export-selection import csv export csv preview validation",
    body: (
      <div className="space-y-4">
        <p>
          The roster is a spreadsheet-style people view with filters, bulk
          actions, and a side drawer for full-detail editing. Every column has
          sort and inline-edit support.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100">The stats bar</h3>
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
          <li><strong>Inline edit</strong> — click or double-click a cell. Enter / blur commits; Escape cancels.</li>
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

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Bulk actions</h3>
        <p>
          Select rows via the checkboxes. The action bar lights up with
          set-department / set-status / unassign / delete / export-selection.
          Multi-selection is preserved across filter changes so you can
          assemble a batch across views.
        </p>

        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Import &amp; export</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li><strong>Import CSV</strong> — paste a CSV or upload a file. A preview panel lists each row with a status (New / Update / Error) and surfaces per-row validation before you commit — no more silent drops on malformed data. Manager references resolve by name; duplicates are matched by email (falling back to name + department).</li>
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
      'reports tab top bar dashboard utilization floor utilization per-floor occupancy capacity desks workstations private offices red yellow green department headcount active employees grouped department sorted unassigned alphabetically exporting export csv snapshot owner hr editor space planner viewers',
    body: (
      <div className="space-y-4">
        <p>
          The <strong>Reports</strong> tab (top bar, next to Map and Roster) is
          a lightweight dashboard for pilot-scale utilization questions. It
          reads straight from the current office — no separate data pipeline.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">What's in it</h3>
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
    label: 'Sharing read-only links',
    icon: '🔗',
    searchText:
      'sharing read-only links owners public link roster sign-in url snapshot contractor recruiter exec creating link share top bar create share link token revoke audit events scope',
    body: (
      <div className="space-y-4">
        <p>
          Owners can generate a public read-only link that renders the roster
          for anyone with the URL — no sign-in required. Useful for sharing a
          headcount snapshot with a contractor, recruiter, or exec who
          shouldn't need a seat in the tool.
        </p>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100">Creating a link</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700 dark:text-gray-200">
          <li>On the map, open <strong>Share</strong> in the top bar.</li>
          <li>Click <strong>Create share link</strong> under the Read-only link section. The URL is of the form <code>/shared/&lt;office-id&gt;/&lt;token&gt;</code>.</li>
          <li>Copy the link. Anyone with it sees the current roster as a static table with floor count.</li>
        </ol>
        <h3 className="font-semibold text-gray-900 dark:text-gray-100 mt-4">Revoking</h3>
        <p>
          Hit <strong>Revoke</strong> in the same panel. The token is marked
          revoked immediately; subsequent visits show "This share link isn't
          valid."
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Scope: roster only. The Konva map itself is not shared — we deferred
          map-in-anon-view as a follow-up. Both create and revoke emit audit
          events.
        </p>
      </div>
    ),
  },
  {
    id: 'shortcuts',
    label: 'Keyboard shortcuts',
    icon: '⌨️',
    searchText:
      'keyboard shortcuts cheat sheet overlay editing ctrl+z undo ctrl+shift+z redo ctrl+d duplicate ctrl+a select all delete del ctrl+g group ctrl+l lock unlock tools v select w wall r rectangle e ellipse t text view ctrl+plus minus zoom in out ctrl+0 reset g toggle grid p presentation m roster general escape deselect cancel question mark cheat sheet arrow nudge cmd cmd+k command palette cmd+f canvas finder space pan',
    body: (
      <div className="space-y-4">
        <p>
          Press <kbd>?</kbd> anywhere in the editor to pop the cheat sheet
          overlay. The highlights:
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
    id: 'faq',
    label: 'FAQ',
    icon: '❓',
    searchText:
      "faq frequently asked questions create first office data saved automatically two people edited same office optimistic locking conflict modal undo delete csv duplicate employees rehire badge departed leave parental leave coverage stat chips ending soon align desks rotate angle export floor plan image png pdf change email password admin owner schedule departure",
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
