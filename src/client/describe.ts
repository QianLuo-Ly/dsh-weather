/**
 * 由**物理量证据**描述天气，而不是由 `weather_code` 反推结论。
 *
 * 为什么另起一层：`weather_code` 是 Open-Meteo 把降水率、对流、云量等连续量压成
 * 的一个整数类别，压完之后「为什么是它」就丢了。用那个整数去写描述，等于让一个
 * 二手的类别去承担它支撑不起的结论 —— 天河区 2026-08–09 的一个月里，含冰雹的
 * 96 码出现了 19 个小时（全部雨强 < 13 mm/h），而同一份响应里的原始变量一直说得
 * 很清楚：`showers` 主导、雨强 1.7–12.3 mm/h，就是一场普通的对流性降水。
 *
 * 这一层的规则：
 * 1. **每个结论都挂在一个物理量上**，`basis` 里写出那个量，弹层直接显示给用户核对；
 * 2. **标准各管各的量纲**：小时强度按小时雨强分档（QX/T 416-2018 / NWS），日累计
 *    等级按 GB/T 28592-2012，短历时暴雨按中国气象局令第 16 号的 3/6/12 小时累计；
 * 3. **要观测才能成立的话不许写成事实**：雷电与冰雹在任何地方都没有可用的观测
 *    （`lightning_potential` / `hail` 在中国区一律返回 null），所以「雷」只能是
 *    `uncertain` 的可能语气（并且注明依据只是天气码），「冰雹」一个字都不出现。
 */
import {
  CLOUD_CLEAR_PCT,
  CLOUD_OVERCAST_PCT,
  CLOUD_PARTLY_PCT,
  CLOUDBURST_24H_MM,
  DELUGE_12H_MM,
  DELUGE_24H_MM,
  DELUGE_3H_MM,
  DELUGE_6H_MM,
  DELUGE_RED_3H_MM,
  DOWNPOUR_24H_MM,
  FOG_VIS_KM,
  FREEZING_RAIN_CODES,
  HAZE_RH_MAX,
  MIST_VIS_KM,
  RAIN_HEAVY_MMH,
  RAIN_MODERATE_MMH,
  RAIN_TORRENTIAL_MMH,
  RAIN_TRACE_MMH,
  SNOW_CM_PER_MM_WE,
  SNOW_HEAVY_24H_MM,
  SNOW_MODERATE_24H_MM,
  SNOWSTORM_24H_MM,
  THUNDER_CODES,
  describeCondition,
} from './condition'

/**
 * 图标种类。刻意不用 WMO 码当参数：码是数据源的分类，图标要跟的是**我们写下的
 * 那句结论**，两者在新规则下已经不是一一对应（19 个 96 码小时里没有一个是冰雹）。
 * `icons.tsx` 只负责把种类画成 SVG。
 */
export type SkyGlyph =
  | 'clear-day'
  | 'clear-night'
  | 'partly-day'
  | 'partly-night'
  | 'cloudy'
  | 'fog'
  | 'drizzle'
  | 'rain-light'
  | 'rain'
  | 'rain-heavy'
  | 'freezing-rain'
  | 'freezing-rain-heavy'
  | 'snow-light'
  | 'snow'
  | 'snow-heavy'
  | 'snow-grains'
  | 'thunder'
  | 'unknown'

/** 写一句描述所需要的全部证据。缺值一律留空，绝不填 0。 */
export interface SkyEvidence {
  /** 总降水率（mm/h）。 */
  precipitation?: number
  /** 其中的连续性部分（mm/h，WMO 连续性降水）。 */
  rain?: number
  /** 其中的对流性部分（mm/h，WMO 阵性降水）。 */
  showers?: number
  /** 降雪率（cm/h）；> 0 即「在下雪」的直接证据。 */
  snowfall?: number
  /** 气温（°C）。 */
  temperature?: number
  /** 相对湿度（%）。 */
  humidity?: number
  /** 能见度（km）。 */
  visibility?: number
  /** 总云量（%）。 */
  cloudCover?: number
  /** WMO 天气码。只用于两件事：冻雨类别与「可能打雷」的提示；其余一概不看。 */
  weatherCode?: number
  isDay: boolean
}

