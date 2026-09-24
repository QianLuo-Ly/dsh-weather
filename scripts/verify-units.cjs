// Unit-level behaviour probes for the pure modules (no DOM, no network).
//
// Why this exists alongside verify-features.cjs: that script greps the BUILT
// BUNDLE for literal markers, which proves a feature is still present but says
// nothing about what a function returns — and its probes must stay ASCII-only
// because esbuild escapes non-ASCII string literals in the bundle. Here the
// modules are bundled and actually CALLED, so assertions can be about behaviour
// and about Chinese text.
//
// Scope: the rules that have no UI and therefore no other test — the coordinate
// keys, the deep comparison, number formatting, the alert severity scale and
// alert wording, the description layer, and the fetch→WeatherData mapping
// (driven by a stubbed `fetch`).
//
// Every probe is an assertion: `npm run check` gates on this process's exit code.
const path = require('node:path')
const Module = require('node:module')
const esbuild = require('esbuild')

const ROOT = path.resolve(__dirname, '..')

/** Bundle a set of client modules (TypeScript, ESM) and return its exports. */
const loadModules = (entries, name) => {
  const source = entries.map((entry) => `export * from './${entry}'`).join('\n')
  const code = esbuild.buildSync({
    stdin: { contents: source, resolveDir: ROOT, loader: 'ts' },
    bundle: true,
    format: 'cjs',
    platform: 'node',
    target: 'node20',
    write: false,
    logLevel: 'silent',
  }).outputFiles[0].text
  const mod = new Module(name)
  mod.filename = path.join(ROOT, `${name}.cjs`)
  mod.paths = Module._nodeModulePaths(ROOT)
  mod._compile(code, mod.filename)
  return mod.exports
}

// ── Harness ─────────────────────────────────────────────────────────────────

let passed = 0
const failures = []
const show = (value) => {
  if (typeof value === 'string') return JSON.stringify(value)
  if (Array.isArray(value)) return JSON.stringify(value)
  if (value && typeof value === 'object') return JSON.stringify(value)
  return String(value)
}
const eq = (label, actual, expected) => {
  if (show(actual) === show(expected)) {
    passed += 1
    console.log(`ok   ${label}`)
  } else {
    failures.push(`${label}\n       expected ${show(expected)}\n       actual   ${show(actual)}`)
    console.log(`FAIL ${label}`)
  }
}
const ok = (label, condition) => eq(label, condition === true, true)

// `fetchWeather` reads `window.setTimeout` through the bounded-fetch layer.
global.window = { setTimeout, clearTimeout }

const X = loadModules([
  'src/client/shared/format.ts',
  'src/config-shared.ts',
  'src/client/data/aqi.ts',
  'src/client/data/alerts.ts',
  'src/client/data/geolocation.ts',
  'src/client/data/describe.ts',
  'src/client/data/condition.ts',
  'src/client/data/weather-api.ts',
], 'dshw-units')

// ── deepEqual ───────────────────────────────────────────────────────────────

// The point of replacing the JSON.stringify idiom: it compared key ORDER too.
eq('deepEqual: key order is irrelevant', X.deepEqual({ a: 1, b: 2 }, { b: 2, a: 1 }), true)
eq('deepEqual: the old stringify idiom disagreed (control)', JSON.stringify({ a: 1, b: 2 }) === JSON.stringify({ b: 2, a: 1 }), false)
eq('sameConfig: key order is irrelevant', X.sameConfig({ units: 'celsius' }, { units: 'celsius' }), true)
eq('deepEqual: nested equal', X.deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 2] } }), true)
eq('deepEqual: nested unequal', X.deepEqual({ a: { b: [1, 2] } }, { a: { b: [1, 3] } }), false)
eq('deepEqual: arrays equal', X.deepEqual([1, 2], [1, 2]), true)
eq('deepEqual: array order matters', X.deepEqual([1, 2], [2, 1]), false)
eq('deepEqual: length matters', X.deepEqual([1, 2], [1]), false)
eq('deepEqual: key count matters', X.deepEqual({ a: 1, b: 2 }, { a: 1 }), false)
eq('deepEqual: undefined vs undefined', X.deepEqual(undefined, undefined), true)
eq('deepEqual: undefined vs number', X.deepEqual(undefined, 5), false)
eq('deepEqual: null vs undefined', X.deepEqual(null, undefined), false)
eq('deepEqual: 0 vs -0', X.deepEqual(0, -0), true)

