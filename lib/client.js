window.__ModuleLoader__.load({ id: "dsh-weather", factory: (require) => {
var module = { exports: {} };
var exports = module.exports;
Object.defineProperty(exports, Symbol.toStringTag, { value: "Module" });
"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/client/index.tsx
var index_exports = {};
__export(index_exports, {
  apply: () => apply,
  inject: () => inject
});
module.exports = __toCommonJS(index_exports);

// src/config-shared.ts
var WEATHER_NS = "weather";
var DEFAULT_WEATHER_CONFIG = {
  enabled: true,
  locationMode: "auto",
  units: "celsius",
  refreshMinutes: 15,
  alertsEnabled: false
};

// src/client/WeatherBar.tsx
var import_react2 = require("react");

// src/client/weather-api.ts
var DISTRICT_ACCURACY_M = 1e3;
var CITY_ACCURACY_M = 1e4;
function precisionFromAccuracy(accuracy) {
  if (accuracy === void 0) return "unreliable";
  if (accuracy <= DISTRICT_ACCURACY_M) return "district";
  if (accuracy <= CITY_ACCURACY_M) return "city";
  return "unreliable";
}
var MINUTE_STEP_MIN = 15;
var MINUTELY_STEPS = 24;
var RAIN_MM_PER_15MIN = 0.1;
function scanRain(steps) {
  const windowMinutes = steps.length * MINUTE_STEP_MIN;
  const wet = (i) => steps[i] !== void 0 && steps[i].precipitation >= RAIN_MM_PER_15MIN;
  if (steps.length === 0) return { rainingNow: false, windowMinutes };
  if (wet(0)) {
    let end = 1;
    while (end < steps.length && wet(end)) end += 1;
    return { rainingNow: true, durationMinutes: end * MINUTE_STEP_MIN, windowMinutes };
  }
  for (let start = 1; start < steps.length; start += 1) {
    if (!wet(start)) continue;
    let end = start + 1;
    while (end < steps.length && wet(end)) end += 1;
    return {
      rainingNow: false,
      onsetMinutes: start * MINUTE_STEP_MIN,
      durationMinutes: (end - start) * MINUTE_STEP_MIN,
      windowMinutes
    };
  }
  return { rainingNow: false, windowMinutes };
}
var GEO_SEARCH_URL = "https://geocoding-api.open-meteo.com/v1/search";
var FORECAST_URL = "https://api.open-meteo.com/v1/forecast";
var AIR_QUALITY_URL = "https://air-quality-api.open-meteo.com/v1/air-quality";
var REVERSE_GEO_URL = "https://api.bigdatacloud.net/data/reverse-geocode-client";
async function sampleIpLocation(url) {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const json = await res.json();
    const latitude = Number(json.latitude ?? json.lat);
    const longitude = Number(json.longitude ?? json.lon);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) return null;
    const city = (json.city ?? "").trim();
    const region = (json.region ?? "").trim();
    const name = city !== "" ? city : region !== "" ? region : "\u5F53\u524D\u4F4D\u7F6E";
    return { name, latitude, longitude, source: "ip" };
  } catch {
    return null;
  }
}
async function resolveLocationByIp() {
  const samples = await Promise.all([
    sampleIpLocation("https://ipwho.is/"),
    sampleIpLocation("https://api.ipapi.is/"),
    sampleIpLocation("https://free.freeipapi.com/api/json")
  ]);
  const ok = samples.filter((sample) => sample !== null);
  if (ok.length === 0) throw new Error("IP \u5B9A\u4F4D\u670D\u52A1\u4E0D\u53EF\u7528");
  let best = ok[0];
  let bestCount = 1;
  for (const candidate of ok) {
    const count = ok.filter(
      (other) => haversineKm(candidate.latitude, candidate.longitude, other.latitude, other.longitude) <= 50
    ).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  const cluster = ok.filter(
    (other) => haversineKm(best.latitude, best.longitude, other.latitude, other.longitude) <= 50
  );
  const latitude = cluster.reduce((sum, sample) => sum + sample.latitude, 0) / cluster.length;
  const longitude = cluster.reduce((sum, sample) => sum + sample.longitude, 0) / cluster.length;
  return { name: best.name, latitude, longitude, source: "ip" };
}
function normalizeFirstLevel(admin1, countryCode) {
  if (countryCode !== "CN") return admin1;
  if (/[省市]$/.test(admin1) || admin1.endsWith("\u81EA\u6CBB\u533A") || admin1.endsWith("\u7279\u522B\u884C\u653F\u533A")) return admin1;
  return `${admin1}\u7701`;
}
function qualifyCityName(name, admin1, countryCode) {
  if (admin1 === void 0 || admin1 === "" || admin1 === name) return name;
  if (admin1.includes(name)) {
    return countryCode === "CN" && !/[市区县]$/.test(name) ? `${name}\u5E02` : name;
  }
  if (countryCode === "CN") {
    const city = /[市区县镇乡]$/.test(name) ? name : `${name}\u5E02`;
    return `${normalizeFirstLevel(admin1, "CN")}${city}`;
  }
  return `${admin1} \xB7 ${name}`;
}
async function reverseGeocodeAddress(latitude, longitude) {
  const url = `${REVERSE_GEO_URL}?latitude=${latitude}&longitude=${longitude}&localityLanguage=zh-Hans`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`\u53CD\u5411\u5730\u7406\u7F16\u7801\u54CD\u5E94\u5F02\u5E38\uFF08HTTP ${res.status}\uFF09`);
  const json = await res.json();
  return {
    province: json.principalSubdivision,
    city: json.city,
    district: json.locality
  };
}
function cityLevelName(name) {
  const trimmed = name.trim();
  const match = /^(.+?市)(?:[^省州市]+区)?$/.exec(trimmed);
  return match !== null ? match[1] : trimmed;
}
function composeAddressName(address, includeDistrict = false) {
  const { province, city, district } = address;
  if (city === void 0 || city === "") {
    if (includeDistrict && province !== void 0 && province !== "" && district !== void 0 && district !== "" && district !== province && /市$/.test(province)) {
      return `${province}${district}`;
    }
    return province ?? "";
  }
  const parts = [];
  if (province !== void 0 && province !== "" && province !== city) parts.push(province);
  parts.push(city);
  if (includeDistrict && district !== void 0 && district !== "" && district !== city) {
    parts.push(district);
  }
  return parts.join("");
}
async function localizeCityName(location) {
  const trimmed = location.name.trim();
  if (trimmed === "" || trimmed === "\u5F53\u524D\u4F4D\u7F6E") return trimmed;
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=10&language=zh&format=json`;
  try {
    const res = await fetch(url);
    if (!res.ok) return location.name;
    const json = await res.json();
    const results = json.results ?? [];
    if (results.length === 0) return location.name;
    let best = results[0];
    let bestDistance = Number.POSITIVE_INFINITY;
    for (const candidate of results) {
      const dLat = candidate.latitude - location.latitude;
      const dLon = candidate.longitude - location.longitude;
      const distance = dLat * dLat + dLon * dLon;
      if (distance < bestDistance) {
        bestDistance = distance;
        best = candidate;
      }
    }
    return qualifyCityName(best.name, best.admin1, best.country_code);
  } catch {
    return location.name;
  }
}
function resolveLocationByBrowser() {
  return new Promise((resolve, reject) => {
    if (typeof navigator === "undefined" || navigator.geolocation === void 0) {
      reject(new Error("\u6D4F\u89C8\u5668\u4E0D\u652F\u6301\u5B9A\u4F4D"));
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (position) => {
        resolve({
          name: "\u5F53\u524D\u4F4D\u7F6E",
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          source: "gps",
          accuracy: position.coords.accuracy
        });
      },
      (error) => {
        reject(new Error(`\u6D4F\u89C8\u5668\u5B9A\u4F4D\u5931\u8D25\uFF08${error.message}\uFF09`));
      },
      { enableHighAccuracy: true, timeout: 5e3, maximumAge: 6e4 }
    );
  });
}
function haversineKm(lat1, lon1, lat2, lon2) {
  const rad = Math.PI / 180;
  const dLat = (lat2 - lat1) * rad;
  const dLon = (lon2 - lon1) * rad;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2;
  return 6371 * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}
async function withTimeout(promise, ms) {
  let timer;
  try {
    return await Promise.race([
      promise.catch(() => null),
      new Promise((resolve) => {
        timer = setTimeout(() => resolve(null), ms);
      })
    ]);
  } finally {
    if (timer !== void 0) clearTimeout(timer);
  }
}
async function resolveAutoLocation() {
  const ipPromise = resolveLocationByIp().catch(() => null);
  const gpsResult = await withTimeout(resolveLocationByBrowser(), 6e3);
  const precision = gpsResult !== null ? precisionFromAccuracy(gpsResult.accuracy) : "unreliable";
  if (gpsResult !== null && precision !== "unreliable") {
    const name2 = await resolveDisplayName(gpsResult, precision);
    return { ...gpsResult, name: name2 };
  }
  const ipResult = await ipPromise;
  if (ipResult === null) throw new Error("IP \u5B9A\u4F4D\u670D\u52A1\u4E0D\u53EF\u7528");
  const name = await resolveDisplayName(ipResult, "city");
  return { ...ipResult, name };
}
async function resolveDisplayName(base, precision) {
  try {
    const composed = composeAddressName(
      await reverseGeocodeAddress(base.latitude, base.longitude),
      precision === "district"
    );
    if (composed !== "") return composed;
  } catch {
  }
  return localizeCityName(base);
}
async function runLocationDiagnostics() {
  const gpsPromise = resolveLocationByBrowser();
  const ipPromise = resolveLocationByIp();
  const gpsRaw = await withTimeout(gpsPromise, 6e3);
  let ip;
  try {
    const ipLoc = await ipPromise;
    ip = { status: "ok", city: ipLoc.name, latitude: ipLoc.latitude, longitude: ipLoc.longitude };
  } catch (err) {
    ip = { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
  const gps = gpsRaw !== null ? { status: "ok", latitude: gpsRaw.latitude, longitude: gpsRaw.longitude, accuracy: gpsRaw.accuracy } : { status: "timeout" };
  const distance = gpsRaw !== null && ip.status === "ok" ? haversineKm(gpsRaw.latitude, gpsRaw.longitude, ip.latitude, ip.longitude) : void 0;
  const precision = gpsRaw !== null ? precisionFromAccuracy(gpsRaw.accuracy) : "unreliable";
  const chosen = precision !== "unreliable" ? "gps" : ip.status === "ok" ? "ip" : "none";
  return { gps, ip, gpsIpDistanceKm: distance, chosen, precision: chosen === "gps" ? precision : void 0 };
}
async function searchCity(query, limit = 5) {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=${limit}&language=zh&format=json`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`\u57CE\u5E02\u641C\u7D22\u54CD\u5E94\u5F02\u5E38\uFF08HTTP ${res.status}\uFF09`);
  const json = await res.json();
  return (json.results ?? []).map((result) => ({
    name: qualifyCityName(result.name, result.admin1, result.country_code),
    latitude: result.latitude,
    longitude: result.longitude,
    source: "search"
  }));
}
async function fetchWeather(location, units) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: [
      "temperature_2m",
      "relative_humidity_2m",
      "apparent_temperature",
      "weather_code",
      "wind_speed_10m",
      "is_day",
      "wind_direction_10m",
      "wind_gusts_10m",
      "surface_pressure",
      "cloud_cover",
      "visibility",
      "dew_point_2m",
      "precipitation"
    ].join(","),
    hourly: "temperature_2m,weather_code,precipitation_probability,wind_speed_10m,wind_gusts_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,precipitation_sum,wind_gusts_10m_max",
    minutely_15: "precipitation",
    timezone: "auto",
    forecast_days: "7",
    language: "zh"
  });
  if (units === "fahrenheit") {
    params.set("temperature_unit", "fahrenheit");
    params.set("wind_speed_unit", "mph");
  }
  const airParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "us_aqi,pm2_5",
    timezone: "auto"
  });
  const [res, airRes] = await Promise.all([
    fetch(`${FORECAST_URL}?${params.toString()}`),
    fetch(`${AIR_QUALITY_URL}?${airParams.toString()}`)
  ]);
  if (!res.ok) throw new Error(`\u5929\u6C14\u6570\u636E\u83B7\u53D6\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
  const json = await res.json();
  let air;
  try {
    if (airRes.ok) {
      const airJson = await airRes.json();
      const aqi = airJson.current?.us_aqi;
      const pm25 = airJson.current?.pm2_5;
      if (aqi !== void 0 || pm25 !== void 0) {
        air = { aqi: aqi ?? 0, pm25: pm25 ?? 0 };
      }
    }
  } catch {
    air = void 0;
  }
  const current = json.current;
  if (current === void 0 || current.temperature_2m === void 0) {
    throw new Error("\u5929\u6C14\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u5F53\u524D\u6570\u636E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  }
  const hourly = json.hourly;
  const daily = json.daily;
  const nowIndex = current.time !== void 0 && hourly?.time !== void 0 ? hourly.time.findIndex((t) => t >= current.time) : -1;
  const from = nowIndex >= 0 ? nowIndex : 0;
  let minutely;
  let rainSoon;
  const minuteTimes = json.minutely_15?.time ?? [];
  if (minuteTimes.length > 0) {
    const minuteFrom = current.time !== void 0 ? minuteTimes.findIndex((t) => t >= current.time) : -1;
    const mStart = minuteFrom >= 0 ? minuteFrom : 0;
    const precipitation = json.minutely_15?.precipitation ?? [];
    const steps = minuteTimes.slice(mStart, mStart + MINUTELY_STEPS).map((time, index) => ({
      time,
      precipitation: precipitation[mStart + index] ?? 0
    }));
    minutely = steps;
    rainSoon = scanRain(steps);
  }
  return {
    location,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m ?? 0,
      windSpeed: current.wind_speed_10m ?? 0,
      weatherCode: current.weather_code ?? -1,
      isDay: (current.is_day ?? 1) === 1,
      windDirection: current.wind_direction_10m ?? void 0,
      windGusts: current.wind_gusts_10m ?? void 0,
      pressure: current.surface_pressure ?? void 0,
      cloudCover: current.cloud_cover ?? void 0,
      visibility: current.visibility ?? void 0,
      dewPoint: current.dew_point_2m ?? void 0,
      precipitation: current.precipitation ?? void 0
    },
    hourly: (hourly?.time ?? []).slice(from, from + 24).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[from + index] ?? 0,
      weatherCode: hourly?.weather_code?.[from + index] ?? -1,
      precipProb: hourly?.precipitation_probability?.[from + index] ?? 0,
      windSpeed: hourly?.wind_speed_10m?.[from + index] ?? void 0,
      windGusts: hourly?.wind_gusts_10m?.[from + index] ?? void 0
    })),
    daily: (daily?.time ?? []).slice(0, 7).map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? -1,
      tempMax: daily?.temperature_2m_max?.[index] ?? 0,
      tempMin: daily?.temperature_2m_min?.[index] ?? 0,
      precipProb: daily?.precipitation_probability_max?.[index] ?? 0,
      precipSum: daily?.precipitation_sum?.[index] ?? void 0,
      windGustsMax: daily?.wind_gusts_10m_max?.[index] ?? void 0
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    uvIndexMax: daily?.uv_index_max?.[0] ?? void 0,
    air,
    minutely,
    rainSoon,
    unitLabel: units === "fahrenheit" ? "\xB0F" : "\xB0C"
  };
}
var HEAT_C = 35;
var COLD_C = 0;
var WIND_KMH = 60;
var LEAD_HOURS = 12;
var HEAVY_RAIN_CODES = /* @__PURE__ */ new Set([65, 82, 99]);
var THUNDER_CODES = /* @__PURE__ */ new Set([95, 96]);
var STORM_CODES = /* @__PURE__ */ new Set([...HEAVY_RAIN_CODES, ...THUNDER_CODES]);
var HEAVY_SNOW_CODES = /* @__PURE__ */ new Set([75, 86]);
function evaluateAlerts(data, fmt) {
  const unit = data.unitLabel;
  const toCelsius = (v) => unit === "\xB0F" ? (v - 32) * 5 / 9 : v;
  const toKmh = (v) => unit === "\xB0F" ? v * 1.609344 : v;
  const alerts = [];
  const hasKey = (key) => alerts.some((alert) => alert.key === key);
  const current = data.current;
  const tempC = toCelsius(current.temperature);
  if (tempC >= HEAT_C) {
    alerts.push({ key: "heat", level: "warning", title: "\u9AD8\u6E29", detail: `\u5F53\u524D ${fmt(current.temperature)}\uFF0C\u6CE8\u610F\u9632\u6691` });
  } else if (tempC <= COLD_C) {
    alerts.push({ key: "cold", level: "warning", title: "\u4F4E\u6E29", detail: `\u5F53\u524D ${fmt(current.temperature)}\uFF0C\u6CE8\u610F\u4FDD\u6696` });
  }
  if (toKmh(current.windSpeed) >= WIND_KMH) {
    alerts.push({ key: "wind", level: "warning", title: "\u5927\u98CE", detail: `\u98CE\u901F ${Math.round(toKmh(current.windSpeed))} km/h` });
  }
  const code = current.weatherCode;
  if (HEAVY_RAIN_CODES.has(code)) {
    alerts.push({ key: "heavy-rain", level: "danger", title: "\u5F3A\u964D\u96E8", detail: "\u5927\u96E8\u6216\u66B4\u98CE\u96E8\uFF0C\u6CE8\u610F\u51FA\u884C\u5B89\u5168" });
  } else if (THUNDER_CODES.has(code)) {
    alerts.push({ key: "thunder", level: "danger", title: "\u96F7\u66B4", detail: "\u96F7\u7535\u5929\u6C14\uFF0C\u6CE8\u610F\u9632\u8303" });
  }
  if (HEAVY_SNOW_CODES.has(code)) {
    alerts.push({ key: "heavy-snow", level: "warning", title: "\u5F3A\u964D\u96EA", detail: "\u5927\u96EA\u5929\u6C14\uFF0C\u6CE8\u610F\u8DEF\u51B5" });
  }
  const future = data.hourly.slice(1, 1 + LEAD_HOURS);
  if (future.length > 0) {
    const stormSoon = future.some((h) => STORM_CODES.has(h.weatherCode));
    if (stormSoon && !hasKey("heavy-rain") && !hasKey("thunder")) {
      alerts.push({
        key: "storm-soon",
        level: "danger",
        title: "\u5F3A\u964D\u96E8/\u96F7\u66B4",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u53EF\u80FD\u6709\u5F3A\u964D\u96E8\u6216\u96F7\u66B4\uFF0C\u8BF7\u7559\u610F\u5929\u6C14\u53D8\u5316`
      });
    }
    const heatMaxC = Math.max(...future.map((h) => toCelsius(h.temperature)));
    if (heatMaxC >= HEAT_C && !hasKey("heat")) {
      alerts.push({
        key: "heat-soon",
        level: "warning",
        title: "\u9AD8\u6E29",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u6700\u9AD8\u53EF\u8FBE ${fmt(unit === "\xB0F" ? heatMaxC * 9 / 5 + 32 : heatMaxC)}\uFF0C\u6CE8\u610F\u9632\u6691`
      });
    }
    const coldMinC = Math.min(...future.map((h) => toCelsius(h.temperature)));
    if (coldMinC <= COLD_C && !hasKey("cold")) {
      alerts.push({
        key: "cold-soon",
        level: "warning",
        title: "\u4F4E\u6E29",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u6700\u4F4E\u5C06\u964D\u81F3 ${fmt(unit === "\xB0F" ? coldMinC * 9 / 5 + 32 : coldMinC)}\uFF0C\u6CE8\u610F\u4FDD\u6696`
      });
    }
    const windMaxKmh = Math.max(...future.map((h) => toKmh(h.windSpeed ?? 0)));
    if (windMaxKmh >= WIND_KMH && !hasKey("wind")) {
      alerts.push({
        key: "wind-soon",
        level: "warning",
        title: "\u5927\u98CE",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u98CE\u529B\u8F83\u5927\uFF08\u6700\u5927 ${Math.round(windMaxKmh)} km/h\uFF09\uFF0C\u6CE8\u610F\u9AD8\u7A7A\u5760\u7269`
      });
    }
    if (future.some((h) => HEAVY_SNOW_CODES.has(h.weatherCode)) && !hasKey("heavy-snow")) {
      alerts.push({
        key: "snow-soon",
        level: "warning",
        title: "\u5F3A\u964D\u96EA",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u53EF\u80FD\u6709\u5F3A\u964D\u96EA\uFF0C\u6CE8\u610F\u8DEF\u51B5`
      });
    }
  }
  return alerts;
}

