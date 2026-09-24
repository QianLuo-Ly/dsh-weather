// 真实报文探针（单城 + 构造边界场景）。
//
// 目的：不看代码猜输出，而是拉 Open-Meteo 的实时数据，套用项目自身的
// describeSky / evaluateAlerts / weatherAdvice 规则，把最终落到 UI 的文案打出来，
// 人工审一遍「这些话对着真实天气说得对不对」。
//
// 批量版见 scripts/calibrate-cities.cjs（100 城自检）。
// 需要网络。用法：npm run probe:live
globalThis.window = globalThis // shared/http.ts 用 window.setTimeout / clearTimeout

const path = require('node:path')
const Module = require('node:module')
const esbuild = require('esbuild')

const ROOT = path.resolve(__dirname, '..')

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

const X = loadModules([
  'src/client/shared/format.ts',
  'src/client/data/alerts.ts',
  'src/client/data/describe.ts',
  'src/client/data/condition.ts',
  'src/client/data/weather-api.ts',
], 'dshw-live')

const CITIES = [
  { name: '广州 · 天河', latitude: 23.1247, longitude: 113.3614, source: 'manual' },
  { name: '北京 · 朝阳', latitude: 39.9219, longitude: 116.4436, source: 'manual' },
  { name: '哈尔滨 · 道里', latitude: 45.755, longitude: 126.616, source: 'manual' },
  { name: '乌鲁木齐 · 天山', latitude: 43.793, longitude: 87.627, source: 'manual' },
]

const fmtC = (v) => `${Math.round(v)}°C`
const fmtWind = (v) => `${Math.round(v)} km/h`
const n = (v, unit = '', digits = 0) =>
  v === undefined || v === null ? '—' : `${v.toFixed(digits)}${unit}`

/** 把 current 块拼成一行观测事实，方便跟下面的话术对照。 */
const evidenceLine = (c) => [
  `气温 ${n(c.temperature, '°C', 1)}`,
  `体感 ${n(c.apparentTemperature, '°C', 1)}`,
  `湿度 ${n(c.humidity, '%')}`,
  `风 ${n(c.windSpeed, ' km/h')}`,
  `阵风 ${n(c.windGusts, ' km/h')}`,
  `云量 ${n(c.cloudCover, '%')}`,
  `能见度 ${n(c.visibility, ' km', 1)}`,
  `露点 ${n(c.dewPoint, '°C', 1)}`,
  `气压 ${n(c.pressure, ' hPa')}`,
  `降水率 ${n(c.precipitation, ' mm/h', 2)}`,
].join('  ')

/** 同一时刻数据源的美标指数，仅作对照：国标算的是 24 h 均值，输入口径本就不同。 */
async function usAqiOf(city) {
  const url = `https://air-quality-api.open-meteo.com/v1/air-quality?latitude=${city.latitude}&longitude=${city.longitude}&current=us_aqi,pm2_5&timezone=auto`
  try {
    const res = await fetch(url)
    if (!res.ok) return null
    const json = await res.json()
    return json?.current ?? null
  } catch {
    return null
  }
}