// ── The two coordinate keys ─────────────────────────────────────────────────

const LAT = 23.12912345
const LON = 113.26456789
eq('locationIdentityKey rounds to 5 decimals', X.locationIdentityKey(LAT, LON), '23.12912,113.26457')
eq('placeKey rounds to 3 decimals', X.placeKey(LAT, LON), '23.129,113.265')
ok('the two keys must differ (different questions)', X.locationIdentityKey(LAT, LON) !== X.placeKey(LAT, LON))
eq('placeKey normalizes -0', X.placeKey(0, -0), '0.000,0.000')
eq('dedupe keeps one entry for the same place', X.sanitizeSavedLocations([
  { id: 'a', name: 'A', latitude: LAT, longitude: LON },
  { id: 'b', name: 'B', latitude: LAT + 0.0001, longitude: LON + 0.0001 },
]).length, 1)

// ── format.ts ───────────────────────────────────────────────────────────────

eq('pad2 single digit', X.pad2(3), '03')
eq('pad2 two digits', X.pad2(12), '12')
eq('rateText one decimal', X.rateText(3.24), '3.2 mm/h')
eq('compactDistance keeps a decimal under 10', X.compactDistance(4.52), '4.5')
eq('compactDistance rounds at 10 and above', X.compactDistance(12.4), '12')
eq('compactDistance does not erase a sub-kilometre reading', X.compactDistance(0.4), '0.4')
// The fog/haze judgement line IS "below 10 km", so 9.96 must not round up to 10.0 —
// the basis line would then contradict the very conclusion drawn from it.
eq('compactDistance truncates rather than rounding into 10', X.compactDistance(9.96), '9.9')
eq('compactDistance: 9.99 still reads as 9.9', X.compactDistance(9.99), '9.9')
eq('pctText rounds', X.pctText(71.6), '72%')
ok('msToNextMinute lands just after the boundary', X.msToNextMinute() > 20 && X.msToNextMinute() <= 60_200)

// ── Alert severity scale ────────────────────────────────────────────────────

eq('severity: 82 violent shower is danger on its own', X.severityOfCode(82), 'danger')
eq('severity: hail code alone is only a warning', X.severityOfCode(96), 'warning')
eq('severity: hail code over light rain stays a warning', X.severityOfCode(96, 0.8, 37), 'warning')
eq('severity: hail code over a Bft-13 gust is danger', X.severityOfCode(96, 0.8, 135), 'danger')
eq('severity: a Bft-12 gust is not yet danger', X.severityOfCode(96, 0.8, 120), 'warning')
eq('severity: heavy rain code with no rate is info', X.severityOfCode(65), 'info')
eq('severity: heavy rain code with a measured rate is a warning', X.severityOfCode(65, 3), 'warning')
eq('severity: plain thunder is a warning', X.severityOfCode(95), 'warning')
eq('severity: thunder over 暴雨 rate is danger', X.severityOfCode(95, 25), 'danger')
eq('severity: heavy snow with no rate trusts the code', X.severityOfCode(75), 'warning')
eq('severity: heavy snow over a light rate is info', X.severityOfCode(75, 0.5), 'info')
eq('severity: a clear code ignores the wind entirely', X.severityOfCode(0, 0, 120), 'info')

// ── Alert wording ───────────────────────────────────────────────────────────

const sample = (current = {}, hourly = [], air) => ({
  location: { name: 'x', latitude: 1, longitude: 2, source: 'ip' },
  current: { temperature: 25, apparentTemperature: 25, weatherCode: 0, isDay: true, ...current },
  hourly,
  daily: [],
  ...(air === undefined ? {} : { air }),
})
const fmt = (value) => `${Math.round(value)}°C`
const alertsOf = (data) => X.evaluateAlerts(data, fmt)
const firstOf = (data) => alertsOf(data)[0]
const keysOf = (data) => alertsOf(data).map((alert) => alert.key)

