/// <reference types="vitest/config" />
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

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
  plugins: [react(), tailwindcss()],
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
  },
})
