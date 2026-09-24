// 100 城批量校准探针。
//
// 目的：把 describeSky / evaluateAlerts / weatherAdvice / computeAqi 这套规则丢到
// 100 个真实城市的实时报文上跑，由脚本**自动报异常**，而不是拉一堆输出让人眼扫。
//
// 三类产出：
//   1. 异常清单（violations）—— 违反了物理常识或自己定的规则，必须修
//   2. 可疑清单（suspects）—— 逻辑上说得通但可能不合常识，需要人判断
//   3. 画像（profile）—— 各地域判定分布，用来看阈值在整个国家尺度上是否合理
//
// 需要网络（Open-Meteo）。不进 `npm run check` —— 它是手动体检工具，不是关卡。
// 用法：npm run probe:cities -- 5      （5 = 并发数，默认 4）
// 明细写入 scripts/calibrate-report.txt
globalThis.window = globalThis // shared/http.ts 用 window.setTimeout / clearTimeout

const path = require('node:path')
const fs = require('node:fs')
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
  'src/client/data/aqi.ts',
  'src/client/data/alerts.ts',
  'src/client/data/describe.ts',
  'src/client/data/condition.ts',
  'src/client/data/weather-api.ts',
], 'dshw-calib')

// ---------------------------------------------------------------------------
// 100 城：覆盖所有气候带与地理极端。校准的价值全在覆盖面 —— 只挑省会，
// 沙尘、高原、严寒这些把规则逼到边界的场景一个都碰不到。
// ---------------------------------------------------------------------------
const CITIES = [
  // —— 东北：严寒、暴雪、极端低温 ——
  { name: '漠河', region: '东北', latitude: 52.97, longitude: 122.53 },
  { name: '抚远', region: '东北', latitude: 48.37, longitude: 134.29 },
  { name: '哈尔滨', region: '东北', latitude: 45.75, longitude: 126.62 },
  { name: '齐齐哈尔', region: '东北', latitude: 47.35, longitude: 123.92 },
  { name: '牡丹江', region: '东北', latitude: 44.55, longitude: 129.63 },
  { name: '佳木斯', region: '东北', latitude: 46.81, longitude: 130.32 },
  { name: '长春', region: '东北', latitude: 43.88, longitude: 125.32 },
  { name: '延吉', region: '东北', latitude: 42.91, longitude: 129.51 },
  { name: '沈阳', region: '东北', latitude: 41.80, longitude: 123.43 },
  { name: '大连', region: '东北', latitude: 38.91, longitude: 121.61 },
  { name: '满洲里', region: '东北', latitude: 49.60, longitude: 117.45 },
  // —— 华北：霾、沙尘、高温 ——
  { name: '北京', region: '华北', latitude: 39.92, longitude: 116.44 },
  { name: '天津', region: '华北', latitude: 39.13, longitude: 117.20 },
  { name: '石家庄', region: '华北', latitude: 38.04, longitude: 114.51 },
  { name: '唐山', region: '华北', latitude: 39.63, longitude: 118.18 },
  { name: '保定', region: '华北', latitude: 38.87, longitude: 115.46 },
  { name: '邯郸', region: '华北', latitude: 36.63, longitude: 114.54 },
  { name: '承德', region: '华北', latitude: 40.95, longitude: 117.94 },
  { name: '太原', region: '华北', latitude: 37.87, longitude: 112.55 },
  { name: '大同', region: '华北', latitude: 40.09, longitude: 113.30 },
  { name: '呼和浩特', region: '华北', latitude: 40.84, longitude: 111.75 },
  { name: '包头', region: '华北', latitude: 40.66, longitude: 109.84 },
  { name: '二连浩特', region: '华北', latitude: 43.65, longitude: 111.98 },
  // —— 华东：高温高湿、梅雨、台风 ——
  { name: '济南', region: '华东', latitude: 36.65, longitude: 117.12 },
  { name: '青岛', region: '华东', latitude: 36.07, longitude: 120.38 },
  { name: '潍坊', region: '华东', latitude: 36.71, longitude: 119.16 },
  { name: '烟台', region: '华东', latitude: 37.46, longitude: 121.45 },
  { name: '郑州', region: '华东', latitude: 34.75, longitude: 113.63 },
  { name: '洛阳', region: '华东', latitude: 34.62, longitude: 112.45 },
  { name: '上海', region: '华东', latitude: 31.23, longitude: 121.47 },
  { name: '南京', region: '华东', latitude: 32.06, longitude: 118.80 },
  { name: '苏州', region: '华东', latitude: 31.30, longitude: 120.62 },
  { name: '无锡', region: '华东', latitude: 31.57, longitude: 120.30 },
  { name: '徐州', region: '华东', latitude: 34.26, longitude: 117.19 },
  { name: '连云港', region: '华东', latitude: 34.60, longitude: 119.22 },
  { name: '杭州', region: '华东', latitude: 30.27, longitude: 120.16 },
  { name: '宁波', region: '华东', latitude: 29.87, longitude: 121.55 },
  { name: '温州', region: '华东', latitude: 28.00, longitude: 120.70 },
  { name: '舟山', region: '华东', latitude: 30.02, longitude: 122.10 },
  { name: '合肥', region: '华东', latitude: 31.82, longitude: 117.23 },
  { name: '福州', region: '华东', latitude: 26.07, longitude: 119.30 },
  { name: '厦门', region: '华东', latitude: 24.48, longitude: 118.09 },
  { name: '泉州', region: '华东', latitude: 24.87, longitude: 118.68 },
  // —— 华中：梅雨、伏旱、秋老虎 ——
  { name: '武汉', region: '华中', latitude: 30.59, longitude: 114.31 },
  { name: '宜昌', region: '华中', latitude: 30.69, longitude: 111.29 },
  { name: '襄阳', region: '华中', latitude: 32.01, longitude: 112.12 },
  { name: '长沙', region: '华中', latitude: 28.23, longitude: 112.94 },
  { name: '张家界', region: '华中', latitude: 29.13, longitude: 110.48 },
  { name: '南昌', region: '华中', latitude: 28.68, longitude: 115.86 },
  { name: '赣州', region: '华中', latitude: 25.83, longitude: 114.93 },
  { name: '九江', region: '华中', latitude: 29.71, longitude: 116.00 },
  { name: '南阳', region: '华中', latitude: 32.99, longitude: 112.53 },
  // —— 华南：高湿、暴雨、台风、回南天 ——
  { name: '广州', region: '华南', latitude: 23.12, longitude: 113.36 },
  { name: '深圳', region: '华南', latitude: 22.54, longitude: 114.06 },
  { name: '珠海', region: '华南', latitude: 22.27, longitude: 113.58 },
  { name: '汕头', region: '华南', latitude: 23.35, longitude: 116.68 },
  { name: '湛江', region: '华南', latitude: 21.27, longitude: 110.36 },
  { name: '南宁', region: '华南', latitude: 22.82, longitude: 108.32 },
  { name: '桂林', region: '华南', latitude: 25.27, longitude: 110.29 },
  { name: '海口', region: '华南', latitude: 20.04, longitude: 110.32 },
  { name: '三亚', region: '华南', latitude: 18.25, longitude: 109.51 },
  { name: '北海', region: '华南', latitude: 21.48, longitude: 109.12 },
  { name: '中国香港', region: '华南', latitude: 22.32, longitude: 114.17 },
  { name: '中国澳门', region: '华南', latitude: 22.20, longitude: 113.54 },
  { name: '中国台湾·台北', region: '华南', latitude: 25.03, longitude: 121.57 },
  { name: '三沙·西沙', region: '华南', latitude: 16.83, longitude: 112.33 },
  // —— 西南：多阴雨、逆温、高原过渡 ——
  { name: '成都', region: '西南', latitude: 30.66, longitude: 104.07 },
  { name: '绵阳', region: '西南', latitude: 31.47, longitude: 104.68 },
  { name: '宜宾', region: '西南', latitude: 28.77, longitude: 104.62 },
  { name: '西昌', region: '西南', latitude: 27.89, longitude: 102.26 },
  { name: '攀枝花', region: '西南', latitude: 26.58, longitude: 101.72 },
  { name: '重庆', region: '西南', latitude: 29.56, longitude: 106.55 },
  { name: '贵阳', region: '西南', latitude: 26.65, longitude: 106.63 },
  { name: '遵义', region: '西南', latitude: 27.73, longitude: 106.93 },
  { name: '昆明', region: '西南', latitude: 25.04, longitude: 102.72 },
  { name: '丽江', region: '西南', latitude: 26.87, longitude: 100.23 },
  { name: '香格里拉', region: '西南', latitude: 27.83, longitude: 99.70 },
  { name: '大理', region: '西南', latitude: 25.61, longitude: 100.27 },
  { name: '景洪', region: '西南', latitude: 22.01, longitude: 100.80 },
  // —— 西北：沙尘、干燥、昼夜温差 ——
  { name: '西安', region: '西北', latitude: 34.34, longitude: 108.94 },
  { name: '榆林', region: '西北', latitude: 38.29, longitude: 109.73 },
  { name: '兰州', region: '西北', latitude: 36.06, longitude: 103.83 },
  { name: '敦煌', region: '西北', latitude: 40.14, longitude: 94.66 },
  { name: '嘉峪关', region: '西北', latitude: 39.77, longitude: 98.29 },
  { name: '张掖', region: '西北', latitude: 38.93, longitude: 100.45 },
  { name: '银川', region: '西北', latitude: 38.49, longitude: 106.23 },
  { name: '乌鲁木齐', region: '西北', latitude: 43.79, longitude: 87.63 },
  { name: '喀什', region: '西北', latitude: 39.47, longitude: 75.99 },
  { name: '和田', region: '西北', latitude: 37.11, longitude: 79.92 },
  { name: '库尔勒', region: '西北', latitude: 41.73, longitude: 86.15 },
  { name: '吐鲁番', region: '西北', latitude: 42.95, longitude: 89.19 },
  { name: '阿勒泰', region: '西北', latitude: 47.85, longitude: 88.14 },
  { name: '伊宁', region: '西北', latitude: 43.92, longitude: 81.32 },
  // —— 青藏：低气压、强紫外线、雷暴、雪 ——
  { name: '西宁', region: '青藏', latitude: 36.62, longitude: 101.78 },
  { name: '格尔木', region: '青藏', latitude: 36.40, longitude: 94.90 },
  { name: '玉树', region: '青藏', latitude: 33.00, longitude: 97.01 },
  { name: '拉萨', region: '青藏', latitude: 29.65, longitude: 91.14 },
  { name: '日喀则', region: '青藏', latitude: 29.27, longitude: 88.88 },
  { name: '那曲', region: '青藏', latitude: 31.48, longitude: 92.05 },
  { name: '林芝', region: '青藏', latitude: 29.65, longitude: 94.36 },
]