eq('alerts: calm conditions raise none', keysOf(sample()), [])
eq('alerts: 41°C is a danger heat alert', [firstOf(sample({ temperature: 41 })).key, firstOf(sample({ temperature: 41 })).level], ['heat', 'danger'])
eq('alerts: 36°C is a heat warning', [firstOf(sample({ temperature: 36 })).key, firstOf(sample({ temperature: 36 })).level], ['heat', 'warning'])
eq('alerts: -20°C is a danger cold alert', [firstOf(sample({ temperature: -20 })).key, firstOf(sample({ temperature: -20 })).level], ['cold', 'danger'])
eq('alerts: 0°C is frost, not a cold alert', [firstOf(sample({ temperature: 0 })).key, firstOf(sample({ temperature: 0 })).level], ['frost', 'warning'])
eq('alerts: a Bft-12 sustained wind is danger', [firstOf(sample({ windSpeed: 120 })).key, firstOf(sample({ windSpeed: 120 })).level], ['wind', 'danger'])
eq('alerts: 65 km/h sustained wind is 大风', [firstOf(sample({ windSpeed: 65 })).title], ['大风'])
eq('alerts: 36°C is the 黄色 heat band', firstOf(sample({ temperature: 36 })).detail.endsWith('注意防暑'), true)
eq('alerts: 38°C is the 橙色 heat band', firstOf(sample({ temperature: 38 })).detail.endsWith('避免午后长时间户外活动'), true)
eq('alerts: a 95 km/h gust is 强阵风', [firstOf(sample({ windGusts: 95 })).title], ['强阵风'])
eq('alerts: 82 with no measured rate stays 暴阵雨', [firstOf(sample({ weatherCode: 82 })).title, firstOf(sample({ weatherCode: 82 })).level], ['暴阵雨', 'danger'])
eq('alerts: 82 over a 暴雨 rate is named 暴雨', [firstOf(sample({ weatherCode: 82, precipitation: 25 })).title], ['暴雨'])
ok('alerts: the 暴雨 detail quotes its measured rate', firstOf(sample({ weatherCode: 82, precipitation: 25 })).detail.includes('25.0 mm/h'))
eq('alerts: plain 95 is 雷阵雨', [firstOf(sample({ weatherCode: 95 })).title, firstOf(sample({ weatherCode: 95 })).level], ['雷阵雨', 'warning'])
eq('alerts: 96 with no rate is 雷雨', [firstOf(sample({ weatherCode: 96 })).title, firstOf(sample({ weatherCode: 96 })).level], ['雷雨', 'warning'])
ok('alerts: 96 is worded as a possibility', firstOf(sample({ weatherCode: 96 })).detail.includes('天气码提示雷雨'))
ok('alerts: the word 冰雹 never appears', !firstOf(sample({ weatherCode: 96 })).detail.includes('冰雹'))

// Short-duration deluge (中国气象局令第 16 号) must still be reachable.
const spread = Array.from({ length: 12 }, (_, i) => ({ time: `t${i}`, weatherCode: 61, isDay: true, precipitation: 10 }))
eq('alerts: 10 mm/h for 6 h is 暴雨黄色', [firstOf(sample({}, spread)).title, firstOf(sample({}, spread)).level], ['暴雨', 'warning'])
const burst = Array.from({ length: 12 }, (_, i) => ({ time: `t${i}`, weatherCode: 61, isDay: true, precipitation: i < 3 ? 40 : 0 }))
eq('alerts: 40 mm/h for 3 h is 暴雨红色', [firstOf(sample({}, burst)).title, firstOf(sample({}, burst)).level], ['暴雨', 'danger'])
eq('shortDurationDeluge reports its signal', X.shortDurationDeluge([10, 10, 10, 10, 10, 10]).signal, '暴雨黄色')

// Lead-time tier.
const hotAhead = Array.from({ length: 12 }, (_, i) => ({ time: `t${i}`, weatherCode: 0, isDay: true, temperature: 38 }))
ok('alerts: heat ahead raises heat-soon', keysOf(sample({}, hotAhead)).includes('heat-soon'))
ok('alerts: heat already firing is not announced twice', !keysOf(sample({ temperature: 41 }, hotAhead)).includes('heat-soon'))

// ── Description layer ───────────────────────────────────────────────────────

