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
import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ID = 'dsh-weather'

/**
 * Repository root, resolved from THIS file rather than from `process.cwd()`:
 * esbuild reads `entryPoints` relative to the working directory, so running the
 * build from anywhere but the repo root silently produced an empty/hollow
 * bundle (or, with build.mjs's `rmSync('lib')`, deleted the wrong directory).
 */
export const ROOT = fileURLToPath(new URL('..', import.meta.url))

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

/** Build both halves into `outDir` (created if missing, resolved against {@link ROOT}). */
export async function buildLib(outDir) {
  const outDirAbsolute = path.isAbsolute(outDir) ? outDir : path.join(ROOT, outDir)
  await build({
    entryPoints: [path.join(ROOT, 'src/index.ts')],
    outfile: path.join(outDirAbsolute, 'index.js'),
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
    entryPoints: [path.join(ROOT, 'src/client/index.tsx')],
    outfile: path.join(outDirAbsolute, 'client.js'),
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