// src/client/condition.ts
var DAY = {
  0: { label: "\u6674", emoji: "\u2600\uFE0F" },
  1: { label: "\u5927\u81F4\u6674\u6717", emoji: "\u{1F324}\uFE0F" },
  2: { label: "\u591A\u4E91", emoji: "\u26C5" },
  3: { label: "\u9634", emoji: "\u2601\uFE0F" },
  45: { label: "\u96FE", emoji: "\u{1F32B}\uFE0F" },
  48: { label: "\u51BB\u96FE", emoji: "\u{1F32B}\uFE0F" },
  51: { label: "\u6BDB\u6BDB\u96E8", emoji: "\u{1F326}\uFE0F" },
  53: { label: "\u6BDB\u6BDB\u96E8", emoji: "\u{1F326}\uFE0F" },
  55: { label: "\u6D53\u6BDB\u6BDB\u96E8", emoji: "\u{1F326}\uFE0F" },
  56: { label: "\u51BB\u6BDB\u6BDB\u96E8", emoji: "\u{1F327}\uFE0F" },
  57: { label: "\u5F3A\u51BB\u6BDB\u6BDB\u96E8", emoji: "\u{1F327}\uFE0F" },
  61: { label: "\u5C0F\u96E8", emoji: "\u{1F327}\uFE0F" },
  63: { label: "\u4E2D\u96E8", emoji: "\u{1F327}\uFE0F" },
  65: { label: "\u5927\u96E8", emoji: "\u{1F327}\uFE0F" },
  66: { label: "\u51BB\u96E8", emoji: "\u{1F327}\uFE0F" },
  67: { label: "\u5F3A\u51BB\u96E8", emoji: "\u{1F327}\uFE0F" },
  71: { label: "\u5C0F\u96EA", emoji: "\u2744\uFE0F" },
  73: { label: "\u4E2D\u96EA", emoji: "\u2744\uFE0F" },
  75: { label: "\u5927\u96EA", emoji: "\u2744\uFE0F" },
  77: { label: "\u7C73\u96EA", emoji: "\u{1F328}\uFE0F" },
  80: { label: "\u9635\u96E8", emoji: "\u{1F326}\uFE0F" },
  81: { label: "\u5F3A\u9635\u96E8", emoji: "\u{1F326}\uFE0F" },
  82: { label: "\u66B4\u9635\u96E8", emoji: "\u26C8\uFE0F" },
  85: { label: "\u9635\u96EA", emoji: "\u{1F328}\uFE0F" },
  86: { label: "\u5F3A\u9635\u96EA", emoji: "\u{1F328}\uFE0F" },
  95: { label: "\u96F7\u66B4", emoji: "\u26C8\uFE0F" },
  96: { label: "\u96F7\u66B4\u4F34\u51B0\u96F9", emoji: "\u26C8\uFE0F" },
  99: { label: "\u5F3A\u96F7\u66B4\u4F34\u51B0\u96F9", emoji: "\u26C8\uFE0F" }
};
var NIGHT = {
  ...DAY,
  0: { label: "\u6674", emoji: "\u{1F319}" },
  1: { label: "\u5927\u81F4\u6674\u6717", emoji: "\u{1F319}" },
  2: { label: "\u591A\u4E91", emoji: "\u2601\uFE0F" }
};
function describeCondition(code, isDay) {
  const table = isDay ? DAY : NIGHT;
  return table[code] ?? { label: "\u672A\u77E5", emoji: "\u{1F321}\uFE0F" };
}
function hourLabel(iso) {
  const match = /T(\d{2})/.exec(iso);
  if (match === null) return iso;
  return `${match[1]}\u65F6`;
}
function dayLabel(iso) {
  const date = /* @__PURE__ */ new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
  const today = /* @__PURE__ */ new Date();
  const startOfToday = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const diffDays = Math.round((date.getTime() - startOfToday.getTime()) / 864e5);
  if (diffDays === 0) return "\u4ECA\u5929";
  if (diffDays === 1) return "\u660E\u5929";
  if (diffDays === 2) return "\u540E\u5929";
  const weekdays = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
  return weekdays[date.getDay()];
}
function aqiInfo(aqi) {
  if (aqi <= 50) return { label: "\u4F18", color: "#4ade80" };
  if (aqi <= 100) return { label: "\u826F", color: "#facc15" };
  if (aqi <= 150) return { label: "\u8F7B\u5EA6", color: "#fb923c" };
  if (aqi <= 200) return { label: "\u4E2D\u5EA6", color: "#f87171" };
  if (aqi <= 300) return { label: "\u91CD\u5EA6", color: "#c084fc" };
  return { label: "\u4E25\u91CD", color: "#d97757" };
}
function uvLevel(uv) {
  if (uv < 3) return "\u4F4E";
  if (uv < 6) return "\u4E2D";
  if (uv < 8) return "\u9AD8";
  if (uv < 11) return "\u5F88\u9AD8";
  return "\u6781\u9AD8";
}
function timeLabel(iso) {
  if (iso === void 0) return "--:--";
  const match = /T(\d{2}:\d{2})/.exec(iso);
  return match === null ? iso : match[1];
}
var RAINY_CODES = [51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82, 95, 96, 99];
function weatherAdvice(data) {
  const current = data.current;
  const today = data.daily[0];
  if (RAINY_CODES.includes(current.weatherCode)) {
    return { icon: "\u2602\uFE0F", text: "\u6709\u964D\u6C34\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u4F1E" };
  }
  if (current.temperature >= 35) {
    return { icon: "\u{1F975}", text: "\u9AD8\u6E29\u5929\u6C14\uFF0C\u6CE8\u610F\u9632\u6691\u8865\u6C34" };
  }
  if (current.temperature <= 0) {
    return { icon: "\u{1F9E3}", text: "\u4E25\u5BD2\u5929\u6C14\uFF0C\u6CE8\u610F\u9632\u5BD2\u4FDD\u6696" };
  }
  if (current.temperature >= 28 && (current.weatherCode === 0 || current.weatherCode === 1)) {
    return { icon: "\u{1F60E}", text: "\u6674\u70ED\u5929\u6C14\uFF0C\u51FA\u95E8\u505A\u597D\u9632\u6652" };
  }
  if (current.weatherCode === 0 || current.weatherCode === 1) {
    return { icon: "\u{1F31E}", text: "\u5929\u6C14\u6674\u597D\uFF0C\u9002\u5408\u6237\u5916\u6D3B\u52A8" };
  }
  if (current.windSpeed >= 40) {
    return { icon: "\u{1F4A8}", text: "\u98CE\u529B\u8F83\u5927\uFF0C\u6CE8\u610F\u9AD8\u7A7A\u5760\u7269" };
  }
  if ((today?.precipProb ?? 0) >= 60) {
    return { icon: "\u{1F327}\uFE0F", text: "\u4ECA\u65E5\u964D\u6C34\u6982\u7387\u8F83\u9AD8\uFF0C\u5907\u597D\u96E8\u5177" };
  }
  if (data.air !== void 0 && data.air.aqi > 150) {
    return { icon: "\u{1F637}", text: "\u7A7A\u6C14\u8D28\u91CF\u8F83\u5DEE\uFF0C\u5916\u51FA\u5EFA\u8BAE\u4F69\u6234\u53E3\u7F69" };
  }
  return { icon: "\u{1F324}\uFE0F", text: "\u5929\u6C14\u5E73\u7A33\uFF0C\u9002\u5408\u65E5\u5E38\u51FA\u884C" };
}
function durationLabel(minutes) {
  if (minutes < 60) return `${minutes} \u5206\u949F`;
  const hours = minutes / 60;
  if (hours >= 10) return `${Math.round(hours)} \u5C0F\u65F6`;
  return `${Math.round(hours * 2) / 2} \u5C0F\u65F6`;
}
function rainTimingText(rain) {
  if (rain.rainingNow) {
    const duration = rain.durationMinutes;
    if (duration !== void 0 && duration >= 15 && duration <= 180) {
      return `\u6B63\u5728\u4E0B\u96E8\uFF0C\u9884\u8BA1\u6301\u7EED ${durationLabel(duration)}`;
    }
    return "\u6B63\u5728\u4E0B\u96E8";
  }
  const onset = rain.onsetMinutes;
  if (onset === void 0) return "\u8FD1\u671F\u65E0\u660E\u663E\u964D\u96E8";
  if (onset <= 15) return "\u5373\u5C06\u5F00\u59CB\u4E0B\u96E8";
  const rounded = onset >= 180 ? `${Math.round(onset / 60)} \u5C0F\u65F6` : `${onset} \u5206\u949F`;
  return `\u7EA6 ${rounded}\u540E\u5F00\u59CB\u4E0B\u96E8`;
}
function windDirectionText(degrees) {
  if (degrees === void 0) return void 0;
  const names = ["\u5317", "\u4E1C\u5317", "\u4E1C", "\u4E1C\u5357", "\u5357", "\u897F\u5357", "\u897F", "\u897F\u5317"];
  const index = Math.round((degrees % 360 + 360) % 360 / 45) % 8;
  return `${names[index]}\u98CE`;
}