eq('describe: showery rate is 阵雨', X.describeSky({ precipitation: 3, showers: 3, rain: 0, isDay: true }).label, '阵雨')
eq('describe: 85 mm/h is 极端强降水', X.describeSky({ precipitation: 85, isDay: true }).label, '极端强降水')
eq('describe: freezing rain needs a rate to be asserted', X.describeSky({ weatherCode: 66, precipitation: 1.2, isDay: true }).glyph, 'freezing-rain')
eq('describe: freezing rain cites the rate as its basis', X.describeSky({ weatherCode: 66, precipitation: 1.2, isDay: true }).basis.includes('1.2 mm/h'), true)
// Without a rate it falls through to the code-only fallback, which carries the
// code's own name but NO basis — the contract every "依据" line depends on.
eq('describe: the code-only fallback has no basis', X.describeSky({ weatherCode: 66, isDay: true }).basis, undefined)
eq('describe: visibility is quoted in 公里', X.describeSky({ weatherCode: 45, visibility: 0.4, isDay: true }).basis, '能见度 0.4 公里')
// QX/T 113-2010: the obscuration window opens at 10 km, and 霾 carries a grade.
eq('describe: 8 km at 60% humidity is 轻微霾', X.describeSky({ weatherCode: 2, visibility: 8, humidity: 60, isDay: true }).label, '轻微霾')
eq('describe: 4 km at 60% humidity is 轻度霾', X.describeSky({ weatherCode: 2, visibility: 4, humidity: 60, isDay: true }).label, '轻度霾')
eq('describe: 1.5 km at 60% humidity is 重度霾', X.describeSky({ weatherCode: 2, visibility: 1.5, humidity: 60, isDay: true }).label, '重度霾')
eq('describe: 8 km at 90% humidity is 轻雾, not 霾', X.describeSky({ weatherCode: 2, visibility: 8, humidity: 90, isDay: true }).label, '轻雾')
eq('describe: 12 km leaves the sky to cloud cover', X.describeSky({ weatherCode: 0, visibility: 12, humidity: 60, cloudCover: 5, isDay: true }).label, '晴')

// 沙尘（GB/T 20480-2017）：主判是 CAMS 的 `dust` 浓度，**不是能见度** —— 数据源的
// 能见度与颗粒物不同源（实测库尔勒 dust 997 µg/m³ 时能见度仍报 26.9 km，r = -0.19），
// 拿能见度当门会让整段判识永不触发，沙尘天报「晴」。下面头两条就是这个回归防线。
eq('describe: dust 高而能见度不降，仍判浮尘', X.describeSky({ weatherCode: 0, visibility: 27, humidity: 30, dust: 400, pm10: 300, isDay: true }).label, '浮尘')
eq('describe: dust 高且能见度缺失，仍判浮尘', X.describeSky({ weatherCode: 0, humidity: 30, dust: 400, pm10: 300, isDay: true }).label, '浮尘')
eq('describe: 沙尘的依据写的是浓度', X.describeSky({ weatherCode: 0, visibility: 27, humidity: 30, dust: 400, pm10: 300, isDay: true }).basis, '沙尘浓度 400 µg/m³')
eq('describe: 能见度真的降了才写进沙尘依据', X.describeSky({ weatherCode: 0, visibility: 6, humidity: 30, dust: 400, pm10: 300, windSpeed: 5, isDay: true }).basis, '沙尘浓度 400 µg/m³，能见度 6.0 公里')
eq('describe: dust 高 + 风超 3 级（能见度 8 km）→ 扬沙', X.describeSky({ weatherCode: 2, visibility: 8, humidity: 25, dust: 200, pm10: 200, windSpeed: 30, isDay: true }).label, '扬沙')
eq('describe: dust 高 + 能见度 0.8 km → 沙尘暴', X.describeSky({ weatherCode: 2, visibility: 0.8, humidity: 25, dust: 600, pm10: 300, windSpeed: 30, isDay: true }).label, '沙尘暴')
// 高湿时低能见度是水汽，不是沙尘。
eq('describe: dust 高但湿度 90% 仍是轻雾', X.describeSky({ weatherCode: 2, visibility: 8, humidity: 90, dust: 400, pm10: 300, isDay: true }).label, '轻雾')
// 张掖实测：dust 72 过了浓度门，而 PM10 只有 17 µg/m³ —— CAMS 在沙漠边缘的背景偏高，
// 单看 dust 会把一片干净空气说成浮尘。PM10 佐证就是为了挡这个。
eq('describe: dust 过线但 PM10 很低不算沙尘', X.describeSky({ weatherCode: 0, visibility: 36, humidity: 23, dust: 72, pm10: 17, cloudCover: 5, isDay: true }).label, '晴')
eq('describe: dust 低于门槛（背景值 12）不算沙尘', X.describeSky({ weatherCode: 0, visibility: 27, humidity: 40, dust: 12, pm10: 30, cloudCover: 5, isDay: true }).label, '晴')
// 没有 dust 时退回颗粒物粒径判据：粗颗粒主导才是沙尘。
eq('describe: coarse particles + dry air is 浮尘, not 霾', X.describeSky({ weatherCode: 2, visibility: 3, humidity: 25, pm10: 200, pm25: 40, windSpeed: 8, isDay: true }).label, '浮尘')
eq('describe: a wind over 3 级 turns it into 扬沙', X.describeSky({ weatherCode: 2, visibility: 3, humidity: 25, pm10: 200, pm25: 40, windSpeed: 30, isDay: true }).label, '扬沙')
eq('describe: below 1 km the dust grades as 沙尘暴', X.describeSky({ weatherCode: 2, visibility: 0.8, humidity: 25, pm10: 300, pm25: 40, windSpeed: 30, isDay: true }).label, '沙尘暴')
// 细颗粒主导就是霾，不是沙尘。
eq('describe: fine particles still grade as 霾', X.describeSky({ weatherCode: 2, visibility: 3, humidity: 25, pm10: 200, pm25: 150, isDay: true }).label, '轻度霾')
eq('describe: PM10 below the dust line stays 霾', X.describeSky({ weatherCode: 2, visibility: 3, humidity: 25, pm10: 80, pm25: 20, isDay: true }).label, '轻度霾')
// 拿不到任何颗粒物信息就不敢断言沙尘，退回霾的判识。
eq('describe: no PM data falls back to 霾', X.describeSky({ weatherCode: 2, visibility: 3, humidity: 25, isDay: true }).label, '轻度霾')
// GB/T 35663-2017 成数: 晴 0–2, 少云 3–5, 多云 6–8, 阴 9–10.
eq('describe: 60% cloud cover is 多云', X.describeSky({ weatherCode: 3, cloudCover: 60, isDay: true }).label, '多云')
eq('describe: 90% cloud cover is 阴', X.describeSky({ weatherCode: 3, cloudCover: 90, isDay: true }).label, '阴')
// Domestic hourly rate table: 大雨 from 8.0 mm/h, 暴雨 from 16, 短时强降水 from QX/T 416's 20.
eq('describe: 9 mm/h is 大雨, not 中雨', X.describeSky({ precipitation: 9, isDay: true }).label, '大雨')
eq('describe: 17 mm/h is 暴雨', X.describeSky({ precipitation: 17, isDay: true }).label, '暴雨')
eq('describe: 25 mm/h is 短时强降水', X.describeSky({ precipitation: 25, isDay: true }).label, '短时强降水')
// 中国气象局紫外线指数五级.
eq('uv: 2 is 最弱', X.uvLevel(2), '最弱')
eq('uv: 4 is 弱', X.uvLevel(4), '弱')
eq('uv: 8 is 强', X.uvLevel(8), '强')
eq('uv: 10 is 很强', X.uvLevel(10), '很强')

