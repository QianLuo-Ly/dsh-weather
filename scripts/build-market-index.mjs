/**
 * Generate the format-1 plugin market index for this package.
 *
 * The index is what DSH 0.2.2+'s built-in `pluginMarket` reads (Discover page,
 * `plugin_market` tool). It is a plain JSON document, so it has to be generated
 * rather than hand-edited: the git source needs the exact 40-hex commit SHA and
 * the version/engines fields must stay in sync with package.json.
 *
 * Since this package is not on npm, every version is a `git` source pinned to a
 * commit. Regenerate and commit after every release commit:
 *
 *   npm run market:index
 *   # or: node scripts/build-market-index.mjs --commit <sha>
 *
 * Output: market/index.json
 */
import { execFileSync } from 'node:child_process'
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const ROOT = fileURLToPath(new URL('..', import.meta.url))
const pkg = JSON.parse(readFileSync(path.join(ROOT, 'package.json'), 'utf8'))

/** Canonical https repository URL without a `.git` suffix (the validator requires href === input). */
function canonicalRepo(url) {
  return url.replace(/^git\+/, '').replace(/\.git$/, '').replace(/\/+$/, '')
}

function git(args) {
  return execFileSync('git', args, { cwd: ROOT, encoding: 'utf8' }).trim()
}

const args = process.argv.slice(2)
const commitFlag = args.indexOf('--commit')
const commit = commitFlag === -1 ? git(['rev-parse', 'HEAD']) : args[commitFlag + 1]

if (!/^[0-9a-f]{40}$/u.test(commit ?? '')) {
  throw new Error(`commit must be a lowercase 40-hex SHA, got ${JSON.stringify(commit)}`)
}

// The index describes a COMMIT, not the working tree: an installable version is
// whatever that commit's package.json declares. Reading the checked-out file
// would advertise a version that does not exist yet at that SHA, and the market
// would install the older code under the newer number.
const committed = JSON.parse(git(['show', `${commit}:package.json`]))
const version = committed.version
if (version !== pkg.version) {
  console.warn(
    `market: working tree is ${pkg.version} but ${commit.slice(0, 7)} is ${version}; `
    + `index describes the commit. Commit first, then re-run to publish ${pkg.version}.`,
  )
}

// Publish time of the version: the commit's own timestamp, not "now" — the index
// entry describes that commit, and re-running the generator must not churn it.
const publishedAt = Number(git(['log', '-1', '--format=%ct', commit]))

const dshRange = (committed.engines ?? {}).dsh

const repository = canonicalRepo(committed.repository?.url ?? pkg.repository?.url ?? `https://github.com/QianLuo-Ly/${pkg.name}`)

// Inline SVG icon keeps the index self-contained (the validator allows data: URLs
// up to 32 KiB decoded). A sun behind a cloud, drawn in the plugin's own colours.
const icon = 'data:image/svg+xml;base64,' + Buffer.from(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48">'
  + '<circle cx="18" cy="17" r="7" fill="#F5B942"/>'
  + '<path d="M13 33a7 7 0 0 1 .6-13.96A9 9 0 0 1 31.4 20.5 6.5 6.5 0 0 1 31 33z" fill="#8FBBE8"/>'
  + '</svg>',
).toString('base64')

const index = {
  format: 1,
  title: { en: 'QianLuo DSH plugins', zh: '千洛的 DSH 插件' },
  description: {
    en: 'Plugins for the DeepSeek Harness web client, maintained by QianLuo-Ly.',
    zh: '千洛维护的 DeepSeek Harness Web 客户端插件。',
  },
  metadata: {
    categories: {
      weather: { title: { en: 'Weather', zh: '天气' } },
    },
    labels: {},
    sortKeys: {},
  },
  plugins: [
    {
      name: pkg.name,
      title: { en: 'Weather Bar', zh: '天气栏' },
      description: {
        en: 'Weather chip in the session header: current conditions, live clock, forecasts with day detail, saved cities, and a daily briefing. Open-Meteo data, no API key.',
        zh: '会话顶栏的天气 chip：实时天气、实时时钟、含逐日详情的预报、多城市收藏与每日简报。数据来自 Open-Meteo，无需 API key。',
      },
      icon,
      author: 'QianLuo-Ly',
      ...(committed.homepage === undefined ? {} : { homepage: committed.homepage }),
      repository: { url: repository },
      metadata: {
        category: 'weather',
        keywords: ['weather', 'forecast', 'open-meteo', 'dsh-plugin'],
        labels: [],
      },
      versions: [
        {
          version,
          publishTimestamp: publishedAt,
          source: { type: 'git', url: repository, commit },
          engines: dshRange === undefined ? {} : { dsh: dshRange },
        },
      ],
    },
  ],
}

const outDir = path.join(ROOT, 'market')
mkdirSync(outDir, { recursive: true })
const outFile = path.join(outDir, 'index.json')
writeFileSync(outFile, `${JSON.stringify(index, null, 2)}\n`)
console.log(`market: wrote ${path.relative(ROOT, outFile)} (${pkg.name}@${version} @ ${commit.slice(0, 7)})`)