if (CITIES.length !== 100) {
  console.error(`城市清单应为 100 个，实为 ${CITIES.length} 个 —— 先修清单再跑。`)
  process.exit(1)
}

// ---------------------------------------------------------------------------
// 输出收集：同时进文件与终端
// ---------------------------------------------------------------------------
const LINES = []
const log = (line = '') => {
  LINES.push(line)
  process.stdout.write(`${line}\n`)
}

// ---------------------------------------------------------------------------
// 判据常量（与 condition.ts / describe.ts 对齐；改那边记得同步这里）
// ---------------------------------------------------------------------------
const RAIN_LABELS = new Set(['毛毛雨', '小雨', '中雨', '大雨', '暴雨', '阵雨', '强阵雨', '雷阵雨', '雷雨', '短时强降水', '极端强降水', '冻雨', '强冻雨', '冻毛毛雨', '强冻毛毛雨'])
const SNOW_LABELS = new Set(['降雪', '阵雪'])
const HAZE_LABELS = new Set(['轻微霾', '轻度霾', '中度霾', '重度霾'])
const DUST_LABELS = new Set(['浮尘', '扬沙', '沙尘暴', '强沙尘暴', '特强沙尘暴'])
const FOG_LABELS = new Set(['雾', '轻雾', '能见度偏低'])
const CLEAR_LABELS = new Set(['晴', '少云', '多云', '阴'])