// ── 中国 AQI（HJ 633-2012，自算） ────────────────────────────────────────────
// 数据源的 us_aqi 是美国 EPA 口径，同一片空气给出的数不同：PM2.5 = 75 µg/m³
// 按国标是「良」(100)，按美国口径已经是「轻度污染」(≈161)。所以指数自己算。

eq('aqi: PM2.5 = 75 是 良(100)，不是美国口径的中度', X.computeAqi({ pm25: 75 }).aqi, 100)
eq('aqi: 首要污染物取到最大值那一项', X.computeAqi({ pm25: 75, pm10: 20 }).primary, 'pm25')
eq('aqi: 六项取最大而不是求和', X.computeAqi({ pm25: 35, o3_8h: 215 }).aqi, 150)
eq('aqi: 优档（≤ 50）不报首要污染物', X.computeAqi({ pm25: 10 }).primary, undefined)
eq('aqi: 全部缺测返回 undefined，不冒充 0', X.computeAqi({}), undefined)
eq('aqi: CO 按 mg/m³ 分段（4 = 100）', X.computeAqi({ co: 4 }).aqi, 100)
eq('aqi: PM10 = 150 是 良(100)', X.computeAqi({ pm10: 150 }).aqi, 100)
eq('aqi: SO2 = 150 是 良(100)', X.computeAqi({ so2: 150 }).aqi, 100)
eq('aqi: NO2 = 80 是 良(100)', X.computeAqi({ no2: 80 }).aqi, 100)
eq('aqi: 浓度越高分指数越高', X.computeAqi({ pm25: 115 }).aqi > X.computeAqi({ pm25: 75 }).aqi, true)
// 表 1 注 3：O3 的 8 小时均值越过 800 µg/m³ 就改用 1 小时平均。
eq('aqi: O3 8 h over 800 switches to the 1 h table', X.computeAqi({ o3_8h: 900, o3_1h: 200 }).aqi, 100)
eq('aqi: over 800 with no 1 h value drops O3 instead of misusing the table', X.computeAqi({ o3_8h: 900 }), undefined)
eq('durationLabel: 375 minutes', X.durationLabel(375), '6.5 小时')
eq('advice: a clear 50 km/h day is not "适合户外活动"', X.weatherAdvice(sample({ windSpeed: 50 })).text, '风力较大，注意高空坠物')
eq('advice: a clear 35 km/h day is still calm', X.weatherAdvice(sample({ windSpeed: 35 })).text, '天气晴好，适合户外活动')

