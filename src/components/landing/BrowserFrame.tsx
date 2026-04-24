import type { ReactNode } from 'react'

/**
 * BrowserFrame — wraps the hero illustration in a fake browser chrome
 * (three traffic-light dots + a muted URL bar) so the floor plan feels
 * like a real product screenshot. Purely presentational.
 */
export function BrowserFrame({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-gray-200 bg-white shadow-2xl shadow-blue-100/60 dark:border-gray-800 dark:bg-gray-900 dark:shadow-black/40 overflow-hidden">
      <div
        className="flex items-center gap-2 px-4 py-3 bg-gray-50 border-b border-gray-200 dark:bg-gray-950 dark:border-gray-800"
        aria-hidden="true"
      >
        <div className="flex gap-1.5">
          <span className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
          <span className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
          <span className="h-3 w-3 rounded-full bg-gray-300 dark:bg-gray-700" />
        </div>
        <div className="ml-3 flex-1 max-w-sm mx-auto rounded-md bg-white border border-gray-200 px-3 py-1 text-xs text-gray-400 text-center font-mono dark:bg-gray-900 dark:border-gray-700 dark:text-gray-500">
          app.floorcraft.com/map
        </div>
      </div>
      <div className="p-4 sm:p-6 bg-white dark:bg-gray-900">{children}</div>
    </div>
  )
}