const run = async () => {
  for (const city of CITIES) {
    console.log(`\n${'='.repeat(72)}\n${city.name}\n${'='.repeat(72)}`)
    let data
    try {
      data = await X.fetchWeather(city)
    } catch (error) {
      console.log(`  拉取失败：${error.message}`)
      continue
    }
    const c = data.current

    console.log(`【观测】${evidenceLine(c)}`)

    // 1) 主描述（describeSky，证据优先；PM 一并喂进去，沙尘才判得出来）
    const sky = X.describeSky(X.skyEvidenceOf(c, data.air))
    console.log(`【描述】${sky.label}${sky.basis === undefined ? '' : `  ｜ 依据 ${sky.basis}`}${sky.uncertain ? '  ｜ 模式推断' : ''}  [glyph ${sky.glyph}]`)

    // 2) 码表本身怎么说的（对照用）
    const cond = X.describeCondition(c.weatherCode, c.isDay)
    console.log(`【码表】${cond.label} ${cond.emoji}  (weather_code ${c.weatherCode}, ${c.isDay ? '白天' : '夜晚'}, 阵性 ${n(c.showers, ' mm/h', 2)} / 连续 ${n(c.rain, ' mm/h', 2)})`)

    // 3) 预警
    const alerts = X.evaluateAlerts(data, fmtC, fmtWind)
    if (alerts.length === 0) console.log('【预警】无')
    else for (const a of alerts) console.log(`【预警】[${a.level}] ${a.title} — ${a.detail}`)

    // 4) 一句话建议
    const advice = X.weatherAdvice(data)
    console.log(`【建议】${advice.icon} ${advice.text}`)

    // 5) 空气 / 紫外线
    const aqi = data.air?.aqi
    const aqiLabel = aqi === undefined ? '—' : `${X.aqiInfo(aqi).label}(${aqi})`
    const us = await usAqiOf(city)
    console.log(`【空气】国标 AQI ${aqiLabel}　首要 ${data.air?.primary ?? '—'}　PM2.5 ${n(data.air?.pm25, ' µg/m³', 1)}（24h 均值）　PM10 ${n(data.air?.pm10, ' µg/m³', 1)}　沙尘 ${n(data.air?.dust, ' µg/m³', 0)}　CO ${n(data.air?.concentrations?.co, ' mg/m³', 2)}`)
    if (us !== null) {
      console.log(`        对照 · 数据源美标 us_aqi ${us.us_aqi ?? '—'}（瞬时 PM2.5 ${n(us.pm2_5, ' µg/m³', 1)}）—— 已不再采用`)
    }
    const uv = data.uvIndexMax
    console.log(`【紫外线】${uv === undefined ? '—' : `${X.uvLevel(uv)}（峰值 ${uv.toFixed(1)}）`}`)

    // 6) 未来 7 天及其依据
    console.log('【7 天】')
    data.daily.forEach((d, i) => {
      const rain = X.rainGrade24h(d.precipSum)
      const snow = X.snowGrade24h(d.snowfallSum)
      const parts = [
        X.dayLabel(d.date, i),
        `${n(d.tempMin, '°C')}~${n(d.tempMax, '°C')}`,
        X.describeCondition(d.weatherCode, true).label,
        `24h 雨量 ${n(d.precipSum, ' mm', 1)}${rain === undefined ? '' : ` → ${rain}`}`,
      ]
      if (snow !== undefined) parts.push(`雪量 ${n(d.snowfallSum, ' cm', 1)} → ${snow}`)
      parts.push(`降水概率 ${n(d.precipProb, '%')}`)
      console.log(`   ${parts.join('  ｜ ')}`)
    })

    // 7) 降水时序（雨带）
    const soon = data.rainSoon
    console.log(`【雨带】${soon === undefined ? '无 minutely 数据' : X.rainTimingText(soon)}  窗外 ${soon?.windowMinutes ?? 0} 分钟`)

    // 8) 逐小时头 8 小时（看描述与预报是否自洽）
    console.log('【逐小时】')
    for (const h of data.hourly.slice(0, 8)) {
      console.log(`   ${h.time.slice(11)}  ${n(h.temperature, '°C')}  ${X.describeCondition(h.weatherCode, h.isDay).label}  降水率 ${n(h.precipitation, ' mm/h', 2)}  概率 ${n(h.precipProb, '%')}  风 ${n(h.windSpeed, ' km/h')}  CAPE ${n(h.cape, '', 0)}`)
    }
  }
}