const isPrecipCode = (code) =>
  (code >= 51 && code <= 67) || (code >= 71 && code <= 77) || (code >= 80 && code <= 86) || (code >= 95 && code <= 99)

// ---------------------------------------------------------------------------
// 规则：return 字符串 = 违规；返回数组 = 多条
// 命名空间前缀便于汇总统计
// ---------------------------------------------------------------------------
const checkPhysics = (ctx) => {
  const problems = []
  const { c, city } = ctx
  const num = (v) => (typeof v === 'number' && Number.isFinite(v) ? v : undefined)

  const t = num(c.temperature)
  const dp = num(c.dewPoint)
  const rh = num(c.humidity)
  const cc = num(c.cloudCover)
  const vis = num(c.visibility)
  const ws = num(c.windSpeed)
  const wg = num(c.windGusts)
  const pr = num(c.pressure)
  const at = num(c.apparentTemperature)

  if (t !== undefined && (t < -55 || t > 50)) problems.push(`phys.temp 气温 ${t.toFixed(1)} ℃ 超出中国气候极值`)
  if (dp !== undefined && t !== undefined && dp > t + 0.6) problems.push(`phys.dewpoint 露点 ${dp.toFixed(1)} > 气温 ${t.toFixed(1)}（不可能）`)
  if (rh !== undefined && (rh < 0 || rh > 100)) problems.push(`phys.humidity 湿度 ${rh} 越界`)
  if (cc !== undefined && (cc < 0 || cc > 100)) problems.push(`phys.cloud 云量 ${cc} 越界`)
  if (vis !== undefined && (vis < 0 || vis > 120)) problems.push(`phys.visibility 能见度 ${vis} km 越界`)
  if (ws !== undefined && (ws < 0 || ws > 230)) problems.push(`phys.wind 风速 ${ws} km/h 越界`)
  if (wg !== undefined && (wg < 0 || wg > 280)) problems.push(`phys.gust 阵风 ${wg} km/h 越界`)
  if (pr !== undefined && (pr < 450 || pr > 1100)) problems.push(`phys.pressure 气压 ${pr} hPa 越界`)
  if (at !== undefined && t !== undefined && Math.abs(at - t) > 25) problems.push(`phys.apparent 体感 ${at.toFixed(1)} 与气温 ${t.toFixed(1)} 相差 ${Math.abs(at - t).toFixed(1)} 度`)
  if (ws !== undefined && wg !== undefined && wg < ws) problems.push(`phys.gustLtWind 阵风 ${wg} < 平均风 ${ws}（不可能）`)

  // 日尺度
  for (const [i, d] of ctx.data.daily.entries()) {
    const lo = num(d.tempMin)
    const hi = num(d.tempMax)
    if (lo !== undefined && hi !== undefined && lo > hi) {
      problems.push(`phys.dailyMinMax 第 ${i + 1} 天 最低 ${lo} > 最高 ${hi}`)
    }
    if (i === 0 && t !== undefined && lo !== undefined && hi !== undefined && (t < lo - 3 || t > hi + 3)) {
      problems.push(`phys.currentOffDaily 当前 ${t.toFixed(1)} 落在今日 ${lo}~${hi} 区间外 3 ℃`)
    }
  }

  // 逐小时
  for (const [i, h] of ctx.data.hourly.slice(0, 24).entries()) {
    const ht = num(h.temperature)
    if (ht !== undefined && (ht < -60 || ht > 55)) problems.push(`phys.hourlyTemp 第 ${i + 1} 小时气温 ${ht.toFixed(1)} 越界`)
    const hp = num(h.precipitation)
    if (hp !== undefined && hp < 0) problems.push(`phys.hourlyPrecip 第 ${i + 1} 小时降水率为负 ${hp}`)
  }

  const srh = ctx.data.sunrise
  const ssh = ctx.data.sunset
  if (srh !== undefined && ssh !== undefined && srh.slice(11) >= ssh.slice(11)) {
    problems.push(`phys.sunrise 日出 ${srh.slice(11)} 不早于日落 ${ssh.slice(11)}`)
  }

  return problems
}

