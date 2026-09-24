// 沙尘 · 能见度字段一致性对照。
//
// 起因：100 城校准里，库尔勒 / 二连浩特 / 喀什 都是 PM10 主导（PM2.5/PM10 ≈ 0.17，
// 典型沙尘比例），AQI 100–244，但数据源报的能见度却是 27–39 km —— 这两件事在物理上
// 不可能同时成立。查明两个字段不同源：
//   · PM10 / dust 来自 air-quality-api（CAMS 空气质量模式，含沙尘模块）
//   · visibility   来自 api.open-meteo.com（气象模式，不随颗粒物变化）
// 本脚本把两条时间序列并排打出来，用数据说话。
//
// **沙尘判识因此改以 `dust` 为主判**（见 data/describe.ts 的 dustDescription）。
// 数据源若换了，重跑这个脚本复核。
// 需要网络。用法：npm run probe:dust
const CITIES = [
  { name: '库尔勒', lat: 41.73, lon: 86.15 },
  { name: '二连浩特', lat: 43.65, lon: 111.98 },
  { name: '喀什', lat: 39.47, lon: 75.99 },
]

const airUrl = (c) => 'https://air-quality-api.open-meteo.com/v1/air-quality'
  + `?latitude=${c.lat}&longitude=${c.lon}`
  + '&hourly=pm10,pm2_5,dust,us_aqi&past_days=2&forecast_days=1&timezone=auto'

const wxUrl = (c) => 'https://api.open-meteo.com/v1/forecast'
  + `?latitude=${c.lat}&longitude=${c.lon}`
  + '&hourly=visibility,wind_speed_10m,relative_humidity_2m&past_days=2&forecast_days=1&timezone=auto'

const get = async (url) => {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`HTTP ${res.status} — ${url}`)
  return res.json()
}

/** Pearson 相关系数；样本不足或方差为 0 时返回 undefined。 */
const pearson = (xs, ys) => {
  const n = Math.min(xs.length, ys.length)
  if (n < 3) return undefined
  const mx = xs.slice(0, n).reduce((a, b) => a + b, 0) / n
  const my = ys.slice(0, n).reduce((a, b) => a + b, 0) / n
  let sxy = 0, sxx = 0, syy = 0
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - mx
    const dy = ys[i] - my
    sxy += dx * dy
    sxx += dx * dx
    syy += dy * dy
  }
  if (sxx === 0 || syy === 0) return undefined
  return sxy / Math.sqrt(sxx * syy)
}

const n = (v, digits = 0, unit = '') =>
  v === null || v === undefined ? '—' : `${v.toFixed(digits)}${unit}`

const run = async () => {
  console.log(`沙尘 · 能见度对照  ${new Date().toLocaleString('zh-CN')}`)

  for (const city of CITIES) {
    console.log(`\n${'='.repeat(84)}\n${city.name}\n${'='.repeat(84)}`)
    const [air, wx] = await Promise.all([get(airUrl(city)), get(wxUrl(city))])

    const at = air.hourly?.time ?? []
    const wt = wx.hourly?.time ?? []
    const wi = new Map(wt.map((t, i) => [t, i]))

    // 已完成的 36 小时（对齐两个端点的时间轴）
    const rows = []
    for (let i = 0; i < at.length; i++) {
      const t = at[i]
      const j = wi.get(t)
      if (j === undefined) continue
      rows.push({
        t,
        pm10: air.hourly.pm10?.[i] ?? null,
        pm25: air.hourly.pm2_5?.[i] ?? null,
        dust: air.hourly.dust?.[i] ?? null,
        usAqi: air.hourly.us_aqi?.[i] ?? null,
        vis: wx.hourly.visibility?.[j] === null ? null : (wx.hourly.visibility[j] ?? 0) / 1000,
        wind: wx.hourly.wind_speed_10m?.[j] ?? null,
        rh: wx.hourly.relative_humidity_2m?.[j] ?? null,
      })
    }
    const tail = rows.slice(-30)

    console.log('  时间          PM10   PM2.5   dust   能见度km   湿度%   风km/h')
    for (const r of tail) {
      const flag = (r.pm10 ?? 0) >= 150 && (r.vis ?? 0) >= 15 ? '   ← 高颗粒物 + 高能见度' : ''
      console.log(`  ${r.t.slice(5).replace('T', ' ')}   ${n(r.pm10, 0).padStart(4)}   ${n(r.pm25, 0).padStart(4)}   ${n(r.dust, 0).padStart(4)}   ${n(r.vis, 1).padStart(6)}   ${n(r.rh, 0).padStart(4)}   ${n(r.wind, 0).padStart(4)}${flag}`)
    }

    const pm10s = tail.map((r) => r.pm10).filter((v) => typeof v === 'number')
    const viss = tail.filter((r) => typeof r.pm10 === 'number' && typeof r.vis === 'number')
    const corr = pearson(viss.map((r) => r.pm10), viss.map((r) => r.vis))
    const dusty = tail.filter((r) => (r.pm10 ?? 0) >= 150)
    const dustyVis = dusty.map((r) => r.vis).filter((v) => typeof v === 'number')
    const avg = (a) => (a.length === 0 ? NaN : a.reduce((x, y) => x + y, 0) / a.length)

    console.log(`\n  PM10 峰值 ${n(Math.max(...pm10s), 0)} µg/m³   dust 峰值 ${n(Math.max(...tail.map((r) => r.dust ?? 0)), 0)} µg/m³`)
    console.log(`  PM10 ≥ 150 的小时：${dusty.length} 个，这些小时的平均能见度 ${n(avg(dustyVis), 1)} km`)
    console.log(`  PM10 与能见度的相关系数 r = ${corr === undefined ? '—' : corr.toFixed(2)}  （若接近 0，说明能见度不随颗粒物变化 → 不同源）`)
  }
}

run().catch((error) => {
  console.error('对照脚本崩溃：', error)
  process.exitCode = 1
})
