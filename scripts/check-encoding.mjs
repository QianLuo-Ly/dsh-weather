/**
 * Guard against double-encoded (mojibake) text, and repair it.
 *
 * The corruption: a file whose Chinese text was saved as UTF-8, then read as
 * GBK/CP936, then saved as UTF-8 again. The result is a file that is *valid*
 * UTF-8, so no decoder, diff or review notices it — it just contains the wrong
 * characters and renders as garbage (`数据不足` → `数据不足`).
 *
 * Repair is the exact inverse of the corruption:
 *     GBK-encode the file's text  →  decode those bytes as UTF-8
 * which round-trips only for a true double-encoding. The re-encode step doubles
 * as the test: a GBK encoding that is absent (or that UTF-8 cannot decode)
 * means the run is ordinary non-ASCII text and is left alone.
 *
 * Usage:
 *   node scripts/check-encoding.mjs          # report; exit 1 on any finding
 *   node scripts/check-encoding.mjs --fix    # repair in place
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from 'node:fs'
import { join, extname, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const FIX = process.argv.includes('--fix')

const SKIP_DIRS = new Set(['node_modules', '.git', '.pnpm-store', '.idea', 'harness', 'lib'])
const TEXT_EXT = new Set(['.ts', '.tsx', '.js', '.mjs', '.cjs', '.json', '.md', '.yml', '.yaml', '.html', '.txt'])
const ROOTS = ['src', 'scripts', 'docs']

const gbkDecoder = new TextDecoder('gbk')
const utf8Strict = new TextDecoder('utf-8', { fatal: true })

/**
 * GBK encoder, built once by inverting the decoder: Node ships TextDecoder('gbk')
 * but no encoder, and the repair needs one. Every byte sequence GBK can produce
 * is decoded and its reverse mapping recorded (first/lowest wins, which is the
 * canonical sequence — GBK maps a few characters twice).
 */
const gbkEncodeMap = (() => {
  const map = new Map()
  const record = (bytes, text) => {
    if (text.length === 1 && text !== '\uFFFD' && !map.has(text)) map.set(text, Buffer.from(bytes))
  }
  for (let b = 0x80; b <= 0xff; b += 1) record([b], gbkDecoder.decode(Uint8Array.of(b)))
  for (let lead = 0x81; lead <= 0xfe; lead += 1) {
    for (let trail = 0x40; trail <= 0xfe; trail += 1) {
      if (trail === 0x7f) continue
      record([lead, trail], gbkDecoder.decode(Uint8Array.of(lead, trail)))
    }
  }
  return map
})()

/** GBK bytes for text, or null when some character has no GBK form. */
function gbkEncode(text) {
  const chunks = []
  for (const ch of text) {
    const code = ch.codePointAt(0)
    if (code !== undefined && code < 0x80) {
      chunks.push(Buffer.from([code]))
      continue
    }
    const bytes = gbkEncodeMap.get(ch)
    if (bytes === undefined) return null
    chunks.push(bytes)
  }
  return Buffer.concat(chunks)
}

/**
 * The intended text for a run of non-ASCII characters, or null when the run is
 * not double-encoded. The recovered text must be valid UTF-8 and contain CJK —
 * which is what stops accented Latin and emoji from being "repaired" into noise.
 */
function repairRun(run) {
  const bytes = gbkEncode(run)
  if (bytes === null) return null
  let recovered
  try {
    recovered = utf8Strict.decode(bytes)
  } catch {
    return null
  }
  if (!/[\u4e00-\u9fff]/.test(recovered)) return null
  return recovered === run ? null : recovered
}

/** Every text file under the scanned roots. */
function* walk(dir) {
  let entries
  try {
    entries = readdirSync(dir)
  } catch {
    return
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const path = join(dir, name)
    if (statSync(path).isDirectory()) yield* walk(path)
    else if (TEXT_EXT.has(extname(name).toLowerCase())) yield path
  }
}

const problems = []
let scanned = 0
for (const root of ROOTS) {
  for (const file of walk(join(ROOT, root))) {
    scanned += 1
    const raw = readFileSync(file)
    const hasBom = raw.length >= 3 && raw[0] === 0xef && raw[1] === 0xbb && raw[2] === 0xbf
    let text
    try {
      text = utf8Strict.decode(raw)
    } catch {
      problems.push({ file, kind: 'invalid UTF-8' })
      continue
    }
    // A leading BOM is not part of any run, but it does sit directly before the
    // file's first string; drop it so run boundaries stay honest.
    if (text.startsWith('\uFEFF')) text = text.slice(1)
    const runs = []
    for (const match of text.matchAll(/[^\x00-\x7f]+/g)) {
      const recovered = repairRun(match[0])
      if (recovered !== null) runs.push({ wrong: match[0], correct: recovered })
    }
    if (FIX && runs.length > 0) {
      writeFileSync(file, text.replace(/[^\x00-\x7f]+/g, (run) => repairRun(run) ?? run), 'utf8')
    }
    if (runs.length > 0) problems.push({ file, kind: `mojibake x${runs.length}`, runs, fixed: FIX })
    else if (hasBom) problems.push({ file, kind: 'UTF-8 BOM (repo is BOM-free)' })
  }
}

const rel = (file) => relative(ROOT, file).replace(/\\/g, '/')
if (problems.length === 0) {
  console.log(`encoding OK: ${scanned} file(s) scanned, no mojibake`)
  process.exit(0)
}
for (const problem of problems) {
  const label = problem.fixed === true ? 'fixed' : 'FAIL'
  console.error(`${label}: ${rel(problem.file)} — ${problem.kind}`)
  for (const { wrong, correct } of problem.runs ?? []) console.error(`    "${wrong}" -> "${correct}"`)
}
if (!FIX) {
  console.error('run `node scripts/check-encoding.mjs --fix` to repair, then review the diff')
  process.exit(1)
}
process.exit(0)