const checkAir = (ctx) => {
  const problems = []
  const air = ctx.data.air
  if (air === undefined) { problems.push('air.missing 空气数据整体缺失'); return problems }
  const aqi = air.aqi
  const pm25 = air.pm25
  const pm10 = air.pm10
  const conc = air.concentrations

  if (aqi !== undefined) {
    if (aqi < 0 || aqi > 500) problems.push(`air.aqiRange AQI ${aqi} 越界`)
    if (aqi > 50 && air.primary === undefined) problems.push(`air.primaryMissing AQI ${aqi} > 50 却无首要污染物`)
    if (aqi <= 50 && air.primary !== undefined) problems.push(`air.primaryHeld AQI ${aqi} ≤ 50 却报了首要污染物 ${air.primary}`)
    // 指数与浓度互证：国标六档，PM2.5 是首要污染物时两侧应当同档
    if (pm25 !== undefined) {
      if (aqi <= 50 && pm25 > 35) problems.push(`air.vsPm25 AQI ${aqi}(优) 却 PM2.5 ${pm25.toFixed(1)}`)
      if (aqi <= 100 && pm25 > 75) problems.push(`air.vsPm25 AQI ${aqi}(良) 却 PM2.5 ${pm25.toFixed(1)}`)
      if (pm25 > 150 && aqi < 200) problems.push(`air.vsPm25 PM2.5 ${pm25.toFixed(1)} 极高却 AQI 只有 ${aqi}`)
    }
    if (air.primary === 'PM10' && pm10 !== undefined && pm25 !== undefined && pm10 < pm25) {
      problems.push(`air.primaryVsConc 首要报 PM10 但 PM10 ${pm10.toFixed(1)} < PM2.5 ${pm25.toFixed(1)}`)
    }
  }
  if (aqi !== undefined && (conc === undefined || Object.keys(conc).length === 0)) {
    problems.push('air.concMissing 有 AQI 但无六项浓度')
  }
  if (conc !== undefined) {
    const co = conc.CO
    if (co !== undefined && (co < 0 || co > 20)) problems.push(`air.coRange CO ${co} mg/m³ 越界`)
    for (const [k, v] of Object.entries(conc)) {
      if (typeof v === 'number' && v < 0) problems.push(`air.concNeg ${k} 浓度为负 ${v}`)
    }
  }
  return problems
}

const checkSky = (ctx) => {
  const problems = []
  const { sky, c, data } = ctx
  const label = sky.label
  const vis = c.visibility
  const rh = c.humidity
  const rate = c.precipitation
  const conc = data.air?.concentrations

  // 判据与结论矛盾（显示层）
  if (sky.basis !== undefined && (HAZE_LABELS.has(label) || DUST_LABELS.has(label))) {
    const m = /能见度 ([\d.]+) 公里/.exec(sky.basis)
    if (m !== null && Number(m[1]) >= 10) {
      problems.push(`sky.basisConflict ${label} 的依据写着「能见度 ${m[1]} 公里」，与「不足 10 km」的门槛互相打脸`)
    }
  }

  // 降水语义 vs 实际降水率
  const p = typeof rate === 'number' && Number.isFinite(rate) ? rate : undefined
  if (CLEAR_LABELS.has(label) && p !== undefined && p >= 0.5) {
    problems.push(`sky.clearButRain 判「${label}」却有降水率 ${p} mm/h`)
  }
  if ((RAIN_LABELS.has(label) || SNOW_LABELS.has(label)) === false && p !== undefined && p >= 2) {
    problems.push(`sky.noRainWord 降水率 ${p} mm/h 但描述是「${label}」`)
  }

  // 降水率缺失时，降水码会被静默吞掉：描述层看不到 rate 就跳到能见度/云量分支。
  // 这不是逻辑错，但用户会看到「图标是雨、描述是阴」，需要有数据支撑才敢下结论。
  if (p === undefined && isPrecipCode(c.weatherCode)) {
    problems.push(`sky.rateMissing 天气码 ${c.weatherCode} 是降水但降水率缺失，描述退到「${label}」`)
  }

  // 能见度类判定的自身矛盾（逻辑上不该出现，出现即 bug）。
  // 注意：**沙尘不在此列** —— 判沙尘却「能见度 ≥ 10 km」是有意为之（该字段不反映沙尘），
  // 见 data/describe.ts 的 dustDescription。
  if (HAZE_LABELS.has(label) && vis !== undefined && vis >= 10) problems.push(`sky.hazeVis 判「${label}」但能见度 ${vis} km ≥ 10`)
  if (label === '雾' && vis !== undefined && vis >= 1) problems.push(`sky.fogVis 判「雾」但能见度 ${vis} km ≥ 1`)

  // 沙尘漏判：有沙尘证据却没给沙尘的词。判据与 describe.ts 保持一致 —— 以 CAMS 的
  // `dust` 浓度为主（只有它反映沙尘），PM10 粒径为辅。**不拿能见度当门**。
  const dust = data.air?.dust
  const pm10 = data.air?.pm10
  const pm25 = data.air?.pm25
  // 与 describe.ts 的判据一致：dust 必须由 PM10 佐证（CAMS 在沙漠边缘背景偏高）。
  const dustEvidence = (typeof dust === 'number' && dust >= 50 && typeof pm10 === 'number' && pm10 >= 100)
    || (typeof pm10 === 'number' && pm10 >= 150 && typeof pm25 === 'number' && pm25 / pm10 < 0.5)
  const dryEnough = rh === undefined || rh < 80
  if (!DUST_LABELS.has(label) && dustEvidence && dryEnough) {
    problems.push(`sky.dustMissed 沙尘证据在手（dust ${dust ?? '—'}，PM10 ${pm10?.toFixed(0) ?? '—'}）却判「${label}」`)
  }
  if (DUST_LABELS.has(label) && !dustEvidence) problems.push(`sky.dustUnfounded 判「${label}」但既无 dust 也无粗颗粒证据`)

  // 霾需要低湿
  if (HAZE_LABELS.has(label) && rh !== undefined && rh >= 80) problems.push(`sky.hazeHumid 判「${label}」但湿度 ${rh}% ≥ 80（应为轻雾）`)

  return problems
}