// 建议优先级：重度污染压过降水提示（吸霾是健康问题），中度及以下仍让位于降水。
eq('advice: 重度污染压过降水提示', X.weatherAdvice(sample({ weatherCode: 61 }, [], { aqi: 250 })).text, '空气重度污染，外出建议佩戴口罩')
eq('advice: 中度污染不抢降水的位', X.weatherAdvice(sample({ weatherCode: 61 }, [], { aqi: 160 })).text, '有降水，出门记得带伞')
eq('advice: 无降水时中度污染仍会提示', X.weatherAdvice(sample({ weatherCode: 3 }, [], { aqi: 160 })).text, '空气质量较差，外出建议佩戴口罩')

// ── 口径统一：逐小时槽位也走证据层 ──────────────────────────────────────────
// 不这样做，tab 标题与逐小时图标会读天气码，说出与描述行不同的名字。

eq('hourly evidence: 0.3 mm/h reads 小雨, not the code’s 毛毛雨',
  X.describeSky(X.skyEvidenceOfHourly({ precipitation: 0.3, weatherCode: 51, isDay: true })).label, '小雨')
eq('hourly evidence: a dry hour falls back to the code',
  X.describeSky(X.skyEvidenceOfHourly({ weatherCode: 2, isDay: true })).label, '多云')
eq('glyphEmoji: every glyph maps to an emoji', typeof X.glyphEmoji('rain-light'), 'string')
eq('glyphEmoji: clear night keeps the moon', X.glyphEmoji('clear-night'), '🌙')

// ── Daily grades (GB/T 28592-2012) ──────────────────────────────────────────

eq('rainGrade24h: 0 is 无降水', X.rainGrade24h(0), '无降水')
eq('rainGrade24h: a trace is its own band', X.rainGrade24h(0.05), '微量')
eq('rainGrade24h: 12.3 mm is 中雨', X.rainGrade24h(12.3), '中雨')
eq('rainGrade24h: 60 mm is 暴雨', X.rainGrade24h(60), '暴雨')
eq('snowGrade24h: a dusting is 微量, not 小雪', X.snowGrade24h(0.5), '微量')
eq('snowGrade24h: 10 cm of fresh snow is 小雪', X.snowGrade24h(10), '小雪')

// ── Location helpers ────────────────────────────────────────────────────────

eq('cityLevelName drops the district', X.cityLevelName('广东省广州市黄埔区'), '广东省广州市')
eq('cityLevelName handles a 直辖市', X.cityLevelName('北京市朝阳区'), '北京市')
eq('the current-location label is the one the guard rejects', X.CURRENT_LOCATION_LABEL, '当前位置')

// ── fetchWeather: fetch → WeatherData mapping ───────────────────────────────

const HOUR = 3600_000
const MINUTE = 60_000
const OFFSET_S = 8 * 3600 // stand-in for timezone=auto's local wall clock
const localIso = (ms) => new Date(ms + OFFSET_S * 1000).toISOString().slice(0, 16)
const nowStep15 = Math.floor(Date.now() / (15 * MINUTE)) * (15 * MINUTE)
const hourBefore = Math.floor(Date.now() / HOUR) * HOUR - HOUR