export interface SkyDescription {
  glyph: SkyGlyph
  /** 中文短语，直接上界面。 */
  label: string
  /** 结论挂靠的物理量，如 `降水率 3.2 mm/h`。弹层里给用户核对用。 */
  basis?: string
  /** true 表示这是模式推断（「可能」），不是直述。 */
  uncertain: boolean
}

const rateText = (value: number): string => `${value.toFixed(1)} mm/h`
const visText = (km: number): string => `${km < 10 ? km.toFixed(1) : String(Math.round(km))} 公里`
const pctText = (value: number): string => `${Math.round(value)}%`

/** `undefined` / `NaN` / 负数一律当作「没有这个量」。 */
function finite(value: number | undefined): number | undefined {
  return value !== undefined && Number.isFinite(value) && value >= 0 ? value : undefined
}

/**
 * WMO 码 → 图标种类，**只**用于证据缺失时的兜底（以及七日预报里的日摘要）。
 * 96/99 落到普通雷雨图标：它们的官方含义带冰雹，而这个类别在这个数据源里不可信
 * （见文件头），界面宁可不画。
 */
export function glyphForCode(code: number, isDay: boolean): SkyGlyph {
  if (code === 0 || code === 1) return isDay ? 'clear-day' : 'clear-night'
  if (code === 2) return isDay ? 'partly-day' : 'partly-night'
  if (code === 3) return 'cloudy'
  if (code === 45 || code === 48) return 'fog'
  if (code === 51 || code === 53 || code === 61 || code === 80) return 'drizzle'
  if (code === 55) return 'rain-light'
  if (code === 56 || code === 66) return 'freezing-rain'
  if (code === 57 || code === 67) return 'freezing-rain-heavy'
  if (code === 63 || code === 81) return 'rain'
  if (code === 65 || code === 82) return 'rain-heavy'
  if (code === 71) return 'snow-light'
  if (code === 73 || code === 85) return 'snow'
  if (code === 75 || code === 86) return 'snow-heavy'
  if (code === 77) return 'snow-grains'
  if (code === 95 || code === 96 || code === 99) return 'thunder'
  return 'unknown'
}

/**
 * 一句基于证据的天气描述。
 *
 * 判定顺序是「谁的存在被直接测到了」优先：雪 → 冻雨 → 降水 → 能见度 → 云量 →
 * 天气码兜底。每一步都带 `basis`，所以界面上任何一句结论都能被用户拿去核对。
 */
