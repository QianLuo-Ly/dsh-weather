// Feature probes against the built bundle. Every probe MUST be an assertion:
// `npm run check` gates on this process's exit code, so a probe that only logs
// could never fail and would report "green" for a bundle missing the feature.
//
// Probe literals stay ASCII-stable on purpose. esbuild escapes non-ASCII *string
// literals* to \uXXXX sequences, so a Chinese-only probe always misses; note it
// does NOT escape regex literals (e.g. /[省市]$/ ships as raw UTF-8), which is
// why ASCII identifiers/params are the safe thing to assert on.
const fs = require('node:fs')
const path = require('node:path')

const bundle = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')
const failures = []
const check = (label, ok) => {
  console.log(`${ok ? 'ok  ' : 'FAIL'} ${label}`)
  if (!ok) failures.push(label)
}

check('dark-mode override (data-ds-dark-theme)', bundle.includes('data-ds-dark-theme'))
check('dshw-fg var', bundle.includes('--dshw-fg'))
check('dark text override present', bundle.includes('#ffffff'))
check('metric feed params', bundle.includes('forecast_days') && bundle.includes('minutely_15'))
check('air-quality feed', bundle.includes('air-quality-api'))
check('IP consensus providers', bundle.includes('ipwho.is') && bundle.includes('api.ipapi.is'))
check('reverse geocoder', bundle.includes('bigdatacloud'))
check('saved locations fields', bundle.includes('savedLocations') && bundle.includes('activeSavedId'))
check('daily brief fields', bundle.includes('briefMorning') && bundle.includes('briefEvening'))
check('brief dedupe key prefix', bundle.includes('dsh-weather-brief-'))
check('day-detail request range', bundle.includes('start_date') && bundle.includes('end_date'))

// React must come from the injected platform require, never be inlined: two React
// copies in one page break hooks in ways that are painful to diagnose.
check('React not inlined', !/react\.production|__SECRET_INTERNALS|ReactCurrentDispatcher/.test(bundle))

if (failures.length > 0) {
  console.error(`\nverify-features FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('features ok')
