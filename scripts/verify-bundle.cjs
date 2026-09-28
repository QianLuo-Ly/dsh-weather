// Bundle contract checks. Every probe MUST be an assertion: `npm run check`
// gates on this process's exit code, so a probe that only logs cannot protect
// anything (it would happily pass an empty or truncated bundle).
const fs = require('node:fs')
const path = require('node:path')

// The registration key must equal the package name: client-modules requires
// `Entry name == package name`, and a mismatch shows up only at runtime as
// `duplicate factory registration` + `entry did not activate`.
const pkgName = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8')).name

// Since Host 0.1.7 the settings namespace IS the profile entry id, so the
// `cordis.patch.yml` row `id` and the client's `WEATHER_NS` must stay in sync:
// `configForms.get(WEATHER_NS)` targets a namespace the Host never serves
// otherwise, and the plugin degrades to a permanently `loading` settings form.
const patch = fs.readFileSync(path.join(__dirname, '..', 'cordis.patch.yml'), 'utf8')
const patchRowId = /- id:\s*(\S+)/.exec(patch)?.[1]
const clientSrc = fs.readFileSync(path.join(__dirname, '..', 'src', 'config-shared.ts'), 'utf8')
const weatherNs = /WEATHER_NS = '([^']+)'/.exec(clientSrc)?.[1]

const bundle = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')
const failures = []
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

check(
  `lazy-CJS factory head (id === package name ${JSON.stringify(pkgName)})`,
  bundle.startsWith(`window.__ModuleLoader__.load({ id: ${JSON.stringify(pkgName)}`),
)
check('factory closes the loader call', bundle.trimEnd().endsWith('} });'))
check('non-trivial bundle size', bundle.length > 20_000)
check('WeatherBar mounted', bundle.includes('WeatherBar'))
check('seats referenced', bundle.includes('conversation.session.header.actions') && bundle.includes('settings.section'))
check(
  `settings namespace === patch row id (${JSON.stringify(patchRowId)})`,
  patchRowId !== undefined && weatherNs === patchRowId && bundle.includes(`"${weatherNs}"`),
)

if (failures.length > 0) {
  console.error(`\nverify-bundle FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`bundle ok: ${bundle.length} bytes`)
