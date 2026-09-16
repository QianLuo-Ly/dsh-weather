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

// Weather-icon intensity: the snowflake arms are generated from the radius, so
// each storm's radius is its identity (the radius argument survives esbuild's
// JSX lowering verbatim). A regression that collapses 小雪/中雪/大雪 — or
// 小雨/中雨/大雨 — back onto one glyph drops the matching literal and fails
// here. Rain intensity is asserted through the drop-count helpers instead.
check('light snow flake (小雪 71)', bundle.includes('flake(12, 20, 2.2'))
check('moderate snow flake (中雪 73/阵雪 85)', bundle.includes('flake(12, 19.6, 3.2'))
check('heavy snow flakes (大雪 75/强阵雪 86)', bundle.includes('flake(9, 19.4, 2.8') && bundle.includes('flake(15, 20, 2.8'))
check('snow grains pellets (米雪 77)', bundle.includes('cx: "12", cy: "17.5"'))
check('drizzle strokes (毛毛雨 51/小雨 61)', bundle.includes('drop(8, 19.5, 1.8'))
check('light-rain single drop (浓毛毛雨 55)', bundle.includes('drop(12, 18.5, 4'))
check('moderate-rain three drops (中雨 63)', bundle.includes('drop(12, 19, 3, "b")'))
check('heavy-rain four drops (大雨 65)', bundle.includes('drop(16.5, 18.5, 3.5, "d")'))
check('freezing-rain ice pellet (冻雨 66)', bundle.includes('cx: "12", cy: "20.5"'))
// ⛈️ vs 🌩️: the hail glyph adds pellets below the bolt, the plain one does not.
const bolt = bundle.includes('13 11 9 17 15 17 11 23')
check('thunderstorm bolt (雷阵雨 95)', bolt)
check('hail-bearing thunderstorm pellets (96/99)', bolt && bundle.includes('cx: "7", cy: "21"'))

// React must come from the injected platform require, never be inlined: two React
// copies in one page break hooks in ways that are painful to diagnose.
check('React not inlined', !/react\.production|__SECRET_INTERNALS|ReactCurrentDispatcher/.test(bundle))

if (failures.length > 0) {
  console.error(`\nverify-features FAILED: ${failures.join(', ')}`)
  process.exit(1)
}
console.log('features ok')