const minutelyTimes = Array.from({ length: 44 }, (_, i) => localIso(nowStep15 + i * 15 * MINUTE))
const hourlyTimes = Array.from({ length: 48 }, (_, i) => localIso(hourBefore + i * HOUR))
const forecastPayload = {
  current: {
    time: localIso(Date.now()),
    interval: 900,
    temperature_2m: 26.4,
    relative_humidity_2m: 72,
    apparent_temperature: 28.1,
    weather_code: 61,
    wind_speed_10m: 12,
    is_day: 1,
    wind_direction_10m: 135,
    wind_gusts_10m: 22,
    surface_pressure: 1005,
    cloud_cover: 88,
    visibility: 4500,
    dew_point_2m: 21,
    precipitation: 5,
    rain: 2,
    showers: 1,
    // Unreported values must stay absent, never become 0.
    snowfall: null,
    cape: null,
    lifted_index: null,
    freezing_level_height: 4800,
  },
  hourly: {
    time: hourlyTimes,
    temperature_2m: hourlyTimes.map((_, i) => 20 + i * 0.1),
    weather_code: hourlyTimes.map((_, i) => (i === 2 ? 65 : 1)),
    is_day: hourlyTimes.map((_, i) => (i % 24 >= 6 && i % 24 < 19 ? 1 : 0)),
    precipitation_probability: hourlyTimes.map((_, i) => 10 + i),
    wind_speed_10m: hourlyTimes.map(() => 9),
    precipitation: hourlyTimes.map((_, i) => (i === 2 ? 10 : 0)),
    showers: hourlyTimes.map(() => 0),
    snowfall: hourlyTimes.map(() => 0),
    cape: hourlyTimes.map(() => 1800),
  },
  daily: {
    time: Array.from({ length: 7 }, (_, i) => `2026-09-${String(20 + i).padStart(2, '0')}`),
    weather_code: Array.from({ length: 7 }, () => 61),
    temperature_2m_max: Array.from({ length: 7 }, (_, i) => 28 + i),
    temperature_2m_min: Array.from({ length: 7 }, (_, i) => 20 + i),
    precipitation_probability_max: Array.from({ length: 7 }, () => 80),
    sunrise: Array.from({ length: 7 }, () => '2026-09-20T06:09'),
    sunset: Array.from({ length: 7 }, () => '2026-09-20T18:32'),
    uv_index_max: Array.from({ length: 7 }, (_, i) => 7 + i * 0.1),
    precipitation_sum: Array.from({ length: 7 }, () => 12.3),
    snowfall_sum: Array.from({ length: 7 }, () => 0),
  },
  // One wet step 30 minutes out, to exercise onset detection and the offset.
  minutely_15: {
    time: minutelyTimes,
    precipitation: minutelyTimes.map((_, i) => (i === 2 ? 1 : 0)),
  },
  utc_offset_seconds: OFFSET_S,
}
// Air feed: `current` is instantaneous, `hourly` is where the 24 h means come from.
// Concentrations are round numbers on purpose — PM2.5 24 h mean 75 → IAQI 100 (良), a reading
// the US EPA scale would have called 轻度污染 (≈161). That gap is the whole reason for computing.
const AIR_BACK_HOURS = 30
const airTimes = Array.from({ length: 48 }, (_, i) => localIso(hourBefore - AIR_BACK_HOURS * HOUR + i * HOUR))
const flat = (value) => airTimes.map(() => value)
const airPayload = {
  current: { time: localIso(Date.now()), ozone: 90, dust: 8 },
  hourly: {
    time: airTimes,
    pm2_5: flat(75),
    pm10: flat(50),
    carbon_monoxide: flat(400),
    nitrogen_dioxide: flat(20),
    sulphur_dioxide: flat(10),
    // 8 h running mean 90 → IAQI 45, under PM2.5's 100, so PM2.5 stays primary.
    ozone: flat(90),
  },
}

let mode = 'ok'
global.fetch = async (url) => {
  const text = mode === 'empty'
    ? ''
    : mode === 'no-temperature'
      ? JSON.stringify({ ...forecastPayload, current: { ...forecastPayload.current, temperature_2m: undefined } })
      : JSON.stringify(String(url).includes('air-quality') ? airPayload : forecastPayload)
  return { ok: mode !== 'http-error', status: mode === 'http-error' ? 503 : 200, text: async () => text }
}
const expectRejection = async (label, run, message) => {
  try {
    await run()
    eq(label, 'resolved', 'threw')
  } catch (err) {
    eq(label, err.message, message)
  }
}