export function describeSky(e: SkyEvidence): SkyDescription {
  const rate = finite(e.precipitation)
  const code = e.weatherCode ?? -1
  const showers = finite(e.showers)
  const steady = finite(e.rain)
  // 阵性 vs 连续：接口把总降水拆成对流性 `showers` 与连续性 `rain`，谁占主导就是
  // 哪一类。QX/T 48-2007 把「阵雨」定义为强度变化大、降自积雨云的那一类，模式的
  // 对流/大尺度拆分是它可操作的代理量（也是这个接口唯一能给的划分）。
  const showery = showers !== undefined && showers > 0 && showers >= (steady ?? 0)

  // 1) 雪：`snowfall > 0` 是直接证据。等级不在这里下 —— GB/T 28592-2012 只用
  //    12/24 小时累计（水当量）定小雪/中雪/大雪，当场只能说「降雪」。
  if (finite(e.snowfall) !== undefined && (e.snowfall as number) > 0) {
    const basis = rate === undefined ? '探空显示降雪' : `降水率 ${rateText(rate)}（其中降雪）`
    return { glyph: 'snow', label: showery ? '阵雪' : '降雪', basis, uncertain: false }
  }

  // 2) 冻雨：模式里没有「地面结冰」这个量，只有天气码带这个类别，所以码 + 有降水
  //    才认。57/67 是其中的「强」档。
  if (FREEZING_RAIN_CODES.has(code) && (rate ?? 0) > 0 && rate !== undefined) {
    const heavy = code === 57 || code === 67
    const drizzle = code === 56 || code === 57
    return {
      glyph: heavy ? 'freezing-rain-heavy' : 'freezing-rain',
      label: drizzle ? (heavy ? '强冻毛毛雨' : '冻毛毛雨') : (heavy ? '强冻雨' : '冻雨'),
      basis: `${rateText(rate)}，气温 ${e.temperature === undefined ? '未知' : `${Math.round(e.temperature)}°C`}`,
      uncertain: false,
    }
  }

  // 3) 有降水：强度按小时雨强分档。
  if (rate !== undefined && rate > 0) {
    if (rate >= RAIN_TORRENTIAL_MMH) {
      return { glyph: 'rain-heavy', label: '短时强降水', basis: `降水率 ${rateText(rate)}`, uncertain: false }
    }
    const thunderHint = THUNDER_CODES.has(code)
    if (thunderHint) {
      // 唯一的「雷」证据就是那个码本身，所以措辞必须是可能语气，并且把依据说出来。
      return {
        glyph: 'thunder',
        label: showery ? '雷阵雨' : '雷雨',
        basis: `${showery ? '阵性' : '连续性'}降水 ${rateText(rate)}，天气码提示雷电`,
        uncertain: true,
      }
    }
    if (showery) {
      const strong = rate >= RAIN_HEAVY_MMH
      return { glyph: strong ? 'rain-heavy' : 'rain', label: strong ? '强阵雨' : '阵雨', basis: `阵性降水 ${rateText(rate)}`, uncertain: false }
    }
    const basis = `降水率 ${rateText(rate)}`
    if (rate < RAIN_TRACE_MMH) return { glyph: 'drizzle', label: '毛毛雨', basis, uncertain: false }
    if (rate < RAIN_MODERATE_MMH) return { glyph: 'rain-light', label: '小雨', basis, uncertain: false }
    if (rate < RAIN_HEAVY_MMH) return { glyph: 'rain', label: '中雨', basis, uncertain: false }
    return { glyph: 'rain-heavy', label: '大雨', basis, uncertain: false }
  }

  // 4) 无降水但有能见度：雾 / 轻雾 / 霾按能见度分级，湿的与干的分开。
  const vis = finite(e.visibility)
  if (vis !== undefined && vis < MIST_VIS_KM) {
    const humidity = finite(e.humidity)
    if (vis < FOG_VIS_KM) {
      return { glyph: 'fog', label: '雾', basis: `能见度 ${visText(vis)}`, uncertain: false }
    }
    if (humidity === undefined) {
      return { glyph: 'fog', label: '能见度偏低', basis: `能见度 ${visText(vis)}`, uncertain: false }
    }
    const wet = humidity >= HAZE_RH_MAX
    return {
      glyph: 'fog',
      label: wet ? '轻雾' : '霾',
      basis: `能见度 ${visText(vis)}，湿度 ${pctText(humidity)}`,
      uncertain: false,
    }
  }

  // 5) 云量分级（八分云量折算）。
  const cloud = finite(e.cloudCover)
  if (cloud !== undefined) {
    const basis = `云量 ${pctText(cloud)}`
    if (cloud < CLOUD_CLEAR_PCT) return { glyph: e.isDay ? 'clear-day' : 'clear-night', label: '晴', basis, uncertain: false }
    if (cloud < CLOUD_PARTLY_PCT) return { glyph: e.isDay ? 'partly-day' : 'partly-night', label: '少云', basis, uncertain: false }
    if (cloud < CLOUD_OVERCAST_PCT) return { glyph: 'cloudy', label: '多云', basis, uncertain: false }
    return { glyph: 'cloudy', label: '阴', basis, uncertain: false }
  }

  // 6) 兜底：只剩天气码。它至少还说清了「下不下雨」，说不清的多半是雷雹那类。
  const info = describeCondition(code, e.isDay)
  return { glyph: glyphForCode(code, e.isDay), label: info.label, uncertain: false }
}

/**
 * GB/T 28592-2012 的 24 小时**雨**量等级（mm 累计）：微量 < 0.1、小雨 0.1–9.9、
 * 中雨 10–24.9、大雨 25–49.9、暴雨 50–99.9、大暴雨 100–249.9、特大暴雨 ≥ 250。
 */
export function rainGrade24h(sumMm: number | undefined): string | undefined {
  if (sumMm === undefined || !Number.isFinite(sumMm)) return undefined
  if (sumMm < 0.1) return '无降水'
  if (sumMm < 10) return '小雨'
  if (sumMm < 25) return '中雨'
  if (sumMm < DELUGE_24H_MM) return '大雨'
  if (sumMm < DOWNPOUR_24H_MM) return '暴雨'
  if (sumMm < CLOUDBURST_24H_MM) return '大暴雨'
  return '特大暴雨'
}