const checkAlerts = (ctx) => {
  const problems = []
  const { alerts, c, advice } = ctx
  const t = c.temperature
  const ws = c.windSpeed
  const wg = c.windGusts
  for (const a of alerts) {
    if (a.key === 'heat' && t !== undefined && t < 35) problems.push(`alert.heat 报高温「${a.title}」但气温只有 ${t.toFixed(1)} ℃`)
    if (a.key === 'cold' && t !== undefined && t > 0) problems.push(`alert.cold 报低温「${a.title}」但气温 ${t.toFixed(1)} ℃`)
    if (a.key === 'wind') {
      const okWind = (ws !== undefined && ws >= 62) || (wg !== undefined && wg >= 75)
      if (!okWind) problems.push(`alert.wind 报大风「${a.title}」但风 ${ws} / 阵风 ${wg} 都未达线`)
    }
    if (a.key === 'frost' && t !== undefined && t > 0) problems.push(`alert.frost 报霜冻但气温 ${t.toFixed(1)} ℃`)
  }
  // 有危险级预警，建议却说天气好
  const danger = alerts.some((a) => a.level === 'danger')
  if (danger && /适合户外|天气晴好|平稳/.test(advice.text)) {
    problems.push(`alert.vsAdvice 有 danger 级预警，建议却是「${advice.text}」`)
  }
  return problems
}

const checkAdvice = (ctx) => {
  const problems = []
  const { data, advice } = ctx
  const aqi = data.air?.aqi
  // 上轮修的：重度污染应浮到降水分支之前
  if (aqi !== undefined && aqi > 200 && !/口罩|空气/.test(advice.text)) {
    problems.push(`advice.aqiBuried AQI ${aqi} 重度污染，建议却是「${advice.text}」`)
  }
  return problems
}

const checkUv = (ctx) => {
  const problems = []
  const uv = ctx.data.uvIndexMax
  if (uv !== undefined && (uv < 0 || uv > 16)) problems.push(`uv.range 紫外线峰值 ${uv} 越界`)
  return problems
}

const RULES = [
  { group: '物理', fn: checkPhysics },
  { group: '空气', fn: checkAir },
  { group: '描述', fn: checkSky },
  { group: '预警', fn: checkAlerts },
  { group: '建议', fn: checkAdvice },
  { group: '紫外线', fn: checkUv },
]

// ---------------------------------------------------------------------------
// 可疑清单：逻辑没错，但可能不合常识 —— 交给人判断
// ---------------------------------------------------------------------------
const SUSPECT_RULES = [
  (ctx) => {
    const out = []
    const { sky, c, data } = ctx
    const vis = c.visibility
    const rh = c.humidity
    const pm10 = data.air?.pm10
    // 秋季华北判霾尚算合理；华南夏季判霾就值得看一眼
    if (HAZE_LABELS.has(sky.label) && c.cloudCover !== undefined && c.cloudCover > 85) {
      out.push(`cloudHaze 云量 ${c.cloudCover}% 却判「${sky.label}」（阴天+霾，值得看是霾还是云底低）`)
    }
    if (sky.label === '能见度偏低' && vis !== undefined) {
      out.push(`visLowNoRh 能见度 ${vis} km 湿度缺失，只说了「能见度偏低」`)
    }
    // 高湿 + 低能见度 + 无降水：回南天 / 雨前
    if (rh !== undefined && rh >= 95 && vis !== undefined && vis >= 5 && vis < 10
      && (c.precipitation === undefined || c.precipitation === 0)) {
      out.push(`wetNotFog 湿度 ${rh}% 能见度 ${vis} km 无降水，判「${sky.label}」`)
    }
    // 露点紧贴气温 = 起雾条件
    if (c.dewPoint !== undefined && c.temperature !== undefined
      && c.temperature - c.dewPoint < 1 && vis !== undefined && vis >= 10) {
      out.push(`fogWatch 气温-露点 ${(c.temperature - c.dewPoint).toFixed(1)} ℃ 却判「${sky.label}」，可能起雾`)
    }
    // CAPE 很高但没雷
    if (c.cape !== undefined && c.cape > 2500 && !THUNDER(ctx) && (c.precipitation ?? 0) === 0) {
      out.push(`capeNoStorm CAPE ${Math.round(c.cape)} J/kg 却没有降水/雷暴`)
    }
    // 码表是雨、描述却是晴/阴：降水率为 0 时这是设计（无实测降水不说下雨），
    // 但它会让图标与描述打架，值得统计有多少城落在这种状态。
    if (isPrecipCode(c.weatherCode) && CLEAR_LABELS.has(sky.label)) {
      out.push(`codeRainSkyClear 码表 ${c.weatherCode} 是降水，描述却是「${sky.label}」（降水率 ${c.precipitation ?? '缺失'}）`)
    }
    // 数据源字段级不一致：颗粒物高而能见度不降。沙尘判识已改用 dust 主判，所以这不再
    // 是「判识失去依据」，但仍是一处值得知道的数据源特性。
    if (typeof pm10 === 'number' && pm10 >= 150 && (c.visibility ?? 0) >= 10) {
      out.push(`coarseHighVis PM10 ${pm10.toFixed(0)} µg/m³ 但能见度 ${c.visibility} km —— 数据源两字段不同源（描述已按 dust 判，此处仅信息）`)
    }
    return out
  },
]
const THUNDER = (ctx) => ctx.data.current.weatherCode >= 95

