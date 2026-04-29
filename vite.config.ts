/// <reference types="vitest/config" />
import { execSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/**
 * Compute build identity at config-load time so the same values flow
 * to (a) `define`-injected constants in the bundle and (b) the
 * `dist/version.json` we write after the build. The runtime poll
 * compares the bundle's `__BUILD_ID__` against the freshly fetched
 * file — when they diverge, a new deploy went live.
 *
 * `git rev-parse --short HEAD` is best-effort: in CI without git
 * (rare on Netlify but possible elsewhere), fall back to a string so
 * the runtime poll still has stable values to compare.
 */
function readGitSha(): string {
  try {
    return execSync('git rev-parse --short HEAD', { stdio: ['ignore', 'pipe', 'ignore'] })
      .toString()
      .trim()
  } catch {
    return 'unknown'
  }
}

const GIT_SHA = readGitSha()
const BUILT_AT = new Date().toISOString()
// `Date.now()` ensures two consecutive builds of the same SHA still
// get distinct ids — useful for "I redeployed without changing code"
// hot-fix scenarios where the client should still pick up a fresh
// bundle (e.g. an edge config change).
const BUILD_ID = `${GIT_SHA}-${Date.now()}`

/**
 * Vite plugin that writes `dist/version.json` after the bundle is
 * emitted. Runs only for the production build (skipped in `vite dev`
 * and `vite preview` so the file doesn't pollute local servers with a
 * stale value).
 */
function writeVersionJsonPlugin(): Plugin {
  return {
    name: 'write-version-json',
    apply: 'build',
    writeBundle({ dir }) {
      const outDir = dir ?? resolve(process.cwd(), 'dist')
      const target = resolve(outDir, 'version.json')
      const payload = {
        buildId: BUILD_ID,
        gitSha: GIT_SHA,
        builtAt: BUILT_AT,
      }
      writeFileSync(target, JSON.stringify(payload, null, 2) + '\n')
    },
  }
}

/**
 * Manual vendor splits. Rolldown's default is to lump everything
 * in `node_modules` into one or two giant chunks; splitting the
 * heavy canvas/data libraries into their own files means the
 * browser can cache them independently across deploys and the
 * landing page doesn't have to download Konva.
 *
 * Keys are stable chunk names (emitted as `vendor-<name>-[hash].js`);
 * values are substring tests against the resolved module path. The
 * checks are ordered most-specific first — e.g. `react-konva` must
 * match `vendor-konva` before the generic `react` rule sees it.
 */
const VENDOR_CHUNKS: Array<{ name: string; test: (id: string) => boolean }> = [
  {
    name: 'vendor-konva',
    test: (id) => /[\\/]node_modules[\\/](react-konva|konva)[\\/]/.test(id),
  },
  {
    name: 'vendor-supabase',
    test: (id) => /[\\/]node_modules[\\/]@supabase[\\/]/.test(id),
  },
  {
    name: 'vendor-state',
    test: (id) => /[\\/]node_modules[\\/](zustand|zundo)[\\/]/.test(id),
  },
  {
    name: 'vendor-icons',
    test: (id) => /[\\/]node_modules[\\/]lucide-react[\\/]/.test(id),
  },
  {
    name: 'vendor-react',
    // `react-router` and `react-router-dom` both need to land here;
    // `scheduler` is a transitive of react-dom and is tiny enough
    // that splitting it out causes an extra request for no win.
    test: (id) =>
      /[\\/]node_modules[\\/](react|react-dom|react-router|react-router-dom|scheduler)[\\/]/.test(
        id,
      ),
  },
]

export default defineConfig({
  plugins: [react(), tailwindcss(), writeVersionJsonPlugin()],
  define: {
    // Compile-time constants injected into the bundle so the runtime
    // poll has a stable reference to compare against `/version.json`.
    // `JSON.stringify` is required — Vite does a literal text replacement.
    __BUILD_ID__: JSON.stringify(BUILD_ID),
    __GIT_SHA__: JSON.stringify(GIT_SHA),
    __BUILT_AT__: JSON.stringify(BUILT_AT),
  },
  build: {
    rolldownOptions: {
      output: {
        manualChunks: (id) => {
          for (const { name, test } of VENDOR_CHUNKS) {
            if (test(id)) return name
          }
          return undefined
        },
      },
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./src/__tests__/setup.ts'],
    // Vitest's default `exclude` already covers node_modules + dist,
    // but the agent infrastructure occasionally drops scratch git
    // worktrees under `.claude/worktrees/<id>/` while parallel
    // sub-tasks run. Each one carries its own `src/__tests__/` tree,
    // so a plain `vitest run` would re-discover and re-run every
    // test 30+ times — slow, noisy, and confusing when one stale
    // worktree fails. Excluding the path keeps us anchored to the
    // real working tree.
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.claude/worktrees/**',
      '**/.idea/**',
      '**/.git/**',
      '**/.cache/**',
    ],
  },
})
