/**
 * 中国环境空气质量指数（AQI）——HJ 633-2012《环境空气质量指数（AQI）技术规定（试行）》。
 *
 * 为什么不用数据源给的指数：Open-Meteo 提供的是 `us_aqi`（美国 EPA 口径）。两套算法
 * 都是「六项分指数取最大」，但分指数表不同，同一片空气算出的数不同 —— PM2.5 = 75 µg/m³
 * 在国标里是「良」，按美国口径已经是「轻度污染」。UI 会把这个指数和 PM2.5 浓度并排展示，
 * 两套口径混着用，读者一眼就能看出两个数对不上。
 *
 * 三处最容易做错的地方：
 * 1. 六项分指数都基于 **24 小时平均浓度**（O3 用 8 小时滑动平均），而数据源的 `current`
 *    是瞬时值。直接拿瞬时值套这张表，算出来的东西不属于任何一个标准。
 *    调用方（weather-api）负责把均值算好再传进来。
 * 2. CO 的分段限值以 **mg/m³** 计，数据源给的是 µg/m³ —— 差 1000 倍。
 * 3. AQI 是六项分指数的**最大值**，不是求和也不是平均；AQI ≤ 50 时国标不报首要污染物。
 */

/** 参与 AQI 计算的六项污染物。 */
export type Pollutant = 'pm25' | 'pm10' | 'so2' | 'no2' | 'co' | 'o3'

/** 首要污染物的中文展示名。 */
export const POLLUTANT_LABEL: Record<Pollutant, string> = {
  pm25: 'PM2.5',
  pm10: 'PM10',
  so2: '二氧化硫',
  no2: '二氧化氮',
  co: '一氧化碳',
  o3: '臭氧',
}

/** HJ 633-2012 表 1 走过的分指数档位（0–500）。 */
const IAQI_LEVELS = [0, 50, 100, 150, 200, 300, 400, 500] as const

/** 一段分段线性映射：`conc[i]` 对应 `iaqi[i]`。 */
interface Band {
  iaqi: readonly number[]
  conc: readonly number[]
}

/**
 * HJ 633-2012 表 1：各污染物的 24 小时平均浓度限值（CO 为 mg/m³，其余 µg/m³）。
 * O3 一栏用的是 8 小时滑动平均，表只排到 IAQI 300（800 µg/m³）—— 再往上按注 3 改用 1 小时平均。
 */
const BANDS: Record<Pollutant, Band> = {
  pm25: { iaqi: IAQI_LEVELS, conc: [0, 35, 75, 115, 150, 250, 350, 500] },
  pm10: { iaqi: IAQI_LEVELS, conc: [0, 50, 150, 250, 350, 420, 500, 600] },
  so2: { iaqi: IAQI_LEVELS, conc: [0, 50, 150, 475, 800, 1600, 2100, 2620] },
  no2: { iaqi: IAQI_LEVELS, conc: [0, 40, 80, 180, 280, 565, 750, 940] },
  co: { iaqi: IAQI_LEVELS, conc: [0, 2, 4, 14, 24, 36, 48, 60] },
  o3: { iaqi: [0, 50, 100, 150, 200, 300], conc: [0, 100, 160, 215, 265, 800] },
}

/** O3 的 1 小时平均分段：表 1 注 3 规定 8 小时均值越过 {@link O3_8H_CEILING} 时改用它。 */
const O3_ONE_HOUR: Band = { iaqi: IAQI_LEVELS, conc: [0, 160, 200, 300, 400, 800, 1000, 1200] }

/** O3 的 8 小时均值越过此值就不再适用 8 小时表（HJ 633-2012 表 1 注 3）。 */
export const O3_8H_CEILING = 800

/**
 * 段内线性内插（HJ 633-2012 4.2）：
 * `IAQI = (IAQI_hi − IAQI_lo) / (C_hi − C_lo) × (C − C_lo) + IAQI_lo`。
 * 浓度高于表内最高档时封顶 500 —— 国标 AQI 的上限；负值与非有限值一律不参与计算。
 */
function iaqiIn(band: Band, concentration: number): number | undefined {
  if (!Number.isFinite(concentration) || concentration < 0) return undefined
  for (let i = 0; i < band.conc.length - 1; i += 1) {
    const lo = band.conc[i]
    const hi = band.conc[i + 1]
    const iaqiLo = band.iaqi[i]
    const iaqiHi = band.iaqi[i + 1]
    if (lo === undefined || hi === undefined || iaqiLo === undefined || iaqiHi === undefined) break
    if (concentration <= hi) {
      return ((iaqiHi - iaqiLo) / (hi - lo)) * (concentration - lo) + iaqiLo
    }
  }
  return 500
}

/**
 * 计算所需的六项浓度。缺失的项不参与计算，**绝不按 0 代入** ——
 * 0 会同时拉低 AQI 又让「PM2.5 0」出现在界面上，把缺测说成空气干净。
 */
export interface AqiInput {
  /** PM2.5 的 24 小时平均（µg/m³）。 */
  pm25?: number
  /** PM10 的 24 小时平均（µg/m³）。 */
  pm10?: number
  /** 二氧化硫的 24 小时平均（µg/m³）；高值时国标改用 1 小时平均，此处不细分。 */
  so2?: number
  /** 二氧化氮的 24 小时平均（µg/m³）。 */
  no2?: number
  /** 一氧化碳的 24 小时平均（**mg/m³**，与数据源的 µg/m³ 差 1000 倍）。 */
  co?: number
  /** O3 的 8 小时滑动平均（µg/m³）。 */
  o3_8h?: number
  /** O3 的 1 小时平均（µg/m³）；仅当 8 小时均值越过 {@link O3_8H_CEILING} 时启用。 */
  o3_1h?: number
}

export interface AqiResult {
  /** AQI = 六项分指数的最大值，四舍五入 —— 国标报出的就是整数。 */
  aqi: number
  /** 首要污染物；AQI ≤ 50 时按国标不报。 */
  primary?: Pollutant
  /** 各项分指数，供诊断与测试。 */
  iaqi: Partial<Record<Pollutant, number>>
}

/** 中国 AQI：六项分指数取最大。所有浓度都缺失时返回 undefined，而不是 0。 */
export function computeAqi(input: AqiInput): AqiResult | undefined {
  const iaqi: Partial<Record<Pollutant, number>> = {}
  const put = (pollutant: Pollutant, concentration: number | undefined, band?: Band): void => {
    if (concentration === undefined) return
    const value = iaqiIn(band ?? BANDS[pollutant], concentration)
    if (value !== undefined) iaqi[pollutant] = value
  }

  put('pm25', input.pm25)
  put('pm10', input.pm10)
  put('so2', input.so2)
  put('no2', input.no2)
  put('co', input.co)
  // O3 的口径随浓度换表：8 小时均值不超过 800 就用它自己，越过了就改按 1 小时均值算。
  // 越过 800 而又拿不到 1 小时值时，宁可漏掉这一项也不拿 8 小时值去套 1 小时的表。
  if (input.o3_8h !== undefined && input.o3_8h <= O3_8H_CEILING) put('o3', input.o3_8h)
  else put('o3', input.o3_1h, O3_ONE_HOUR)

  const entries = Object.entries(iaqi) as [Pollutant, number][]
  if (entries.length === 0) return undefined

  let primary: Pollutant | undefined
  let max = -Infinity
  for (const [pollutant, value] of entries) {
    if (value > max) {
      max = value
      primary = pollutant
    }
  }
  const aqi = Math.round(max)
  return { aqi, primary: aqi > 50 ? primary : undefined, iaqi }
}
