import { useNavigate } from 'react-router-dom'
import {
  HelpCircle,
  Keyboard,
  LogOut,
  User as UserIcon,
} from 'lucide-react'
import { useSession } from '../../lib/auth/session'
import { supabase } from '../../lib/supabase'
import { useUIStore } from '../../stores/uiStore'
import { useDropdownMenu } from '../../hooks/useDropdownMenu'
import { ThemeToggle } from '../ui/ThemeToggle'
import { prefersReducedMotion } from '../../lib/prefersReducedMotion'
import { cn } from '../../lib/cn'

/**
 * Wave 14C polish — TopBar account dropdown.
 *
 * Matches the FileMenu vocabulary: lucide icons, grouped sections with
 * uppercase headers, keyboard navigation (Up/Down, Home/End, Esc, Tab),
 * dark-mode tokens, and a destructive "Sign out" footer.
 *
 * Layout:
 *   - Trigger:    32px initials disc — no email label beside it. The
 *                 email is still surfaced as the menu's "Signed in
 *                 as …" header row when the dropdown is open.
 *   - Header row: email (truncated, non-interactive)
 *   - Account:  Profile  /  Theme (three-way ThemeToggle inline)
 *   - Help:     User guide  /  Keyboard shortcuts
 *   - Footer:   Sign out (red)
 *
 * Notifications/Billing are deliberately omitted — no route exists for
 * them yet, and the PRD says only to include items whose routes exist.
 */

export function UserMenu() {
  const session = useSession()
  const navigate = useNavigate()
  const setShortcutsOverlayOpen = useUIStore((s) => s.setShortcutsOverlayOpen)
  const {
    open,
    toggle,
    close,
    focusedIndex,
    setFocusedIndex,
    registerItemRef,
    panelProps,
    triggerProps,
  } = useDropdownMenu()

  if (session.status !== 'authenticated') return null

  const email = session.user.email
  const initial = email[0]?.toUpperCase() ?? '?'
  const reduceMotion = prefersReducedMotion()

  function activate(fn: () => void | Promise<void>) {
    close()
    void fn()
  }

  async function handleSignOut() {
    await supabase.auth.signOut()
    navigate('/login')
  }

  // Rows that participate in arrow-key focus. Theme is NOT a row — the
  // ThemeToggle inside it is a radiogroup that owns its own focus.
  // Ordered: Profile, User guide, Keyboard shortcuts, Sign out.
  let idx = 0
  const profileIdx = idx++
  const helpIdx = idx++
  const shortcutsIdx = idx++
  const signOutIdx = idx++

  return (
    <div className="relative">
      {/*
        Trigger is the avatar circle alone — no email beside it. The
        email previously rendered next to the circle on >=sm viewports
        (truncated to 140px) was redundant noise: the same address is
        still shown inside the dropdown's "Signed in as …" header, so
        users who actually need to see which account they're in can
        open the menu and read it there. Stripping it from the trigger
        gives the right cluster a clean, unmistakable account anchor —
        a single 32px initials disc — and lets the eye land on it
        without competing with project name, save state, plan-health
        pill, or any of the other right-cluster chips.
      */}
      <button
        {...triggerProps}
        type="button"
        onClick={toggle}
        className="w-8 h-8 rounded-full bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-200 flex items-center justify-center text-sm font-semibold hover:bg-gray-300 dark:hover:bg-gray-600 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 dark:focus-visible:ring-offset-gray-900 transition-colors"
        aria-label={`Account menu (${email})`}
        title={email}
        data-testid="user-menu-trigger"
      >
        <span aria-hidden="true">{initial}</span>
      </button>
      {open && (
        <div
          {...panelProps}
          role="menu"
          aria-label="Account"
          className={cn(
            'absolute right-0 mt-1 w-64 bg-white border border-gray-200 rounded shadow dark:bg-gray-900 dark:border-gray-800 dark:shadow-black/40 z-30 py-1 origin-top-right',
            !reduceMotion && 'dropdown-enter',
          )}
          data-testid="user-menu-panel"
        >
          <div
            className="px-3 py-2 text-xs text-gray-500 dark:text-gray-400 truncate border-b border-gray-100 dark:border-gray-800"
            title={email}
          >
            Signed in as <span className="font-medium text-gray-700 dark:text-gray-300">{email}</span>
          </div>

          <div>
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Account
            </div>
            <button
              ref={registerItemRef(profileIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === profileIdx ? 0 : -1}
              onClick={() => activate(() => navigate('/account'))}
              onMouseEnter={() => setFocusedIndex(profileIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
              data-testid="user-menu-profile"
            >
              <UserIcon size={14} aria-hidden="true" />
              <span className="flex-1">Profile</span>
            </button>
            <div
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-200"
              data-testid="user-menu-theme-row"
            >
              <span className="flex-1 text-xs text-gray-500 dark:text-gray-400">Theme</span>
              <ThemeToggle />
            </div>
          </div>

          <div>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <div className="px-3 pt-1.5 pb-1 text-[10px] font-semibold uppercase tracking-wider text-gray-400 dark:text-gray-500">
              Help
            </div>
            <button
              ref={registerItemRef(helpIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === helpIdx ? 0 : -1}
              onClick={() => activate(() => navigate('/help'))}
              onMouseEnter={() => setFocusedIndex(helpIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
              data-testid="user-menu-help"
            >
              <HelpCircle size={14} aria-hidden="true" />
              <span className="flex-1">User guide</span>
            </button>
            <button
              ref={registerItemRef(shortcutsIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === shortcutsIdx ? 0 : -1}
              onClick={() =>
                activate(() => {
                  setShortcutsOverlayOpen(true)
                })
              }
              onMouseEnter={() => setFocusedIndex(shortcutsIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800 focus:bg-gray-100 dark:focus:bg-gray-800 outline-none"
              data-testid="user-menu-shortcuts"
            >
              <Keyboard size={14} aria-hidden="true" />
              <span className="flex-1">Keyboard shortcuts</span>
              <kbd className="text-[10px] text-gray-400 dark:text-gray-500 font-mono">?</kbd>
            </button>
          </div>

          <div>
            <div className="my-1 border-t border-gray-100 dark:border-gray-800" />
            <button
              ref={registerItemRef(signOutIdx)}
              role="menuitem"
              type="button"
              tabIndex={focusedIndex === signOutIdx ? 0 : -1}
              onClick={() => activate(handleSignOut)}
              onMouseEnter={() => setFocusedIndex(signOutIdx)}
              className="flex items-center gap-2 w-full text-left px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 focus:bg-red-50 dark:focus:bg-red-900/20 outline-none"
              data-testid="user-menu-signout"
            >
              <LogOut size={14} aria-hidden="true" />
              <span className="flex-1">Sign out</span>
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
