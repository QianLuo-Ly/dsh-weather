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
import { rmSync } from 'node:fs'
import { buildLib } from './build-lib.mjs'

rmSync('lib', { recursive: true, force: true })
await buildLib('lib')
console.log('dsh-weather: built lib/index.js (host) and lib/client.js (browser bundle)')
