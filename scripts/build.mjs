/**
 * dsh-weather build script.
 *
 * Emits two artifacts from the same package:
 * - `lib/index.js`  — Host half: a Node ESM bundle the Cordis loader mounts
 *                     from the profile (`main`).
 * - `lib/client.js` — Browser half: the client module system's lazy-CJS
 *                     factory artifact. The bundle registers itself through
 *                     `window.__ModuleLoader__.load({ id, factory })` and
 *                     resolves the platform modules (react, cordis, ui-slots,
 *                     ui-primitives, and the `dsh.client.inject` edges) via
 *                     the injected `require` against the loader module table.
 *                     This format mirrors the repository preset at
 *                     `packages/client/tsdown.client.ts`.
 */
import { build } from 'esbuild'
import { rmSync } from 'node:fs'

const ID = 'dsh-weather'

/** Module-table specifiers every client bundle may require without an inject edge. */
const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
]

/** Package-specific module rows requested via `dsh.client.inject`. */
const INJECT_EDGES = [
  '@deepseek-ai/dsh-client-ui-settings',
]

rmSync('lib', { recursive: true, force: true })

// ── Host half ────────────────────────────────────────────────────────────────
await build({
  entryPoints: ['src/index.ts'],
  outfile: 'lib/index.js',
  bundle: true,
  format: 'esm',
  platform: 'node',
  target: 'node20',
  // Runtime imports resolved from the profile's node_modules. `@deepseek-ai/cordis`
  // appears type-only and is erased; these are the value imports that stay.
  external: ['@deepseek-ai/dsh-settings', '@deepseek-ai/schemastery'],
  logLevel: 'info',
})

// ── Browser half ─────────────────────────────────────────────────────────────
await build({
  entryPoints: ['src/client/index.tsx'],
  outfile: 'lib/client.js',
  bundle: true,
  format: 'cjs',
  platform: 'browser',
  target: 'es2020',
  jsx: 'automatic',
  external: [...PLATFORM_MODULES, ...INJECT_EDGES],
  banner: {
    js: [
      `window.__ModuleLoader__.load({ id: ${JSON.stringify(ID)}, factory: (require) => {`,
      'var module = { exports: {} };',
      'var exports = module.exports;',
      'Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });',
    ].join('\n'),
  },
  footer: {
    js: 'return module.exports;\n} });',
  },
  logLevel: 'info',
})

console.log('dsh-weather: built lib/index.js (host) and lib/client.js (browser bundle)')
