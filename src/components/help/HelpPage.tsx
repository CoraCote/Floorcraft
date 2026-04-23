import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'

/**
 * Single-page user guide + FAQ. Deliberately kept in one file with
 * inline content so contributors can search/grep for a phrase and land
 * on the exact spot to edit — no cross-file hunting. Content is grouped
 * into anchored sections that the sidebar TOC jumps to; a
 * scroll-spy effect keeps the active section highlighted in the TOC as
 * the reader scrolls.
 */

interface Section {
  id: string
  label: string
  icon: string
  body: React.ReactNode
}

const sections: Section[] = [
  {
    id: 'getting-started',
    label: 'Getting started',
    icon: '🚀',
    body: (
      <div className="space-y-4">
        <p>
          Floorcraft is two things under one roof: a <strong>floor-plan
          editor</strong> for drawing offices, and a <strong>roster</strong> for
          tracking who works there. Every office has both, and the two views
          stay in sync — assign Jamie to Desk D-014 on the map and the roster
          shows her seat, and vice versa.
        </p>
        <h3 className="font-semibold text-gray-900 mt-4">Three-minute tour</h3>
        <ol className="list-decimal pl-6 space-y-2 text-gray-700">
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
        <p className="text-sm text-gray-500">
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
    body: (
      <div className="space-y-4">
        <p>
          A <strong>team</strong> is your workspace — a company, a department,
          a family (we don't judge). Inside a team you have <strong>offices</strong>,
          which is where the floor plan + roster actually live.
        </p>
        <h3 className="font-semibold text-gray-900">Creating offices</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>
            <strong>New office</strong> — blank canvas, empty roster. Good if
            you want to draw from scratch.
          </li>
          <li>
            <strong>Demo office</strong> — pre-seeded with a floor plan and
            realistic demo employees. Perfect for exploring features before
            committing real data.
          </li>
        </ul>
        <h3 className="font-semibold text-gray-900 mt-4">Deleting offices</h3>
        <p>
          On the team home, hover an office card — the trash icon in the top
          right corner opens a confirmation dialog. Deletion is permanent: the
          floor plan, roster, history, and share links all go.
        </p>
        <h3 className="font-semibold text-gray-900 mt-4">Inviting collaborators</h3>
        <p>
          Open <strong>Team → Settings → Members</strong>. Invite by email;
          invitees land on a preview screen showing who invited them and which
          team they're joining, then get a verification link. Couldn't find the
          email? The signup "Check your email" screen has a{' '}
          <strong>Resend verification</strong> button with a 30-second cooldown.
        </p>
        <h3 className="font-semibold text-gray-900 mt-4">Team vs office roles</h3>
        <p>
          Permissions come in two layers. The <strong>team role</strong>{' '}
          (<strong>Admin</strong> or <strong>Member</strong>) controls team
          settings, billing, and the ability to delete offices. Each office
          then has its own <strong>office role</strong>:
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Owner</strong> — full access, including audit log, reports, and share-link generation.</li>
          <li><strong>HR Editor</strong> — edit the roster + view audit log + view reports. Cannot edit the map.</li>
          <li><strong>Space Planner</strong> — edit the map + view reports. Cannot edit the roster or see the audit log.</li>
          <li><strong>Viewer</strong> — read-only. Cannot edit, export, or view reports.</li>
        </ul>
        <p className="text-sm text-gray-500">
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
    body: (
      <div className="space-y-4">
        <p>
          The map view is a Konva-backed canvas with tools in the left sidebar
          and an element library you drag from. It supports multi-floor plans,
          undo/redo, grouping, and live collaboration.
        </p>

        <h3 className="font-semibold text-gray-900">Drawing walls</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700">
          <li>Press <kbd>W</kbd> or click the Wall tool.</li>
          <li>Click to drop each wall segment endpoint. Double-click or press <kbd>Enter</kbd> to finish a run.</li>
          <li>Walls snap to the grid (toggle with <kbd>G</kbd>) and to existing wall endpoints.</li>
          <li>Drag a wall midpoint to curve it into an arc.</li>
        </ol>

        <h3 className="font-semibold text-gray-900 mt-4">Placing elements</h3>
        <p>
          Drag any tile from the left <strong>Element Library</strong> onto the
          canvas — desks, workstations, private offices, conference rooms, phone
          booths, kitchens, doors, windows, and decor (plants, couches, etc).
          Doors and windows show a ghost preview that snaps to the nearest wall
          as you hover.
        </p>

        <h3 className="font-semibold text-gray-900 mt-4">Multiple floors</h3>
        <p>
          The floor switcher lives at the bottom of the map. <strong>+ Add
          floor</strong> spins up an empty floor; each floor has its own
          elements and seat assignments but shares the same roster of people.
          Deleting a floor that has people assigned to desks on it shows the
          count in the confirmation dialog ("Floor 3 has 12 assigned employees.
          They will be unassigned.") and frees those seats automatically.
        </p>

        <h3 className="font-semibold text-gray-900 mt-4">Safe renames</h3>
        <p>
          Desk IDs must be unique within a floor. Renaming a desk to a name
          already in use shows an inline error in the properties panel and
          blocks the save — no silent collisions.
        </p>

        <h3 className="font-semibold text-gray-900 mt-4">Selection & editing</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Click to select; Shift-click to add to selection.</li>
          <li>Drag on empty canvas to marquee-select.</li>
          <li><kbd>Ctrl</kbd>+<kbd>D</kbd> duplicates; arrow keys nudge (hold <kbd>Shift</kbd> for 10px).</li>
          <li><kbd>Ctrl</kbd>+<kbd>G</kbd> groups selected elements; <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>G</kbd> ungroups.</li>
          <li><kbd>Ctrl</kbd>+<kbd>L</kbd> locks/unlocks selection so it can't be moved accidentally.</li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-4">Moving &amp; rotating</h3>
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
      </div>
    ),
  },
  {
    id: 'roster',
    label: 'Roster',
    icon: '👥',
    body: (
      <div className="space-y-4">
        <p>
          The roster is a spreadsheet-style people view with filters, bulk
          actions, and a side drawer for full-detail editing. Every column has
          sort and inline-edit support.
        </p>

        <h3 className="font-semibold text-gray-900">The stats bar</h3>
        <p>
          The chips at the top of the roster aren't just decoration — they're
          click-to-filter toggles.
        </p>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Total</strong> — clears status/seat/day/equip/preset chips but keeps your search, department, and floor filters.</li>
          <li><strong>Active / On leave</strong> — filter by status.</li>
          <li><strong>Unassigned</strong> — people without a seat.</li>
          <li><strong>Pending equipment</strong> — anyone whose equipment status is still pending (only shows when &gt; 0).</li>
          <li><strong>Ending soon</strong> — contracts or internships whose <code>endDate</code> is within the next 30 days (only shows when &gt; 0).</li>
          <li><strong>Departing soon</strong> — active employees with a scheduled <code>departureDate</code> inside the next 30 days (only shows when &gt; 0).</li>
          <li><strong>In today</strong> — people whose office-days cover today's weekday (weekdays only).</li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-4">Editing rows</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Inline edit</strong> — click or double-click a cell. Enter / blur commits; Escape cancels.</li>
          <li><strong>Side drawer</strong> — double-click a row. Covers every field, including office-day presets (Weekdays / MWF / TTh / Hybrid / Remote), leave metadata (type, expected return, coverage buddy, notes), and scheduled departure date.</li>
          <li><strong>Status</strong> — <strong>Active</strong>, <strong>On leave</strong>, or <strong>Departed</strong>. On-leave rows surface the leave type and expected-return date in the drawer; departed rows are kept for history.</li>
          <li><strong>Status = Departed</strong> — if the person still holds a seat, a prompt asks whether to unassign it too. Direct reports get their <code>managerId</code> cleared automatically.</li>
          <li><strong>Delete</strong> — row menu or bulk action. Always shows a confirmation with a name preview.</li>
          <li><strong>Undo after restore</strong> — if you delete an assigned desk and then <kbd>Ctrl</kbd>+<kbd>Z</kbd>, the desk comes back but the assignment is dropped on purpose. A toast reads <em>"Desk restored — Jane Doe's assignment not recovered. Reassign?"</em> and jumps you to that person on the roster.</li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-4">Badges &amp; warnings</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Amber "rehire?"</strong> — two rows share a name and department. Catches duplicate imports.</li>
          <li><strong>End-date pill</strong> — shows "in N days" when within 30 days.</li>
          <li><strong>Departure pill</strong> — active employees with a scheduled <code>departureDate</code> inside 30 days get a dated "Departing" pill.</li>
          <li><strong>On-leave ribbon</strong> — rows with status On leave show the leave type + expected return at a glance.</li>
          <li><strong>Manager dangling</strong> — the person's manager no longer exists. The drawer offers a one-click Clear.</li>
        </ul>

        <h3 className="font-semibold text-gray-900 mt-4">Bulk actions</h3>
        <p>
          Select rows via the checkboxes. The action bar lights up with
          set-department / set-status / unassign / delete / export-selection.
          Multi-selection is preserved across filter changes so you can
          assemble a batch across views.
        </p>

        <h3 className="font-semibold text-gray-900 mt-4">Import & export</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
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
    body: (
      <div className="space-y-4">
        <p>
          Seat assignment is the bridge between the map and the roster. Any
          Desk, Workstation, or Private Office can hold one or more employees.
        </p>
        <h3 className="font-semibold text-gray-900">Ways to assign</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li>Drag a person from the right-sidebar People panel onto a desk on the map.</li>
          <li>Click a desk, then click <strong>Assign</strong> in its properties panel and pick the person.</li>
          <li>Import a CSV where the <code>seat</code> column matches a desk's ID (e.g. <code>D-014</code>).</li>
        </ul>
        <h3 className="font-semibold text-gray-900 mt-4">Moving &amp; unassigning</h3>
        <p>
          Dragging an already-seated person to another desk swaps them in. If
          the target desk is occupied, the existing occupant is bumped back to
          unassigned (you'll see a notification).
        </p>
        <h3 className="font-semibold text-gray-900 mt-4">From roster → map</h3>
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
    body: (
      <div className="space-y-4">
        <p>
          The <strong>Reports</strong> tab (top bar, next to Map and Roster) is
          a lightweight dashboard for pilot-scale utilization questions. It
          reads straight from the current office — no separate data pipeline.
        </p>
        <h3 className="font-semibold text-gray-900">What's in it</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
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
        <h3 className="font-semibold text-gray-900 mt-4">Exporting</h3>
        <p>
          Each section has its own <strong>Export CSV</strong> button so you
          can hand numbers to someone outside the tool. Exports are a snapshot
          of the current view; they're not signed or versioned.
        </p>
        <p className="text-sm text-gray-500">
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
    body: (
      <div className="space-y-4">
        <p>
          The audit log captures meaningful mutations for compliance-friendly
          review: employees added/updated/deleted, seat assignments, floor
          lifecycle events, and CSV imports. Each entry records the actor,
          action, target, and a small metadata blob.
        </p>
        <h3 className="font-semibold text-gray-900">Filters</h3>
        <ul className="list-disc pl-6 space-y-1.5 text-gray-700">
          <li><strong>Actor</strong> — filter to a specific user ID.</li>
          <li><strong>Action</strong> — filter to a specific event type (e.g. <code>employee.delete</code>, <code>csv.import</code>).</li>
        </ul>
        <p className="text-sm text-gray-500">
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
    body: (
      <div className="space-y-4">
        <p>
          Owners can generate a public read-only link that renders the roster
          for anyone with the URL — no sign-in required. Useful for sharing a
          headcount snapshot with a contractor, recruiter, or exec who
          shouldn't need a seat in the tool.
        </p>
        <h3 className="font-semibold text-gray-900">Creating a link</h3>
        <ol className="list-decimal pl-6 space-y-1.5 text-gray-700">
          <li>On the map, open <strong>Share</strong> in the top bar.</li>
          <li>Click <strong>Create share link</strong> under the Read-only link section. The URL is of the form <code>/shared/&lt;office-id&gt;/&lt;token&gt;</code>.</li>
          <li>Copy the link. Anyone with it sees the current roster as a static table with floor count.</li>
        </ol>
        <h3 className="font-semibold text-gray-900 mt-4">Revoking</h3>
        <p>
          Hit <strong>Revoke</strong> in the same panel. The token is marked
          revoked immediately; subsequent visits show "This share link isn't
          valid."
        </p>
        <p className="text-sm text-gray-500">
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
    body: (
      <div className="space-y-4">
        <p>
          Press <kbd>?</kbd> anywhere in the editor to pop the cheat sheet
          overlay. The highlights:
        </p>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mt-3">
          <div>
            <h4 className="font-semibold text-gray-900 mb-1.5">Editing</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>Z</kbd></dt><dd className="inline text-gray-600"> — Undo</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd></dt><dd className="inline text-gray-600"> — Redo</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>D</kbd></dt><dd className="inline text-gray-600"> — Duplicate</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>A</kbd></dt><dd className="inline text-gray-600"> — Select all</dd><br />
              <dt className="inline"><kbd>Del</kbd></dt><dd className="inline text-gray-600"> — Delete selected</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>G</kbd></dt><dd className="inline text-gray-600"> — Group</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>L</kbd></dt><dd className="inline text-gray-600"> — Lock / unlock</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1.5">Tools</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>V</kbd></dt><dd className="inline text-gray-600"> — Select</dd><br />
              <dt className="inline"><kbd>W</kbd></dt><dd className="inline text-gray-600"> — Wall</dd><br />
              <dt className="inline"><kbd>R</kbd></dt><dd className="inline text-gray-600"> — Rectangle</dd><br />
              <dt className="inline"><kbd>E</kbd></dt><dd className="inline text-gray-600"> — Ellipse</dd><br />
              <dt className="inline"><kbd>T</kbd></dt><dd className="inline text-gray-600"> — Text</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1.5">View</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>+</kbd> / <kbd>-</kbd></dt><dd className="inline text-gray-600"> — Zoom in / out</dd><br />
              <dt className="inline"><kbd>Ctrl</kbd>+<kbd>0</kbd></dt><dd className="inline text-gray-600"> — Reset zoom</dd><br />
              <dt className="inline"><kbd>G</kbd></dt><dd className="inline text-gray-600"> — Toggle grid</dd><br />
              <dt className="inline"><kbd>P</kbd></dt><dd className="inline text-gray-600"> — Presentation mode</dd><br />
              <dt className="inline"><kbd>M</kbd> / <kbd>R</kbd></dt><dd className="inline text-gray-600"> — Map / Roster</dd>
            </dl>
          </div>
          <div>
            <h4 className="font-semibold text-gray-900 mb-1.5">General</h4>
            <dl className="text-sm space-y-1">
              <dt className="inline"><kbd>Esc</kbd></dt><dd className="inline text-gray-600"> — Deselect / cancel</dd><br />
              <dt className="inline"><kbd>?</kbd></dt><dd className="inline text-gray-600"> — Show cheat sheet</dd><br />
              <dt className="inline">Arrow keys</dt><dd className="inline text-gray-600"> — Nudge 1px (Shift = 10px)</dd>
            </dl>
          </div>
        </div>
        <p className="text-sm text-gray-500 mt-3">
          On macOS, use <kbd>Cmd</kbd> wherever <kbd>Ctrl</kbd> appears.
        </p>
      </div>
    ),
  },
  {
    id: 'faq',
    label: 'FAQ',
    icon: '❓',
    body: (
      <div className="space-y-5">
        <FaqItem q="How do I create my first office?">
          After signing up, you'll be guided to create a team. On the team home
          page, click <strong>New office</strong> for a blank canvas or{' '}
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
    <details className="group border-l-2 border-gray-200 pl-4 py-1 hover:border-blue-400">
      <summary className="cursor-pointer font-medium text-gray-900 list-none flex items-center gap-2">
        <span className="text-gray-400 group-open:rotate-90 transition-transform">▸</span>
        {q}
      </summary>
      <div className="mt-2 text-gray-700 text-sm leading-relaxed">{children}</div>
    </details>
  )
}

export function HelpPage() {
  const [activeId, setActiveId] = useState(sections[0].id)
  const sectionRefs = useRef<Record<string, HTMLElement | null>>({})

  // Scroll-spy: highlight whichever section's top is closest to the
  // viewport top. Runs on scroll, cheap — just a bounding-box read per
  // section, no IntersectionObserver needed for this list size.
  useEffect(() => {
    function onScroll() {
      let best = sections[0].id
      let bestDist = Infinity
      for (const s of sections) {
        const el = sectionRefs.current[s.id]
        if (!el) continue
        const top = el.getBoundingClientRect().top
        // Pick the section whose top is closest to (but not far past)
        // the viewport top. A 120px grace zone accounts for the fixed
        // header so we don't jump active-state too eagerly.
        const dist = Math.abs(top - 120)
        if (top < 200 && dist < bestDist) {
          best = s.id
          bestDist = dist
        }
      }
      setActiveId(best)
    }
    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [])

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="max-w-6xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link to="/" className="text-lg font-semibold text-gray-900 hover:text-blue-600">
            Floorcraft
          </Link>
          <nav className="flex items-center gap-3 text-sm">
            <Link to="/dashboard" className="text-gray-700 hover:text-blue-600">
              Dashboard
            </Link>
            <Link
              to="/account"
              className="px-3 py-1.5 border rounded hover:bg-gray-50 text-gray-700"
            >
              Account
            </Link>
          </nav>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-6 py-10 grid grid-cols-1 md:grid-cols-[220px_1fr] gap-10">
        {/* Sticky sidebar TOC — collapses to a plain list above md */}
        <aside className="md:sticky md:top-6 md:self-start">
          <div className="text-xs uppercase tracking-wide text-gray-500 mb-2">
            On this page
          </div>
          <nav className="space-y-0.5 text-sm">
            {sections.map((s) => (
              <a
                key={s.id}
                href={`#${s.id}`}
                className={`flex items-center gap-2 px-2 py-1.5 rounded transition-colors ${
                  activeId === s.id
                    ? 'bg-blue-50 text-blue-700 font-medium'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
              >
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </a>
            ))}
          </nav>
        </aside>

        <main className="min-w-0">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">User guide</h1>
          <p className="text-gray-600 mb-10 max-w-2xl">
            Everything you need to design an office, populate a roster, and
            keep both in sync. Use the sidebar to jump around, or scroll top
            to bottom.
          </p>

          {sections.map((s) => (
            <section
              key={s.id}
              id={s.id}
              ref={(el) => {
                sectionRefs.current[s.id] = el
              }}
              className="mb-14 scroll-mt-20"
            >
              <h2 className="text-2xl font-semibold text-gray-900 mb-4 flex items-center gap-2">
                <span aria-hidden>{s.icon}</span>
                {s.label}
              </h2>
              <div className="prose prose-sm max-w-none text-gray-700 leading-relaxed">
                {s.body}
              </div>
            </section>
          ))}

          <footer className="mt-20 pt-6 border-t border-gray-200 text-sm text-gray-500">
            <p>
              Guide out of date?{' '}
              <a
                href="https://github.com/rcasto123/Floorcraft/issues/new"
                className="text-blue-600 hover:underline"
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
    </div>
  )
}