// ---------------------------------------------------------------------------
// 并发池
// ---------------------------------------------------------------------------
const pool = async (items, size, fn) => {
  const results = new Array(items.length)
  let cursor = 0
  const worker = async () => {
    while (cursor < items.length) {
      const i = cursor++
      results[i] = await fn(items[i], i)
    }
  }
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, worker))
  return results
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms))

// ---------------------------------------------------------------------------
// 单城探测
// ---------------------------------------------------------------------------
const probeCity = async (city, index) => {
  const tag = `[${String(index + 1).padStart(3)}/100]`
  let data
  let lastError
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      data = await X.fetchWeather({ ...city, source: 'manual' })
      break
    } catch (error) {
      lastError = error
      await sleep(800)
    }
  }
  if (data === undefined) {
    log(`${tag} ${city.name.padEnd(12)} ✗ 拉取失败：${lastError?.message ?? '未知'}`)
    return { city, failed: true, error: lastError?.message }
  }

  const c = data.current
  const sky = X.describeSky(X.skyEvidenceOf(c, data.air))
  const cond = X.describeCondition(c.weatherCode, c.isDay)
  const alerts = X.evaluateAlerts(data, (v) => `${Math.round(v)}°C`, (v) => `${Math.round(v)} km/h`)
  const advice = X.weatherAdvice(data)

  const ctx = { city, data, c, sky, cond, alerts, advice, index }

  const violations = []
  const suspects = []
  for (const rule of RULES) {
    for (const p of rule.fn(ctx) ?? []) violations.push({ group: rule.group, text: p })
  }
  for (const rule of SUSPECT_RULES) {
    for (const p of rule(ctx) ?? []) suspects.push(p)
  }

  const flags = []
  if (violations.length > 0) flags.push(`!${violations.length}`)
  if (data.air === undefined) flags.push('无空气')

  const aqiText = data.air?.aqi === undefined ? '—' : `${data.air.aqi}${X.aqiInfo(data.air.aqi).label}`
  log(`${tag} ${city.name.padEnd(12)} ${String(Math.round(c.temperature)).padStart(3)}°C  ${sky.label.padEnd(6)}  AQI ${aqiText.padEnd(8)} ${alerts.length > 0 ? `预警${alerts.length}` : ''} ${flags.join(' ')}`)

  // 因子级明细：AQI 是六项取最大，不拆开就不知道是哪一项在拉高。
  const conc = data.air?.concentrations
  const factor = conc === undefined ? undefined : X.computeAqi({
    pm25: conc.pm25, pm10: conc.pm10, so2: conc.so2, no2: conc.no2, co: conc.co, o3_8h: conc.o3,
  })

  return {
    city, failed: false, temp: c.temperature, sky, cond, alerts, advice, violations, suspects,
    aqi: data.air?.aqi, aqiLabel: data.air?.aqi === undefined ? undefined : X.aqiInfo(data.air.aqi).label,
    primary: data.air?.primary, pm25: data.air?.pm25, pm10: data.air?.pm10, dust: data.air?.dust,
    iaqi: factor?.iaqi, conc,
    uv: data.uvIndexMax, rh: c.humidity, vis: c.visibility, cloud: c.cloudCover,
    code: c.weatherCode, isDay: c.isDay, wind: c.windSpeed, gust: c.windGusts,
    airMissing: data.air === undefined,
  }
}

// ---------------------------------------------------------------------------
// 主流程
// ---------------------------------------------------------------------------
const CONCURRENCY = Number(process.argv[2] ?? 4)

