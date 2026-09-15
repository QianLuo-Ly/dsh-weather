// Feature probes against the minified bundle. Prefer ASCII-stable literals —
// esbuild escapes non-ASCII to \uXXXX sequences by default, so Chinese-only
// probes always miss.
const fs = require('node:fs')
const path = require('node:path')
const c = fs.readFileSync(path.join(__dirname, '..', 'lib', 'client.js'), 'utf8')
console.log('dark-mode override (data-ds-dark-theme):', c.includes('data-ds-dark-theme'))
console.log('dshw-fg var:', c.includes('--dshw-fg'))
console.log('pure white in dark:', c.includes('#ffffff'))
console.log('metric feed param (forecast_days):', c.includes('forecast_days'))
console.log('air-quality feed (air-quality-api):', c.includes('air-quality-api'))
console.log('IP consensus providers (ipwho.is):', c.includes('ipwho.is'))
console.log('reverse geocoder (bigdatacloud):', c.includes('bigdatacloud'))
// New in 0.5.0: saved cities, daily brief, per-day detail.
console.log('saved locations field:', c.includes('savedLocations') && c.includes('activeSavedId'))
console.log('daily brief fields:', c.includes('briefMorning') && c.includes('briefEvening'))
console.log('brief dedupe key prefix:', c.includes('dsh-weather-brief-'))
console.log('day-detail request range:', c.includes('start_date') && c.includes('end_date'))
