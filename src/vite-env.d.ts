/// <reference types="vite/client" />

/**
 * Compile-time build identity. Defined by the Vite config's `define`
 * block in `vite.config.ts` — see `writeVersionJsonPlugin` for the
 * matching `dist/version.json` writer. Used by `useBuildVersion` to
 * detect when a new deploy has gone live.
 */
declare const __BUILD_ID__: string
declare const __GIT_SHA__: string
declare const __BUILT_AT__: string