/**
 * GB/T 28592-2012 的 24 小时**降雪量**等级。国标以水当量（mm）计量纯雪，接口给的是
 * 新雪深度（cm），所以先按 {@link SNOW_CM_PER_MM_WE} 折算。
 * 小雪 0.1–2.4、中雪 2.5–4.9、大雪 5.0–9.9、暴雪 10.0–19.9、大暴雪 20.0–29.9。
 */
export function snowGrade24h(snowfallCm: number | undefined): string | undefined {
  if (snowfallCm === undefined || !Number.isFinite(snowfallCm) || snowfallCm <= 0) return undefined
  const we = snowfallCm / SNOW_CM_PER_MM_WE
  if (we < SNOW_MODERATE_24H_MM) return '小雪'
  if (we < SNOW_HEAVY_24H_MM) return '中雪'
  if (we < SNOWSTORM_24H_MM) return '大雪'
  if (we < 20) return '暴雪'
  if (we < 30) return '大暴雪'
  return '特大暴雪'
}

/**
 * 从「现在所在的那个小时」起算的 `windowHours` 小时滚动累计降水（mm）。
 *
 * 窗口里任何一小时缺报就整体放弃（返回 `undefined`）：把缺报当成 0 会算出一个偏小的
 * 累计量，从而**漏掉**一场真暴雨 —— 拿假数据凑一个看起来精确的数，比不给结论更糟。
 */
export function rollingRainSum(hourlyRates: (number | undefined)[], windowHours: number): number | undefined {
  if (windowHours <= 0 || hourlyRates.length < windowHours) return undefined
  let sum = 0
  for (let i = 0; i < windowHours; i += 1) {
    const value = hourlyRates[i]
    if (value === undefined || !Number.isFinite(value)) return undefined
    sum += value
  }
  return sum
}

/** 短历时暴雨结论：对应中国气象局令第 16 号的一级预警信号。 */
export interface DelugeWarning {
  level: 'warning' | 'danger'
  /** 预警信号名，如 `暴雨橙色`。 */
  signal: string
  /** 判定的累计窗口（小时）。 */
  hours: number
  /** 该窗口的累计降水（mm）。 */
  sumMm: number
  /** 命中的标准门槛（mm）。 */
  thresholdMm: number
}

/**
 * 短历时暴雨判定：中国气象局令第 16 号《气象灾害预警信号发布与传播办法》。
 *
 * 为什么需要它：GB/T 28592-2012 的暴雨是 **24 小时**累计 ≥ 50 mm，QX/T 416-2018 的
 * 短时强降水是**某一小时** ≥ 20 mm —— 两者之间的雨型（每小时 10 mm 连下六小时，
 * 累计 60 mm 却没有任何一小时到 20 mm/h）按哪一条都不触发，可它实实在在是一场暴雨
 * 预警级别的雨。令第 16 号正是为这个区间定的：
 * 蓝色 12h ≥ 50、黄色 6h ≥ 50、橙色 3h ≥ 50、红色 3h ≥ 100 mm。
 *
 * 先判更严重的档：3 小时同时满足橙、黄两级时给橙色。窗口缺报时该窗口不参与判定，
 * 所以宁可少报一级，也不拿缺报当 0。
 */
export function shortDurationDeluge(hourlyRates: (number | undefined)[]): DelugeWarning | undefined {
  const sum3 = rollingRainSum(hourlyRates, 3)
  if (sum3 !== undefined && sum3 >= DELUGE_RED_3H_MM) {
    return { level: 'danger', signal: '暴雨红色', hours: 3, sumMm: sum3, thresholdMm: DELUGE_RED_3H_MM }
  }
  if (sum3 !== undefined && sum3 >= DELUGE_3H_MM) {
    return { level: 'danger', signal: '暴雨橙色', hours: 3, sumMm: sum3, thresholdMm: DELUGE_3H_MM }
  }
  const sum6 = rollingRainSum(hourlyRates, 6)
  if (sum6 !== undefined && sum6 >= DELUGE_6H_MM) {
    return { level: 'warning', signal: '暴雨黄色', hours: 6, sumMm: sum6, thresholdMm: DELUGE_6H_MM }
  }
  const sum12 = rollingRainSum(hourlyRates, 12)
  if (sum12 !== undefined && sum12 >= DELUGE_12H_MM) {
    return { level: 'warning', signal: '暴雨蓝色', hours: 12, sumMm: sum12, thresholdMm: DELUGE_12H_MM }
  }
  return undefined
}