// src/client/icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var SUN = "#fbbf24";
var RAIN = "#60a5fa";
var LIGHTNING = "#fbbf24";
var CLOUD = "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z";
var CLOUD_LOW = "M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25";
function Sun() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { stroke: SUN, children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "5" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "1", x2: "12", y2: "3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "21", x2: "12", y2: "23" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "1", y1: "12", x2: "3", y2: "12" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "21", y1: "12", x2: "23", y2: "12" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
  ] });
}
function Moon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" });
}
function Cloud() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD });
}
function CloudSun() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2v2", stroke: SUN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4.93 4.93 1.41 1.41", stroke: SUN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 12h2", stroke: SUN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m19.07 4.93-1.41 1.41", stroke: SUN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15.95 8.05a5 5 0 0 0-7.9 6.95" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD })
  ] });
}
function CloudMoon() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M15.5 6.5a5.5 5.5 0 1 1-7.5 7.5 6 6 0 0 0 7.5-7.5z" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M18 12h-1.26A7 7 0 1 0 10 19h8a4.5 4.5 0 0 0 0-7z" })
  ] });
}
function Fog() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 17h8", opacity: 0.75 }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 20h5", opacity: 0.45 })
  ] });
}
function Drizzle() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v2", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 19v2", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v2", stroke: RAIN })
  ] });
}
function Rain() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v3", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 19v3", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v3", stroke: RAIN })
  ] });
}
function HeavyRain() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7.5 19v3.5", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 18.5v3.5", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13.5 19v3.5", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16.5 18.5v3.5", stroke: RAIN })
  ] });
}
function Snow() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 18.5v3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M6.5 20h3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 18v3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 19.5h3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 18.5v3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14.5 20h3" })
  ] });
}
function Sleet() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v2", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v2", stroke: RAIN }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 18.5v3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 20h3" })
  ] });
}
function Thunder() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "13 11 9 17 15 17 11 23", stroke: LIGHTNING, fill: "none" })
  ] });
}
function ThunderHail() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "13 11 9 17 15 17 11 23", stroke: LIGHTNING, fill: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "7", cy: "21", r: "1", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "11", cy: "22", r: "1", fill: "currentColor", stroke: "none" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "15", cy: "21", r: "1", fill: "currentColor", stroke: "none" })
  ] });
}
function Unknown() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" });
}
function WeatherIcon(props) {
  const { code, isDay, size = 24 } = props;
  let node;
  if (code === 0 || code === 1) {
    node = isDay ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sun, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Moon, {});
  } else if (code === 2) {
    node = isDay ? /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloudSun, {}) : /* @__PURE__ */ (0, import_jsx_runtime.jsx)(CloudMoon, {});
  } else if (code === 3) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Cloud, {});
  } else if (code === 45 || code === 48) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Fog, {});
  } else if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Drizzle, {});
  } else if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Rain, {});
  } else if (code === 80 || code === 81 || code === 82) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(HeavyRain, {});
  } else if (code === 71 || code === 73 || code === 75 || code === 77) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Snow, {});
  } else if (code === 85 || code === 86) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sleet, {});
  } else if (code === 95) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Thunder, {});
  } else if (code === 96 || code === 99) {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(ThunderHail, {});
  } else {
    node = /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Unknown, {});
  }
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: node
    }
  );
}
function Glyph(props) {
  const { name, size = 14 } = props;
  const paths = {
    droplet: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" }),
    wind: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M9.59 4.59A2 2 0 1 1 11 8H2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12.59 19.41A2 2 0 1 0 14 16H2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" })
    ] }),
    umbrella: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" }),
    refresh: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "23 4 23 10 17 10" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20.49 15a9 9 0 1 1-2.12-9.36L23 10" })
    ] }),
    pin: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "10", r: "3" })
    ] }),
    sunrise: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M17 18a5 5 0 0 0-10 0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "2", x2: "12", y2: "9" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "10.22", x2: "5.64", y2: "11.64" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "1", y1: "18", x2: "3", y2: "18" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "21", y1: "18", x2: "23", y2: "18" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "11.64", x2: "19.78", y2: "10.22" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "23", y1: "22", x2: "1", y2: "22" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "8 6 12 2 16 6" })
    ] }),
    sunset: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M17 18a5 5 0 0 0-10 0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "9", x2: "12", y2: "2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "10.22", x2: "5.64", y2: "11.64" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "1", y1: "18", x2: "3", y2: "18" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "21", y1: "18", x2: "23", y2: "18" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "11.64", x2: "19.78", y2: "10.22" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "23", y1: "22", x2: "1", y2: "22" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "16 5 12 9 8 5" })
    ] }),
    sun: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "5" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "1", x2: "12", y2: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "21", x2: "12", y2: "23" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "4.22", x2: "5.64", y2: "5.64" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "18.36", x2: "19.78", y2: "19.78" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "1", y1: "12", x2: "3", y2: "12" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "21", y1: "12", x2: "23", y2: "12" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4.22", y1: "19.78", x2: "5.64", y2: "18.36" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "18.36", y1: "5.64", x2: "19.78", y2: "4.22" })
    ] }),
    sliders: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4", y1: "21", x2: "4", y2: "14" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "4", y1: "10", x2: "4", y2: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "21", x2: "12", y2: "12" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "12", y1: "8", x2: "12", y2: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "20", y1: "21", x2: "20", y2: "16" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "20", y1: "12", x2: "20", y2: "3" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "1", y1: "14", x2: "7", y2: "14" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "9", y1: "8", x2: "15", y2: "8" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("line", { x1: "17", y1: "16", x2: "23", y2: "16" })
    ] }),
    "chevron-left": /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "15 18 9 12 15 6" }),
    cloud: /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD }),
    eye: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "12", r: "3" })
    ] }),
    gauge: /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { children: [
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M5 15a7 7 0 1 1 14 0" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 15l4.2-4.2" }),
      /* @__PURE__ */ (0, import_jsx_runtime.jsx)("circle", { cx: "12", cy: "15", r: "1.3", fill: "currentColor", stroke: "none" })
    ] })
  };
  return /* @__PURE__ */ (0, import_jsx_runtime.jsx)(
    "svg",
    {
      width: size,
      height: size,
      viewBox: "0 0 24 24",
      fill: "none",
      stroke: "currentColor",
      strokeWidth: 2,
      strokeLinecap: "round",
      strokeLinejoin: "round",
      "aria-hidden": "true",
      children: paths[name]
    }
  );
}

