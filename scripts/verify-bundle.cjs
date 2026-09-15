// Bundle contract checks. Every probe MUST be an assertion: `npm run check`
// gates on this process's exit code, so a probe that only logs cannot protect
// anything (it would happily pass an empty or truncated bundle).
const fs = require('node:fs')
const path = require('node:path')

const bundle = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')
const failures = []
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

check('lazy-CJS factory head', bundle.startsWith('window.__ModuleLoader__.load({ id: "dsh-weather"'))
check('factory closes the loader call', bundle.trimEnd().endsWith('} });'))
check('non-trivial bundle size', bundle.length > 20_000)
check('WeatherBar mounted', bundle.includes('WeatherBar'))
check('seats referenced', bundle.includes('conversation.session.header.actions') && bundle.includes('settings.section'))

if (failures.length > 0) {
  console.error(`\nverify-bundle FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log(`bundle ok: ${bundle.length} bytes`)
