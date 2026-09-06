/**
 * Verify the committed `lib/` artifacts still match `src/`. The repo ships
 * prebuilt lib/ (git installs need no build-script approval), so every `src/`
 * change must be accompanied by a rebuilt lib/. This script rebuilds into a
 * temp directory and compares — exit code 1 (with a hint) when they drift.
 */
import { mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildLib } from './build-lib.mjs'

const tmp = mkdtempSync(join(tmpdir(), 'dsh-weather-lib-sync-'))
let failed = false
try {
  await buildLib(tmp)
  for (const name of ['index.js', 'client.js']) {
    const fresh = readFileSync(join(tmp, name), 'utf8')
    const committed = readFileSync(`lib/${name}`, 'utf8')
    if (fresh !== committed) {
      failed = true
      console.error(`lib/${name} is OUT OF SYNC with src/.`)
    } else {
      console.log(`lib/${name}: in sync (${fresh.length} bytes)`)
    }
  }
} finally {
  rmSync(tmp, { recursive: true, force: true })
}

if (failed) {
  console.error('Run `pnpm build` and commit the updated lib/ together with your src/ changes.')
  process.exit(1)
}
console.log('check:lib-sync OK')