// src/client/TrendChart.tsx
var import_react = require("react");
var import_jsx_runtime2 = require("react/jsx-runtime");
var WIDTH = 640;
var PAD_X = 52;
var PAD_Y = 16;
var ACCENT = "var(--dsw-alias-brand-primary, #4f8cff)";
var MUTED = "var(--dshw-fg-muted, #5f6672)";
var DOT_EDGE = "var(--dsw-alias-bg-layer-2, #ffffff)";
function TrendChart(props) {
  const { values, labels, height = 88, unit = "" } = props;
  const gradientId = (0, import_react.useId)();
  if (values.length < 2) {
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, color: MUTED }, children: "\u6570\u636E\u4E0D\u8DB3" });
  }
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = max - min || 1;
  const stepX = (WIDTH - PAD_X * 2) / (values.length - 1);
  const points = values.map((value, index) => ({
    x: PAD_X + index * stepX,
    y: PAD_Y + (height - PAD_Y * 2) * (1 - (value - min) / span)
  }));
  const line = points.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
  const area = `${PAD_X},${height - PAD_Y} ${line} ${WIDTH - PAD_X},${height - PAD_Y}`;
  const labelIndices = [.../* @__PURE__ */ new Set([
    0,
    Math.floor((values.length - 1) / 3),
    Math.floor((values.length - 1) * 2 / 3),
    values.length - 1
  ])];
  const first = points[0];
  const last = points[points.length - 1];
  const showExtremes = max !== min;
  const maxPoint = points[values.indexOf(max)];
  const minPoint = points[values.indexOf(min)];
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("svg", { viewBox: `0 0 ${WIDTH} ${height}`, width: "100%", height, style: { display: "block" }, "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("linearGradient", { id: gradientId, x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("stop", { offset: "0%", style: { stopColor: ACCENT, stopOpacity: 0.3 } }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("stop", { offset: "100%", style: { stopColor: ACCENT, stopOpacity: 0.02 } })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("polygon", { points: area, fill: `url(#${gradientId})` }),
    showExtremes && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: PAD_X, y1: maxPoint.y, x2: WIDTH - PAD_X, y2: maxPoint.y, stroke: ACCENT, strokeOpacity: 0.3, strokeWidth: 1, strokeDasharray: "3 3" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("line", { x1: PAD_X, y1: minPoint.y, x2: WIDTH - PAD_X, y2: minPoint.y, stroke: ACCENT, strokeOpacity: 0.16, strokeWidth: 1, strokeDasharray: "3 3" }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("text", { x: PAD_X - 6, y: maxPoint.y + 4, textAnchor: "end", fontSize: 12, fontWeight: 700, style: { fill: ACCENT }, children: [
        Math.round(max),
        unit
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("text", { x: PAD_X - 6, y: minPoint.y + 4, textAnchor: "end", fontSize: 12, fontWeight: 700, style: { fill: MUTED }, children: [
        Math.round(min),
        unit
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "polyline",
      {
        points: line,
        fill: "none",
        style: { stroke: ACCENT },
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: first.x, cy: first.y, r: 3.5, fill: ACCENT, style: { stroke: DOT_EDGE }, strokeWidth: 1.5 }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("circle", { cx: last.x, cy: last.y, r: 2.5, fill: ACCENT }),
    labels !== void 0 && labelIndices.map((index) => /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
      "text",
      {
        x: points[index].x,
        y: height - 4,
        textAnchor: index === 0 ? "start" : index === values.length - 1 ? "end" : "middle",
        fontSize: 10.5,
        style: { fill: MUTED },
        children: labels[index]
      },
      index
    ))
  ] });
}

// src/client/WeatherBar.tsx
var import_jsx_runtime3 = require("react/jsx-runtime");
var TOKEN = {
  bg: "var(--dsw-alias-bg-layer-2, #f3f4f6)",
  bgSoft: "var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06))",
  // Text colors flip to pure white in dark mode via .dshw-root (see styles.ts).
  fg: "var(--dshw-fg, #1f2328)",
  fgMuted: "var(--dshw-fg-muted, #5f6672)",
  border: "var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))",
  accent: "var(--dsw-alias-brand-primary, #4f8cff)",
  danger: "#e5484d"
};
var NUM = { fontVariantNumeric: "tabular-nums" };
function WeatherBar(props) {
  const { scope } = props;
  const [config, setConfig] = (0, import_react2.useState)(() => scope.getSnapshot().value);
  const [status, setStatus] = (0, import_react2.useState)("idle");
  const [location, setLocation] = (0, import_react2.useState)(null);
  const [data, setData] = (0, import_react2.useState)(null);
  const [error, setError] = (0, import_react2.useState)(null);
  const [open, setOpen] = (0, import_react2.useState)(false);
  const [tick, setTick] = (0, import_react2.useState)(0);
  const [relocateTick, setRelocateTick] = (0, import_react2.useState)(0);
  const [now, setNow] = (0, import_react2.useState)(() => /* @__PURE__ */ new Date());
  const [pop, setPop] = (0, import_react2.useState)(null);
  const barRef = (0, import_react2.useRef)(null);
  const bypassCacheRef = (0, import_react2.useRef)(false);
  const notifiedAt = (0, import_react2.useRef)(/* @__PURE__ */ new Map());
  const lastGoodRef = (0, import_react2.useRef)(null);
  const [stale, setStale] = (0, import_react2.useState)(false);
  const [updatedAt, setUpdatedAt] = (0, import_react2.useState)(null);
  const appTitle = (0, import_react2.useRef)(null);
  const closePopover = () => {
    setOpen(false);
  };
  const togglePopover = () => {
    const next = !open;
    if (next && barRef.current !== null) {
      const rect = barRef.current.getBoundingClientRect();
      const gap = 16;
      const rightRoom = window.innerWidth - rect.right - gap;
      const leftRoom = rect.left - gap;
      if (rightRoom >= leftRoom) {
        setPop({ align: "start", width: Math.min(560, Math.max(280, rect.width + rightRoom)) });
      } else {
        setPop({ align: "end", width: Math.min(560, Math.max(280, rect.width + leftRoom)) });
      }
    }
    setOpen(next);
  };
  const effective = config ?? DEFAULT_WEATHER_CONFIG;
  (0, import_react2.useEffect)(() => {
    const sync = () => setConfig(scope.getSnapshot().value);
    sync();
    return scope.subscribe(sync);
  }, [scope]);
  (0, import_react2.useEffect)(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (barRef.current !== null && !barRef.current.contains(event.target)) {
        closePopover();
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closePopover();
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);
  (0, import_react2.useEffect)(() => {
    if (!effective.enabled) return;
    let cancelled = false;
    setStatus(effective.locationMode === "manual" ? "loading" : "locating");
    setError(null);
    void (async () => {
      try {
        let loc;
        if (effective.locationMode === "manual") {
          if (effective.latitude === void 0 || effective.longitude === void 0) {
            throw new Error("\u624B\u52A8\u6A21\u5F0F\u7F3A\u5C11\u5750\u6807\uFF0C\u8BF7\u5728\u8BBE\u7F6E\u4E2D\u586B\u5199");
          }
          loc = {
            name: cityLevelName(effective.cityName ?? "") !== "" ? cityLevelName(effective.cityName ?? "") : "\u5F53\u524D\u4F4D\u7F6E",
            latitude: effective.latitude,
            longitude: effective.longitude,
            source: "manual"
          };
        } else {
          const cached = !bypassCacheRef.current && effective.autoLatitude !== void 0 && effective.autoLongitude !== void 0 ? {
            // Preserve the resolved name verbatim — it may already include a
            // district (区) resolved from a trusted browser fix.
            name: effective.autoCityName !== void 0 && effective.autoCityName !== "" ? effective.autoCityName : "\u5F53\u524D\u4F4D\u7F6E",
            latitude: effective.autoLatitude,
            longitude: effective.autoLongitude,
            source: effective.autoSource ?? "ip"
          } : null;
          loc = cached ?? await resolveAutoLocation();
          bypassCacheRef.current = false;
          if (cancelled) return;
          if (cached === null) {
            void scope.set("autoLatitude", loc.latitude);
            void scope.set("autoLongitude", loc.longitude);
            void scope.set("autoCityName", loc.name);
            void scope.set("autoSource", loc.source);
          } else {
            void resolveLocationByIp().then((ip) => {
              if (cancelled) return;
              if (cached.source === "gps") return;
              if (haversineKm(cached.latitude, cached.longitude, ip.latitude, ip.longitude) > 50) {
                void scope.unset("autoLatitude");
                void scope.unset("autoLongitude");
                void scope.unset("autoCityName");
                void scope.unset("autoSource");
              }
            }).catch(() => {
            });
          }
        }
        if (cancelled) return;
        setLocation(loc);
        setStatus("loading");
      } catch (err) {
        bypassCacheRef.current = false;
        if (cancelled) return;
        setStatus("error");
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    effective.enabled,
    effective.locationMode,
    effective.latitude,
    effective.longitude,
    effective.cityName,
    effective.autoLatitude,
    effective.autoLongitude,
    effective.autoCityName,
    relocateTick
  ]);
  (0, import_react2.useEffect)(() => {
    if (!effective.enabled || location === null) return;
    let cancelled = false;
    const locKey = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    setStatus("loading");
    void (async () => {
      try {
        const weather = await fetchWeather(location, effective.units);
        if (cancelled) return;
        lastGoodRef.current = { weather, key: locKey, units: effective.units };
        setData(weather);
        setUpdatedAt(Date.now());
        setError(null);
        setStale(false);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const cache = lastGoodRef.current;
        if (cache !== null && cache.units === effective.units && cache.key === locKey) {
          setData(cache.weather);
          setError(message);
          setStale(true);
          setStatus("ready");
        } else {
          setData(null);
          setError(message);
          setStale(false);
          setStatus("error");
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [effective.enabled, effective.units, location, tick]);
  (0, import_react2.useEffect)(() => {
    if (!effective.enabled) return;
    const minutes = Math.max(5, effective.refreshMinutes);
    const id = window.setInterval(() => setTick((n) => n + 1), minutes * 6e4);
    return () => window.clearInterval(id);
  }, [effective.refreshMinutes, effective.enabled]);
  (0, import_react2.useEffect)(() => {
    let timer = 0;
    const refresh = () => {
      setNow(/* @__PURE__ */ new Date());
      timer = window.setTimeout(refresh, 6e4 - Date.now() % 6e4 + 20);
    };
    timer = window.setTimeout(refresh, 6e4 - Date.now() % 6e4 + 20);
    return () => window.clearTimeout(timer);
  }, []);
  (0, import_react2.useEffect)(() => {
    if (effective.alertsEnabled && typeof Notification !== "undefined" && Notification.permission === "default") {
      void Notification.requestPermission();
    }
  }, [effective.alertsEnabled]);
  (0, import_react2.useEffect)(() => {
    if (!effective.alertsEnabled || data === null) return;
    const unit2 = effective.units === "fahrenheit" ? "\xB0F" : "\xB0C";
    const fmtLocal = (value) => `${Math.round(value)}${unit2}`;
    const alerts2 = evaluateAlerts(data, fmtLocal);
    const rain = data.rainSoon;
    if (rain !== void 0 && !rain.rainingNow && rain.onsetMinutes !== void 0 && rain.onsetMinutes <= 60) {
      alerts2.push({
        key: "rain-soon",
        level: "warning",
        title: "\u5373\u5C06\u964D\u96E8",
        detail: `\u9884\u8BA1 ${Math.max(15, Math.round(rain.onsetMinutes / 5) * 5)} \u5206\u949F\u540E\u5F00\u59CB\u4E0B\u96E8\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u4F1E`
      });
    }
    if (alerts2.length === 0) return;
    const key = alerts2.map((alert) => alert.key).sort().join("+");
    const now2 = Date.now();
    const dedupeMs = key.includes("-soon") ? 4 * 60 * 6e4 : 60 * 6e4;
    if (now2 - (notifiedAt.current.get(key) ?? 0) < dedupeMs) return;
    notifiedAt.current.set(key, now2);
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    try {
      new Notification(`\u26A0 ${data.location.name} \u5929\u6C14\u63D0\u9192`, {
        body: alerts2.map((alert) => `${alert.title}\uFF1A${alert.detail}`).join("\uFF1B"),
        tag: `dsh-weather-${key}`
      });
    } catch {
    }
  }, [data, effective.alertsEnabled, effective.units]);
  (0, import_react2.useEffect)(() => {
    if (!effective.enabled || data === null) {
      if (appTitle.current !== null) document.title = appTitle.current;
      return;
    }
    const prefixPattern = /^⛅ .*? — /;
    if (appTitle.current === null) {
      appTitle.current = prefixPattern.test(document.title) ? document.title.replace(prefixPattern, "") : document.title;
    }
    const titleUnit = effective.units === "fahrenheit" ? "\xB0F" : "\xB0C";
    const temp = `${Math.round(data.current.temperature)}${titleUnit}`;
    document.title = `\u26C5 ${temp} ${data.location.name} \u2014 ${appTitle.current}`;
    return () => {
      if (appTitle.current !== null) document.title = appTitle.current;
    };
  }, [data, effective.enabled, effective.units]);
  if (!effective.enabled) return null;
  const unit = effective.units === "fahrenheit" ? "\xB0F" : "\xB0C";
  const fmt = (value) => `${Math.round(value)}${unit}`;
  const condition = data !== null ? describeCondition(data.current.weatherCode, data.current.isDay) : null;
  const name = location?.name ?? (effective.locationMode === "manual" ? effective.cityName ?? "\u5F53\u524D\u4F4D\u7F6E" : "\u5B9A\u4F4D\u4E2D\u2026");
  const nowTime = clockTime(now);
  const nowDate = clockDate(now);
  const busyText = status === "locating" ? "\u5B9A\u4F4D\u4E2D\u2026" : status === "loading" ? "\u52A0\u8F7D\u4E2D\u2026" : status === "error" ? "\u52A0\u8F7D\u5931\u8D25" : null;
  const showTemp = status === "ready" && data !== null;
  const barIcon = status === "ready" && data !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WeatherIcon, { code: data.current.weatherCode, isDay: data.current.isDay, size: 17 }) : /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "pin", size: 15 });
  const chipTitle = [
    name,
    showTemp && condition !== null ? condition.label : void 0,
    showTemp ? fmt(data.current.temperature) : void 0,
    `${nowDate} ${nowTime}`
  ].filter((part) => typeof part === "string").join(" \xB7 ");
  const weekly = data?.daily ?? [];
  const weekMin = weekly.length > 0 ? Math.min(...weekly.map((d) => d.tempMin)) : 0;
  const weekMax = weekly.length > 0 ? Math.max(...weekly.map((d) => d.tempMax)) : 1;
  const weekSpan = weekMax - weekMin || 1;
  const alerts = data !== null ? evaluateAlerts(data, fmt) : [];
  const hasDanger = alerts.some((alert) => alert.level === "danger");
  const air = data?.air;
  const airInfo = air !== void 0 ? aqiInfo(air.aqi) : null;
  const advice = data !== null ? weatherAdvice(data) : null;
  const windSuffix = effective.units === "celsius" ? "km/h" : "mph";
  const cur = data?.current;
  const windDeg = cur?.windDirection;
  const windText = windDeg !== void 0 ? windDirectionText(windDeg) : void 0;
  const gustValue = cur?.windGusts;
  const gustText = gustValue !== void 0 ? `${Math.round(gustValue)} ${windSuffix}` : void 0;
  const dewValue = cur?.dewPoint;
  const dewPointText = dewValue !== void 0 ? `${Math.round(dewValue)}${unit}` : void 0;
  const pressureValue = cur?.pressure;
  const pressureText = pressureValue !== void 0 ? `${Math.round(pressureValue)} hPa` : void 0;
  const visibilityValue = cur?.visibility;
  const visibilityText = visibilityValue !== void 0 ? `${Math.round(visibilityValue)} km` : void 0;
  const cloudValue = cur?.cloudCover;
  const cloudText = cloudValue !== void 0 ? `${Math.round(cloudValue)}%` : void 0;
  const rainTotal = data?.daily[0]?.precipSum;
  const rainTotalText = rainTotal !== void 0 && rainTotal >= 0.05 ? `${rainTotal.toFixed(1)} mm` : void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      ref: barRef,
      className: "dshw-root",
      style: {
        position: "relative",
        display: "inline-flex",
        fontSize: 13
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "button",
          {
            type: "button",
            className: "dshw-bar",
            onClick: togglePopover,
            "aria-expanded": open,
            title: chipTitle,
            style: {
              ...baseButton,
              display: "flex",
              alignItems: "baseline",
              gap: 6,
              background: TOKEN.bgSoft,
              color: TOKEN.fg,
              border: `1px solid ${TOKEN.border}`,
              borderRadius: 999,
              padding: "3px 10px 3px 5px",
              cursor: "pointer",
              maxWidth: "min(280px, 42vw)",
              textAlign: "left"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                "span",
                {
                  style: {
                    flex: "0 0 auto",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 24,
                    height: 24,
                    borderRadius: "50%",
                    background: TOKEN.bg,
                    border: `1px solid ${TOKEN.border}`,
                    color: TOKEN.fg,
                    alignSelf: "center"
                  },
                  children: barIcon
                }
              ),
              showTemp ? /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 17, fontWeight: 700, lineHeight: "22px", ...NUM, flex: "0 0 auto" }, children: fmt(data.current.temperature) }),
                condition !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 14, lineHeight: "20px", color: TOKEN.fgMuted, whiteSpace: "nowrap", flex: "0 0 auto" }, children: condition.label })
              ] }) : busyText !== null ? /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 14, lineHeight: "20px", color: TOKEN.fgMuted, whiteSpace: "nowrap", ...status === "error" ? { color: TOKEN.danger } : {} }, children: busyText }) : null,
              /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                "span",
                {
                  style: {
                    flex: "0 0 auto",
                    fontSize: 14,
                    lineHeight: "20px",
                    color: TOKEN.fgMuted,
                    whiteSpace: "nowrap",
                    paddingLeft: 8,
                    borderLeft: `1px solid ${TOKEN.border}`,
                    ...NUM
                  },
                  children: [
                    nowDate,
                    " ",
                    nowTime
                  ]
                }
              )
            ]
          }
        ),
        open && pop !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "div",
          {
            className: "dshw-popover",
            style: {
              position: "absolute",
              top: "calc(100% + 8px)",
              zIndex: 60,
              ...pop.align === "start" ? { left: 0 } : { right: 0 },
              width: pop.width,
              maxWidth: "calc(100vw - 24px)",
              maxHeight: "calc(100vh - 150px)",
              overflowY: "auto",
              background: TOKEN.bg,
              color: TOKEN.fg,
              border: `1px solid ${TOKEN.border}`,
              borderRadius: 16,
              boxShadow: "0 16px 48px rgba(0, 0, 0, 0.28)",
              padding: 14,
              fontSize: 13.5,
              textAlign: "left"
            },
            children: [
              status === "error" && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { marginBottom: 10 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: TOKEN.danger }, children: error ?? "\u52A0\u8F7D\u5931\u8D25" }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                  "button",
                  {
                    type: "button",
                    onClick: () => {
                      bypassCacheRef.current = true;
                      setRelocateTick((n) => n + 1);
                    },
                    style: actionButton,
                    children: "\u27F3 \u91CD\u8BD5"
                  }
                )
              ] }),
              status === "ready" && data !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "pin", size: 14 }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: name }),
                    location?.source === "gps" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "0 0 auto", fontSize: 9.5, fontWeight: 700, color: TOKEN.accent, border: `1px solid ${TOKEN.accent}`, borderRadius: 999, padding: "0 5px", lineHeight: "14px" }, children: "GPS" }),
                    location?.source === "ip" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { flex: "0 0 auto", fontSize: 9.5, fontWeight: 700, color: TOKEN.fgMuted, border: `1px solid ${TOKEN.border}`, borderRadius: 999, padding: "0 5px", lineHeight: "14px" }, children: "IP" })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => setTick((n) => n + 1), title: "\u5237\u65B0", style: iconButton, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "refresh", size: 14 }) })
                ] }),
                stale && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, lineHeight: "17px", color: "#b45309", background: "rgba(180, 83, 9, 0.1)", border: "1px solid rgba(180, 83, 9, 0.28)", borderRadius: 10, padding: "6px 10px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { flex: "1 1 auto", minWidth: 0 }, children: [
                    "\u6570\u636E\u66F4\u65B0\u5931\u8D25",
                    error !== null ? `\uFF08${error}\uFF09` : "",
                    "\uFF0C\u663E\u793A ",
                    updatedAt !== null ? `${hhmm(updatedAt)} \u7684` : "\u4E0A\u6B21",
                    "\u5FEB\u7167"
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("button", { type: "button", onClick: () => setTick((n) => n + 1), style: actionButton, children: "\u27F3 \u91CD\u8BD5" })
                ] }),
                alerts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      marginBottom: 10,
                      fontSize: 12,
                      lineHeight: "17px",
                      color: hasDanger ? "#d5484d" : "#b45309",
                      background: hasDanger ? "rgba(213, 72, 77, 0.1)" : "rgba(180, 83, 9, 0.1)",
                      border: `1px solid ${hasDanger ? "rgba(213, 72, 77, 0.3)" : "rgba(180, 83, 9, 0.28)"}`,
                      borderRadius: 10,
                      padding: "6px 10px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: "\u26A0" }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: alerts.map((a) => `${a.title}\uFF1A${a.detail}`).join("\uFF1B") })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "hero-stats", style: { display: "flex", alignItems: "center", gap: 18, marginTop: 4 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, background: TOKEN.bgSoft, border: `1px solid ${TOKEN.border}` }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WeatherIcon, { code: data.current.weatherCode, isDay: data.current.isDay, size: 36 }) }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { minWidth: 0 }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 30, fontWeight: 700, lineHeight: "34px", ...NUM }, children: fmt(data.current.temperature) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: 12.5, color: TOKEN.fgMuted, lineHeight: "17px", marginTop: 1 }, children: [
                        condition?.label,
                        " \xB7 \u4F53\u611F ",
                        fmt(data.current.apparentTemperature)
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StatChip, { icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "droplet", size: 13 }), label: "\u6E7F\u5EA6", value: `${Math.round(data.current.humidity)}%` }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StatChip, { icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "wind", size: 13 }), label: "\u98CE\u901F", value: `${Math.round(data.current.windSpeed)}`, suffix: effective.units === "celsius" ? "km/h" : "mph" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(StatChip, { icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "umbrella", size: 13 }), label: "\u4ECA\u65E5\u964D\u6C34", value: `${data.daily[0]?.precipProb ?? 0}%` }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      StatChip,
                      {
                        icon: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "wind", size: 13 }),
                        label: "\u7A7A\u6C14",
                        value: airInfo !== null && air !== void 0 ? `${airInfo.label} ${air.aqi}` : "--",
                        valueColor: airInfo?.color
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "today", style: { display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 12, fontSize: 12, color: TOKEN.fgMuted }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "sunrise", size: 14 }),
                    " ",
                    timeLabel(data.sunrise)
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "sunset", size: 14 }),
                    " ",
                    timeLabel(data.sunset)
                  ] }),
                  data.uvIndexMax !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "sun", size: 14 }),
                    " UV ",
                    Math.round(data.uvIndexMax),
                    " ",
                    uvLevel(data.uvIndexMax)
                  ] }),
                  air !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    "PM2.5 ",
                    Math.round(air.pm25)
                  ] }),
                  windText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "wind", size: 14 }),
                    " ",
                    windText
                  ] }),
                  gustText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "wind", size: 14 }),
                    " \u9635\u98CE ",
                    gustText
                  ] }),
                  dewPointText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "droplet", size: 14 }),
                    " \u9732\u70B9 ",
                    dewPointText
                  ] }),
                  pressureText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "gauge", size: 14 }),
                    " \u6C14\u538B ",
                    pressureText
                  ] }),
                  visibilityText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "eye", size: 14 }),
                    " \u80FD\u89C1\u5EA6 ",
                    visibilityText
                  ] }),
                  cloudText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "cloud", size: 14 }),
                    " \u4E91\u91CF ",
                    cloudText
                  ] }),
                  rainTotalText !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(Glyph, { name: "droplet", size: 14 }),
                    " \u4ECA\u65E5\u96E8\u91CF ",
                    rainTotalText
                  ] })
                ] }),
                data.minutely !== void 0 && data.minutely.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "rain", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u672A\u6765 6 \u5C0F\u65F6\u964D\u6C34" }),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 12, fontWeight: 600, color: data.rainSoon?.rainingNow === true || data.rainSoon?.onsetMinutes !== void 0 ? TOKEN.accent : TOKEN.fgMuted }, children: rainTimingText(data.rainSoon ?? { rainingNow: false }) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(RainStrip, { points: data.minutely })
                ] }),
                advice !== null && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "advice", style: { display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12.5, color: TOKEN.fgMuted, background: TOKEN.bgSoft, borderRadius: 10, padding: "8px 12px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: advice.icon }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { children: advice.text })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "trend", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 4 }, children: "\u672A\u6765 24 \u5C0F\u65F6\u6E29\u5EA6" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    TrendChart,
                    {
                      values: data.hourly.map((point) => point.temperature),
                      labels: data.hourly.map((point) => hourLabel(point.time)),
                      unit,
                      height: 56
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "hourly", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }, children: "\u672A\u6765 12 \u5C0F\u65F6" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }, children: data.hourly.slice(0, 12).map((point, index) => {
                    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "0 0 auto", width: 46, textAlign: "center", background: TOKEN.bgSoft, borderRadius: 10, padding: "5px 2px" }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 11, color: TOKEN.fgMuted, ...NUM }, children: hourLabel(point.time) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { margin: "2px 0" }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WeatherIcon, { code: point.weatherCode, isDay: true, size: 18 }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12.5, fontWeight: 600, ...NUM }, children: fmt(point.temperature) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { fontSize: 10, color: point.precipProb > 0 ? "#4f8cff" : "transparent", ...NUM }, children: [
                        point.precipProb,
                        "%"
                      ] })
                    ] }, index);
                  }) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { "data-block": "daily", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }, children: "\u672A\u6765 7 \u5929" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { children: weekly.map((point, index) => {
                    const left = (point.tempMin - weekMin) / weekSpan * 100;
                    const width = Math.max(8, (point.tempMax - point.tempMin) / weekSpan * 100);
                    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 10, padding: "3px 2px", borderBottom: index === weekly.length - 1 ? "none" : `1px solid ${TOKEN.border}`, fontSize: 12.5 }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { width: 44, flex: "0 0 auto", ...NUM }, children: dayLabel(point.date) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { width: 20, textAlign: "center", flex: "0 0 auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(WeatherIcon, { code: point.weatherCode, isDay: true, size: 18 }) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { width: 36, flex: "0 0 auto", textAlign: "right", fontSize: 11, color: point.precipProb > 0 ? "#4f8cff" : TOKEN.fgMuted, ...NUM }, children: [
                        point.precipProb,
                        "%"
                      ] }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { width: 36, flex: "0 0 auto", textAlign: "right", color: TOKEN.fgMuted, ...NUM }, children: fmt(point.tempMin) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { position: "relative", flex: 1, height: 4, borderRadius: 2, background: TOKEN.bgSoft, overflow: "hidden" }, children: /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                        "span",
                        {
                          style: {
                            position: "absolute",
                            left: `${left}%`,
                            width: `${width}%`,
                            top: 0,
                            bottom: 0,
                            borderRadius: 3,
                            background: `linear-gradient(90deg, ${TOKEN.accent}, #fbbf24)`
                          }
                        }
                      ) }),
                      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { width: 38, flex: "0 0 auto", textAlign: "right", fontWeight: 600, ...NUM }, children: fmt(point.tempMax) })
                    ] }, index);
                  }) })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TOKEN.border}` }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u5355\u4F4D" }),
                  /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { display: "flex", background: TOKEN.bgSoft, borderRadius: 999, padding: 2 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: () => void scope.set("units", "celsius"),
                        style: { ...segmentButton, fontWeight: effective.units === "celsius" ? 700 : 400, background: effective.units === "celsius" ? TOKEN.bg : "transparent" },
                        children: "\xB0C"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                      "button",
                      {
                        type: "button",
                        onClick: () => void scope.set("units", "fahrenheit"),
                        style: { ...segmentButton, fontWeight: effective.units === "fahrenheit" ? 700 : 400, background: effective.units === "fahrenheit" ? TOKEN.bg : "transparent" },
                        children: "\xB0F"
                      }
                    )
                  ] }),
                  effective.locationMode === "auto" && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
                    "button",
                    {
                      type: "button",
                      onClick: () => {
                        bypassCacheRef.current = true;
                        setRelocateTick((n) => n + 1);
                      },
                      style: actionButton,
                      children: "\u{1F4CD} \u91CD\u65B0\u5B9A\u4F4D"
                    }
                  )
                ] })
              ] }),
              (status === "idle" || status === "locating" || status === "loading") && /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { color: TOKEN.fgMuted, textAlign: "center", padding: 20 }, children: status === "idle" ? "\u5C1A\u672A\u542F\u7528" : "\u5929\u6C14\u52A0\u8F7D\u4E2D\u2026" })
            ]
          }
        )
      ]
    }
  );
}
function hhmm(millis) {
  const date = new Date(millis);
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function clockTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function clockDate(date) {
  return `${date.getMonth() + 1}\u6708${date.getDate()}\u65E5`;
}
function RainStrip(props) {
  const { points } = props;
  const maxValue = Math.max(...points.map((point) => point.precipitation), 0.5);
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { display: "flex", gap: 3, alignItems: "flex-end" }, children: points.map((point, index) => {
    const value = point.precipitation;
    const wet = value >= RAIN_MM_PER_15MIN;
    const height = wet ? Math.max(8, Math.min(30, 6 + value / maxValue * 24)) : 4;
    const color = !wet ? "var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))" : value >= 2.5 ? "#3b82f6" : value >= 1 ? "#60a5fa" : "#93c5fd";
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("div", { style: { flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
        "div",
        {
          title: `${timeLabel(point.time)} ${value.toFixed(1)} mm`,
          style: { width: "100%", maxWidth: 14, height, borderRadius: 3, background: color, transition: "height 0.2s ease" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 9, lineHeight: "12px", color: TOKEN.fgMuted, whiteSpace: "nowrap" }, children: index % 4 === 0 ? timeLabel(point.time) : "" })
    ] }, index);
  }) });
}
function StatChip(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
    "div",
    {
      style: {
        flex: "1 1 0",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 1,
        background: TOKEN.bgSoft,
        borderRadius: 10,
        padding: props.compact === true ? "6px 2px" : "7px 4px",
        border: `1px solid ${TOKEN.border}`,
        overflow: "hidden"
      },
      children: [
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { color: TOKEN.fgMuted }, children: props.icon }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("span", { style: { fontSize: 10, color: TOKEN.fgMuted, lineHeight: "13px" }, children: props.label }),
        /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(
          "span",
          {
            style: {
              fontSize: props.compact === true ? 12.5 : 12.5,
              fontWeight: 600,
              lineHeight: "16px",
              whiteSpace: "nowrap",
              textOverflow: "ellipsis",
              maxWidth: "100%",
              ...NUM,
              ...props.valueColor === void 0 ? {} : { color: props.valueColor }
            },
            children: [
              props.value,
              props.suffix !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("span", { style: { fontSize: "0.8em", fontWeight: 400, marginLeft: 1 }, children: [
                " ",
                props.suffix
              ] })
            ]
          }
        )
      ]
    }
  );
}
var baseButton = {
  fontFamily: "inherit"
};
var iconButton = {
  ...baseButton,
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  width: 28,
  height: 28,
  borderRadius: 8,
  background: "transparent",
  color: TOKEN.fgMuted,
  border: "none",
  cursor: "pointer"
};
var actionButton = {
  ...baseButton,
  background: TOKEN.bgSoft,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "5px 13px",
  fontSize: 12.5,
  cursor: "pointer"
};
var segmentButton = {
  ...baseButton,
  border: "none",
  borderRadius: 999,
  padding: "4px 13px",
  fontSize: 12.5,
  color: TOKEN.fg,
  cursor: "pointer"
};

// src/client/WeatherSettings.tsx
var import_react3 = require("react");
var import_jsx_runtime4 = require("react/jsx-runtime");
var FG = "var(--dshw-fg, #1f2328)";
var MUTED2 = "var(--dshw-fg-muted, #5f6672)";
var BORDER = "var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))";
var BG_ROW = "var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.03))";
var ACCENT2 = "var(--dsw-alias-brand-primary, #4f8cff)";
function WeatherSettingsSection(props) {
  const { scope } = props;
  const [config, setConfig] = (0, import_react3.useState)(() => scope.getSnapshot().value);
  const [search, setSearch] = (0, import_react3.useState)("");
  const [suggestions, setSuggestions] = (0, import_react3.useState)([]);
  const [searching, setSearching] = (0, import_react3.useState)(false);
  const [notice, setNotice] = (0, import_react3.useState)(null);
  const [diag, setDiag] = (0, import_react3.useState)(null);
  (0, import_react3.useEffect)(() => {
    const sync = () => setConfig(scope.getSnapshot().value);
    sync();
    return scope.subscribe(sync);
  }, [scope]);
  (0, import_react3.useEffect)(() => {
    const trimmed = search.trim();
    if (trimmed === "") {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = window.setTimeout(() => {
      setSearching(true);
      void searchCity(trimmed, 5).then((results) => {
        if (!cancelled) setSuggestions(results);
      }).catch(() => {
        if (!cancelled) setSuggestions([]);
      }).finally(() => {
        if (!cancelled) setSearching(false);
      });
    }, 250);
    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [search]);
  const effective = config ?? DEFAULT_WEATHER_CONFIG;
  const snapshot = scope.getSnapshot();
  const writable = snapshot.writable;
  const set = (field, value) => {
    if (!writable) {
      setNotice("\u5F53\u524D\u8FDE\u63A5\u672A\u5F00\u653E\u8BBE\u7F6E\u6301\u4E45\u5316\uFF0C\u6539\u52A8\u4EC5\u5728\u672C\u6B21\u4F1A\u8BDD\u751F\u6548");
      return;
    }
    void scope.set(field, value).catch(() => setNotice("\u5199\u5165\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5"));
  };
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { maxWidth: 560, padding: "4px 0 20px", color: FG }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 }, children: "\u5929\u6C14" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: MUTED2, fontSize: 12.5, marginBottom: 16 }, children: "\u4F1A\u8BDD\u9876\u90E8\u64CD\u4F5C\u884C\u7684\u5929\u6C14 chip\uFF08\u6570\u636E\u6765\u6E90\uFF1AOpen-Meteo\uFF0C\u65E0\u9700 API key\uFF09\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u663E\u793A\u5929\u6C14\u680F", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        type: "checkbox",
        checked: effective.enabled,
        onChange: (event) => set("enabled", event.target.checked),
        style: checkbox
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u6076\u52A3\u5929\u6C14\u63D0\u9192", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        type: "checkbox",
        checked: effective.alertsEnabled,
        onChange: (event) => {
          set("alertsEnabled", event.target.checked);
          if (event.target.checked && typeof Notification !== "undefined" && Notification.permission === "default") {
            void Notification.requestPermission();
          }
        },
        style: checkbox
      }
    ) }),
    effective.alertsEnabled && typeof Notification !== "undefined" && Notification.permission === "denied" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: "#d43c3c", fontSize: 12, margin: "-2px 0 10px 12px" }, children: "\u901A\u77E5\u6743\u9650\u5DF2\u88AB\u6D4F\u89C8\u5668\u62D2\u7EDD\uFF0C\u8BF7\u5728\u7AD9\u70B9\u8BBE\u7F6E\u4E2D\u5141\u8BB8\u540E\u91CD\u65B0\u5F00\u542F\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: MUTED2, fontSize: 12, margin: "-2px 0 10px 12px" }, children: "\u5F3A\u964D\u96E8 / \u96F7\u66B4 / \u9AD8\u6E29 / \u5927\u98CE / \u5F3A\u964D\u96EA\u65F6\u53D1\u9001\u6D4F\u89C8\u5668\u901A\u77E5\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u5B9A\u4F4D\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-weather-location-mode",
            checked: effective.locationMode === "auto",
            onChange: () => set("locationMode", "auto")
          }
        ),
        "\u81EA\u52A8\uFF08GPS \u5B9A\u4F4D\uFF0C\u5931\u8D25\u56DE\u9000 IP\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-weather-location-mode",
            checked: effective.locationMode === "manual",
            onChange: () => set("locationMode", "manual")
          }
        ),
        "\u624B\u52A8"
      ] })
    ] }) }),
    effective.locationMode === "manual" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u57CE\u5E02\u641C\u7D22", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { position: "relative", flex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "text",
            value: search,
            placeholder: "\u8F93\u5165\u57CE\u5E02\u540D\uFF0C\u5982\uFF1A\u5317\u4EAC / Beijing",
            onChange: (event) => setSearch(event.target.value),
            style: input
          }
        ),
        searching && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { position: "absolute", right: 8, top: 7, fontSize: 12, color: MUTED2 }, children: "\u641C\u7D22\u4E2D\u2026" }),
        suggestions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { position: "absolute", top: "calc(100% + 4px)", left: 0, right: 0, background: "var(--dsw-alias-bg-layer-1, #ffffff)", border: `1px solid ${BORDER}`, borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.12)", zIndex: 10, overflow: "hidden" }, children: suggestions.map((place, index) => /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
          "button",
          {
            type: "button",
            onClick: () => {
              set("cityName", place.name);
              set("latitude", place.latitude);
              set("longitude", place.longitude);
              setSearch(place.name);
              setSuggestions([]);
            },
            style: { display: "block", width: "100%", textAlign: "left", padding: "8px 12px", background: "transparent", border: "none", cursor: "pointer", fontSize: 13, color: FG },
            children: [
              place.name,
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { color: MUTED2, fontSize: 12 }, children: [
                "\u3000",
                place.latitude.toFixed(2),
                ", ",
                place.longitude.toFixed(2)
              ] })
            ]
          },
          index
        )) })
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u7EAC\u5EA6 / \u7ECF\u5EA6", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "number",
            step: "0.0001",
            value: effective.latitude ?? "",
            placeholder: "\u7EAC\u5EA6",
            onChange: (event) => set("latitude", event.target.value === "" ? void 0 : Number(event.target.value)),
            style: { ...input, width: 120 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { color: MUTED2 }, children: "/" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "input",
          {
            type: "number",
            step: "0.0001",
            value: effective.longitude ?? "",
            placeholder: "\u7ECF\u5EA6",
            onChange: (event) => set("longitude", event.target.value === "" ? void 0 : Number(event.target.value)),
            style: { ...input, width: 120 }
          }
        )
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u663E\u793A\u540D\u79F0", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
        "input",
        {
          type: "text",
          value: effective.cityName ?? "",
          placeholder: "\u5982\uFF1A\u5317\u4EAC",
          onChange: (event) => set("cityName", event.target.value === "" ? void 0 : event.target.value),
          style: input
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: "\u6E29\u5EA6\u5355\u4F4D", children: /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "radio", name: "dsh-weather-units", checked: effective.units === "celsius", onChange: () => set("units", "celsius") }),
        "\u6444\u6C0F \xB0C"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("input", { type: "radio", name: "dsh-weather-units", checked: effective.units === "fahrenheit", onChange: () => set("units", "fahrenheit") }),
        "\u534E\u6C0F \xB0F"
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Row, { label: `\u5237\u65B0\u95F4\u9694\uFF08\u5206\u949F\uFF0C\u5F53\u524D ${effective.refreshMinutes}\uFF09`, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
      "input",
      {
        type: "range",
        min: 5,
        max: 120,
        step: 5,
        value: effective.refreshMinutes,
        onChange: (event) => set("refreshMinutes", Number(event.target.value)),
        style: { flex: 1, accentColor: ACCENT2 }
      }
    ) }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: "#d43c3c", fontSize: 12.5, marginTop: 8 }, children: notice }),
    snapshot.mode === "memory" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: MUTED2, fontSize: 12.5, marginTop: 8 }, children: "\u5F53\u524D\u8FDE\u63A5\u4E3A\u8FDB\u7A0B\u5185\u6A21\u5F0F\uFF0C\u914D\u7F6E\u4EC5\u5728\u672C\u6B21\u4F1A\u8BDD\u751F\u6548\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginTop: 20, fontSize: 12, lineHeight: "19px", color: MUTED2, background: BG_ROW, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontWeight: 600, color: FG }, children: "\u5B9A\u4F4D\u8BCA\u65AD" }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
          "button",
          {
            type: "button",
            onClick: () => {
              setDiag(null);
              void runLocationDiagnostics().then(setDiag);
            },
            style: inputButton,
            children: "\u91CD\u65B0\u68C0\u6D4B"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
        "\u914D\u7F6E\u5750\u6807\uFF1A",
        effective.locationMode === "manual" ? `${effective.latitude?.toFixed(3) ?? "--"}, ${effective.longitude?.toFixed(3) ?? "--"}\uFF08\u624B\u52A8\uFF1A${effective.cityName ?? "\u672A\u8BBE\u7F6E"}\uFF09` : effective.autoLatitude !== void 0 ? `${effective.autoLatitude.toFixed(3)}, ${effective.autoLongitude?.toFixed(3)}\uFF08\u7F13\u5B58\uFF1A${effective.autoCityName ?? ""}\uFF09` : "\u81EA\u52A8\u6A21\u5F0F\uFF08\u5C1A\u672A\u5B9A\u4F4D\uFF09"
      ] }),
      diag !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          "\u6D4F\u89C8\u5668 GPS\uFF1A",
          diag.gps.status === "ok" ? `${diag.gps.latitude?.toFixed(3)}, ${diag.gps.longitude?.toFixed(3)}${diag.gps.accuracy !== void 0 ? `\uFF08\u7CBE\u5EA6 \xB1${Math.round(diag.gps.accuracy)} m\uFF09` : ""}` : diag.gps.status
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          "IP \u5B9A\u4F4D\uFF1A",
          diag.ip.status === "ok" ? `${diag.ip.city}\uFF08${diag.ip.latitude?.toFixed(3)}, ${diag.ip.longitude?.toFixed(3)}\uFF09` : `\u5931\u8D25 ${diag.ip.error ?? ""}`
        ] }),
        diag.gpsIpDistanceKm !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          "GPS \u2194 IP \u8DDD\u79BB\uFF1A",
          Math.round(diag.gpsIpDistanceKm),
          " km"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { children: [
          "\u91C7\u7528\uFF1A",
          diag.chosen === "gps" ? `GPS\uFF08${precisionLabel(diag.precision)}\u7CBE\u5EA6\uFF09` : diag.chosen === "ip" ? "IP\uFF08\u6D4F\u89C8\u5668\u5B9A\u4F4D\u7F3A\u5931\u6216\u8FC7\u7C97\uFF09" : "\u65E0"
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { children: '\u70B9\u51FB"\u91CD\u65B0\u68C0\u6D4B"\u67E5\u770B GPS / IP \u5404\u81EA\u7684\u539F\u59CB\u7ED3\u679C\u3002' })
    ] })
  ] });
}
function precisionLabel(precision) {
  if (precision === "district") return "\u533A\u7EA7";
  if (precision === "city") return "\u5E02\u7EA7";
  return "\u672A\u5206\u7EA7";
}
function Row(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", marginBottom: 8, background: BG_ROW, borderRadius: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: 13, flex: "0 0 auto" }, children: props.label }),
    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 }, children: props.children })
  ] });
}
var checkbox = { width: 16, height: 16, accentColor: ACCENT2, cursor: "pointer" };
var radioLabel = {
  display: "flex",
  alignItems: "center",
  gap: 6,
  fontSize: 13,
  cursor: "pointer",
  whiteSpace: "nowrap"
};
var input = {
  fontFamily: "inherit",
  fontSize: 13,
  color: FG,
  background: "var(--dsw-alias-bg-layer-1, #ffffff)",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 10px",
  outline: "none",
  minWidth: 0,
  boxSizing: "border-box"
};
var inputButton = {
  fontFamily: "inherit",
  fontSize: 13,
  color: FG,
  background: "transparent",
  border: `1px solid ${BORDER}`,
  borderRadius: 8,
  padding: "6px 16px",
  cursor: "pointer"
};

// src/client/styles.ts
function ensureWeatherStyles() {
  if (typeof document === "undefined") return;
  const id = "dsh-weather-styles";
  if (document.getElementById(id) !== null) return;
  const style = document.createElement("style");
  style.id = id;
  style.textContent = [
    "@keyframes dshw-pop-in {",
    "  from { opacity: 0; transform: translateY(8px) scale(0.97); }",
    "  to { opacity: 1; transform: translateY(0) scale(1); }",
    "}",
    // Plugin text colors: dark text on the light palette, PURE WHITE in dark
    // mode (the harness marks dark mode with body[data-ds-dark-theme]).
    // Defined document-wide (not under .dshw-root) so both the weather chip and
    // the settings page (rendered inside the DSH Settings panel, outside the
    // chip's root) resolve them. Direct colors avoid a var()-chain that would
    // become guaranteed-invalid if an alias token were ever missing.
    ":root {",
    "  --dshw-fg: #1f2328;",
    "  --dshw-fg-muted: #5f6672;",
    "}",
    "body[data-ds-dark-theme] {",
    "  --dshw-fg: #ffffff;",
    "  --dshw-fg-muted: rgba(255, 255, 255, 0.8);",
    "}",
    // The chip lives inside the conversation header, so hover only brightens —
    // a translate would nudge the header row mid-layout.
    ".dshw-bar { transition: filter 0.15s ease, background-color 0.15s ease; }",
    ".dshw-bar:hover { filter: brightness(1.08); }",
    ".dshw-popover { animation: dshw-pop-in 0.15s ease; }"
  ].join("\n");
  document.head.appendChild(style);
}

// src/client/index.tsx
var inject = ["slots", "settingsScope"];
function apply(ctx) {
  ensureWeatherStyles();
  const scope = ctx.settingsScope.bind({
    namespace: WEATHER_NS,
    decode: (section) => section
  });
  ctx.slots.inject("conversation.session.header.actions", () => ctx.slots.register({
    name: "conversation.session.header.actions",
    id: "weather",
    order: 30,
    inject: () => ({ scope })
  }, WeatherBar));
  ctx.slots.inject("settings.section", () => ctx.slots.register({
    name: "settings.section",
    id: "weather",
    order: 90,
    label: "\u5929\u6C14",
    inject: () => ({ scope })
  }, WeatherSettingsSection));
}
return module.exports;
} });
