/**
 * dsh-weather build script.
 *
 * Emits two artifacts from the same package:
 * - `lib/index.js`  — Host half: a Node ESM bundle the Cordis loader mounts
 *                     from the profile (`main`).
 * - `lib/client.js` — Browser half: the client module system's lazy-CJS
 *                     factory artifact.
 * See scripts/build-lib.mjs for the shared build core.
 */
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { buildLib, ROOT } from './build-lib.mjs'

// Resolved against the repo root, so `node scripts/build.mjs` from another
// directory rebuilds this project's `lib/` instead of touching an unrelated one.
// Truncate the two known artifacts instead of deleting the directory: recursive
// deletes (and even single-file rm) trip host bulk-delete guards on Windows
// sandboxes and trash shims, while the build core overwrites both files anyway.
const libDir = path.join(ROOT, 'lib')
mkdirSync(libDir, { recursive: true })
for (const artifact of ['index.js', 'client.js']) {
  writeFileSync(path.join(libDir, artifact), '')
}
await buildLib('lib')
console.log('dsh-weather: built lib/index.js (host) and lib/client.js (browser bundle)')