const main = async () => {
  const started = Date.now()
  log(`100 城批量校准 · 并发 ${CONCURRENCY} · ${new Date().toLocaleString('zh-CN')}`)
  log('='.repeat(96))

  const results = await pool(CITIES, CONCURRENCY, probeCity)
  const ok = results.filter((r) => !r.failed)
  const failed = results.filter((r) => r.failed)

  log('')
  log('='.repeat(96))
  log(`一、画像（${ok.length} 城成功 / ${failed.length} 城失败）`)
  log('='.repeat(96))

  // 描述分布
  const skyDist = new Map()
  for (const r of ok) skyDist.set(r.sky.label, (skyDist.get(r.sky.label) ?? 0) + 1)
  log('\n【描述层判定分布】')
  for (const [label, n] of [...skyDist.entries()].sort((a, b) => b[1] - a[1])) {
    const cities = ok.filter((r) => r.sky.label === label).map((r) => r.city.name).join(' ')
    log(`  ${label.padEnd(8)} ${String(n).padStart(3)} 城   ${cities}`)
  }

  // 码表层分布（对照）
  const condDist = new Map()
  for (const r of ok) condDist.set(r.cond.label, (condDist.get(r.cond.label) ?? 0) + 1)
  log('\n【码表层判定分布（对照）】')
  for (const [label, n] of [...condDist.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${label.padEnd(8)} ${String(n).padStart(3)} 城`)
  }

  // 两套口径分歧
  const mismatch = ok.filter((r) => r.sky.label !== r.cond.label)
  log(`\n【描述层 vs 码表层 分歧】${mismatch.length} / ${ok.length} 城不同名`)
  for (const r of mismatch.slice(0, 20)) {
    log(`  ${r.city.name.padEnd(12)} 描述「${r.sky.label}」 / 码表「${r.cond.label}」`)
  }
  if (mismatch.length > 20) log(`  …… 另 ${mismatch.length - 20} 城`)

  // AQI 分布
  const aqiDist = new Map()
  for (const r of ok) if (r.aqiLabel !== undefined) aqiDist.set(r.aqiLabel, (aqiDist.get(r.aqiLabel) ?? 0) + 1)
  log('\n【AQI 等级分布】')
  for (const [label, n] of [...aqiDist.entries()].sort((a, b) => b[1] - a[1])) {
    const cities = ok.filter((r) => r.aqiLabel === label).map((r) => r.city.name).join(' ')
    log(`  ${label.padEnd(6)} ${String(n).padStart(3)} 城   ${cities}`)
  }
  const primaryDist = new Map()
  for (const r of ok) if (r.primary !== undefined) primaryDist.set(r.primary, (primaryDist.get(r.primary) ?? 0) + 1)
  log('【首要污染物分布】')
  for (const [p, n] of [...primaryDist.entries()].sort((a, b) => b[1] - a[1])) log(`  ${p.padEnd(6)} ${n} 城`)

  // 区域 × AQI / 描述
  log('\n【区域画像】')
  const regions = [...new Set(CITIES.map((c) => c.region))]
  for (const region of regions) {
    const rs = ok.filter((r) => r.city.region === region)
    if (rs.length === 0) continue
    const temps = rs.map((r) => r.temp).filter((t) => typeof t === 'number')
    const aqis = rs.map((r) => r.aqi).filter((a) => typeof a === 'number')
    const avg = (arr) => (arr.length === 0 ? NaN : arr.reduce((a, b) => a + b, 0) / arr.length)
    const labels = [...new Set(rs.map((r) => r.sky.label))]
    log(`  ${region.padEnd(4)} ${String(rs.length).padStart(2)} 城  均温 ${avg(temps).toFixed(1).padStart(5)} °C  均 AQI ${avg(aqis).toFixed(0).padStart(3)}  描述：${labels.join('/')}`)
  }

  // 预警分布
  const alertKeys = new Map()
  for (const r of ok) for (const a of r.alerts) alertKeys.set(a.key, (alertKeys.get(a.key) ?? 0) + 1)
  log('\n【预警触发分布】')
  if (alertKeys.size === 0) log('  全 100 城无预警')
  for (const [k, n] of [...alertKeys.entries()].sort((a, b) => b[1] - a[1])) {
    log(`  ${k.padEnd(8)} ${n} 城   ${ok.filter((r) => r.alerts.some((a) => a.key === k)).map((r) => r.city.name).join(' ')}`)
  }

  // 极端值
  log('\n【极值】')
  const byTemp = [...ok].filter((r) => typeof r.temp === 'number').sort((a, b) => a.temp - b.temp)
  log(`  最冷  ${byTemp.slice(0, 3).map((r) => `${r.city.name} ${r.temp.toFixed(1)}°C`).join('  ')}`)
  log(`  最热  ${byTemp.slice(-3).reverse().map((r) => `${r.city.name} ${r.temp.toFixed(1)}°C`).join('  ')}`)
  const byUv = [...ok].filter((r) => typeof r.uv === 'number').sort((a, b) => b.uv - a.uv)
  log(`  UV 最高  ${byUv.slice(0, 4).map((r) => `${r.city.name} ${r.uv.toFixed(1)}`).join('  ')}`)
  const byPm = [...ok].filter((r) => typeof r.pm25 === 'number').sort((a, b) => b.pm25 - a.pm25)
  log(`  PM2.5 最高  ${byPm.slice(0, 4).map((r) => `${r.city.name} ${r.pm25.toFixed(1)}`).join('  ')}`)

  // 空气缺失
  const noAir = ok.filter((r) => r.airMissing)
  log(`\n【空气数据缺失】${noAir.length} 城${noAir.length > 0 ? ` —— ${noAir.map((r) => r.city.name).join(' ')}` : ''}`)

  // AQI 因子明细：AQI 是六项取最大，必须知道是谁在拉高
  log('\n【AQI 因子明细（AQI ≥ 100 或首要污染物非颗粒物）】')
  const notable = ok.filter((r) => (r.aqi ?? 0) >= 100 || (r.primary !== undefined && r.primary !== 'PM2.5' && r.primary !== 'PM10'))
  for (const r of notable.slice(0, 40)) {
    const ia = r.iaqi ?? {}
    const parts = Object.entries(ia)
      .sort((a, b) => b[1] - a[1])
      .map(([k, v]) => `${k} ${Math.round(v)}`)
      .join('  ')
    log(`  ${r.city.name.padEnd(12)} AQI ${String(r.aqi).padStart(3)}${(r.aqiLabel ?? '').padEnd(3)} 首要 ${(r.primary ?? '—').padEnd(7)} │ ${parts}`)
  }
  if (notable.length > 40) log(`  …… 另 ${notable.length - 40} 城`)

  // 粗颗粒主导：沙尘判识的候选。GB/T 20480-2017 的浮尘/扬沙都要求能见度 < 10 km，
  // 所以能见度 ≥ 10 km 时即使粗颗粒很多也不算沙尘天气 —— 这里列出来是为了判断
  // 数据源的能见度是否可信。
  const coarse = ok.filter((r) => typeof r.pm10 === 'number' && typeof r.pm25 === 'number'
    && r.pm10 >= 150 && r.pm25 / r.pm10 < 0.5)
  log(`\n【粗颗粒主导（PM10 ≥ 150 且 PM2.5/PM10 < 0.5）】${coarse.length} 城`)
  for (const r of coarse) {
    log(`  ${r.city.name.padEnd(12)} PM10 ${r.pm10.toFixed(0)} / PM2.5 ${r.pm25.toFixed(0)}（比 ${(r.pm25 / r.pm10).toFixed(2)}）  湿度 ${r.rh ?? '—'}%  能见度 ${r.vis ?? '—'} km  风 ${r.wind ?? '—'} km/h  AQI ${r.aqi}${r.aqiLabel}  描述「${r.sky.label}」`)
  }

  // 判为沙尘的城市逐条列数值 —— 用来复核 dust 门槛是否过松或过紧。
  const dustCities = ok.filter((r) => DUST_LABELS.has(r.sky.label))
  log(`\n【判为沙尘】${dustCities.length} 城`)
  for (const r of dustCities) {
    log(`  ${r.city.name.padEnd(12)} 「${r.sky.label}」  dust ${r.dust ?? '—'}  PM10 ${r.pm10?.toFixed(0) ?? '—'}  PM2.5 ${r.pm25?.toFixed(0) ?? '—'}  湿度 ${r.rh ?? '—'}%  能见度 ${r.vis ?? '—'} km  风 ${r.wind ?? '—'} km/h`)
  }

  // 细颗粒主导：霾的地基
  const fine = ok.filter((r) => typeof r.pm10 === 'number' && typeof r.pm25 === 'number'
    && r.pm25 >= 35 && r.pm25 / r.pm10 >= 0.5)
  log(`\n【细颗粒主导（PM2.5 ≥ 35 且占 PM10 一半以上）】${fine.length} 城 —— ${fine.map((r) => r.city.name).join(' ')}`)

  // ---------------------------------------------------------------------------
  log('')
  log('='.repeat(96))
  log('二、异常清单（逻辑或物理上说不通，必须处理）')
  log('='.repeat(96))
  const allViolations = []
  for (const r of ok) for (const v of r.violations) allViolations.push({ city: r.city, ...v })
  if (allViolations.length === 0) {
    log('\n  无。100 城的输出全部自洽。')
  } else {
    const byGroup = new Map()
    for (const v of allViolations) {
      if (!byGroup.has(v.group)) byGroup.set(v.group, [])
      byGroup.get(v.group).push(v)
    }
    for (const [group, items] of byGroup) {
      log(`\n▸ ${group}（${items.length} 条）`)
      for (const v of items) log(`  ${v.city.name.padEnd(12)} ${v.text}`)
    }
  }

  log('')
  log('='.repeat(96))
  log('三、可疑清单（逻辑说得通，但可能不合常识，需要人判断）')
  log('='.repeat(96))
  const allSuspects = []
  for (const r of ok) for (const s of r.suspects) allSuspects.push({ city: r.city, text: s })
  if (allSuspects.length === 0) log('\n  无。')
  else for (const s of allSuspects) log(`  ${s.city.name.padEnd(12)} ${s.text}`)

  if (failed.length > 0) {
    log('')
    log('【拉取失败】')
    for (const r of failed) log(`  ${r.city.name} —— ${r.error}`)
  }

  const summary = {
    total: CITIES.length,
    ok: ok.length,
    failed: failed.length,
    violations: allViolations.length,
    suspects: allSuspects.length,
    airMissing: noAir.length,
    mismatch: mismatch.length,
    elapsedSec: Math.round((Date.now() - started) / 1000),
  }
  log('')
  log('='.repeat(96))
  log(`汇总：${summary.ok}/${summary.total} 城成功 · 异常 ${summary.violations} 条 · 可疑 ${summary.suspects} 条 · 口径分歧 ${summary.mismatch} 城 · 空气缺失 ${summary.airMissing} 城 · 耗时 ${summary.elapsedSec}s`)
  log('='.repeat(96))

  const outPath = path.join(__dirname, 'calibrate-report.txt')
  fs.writeFileSync(outPath, LINES.join('\n') + '\n', 'utf8')
  process.stdout.write(`\n明细已写入 ${path.relative(ROOT, outPath)}\n`)
}

main().catch((error) => {
  console.error('校准脚本崩溃：', error)
  process.exitCode = 1
})
