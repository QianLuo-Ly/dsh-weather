/**
 * Shared build core: produces the two dsh-weather artifacts into a given
 * output directory. Used by scripts/build.mjs (writes `lib/`) and
 * scripts/check-lib-sync.mjs (builds into a temp dir to verify the committed
 * `lib/` still matches `src/`).
 *
 * - Host half (`index.js`)   — Node ESM bundle the Cordis loader mounts.
 * - Browser half (`client.js`) — the client module system's lazy-CJS factory
 *   artifact (see the banner/footer comments below).
 */
import { build } from 'esbuild'

export const ID = 'dsh-weather'

/** Module-table specifiers every client bundle may require without an inject edge. */
export const PLATFORM_MODULES = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  '@deepseek-ai/cordis',
  '@deepseek-ai/dsh-client-ui-slots',
]

/** Package-specific module rows requested via `dsh.client.inject`. */
export const INJECT_EDGES = [
  '@deepseek-ai/dsh-client-ui-settings',
]

/** Build both halves into `outDir` (created if missing). */
export async function buildLib(outDir) {
  await build({
    entryPoints: ['src/index.ts'],
    outfile: `${outDir}/index.js`,
    bundle: true,
    format: 'esm',
    platform: 'node',
    target: 'node20',
    // Runtime imports resolved from the profile's node_modules. `@deepseek-ai/cordis`
    // appears type-only and is erased; these are the value imports that stay.
    external: ['@deepseek-ai/dsh-settings', '@deepseek-ai/schemastery'],
    logLevel: 'silent',
  })

  await build({
    entryPoints: ['src/client/index.tsx'],
    outfile: `${outDir}/client.js`,
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
    logLevel: 'silent',
  })
}