/** 构造场景：验证边界与口径冲突，不依赖当天真实天气。 */
const scenarios = () => {
  console.log(`\n${'='.repeat(72)}\n构造边界场景（口径对照）\n${'='.repeat(72)}`)
  const cases = [
    {
      name: '沙尘：dust 400 µg/m³ 但能见度 27 km（数据源的能见度不反映沙尘）',
      e: { precipitation: 0, humidity: 30, visibility: 27, cloudCover: 10, weatherCode: 0, isDay: true, dust: 400, pm10: 300 },
    },
    {
      name: '沙尘：dust 200 + 风超 3 级（能见度 8 km）→ 扬沙',
      e: { precipitation: 0, humidity: 25, visibility: 8, cloudCover: 20, weatherCode: 2, isDay: true, dust: 200, pm10: 200, windSpeed: 30 },
    },
    {
      name: 'dust 过线但 PM10 只有 17（张掖实测）→ 是干净空气，不是浮尘',
      e: { precipitation: 0, humidity: 23, visibility: 36, cloudCover: 5, weatherCode: 0, isDay: true, dust: 72, pm10: 17 },
    },
    {
      name: 'dust 高但湿度 90 % → 是轻雾，不是沙尘',
      e: { precipitation: 0, humidity: 90, visibility: 8, cloudCover: 90, weatherCode: 2, isDay: true, dust: 400, pm10: 300 },
    },
    {
      name: '沙尘（回退判据）：湿度 25 % / 能见度 3 km / PM10 200（无 dust）',
      e: { precipitation: 0, humidity: 25, visibility: 3, cloudCover: 10, weatherCode: 0, isDay: true, pm10: 200, pm25: 40, windSpeed: 8 },
    },
    {
      name: '同样低能见度，但细颗粒主导 —— 这是霾，不是沙尘',
      e: { precipitation: 0, humidity: 25, visibility: 3, cloudCover: 60, weatherCode: 2, isDay: true, pm10: 200, pm25: 150 },
    },
    {
      name: '雨后高湿：湿度 92 % / 能见度 6 km',
      e: { precipitation: 0, humidity: 92, visibility: 6, cloudCover: 80, weatherCode: 0, isDay: true },
    },
    {
      name: '能见度 9.99 km（判霾门槛内侧一格）',
      e: { precipitation: 0, humidity: 70, visibility: 9.99, cloudCover: 90, weatherCode: 3, isDay: true },
    },
    {
      name: '毛毛雨 0.2 mm/h（码表 51）',
      e: { precipitation: 0.2, rain: 0.2, humidity: 90, visibility: 12, cloudCover: 95, weatherCode: 51, isDay: true },
    },
    {
      name: '小雨 0.3 mm/h（码表仍是 51 —— 同一份数据两套叫法）',
      e: { precipitation: 0.3, rain: 0.3, humidity: 90, visibility: 12, cloudCover: 95, weatherCode: 51, isDay: true },
    },
    {
      name: '阵雨 3 mm/h（阵性）',
      e: { precipitation: 3, showers: 3, humidity: 85, visibility: 10, cloudCover: 90, weatherCode: 80, isDay: true },
    },
    {
      name: '阵雨 9 mm/h（越过 8 的大雨线）',
      e: { precipitation: 9, showers: 9, humidity: 85, visibility: 8, cloudCover: 95, weatherCode: 81, isDay: true },
    },
    {
      name: '连续雨 17 mm/h（越过 16 的暴雨线）',
      e: { precipitation: 17, rain: 17, humidity: 95, visibility: 4, cloudCover: 100, weatherCode: 65, isDay: true },
    },
  ]
  for (const c of cases) {
    const sky = X.describeSky(c.e)
    const cond = X.describeCondition(c.e.weatherCode, c.e.isDay)
    const shown = c.e.visibility === undefined ? '—' : `${X.compactDistance(c.e.visibility)} km`
    console.log(`\n· ${c.name}`)
    console.log(`  证据层 describeSky  → ${sky.label}${sky.basis === undefined ? '' : `  ｜ ${sky.basis}`}`)
    console.log(`  码表层 码表         → ${cond.label} ${cond.emoji}`)
    console.log(`  能见度若写进依据    → 「${shown}」（沙尘场景下不一定写，见上）`)
  }
}

run()
  .then(scenarios)
  .catch((error) => {
    console.error('探针崩溃：', error)
    process.exitCode = 1
  })