;(async () => {
  const LOCATION = { name: '广州市', latitude: 23.129, longitude: 113.265, source: 'ip' }
  const data = await X.fetchWeather(LOCATION)

  eq('fetch: temperature', data.current.temperature, 26.4)
  eq('fetch: apparent temperature', data.current.apparentTemperature, 28.1)
  eq('fetch: is_day becomes a boolean', data.current.isDay, true)
  // A 15-minute accumulation is converted to a rate: 5 mm/15 min = 20 mm/h.
  eq('fetch: precipitation becomes mm/h (5 → 20)', data.current.precipitation, 20)
  eq('fetch: rain takes the same conversion (2 → 8)', data.current.rain, 8)
  eq('fetch: showers takes the same conversion (1 → 4)', data.current.showers, 4)
  eq('fetch: an unreported snowfall stays absent', data.current.snowfall, undefined)
  eq('fetch: an unreported cape stays absent', data.current.cape, undefined)
  eq('fetch: visibility metres become km (4500 → 4.5)', data.current.visibility, 4.5)
  eq('fetch: freezing level passes through', data.current.freezingLevel, 4800)
  eq('fetch: the location is carried back', data.location, LOCATION)

  eq('fetch: hourly is capped at 24 points', data.hourly.length, 24)
  eq('fetch: hourly starts at the hour CONTAINING now', data.hourly[0].time, localIso(hourBefore + HOUR))
  // The slice shifts indices: raw index 2 lands at hourly[1].
  eq('fetch: the wet hour keeps its value after slicing', data.hourly[1].precipitation, 10)
  eq('fetch: the wet hour keeps its code after slicing', data.hourly[1].weatherCode, 65)
  ok('fetch: every hourly point carries an isDay flag', data.hourly.every((h) => typeof h.isDay === 'boolean'))

  eq('fetch: daily is capped at 7 days', data.daily.length, 7)
  eq('fetch: sunrise comes from day 0', data.sunrise, '2026-09-20T06:09')
  eq('fetch: uvIndexMax comes from day 0', data.uvIndexMax, 7)
  eq('fetch: the last day keeps its values', data.daily[6].tempMax, 34)

  eq('fetch: minutely keeps 24 steps', data.minutely.length, 24)
  eq('fetch: minutely starts at the step containing now', data.minutely[0].time, localIso(nowStep15))
  eq('fetch: a dry grid step reports 0, not a hole', data.minutely[5].precipitation, 0)
  eq('fetch: rain is not falling yet', data.rainSoon.rainingNow, false)
  // The step containing now is already partly spent, so the reported onset must
  // sit strictly inside the two-step window: the un-subtracted answer would be
  // exactly 30. (The upper bound must not be asserted as `> 15` — this payload
  // is built from a wall-clock snapshot, so a tick across a 15-minute boundary
  // legitimately pushes the elapsed portion to a whole step.)
  ok('fetch: onset subtracts the elapsed part of the current step',
    data.rainSoon.onsetMinutes > 0 && data.rainSoon.onsetMinutes < 30)
  eq('fetch: a one-step spell lasts 15 minutes', data.rainSoon.durationMinutes, 15)
  eq('fetch: the window covers every step', data.rainSoon.windowMinutes, 360)

  // The index is computed from the 24 h means, not lifted from the feed's own AQI.
  eq('fetch: AQI is computed per HJ 633-2012', data.air.aqi, 100)
  eq('fetch: the primary pollutant is named in Chinese', data.air.primary, 'PM2.5')
  eq('fetch: the PM2.5 on the card is the 24 h mean', data.air.pm25, 75)
  eq('fetch: CO is converted µg/m³ → mg/m³', data.air.concentrations.co, 0.4)
  // dust 走瞬时值：沙尘是短时事件，取 24 h 均值会把它抹平。
  eq('fetch: dust rides along as an instantaneous reading', data.air.dust, 8)

  mode = 'empty'
  await expectRejection('fetch: an empty body is an error', () => X.fetchWeather(LOCATION), '天气服务暂未返回数据，请稍后重试')
  mode = 'no-temperature'
  await expectRejection('fetch: a missing temperature is an error', () => X.fetchWeather(LOCATION), '天气服务暂未返回当前数据，请稍后重试')
  mode = 'http-error'
  await expectRejection('fetch: an HTTP error is surfaced', () => X.fetchWeather(LOCATION), '天气数据获取失败（HTTP 503）')
  mode = 'ok'

  const detail = await X.fetchDayDetail(LOCATION, '2026-09-20')
  eq('day detail: the date passes through', detail.date, '2026-09-20')
  eq('day detail: the whole day is returned', detail.hourly.length, 48)
  eq('day detail: an unreported humidity stays absent', detail.hourly[0].humidity, undefined)

  if (failures.length > 0) {
    console.error(`\nverify-units FAILED (${failures.length}):\n`)
    for (const failure of failures) console.error(`  ✗ ${failure}`)
    process.exit(1)
  }
  console.log(`units ok (${passed} assertions)`)
})()
