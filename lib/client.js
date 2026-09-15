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
var MAX_SAVED_LOCATIONS = 8;
var MAX_NAME_LENGTH = 40;
var MAX_ID_LENGTH = 64;
var BRIEF_TIMES = { morning: "08:00", evening: "20:00" };
var CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
var DEFAULT_WEATHER_CONFIG = {
  enabled: true,
  locationMode: "auto",
  units: "celsius",
  refreshMinutes: 15,
  alertsEnabled: false,
  briefEnabled: false,
  briefMorning: BRIEF_TIMES.morning,
  briefEvening: BRIEF_TIMES.evening
};
function parseClockTime(value) {
  if (typeof value !== "string") return void 0;
  const match = CLOCK_TIME_PATTERN.exec(value.trim());
  return match === null ? void 0 : `${match[1]}:${match[2]}`;
}
var REFRESH_RANGE = { min: 5, max: 120, step: 5 };
var LAT_RANGE = { min: -90, max: 90 };
var LON_RANGE = { min: -180, max: 180 };
var UNSAFE_TEXT_RE = /[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u202A-\u202E\u2066-\u2069\uFEFF]/g;
function sanitizeText(value, maxLength = MAX_NAME_LENGTH) {
  if (typeof value !== "string") return void 0;
  const cleaned = value.replace(UNSAFE_TEXT_RE, "").trim();
  if (cleaned === "") return void 0;
  if (cleaned.length <= maxLength) return cleaned;
  return Array.from(cleaned).slice(0, maxLength).join("");
}
function placeKey(latitude, longitude) {
  const fixed = (value) => (value === 0 ? 0 : value).toFixed(3);
  return `${fixed(latitude)},${fixed(longitude)}`;
}
function sanitizeSavedLocations(input2) {
  if (!Array.isArray(input2)) return [];
  const seenIds = /* @__PURE__ */ new Set();
  const seenPlaces = /* @__PURE__ */ new Set();
  const out = [];
  for (const entry of input2) {
    if (typeof entry !== "object" || entry === null) continue;
    const candidate = entry;
    const id = sanitizeText(candidate.id, MAX_ID_LENGTH);
    const name = sanitizeText(candidate.name);
    const latitude = typeof candidate.latitude === "number" && Number.isFinite(candidate.latitude) ? candidate.latitude : NaN;
    const longitude = typeof candidate.longitude === "number" && Number.isFinite(candidate.longitude) ? candidate.longitude : NaN;
    if (id === void 0 || name === void 0 || Number.isNaN(latitude) || Number.isNaN(longitude)) continue;
    if (latitude < LAT_RANGE.min || latitude > LAT_RANGE.max) continue;
    if (longitude < LON_RANGE.min || longitude > LON_RANGE.max) continue;
    if (seenIds.has(id)) continue;
    const key = placeKey(latitude, longitude);
    if (seenPlaces.has(key)) continue;
    seenIds.add(id);
    seenPlaces.add(key);
    out.push({ id, name, latitude, longitude });
    if (out.length >= MAX_SAVED_LOCATIONS) break;
  }
  return out;
}
function sameConfig(a, b) {
  if (a === b) return true;
  if (a === void 0 || b === void 0) return false;
  return JSON.stringify(a) === JSON.stringify(b);
}
function sanitizeConfig(input2) {
  const raw = input2 ?? {};
  const pickNumber = (value) => typeof value === "number" && Number.isFinite(value) ? value : void 0;
  const pickString = (value, maxLength = MAX_NAME_LENGTH) => sanitizeText(value, maxLength);
  const clamp = (value, min, max) => Math.min(max, Math.max(min, value));
  const latitude = pickNumber(raw.latitude);
  const longitude = pickNumber(raw.longitude);
  const autoLatitude = pickNumber(raw.autoLatitude);
  const autoLongitude = pickNumber(raw.autoLongitude);
  const refreshMinutes = pickNumber(raw.refreshMinutes);
  const units = raw.units === "celsius" || raw.units === "fahrenheit" ? raw.units : DEFAULT_WEATHER_CONFIG.units;
  const locationMode = raw.locationMode === "auto" || raw.locationMode === "manual" ? raw.locationMode : DEFAULT_WEATHER_CONFIG.locationMode;
  const autoSource = raw.autoSource === "gps" || raw.autoSource === "ip" ? raw.autoSource : void 0;
  const savedLocations = sanitizeSavedLocations(raw.savedLocations);
  const activeSavedId = pickString(raw.activeSavedId, MAX_ID_LENGTH);
  const briefMorning = parseClockTime(raw.briefMorning) ?? BRIEF_TIMES.morning;
  const briefEvening = parseClockTime(raw.briefEvening) ?? BRIEF_TIMES.evening;
  return {
    enabled: typeof raw.enabled === "boolean" ? raw.enabled : DEFAULT_WEATHER_CONFIG.enabled,
    locationMode,
    latitude: latitude !== void 0 ? clamp(latitude, LAT_RANGE.min, LAT_RANGE.max) : void 0,
    longitude: longitude !== void 0 ? clamp(longitude, LON_RANGE.min, LON_RANGE.max) : void 0,
    cityName: pickString(raw.cityName),
    savedLocations,
    // An activeSavedId pointing at a vanished entry is dropped rather than kept
    // dangling (deleting the active city falls back to the manual/auto location).
    activeSavedId: activeSavedId !== void 0 && savedLocations.some((entry) => entry.id === activeSavedId) ? activeSavedId : void 0,
    units,
    refreshMinutes: refreshMinutes === void 0 ? DEFAULT_WEATHER_CONFIG.refreshMinutes : clamp(Math.round(refreshMinutes / REFRESH_RANGE.step) * REFRESH_RANGE.step, REFRESH_RANGE.min, REFRESH_RANGE.max),
    alertsEnabled: typeof raw.alertsEnabled === "boolean" ? raw.alertsEnabled : DEFAULT_WEATHER_CONFIG.alertsEnabled,
    briefEnabled: typeof raw.briefEnabled === "boolean" ? raw.briefEnabled : DEFAULT_WEATHER_CONFIG.briefEnabled,
    briefMorning,
    briefEvening,
    autoLatitude: autoLatitude !== void 0 ? clamp(autoLatitude, LAT_RANGE.min, LAT_RANGE.max) : void 0,
    autoLongitude: autoLongitude !== void 0 ? clamp(autoLongitude, LON_RANGE.min, LON_RANGE.max) : void 0,
    autoCityName: pickString(raw.autoCityName),
    autoSource
  };
}

// src/client/WeatherBar.tsx
var import_react3 = require("react");

// src/client/condition.ts
var CLEAR_CODES = /* @__PURE__ */ new Set([0, 1]);
var RAIN_CODES = /* @__PURE__ */ new Set([51, 53, 55, 56, 57, 61, 63, 65, 66, 67, 80, 81, 82]);
var THUNDER_CODES = /* @__PURE__ */ new Set([95, 96]);
var HEAVY_RAIN_CODES = /* @__PURE__ */ new Set([65, 82, 99]);
var HEAVY_SNOW_CODES = /* @__PURE__ */ new Set([75, 86]);
var PRECIP_CODES = /* @__PURE__ */ new Set([...RAIN_CODES, ...THUNDER_CODES, ...HEAVY_RAIN_CODES]);
var STORM_CODES = /* @__PURE__ */ new Set([...HEAVY_RAIN_CODES, ...THUNDER_CODES]);
var HEAT_C = 35;
var COLD_C = 0;
var WIND_ALERT_KMH = 60;
var WIND_ADVICE_KMH = 40;
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
function dayLabel(iso, index = 0) {
  if (index === 0) return "\u4ECA\u5929";
  if (index === 1) return "\u660E\u5929";
  if (index === 2) return "\u540E\u5929";
  const date = /* @__PURE__ */ new Date(`${iso}T00:00:00`);
  if (Number.isNaN(date.getTime())) return iso;
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
function weatherAdvice(data) {
  const current = data.current;
  const today = data.daily[0];
  const code = current.weatherCode;
  const isClear = CLEAR_CODES.has(code);
  const hasPrecip = PRECIP_CODES.has(code);
  if (hasPrecip) {
    return { icon: "\u2602\uFE0F", text: "\u6709\u964D\u6C34\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u4F1E" };
  }
  if (current.temperature >= HEAT_C) {
    return { icon: "\u{1F975}", text: "\u9AD8\u6E29\u5929\u6C14\uFF0C\u6CE8\u610F\u9632\u6691\u8865\u6C34" };
  }
  if (current.temperature <= COLD_C) {
    return { icon: "\u{1F9E3}", text: "\u4E25\u5BD2\u5929\u6C14\uFF0C\u6CE8\u610F\u9632\u5BD2\u4FDD\u6696" };
  }
  if (current.temperature >= 28 && isClear) {
    return { icon: "\u{1F60E}", text: "\u6674\u70ED\u5929\u6C14\uFF0C\u51FA\u95E8\u505A\u597D\u9632\u6652" };
  }
  if (isClear) {
    return { icon: "\u{1F31E}", text: "\u5929\u6C14\u6674\u597D\uFF0C\u9002\u5408\u6237\u5916\u6D3B\u52A8" };
  }
  if (current.windSpeed !== void 0 && current.windSpeed >= WIND_ADVICE_KMH) {
    return { icon: "\u{1F4A8}", text: "\u98CE\u529B\u8F83\u5927\uFF0C\u6CE8\u610F\u9AD8\u7A7A\u5760\u7269" };
  }
  if ((today?.precipProb ?? 0) >= 60) {
    return { icon: "\u{1F327}\uFE0F", text: "\u4ECA\u65E5\u964D\u6C34\u6982\u7387\u8F83\u9AD8\uFF0C\u5907\u597D\u96E8\u5177" };
  }
  if (data.air !== void 0 && data.air.aqi !== void 0 && data.air.aqi > 150) {
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
function rainOnsetRounded(minutes) {
  if (minutes < 1) return 1;
  if (minutes < 5) return 5;
  return Math.max(5, Math.round(minutes / 5) * 5);
}
function windDirectionText(degrees) {
  if (degrees === void 0) return void 0;
  const names = ["\u5317", "\u4E1C\u5317", "\u4E1C", "\u4E1C\u5357", "\u5357", "\u897F\u5357", "\u897F", "\u897F\u5317"];
  const index = Math.round((degrees % 360 + 360) % 360 / 45) % 8;
  return `${names[index]}\u98CE`;
}
function clockTime(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}
function clockDate(date) {
  return `${date.getMonth() + 1}\u6708${date.getDate()}\u65E5`;
}
function hhmm(millis) {
  return clockTime(new Date(millis));
}

// src/client/weather-api.ts
var DISTRICT_ACCURACY_M = 1e3;
var CITY_ACCURACY_M = 1e4;
var AUTO_LOCATION_DRIFT_KM = 50;
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
var REQUEST_TIMEOUT_MS = 1e4;
var IP_PROVIDER_TIMEOUT_MS = 6e3;
var AIR_TIMEOUT_MS = 5e3;
var GPS_TIMEOUT_MS = 6e3;
var FORECAST_DAYS = 7;
async function apiFetch(url, options = {}) {
  const controller = new AbortController();
  const { signal, timeoutMs = REQUEST_TIMEOUT_MS } = options;
  let timedOut = false;
  const abortFromOutside = () => controller.abort();
  if (signal !== void 0) {
    if (signal.aborted) controller.abort();
    else signal.addEventListener("abort", abortFromOutside, { once: true });
  }
  const timer = window.setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, timeoutMs);
  try {
    const res = await fetch(url, { signal: controller.signal });
    const text = await res.text();
    let json = null;
    if (text !== "") {
      try {
        json = JSON.parse(text);
      } catch {
        json = null;
      }
    }
    return { ok: res.ok, status: res.status, text, json };
  } catch {
    if (timedOut) throw new Error("\u8BF7\u6C42\u8D85\u65F6\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
    if (signal?.aborted) throw new Error("\u8BF7\u6C42\u5DF2\u53D6\u6D88");
    throw new Error("\u7F51\u7EDC\u8BF7\u6C42\u5931\u8D25\uFF0C\u8BF7\u68C0\u67E5\u7F51\u7EDC\u8FDE\u63A5\u540E\u91CD\u8BD5");
  } finally {
    window.clearTimeout(timer);
    signal?.removeEventListener("abort", abortFromOutside);
  }
}
function containingGridIndex(times, current) {
  if (current === void 0) return 0;
  let index = -1;
  for (let i = 0; i < times.length; i += 1) {
    if (times[i] > current) break;
    index = i;
  }
  return index >= 0 ? index : 0;
}
async function sampleIpLocation(url) {
  try {
    const res = await apiFetch(url, { timeoutMs: IP_PROVIDER_TIMEOUT_MS });
    if (!res.ok) return null;
    const json = res.json;
    if (json === null) return null;
    const toNumber = (value) => {
      if (typeof value === "number") return Number.isFinite(value) ? value : Number.NaN;
      if (typeof value === "string" && value.trim() !== "") return Number(value.trim());
      return Number.NaN;
    };
    const latitude = toNumber(json.latitude ?? json.lat);
    const longitude = toNumber(json.longitude ?? json.lon);
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
      (other) => haversineKm(candidate.latitude, candidate.longitude, other.latitude, other.longitude) <= AUTO_LOCATION_DRIFT_KM
    ).length;
    if (count > bestCount) {
      best = candidate;
      bestCount = count;
    }
  }
  const cluster = ok.filter(
    (other) => haversineKm(best.latitude, best.longitude, other.latitude, other.longitude) <= AUTO_LOCATION_DRIFT_KM
  );
  const latitude = cluster.reduce((sum, sample) => sum + sample.latitude, 0) / cluster.length;
  const longitude = cluster.reduce((sum, sample) => sum + sample.longitude, 0) / cluster.length;
  return { name: best.name, latitude, longitude, source: "ip" };
}
var SPECIAL_FIRST_LEVEL = {
  \u5185\u8499\u53E4: "\u5185\u8499\u53E4\u81EA\u6CBB\u533A",
  \u5E7F\u897F: "\u5E7F\u897F\u58EE\u65CF\u81EA\u6CBB\u533A",
  \u897F\u85CF: "\u897F\u85CF\u81EA\u6CBB\u533A",
  \u5B81\u590F: "\u5B81\u590F\u56DE\u65CF\u81EA\u6CBB\u533A",
  \u65B0\u7586: "\u65B0\u7586\u7EF4\u543E\u5C14\u81EA\u6CBB\u533A"
};
function normalizeFirstLevel(admin1, countryCode) {
  if (countryCode !== "CN") return admin1;
  if (/[省市]$/.test(admin1) || admin1.endsWith("\u81EA\u6CBB\u533A") || admin1.endsWith("\u7279\u522B\u884C\u653F\u533A")) return admin1;
  return SPECIAL_FIRST_LEVEL[admin1] ?? `${admin1}\u7701`;
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
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`\u53CD\u5411\u5730\u7406\u7F16\u7801\u54CD\u5E94\u5F02\u5E38\uFF08HTTP ${res.status}\uFF09`);
  const json = res.json;
  return {
    province: json?.principalSubdivision,
    city: json?.city,
    district: json?.locality
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
    const res = await apiFetch(url);
    if (!res.ok) return location.name;
    const json = res.json;
    const results = json?.results ?? [];
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
  const a = Math.min(1, Math.max(0, Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(dLon / 2) ** 2));
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
  const gpsResult = await withTimeout(resolveLocationByBrowser(), GPS_TIMEOUT_MS);
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
async function resolveFreshIfDrifted(cached) {
  if (cached.source === "gps") return null;
  let ip = null;
  try {
    ip = await resolveLocationByIp();
  } catch {
    ip = null;
  }
  if (ip === null) return null;
  if (haversineKm(cached.latitude, cached.longitude, ip.latitude, ip.longitude) <= AUTO_LOCATION_DRIFT_KM) {
    return null;
  }
  return resolveAutoLocation().catch(() => null);
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
  const gpsAttempt = (async () => {
    try {
      return { kind: "ok", loc: await resolveLocationByBrowser() };
    } catch (err) {
      return { kind: "error", error: err instanceof Error ? err.message : String(err) };
    }
  })();
  const ipPromise = resolveLocationByIp();
  const gpsProbe = await new Promise((resolve) => {
    const timer = window.setTimeout(() => resolve({ kind: "timeout" }), GPS_TIMEOUT_MS);
    void gpsAttempt.then((result) => {
      window.clearTimeout(timer);
      resolve(result);
    });
  });
  let ip;
  try {
    const ipLoc = await ipPromise;
    ip = { status: "ok", city: ipLoc.name, latitude: ipLoc.latitude, longitude: ipLoc.longitude };
  } catch (err) {
    ip = { status: "error", error: err instanceof Error ? err.message : String(err) };
  }
  const gpsRaw = gpsProbe.kind === "ok" && gpsProbe.loc !== void 0 ? gpsProbe.loc : null;
  const gps = gpsProbe.kind === "ok" && gpsRaw !== null ? { status: "ok", latitude: gpsRaw.latitude, longitude: gpsRaw.longitude, accuracy: gpsRaw.accuracy } : gpsProbe.kind === "error" ? { status: "error", error: gpsProbe.error } : { status: "timeout" };
  const distance = gpsRaw !== null && ip.status === "ok" ? haversineKm(gpsRaw.latitude, gpsRaw.longitude, ip.latitude, ip.longitude) : void 0;
  const precision = gpsRaw !== null ? precisionFromAccuracy(gpsRaw.accuracy) : "unreliable";
  const chosen = precision !== "unreliable" ? "gps" : ip.status === "ok" ? "ip" : "none";
  return { gps, ip, gpsIpDistanceKm: distance, chosen, precision: chosen === "gps" ? precision : void 0 };
}
async function searchCity(query, limit = 5) {
  const trimmed = query.trim();
  if (trimmed === "") return [];
  const url = `${GEO_SEARCH_URL}?name=${encodeURIComponent(trimmed)}&count=${limit}&language=zh&format=json`;
  const res = await apiFetch(url);
  if (!res.ok) throw new Error(`\u57CE\u5E02\u641C\u7D22\u54CD\u5E94\u5F02\u5E38\uFF08HTTP ${res.status}\uFF09`);
  const json = res.json;
  return (json?.results ?? []).map((result) => ({
    name: qualifyCityName(result.name, result.admin1, result.country_code),
    latitude: result.latitude,
    longitude: result.longitude,
    source: "search"
  }));
}
async function fetchWeather(location, signal) {
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
    hourly: "temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m",
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,sunrise,sunset,uv_index_max,precipitation_sum",
    minutely_15: "precipitation",
    timezone: "auto",
    forecast_days: String(FORECAST_DAYS),
    language: "zh"
  });
  const airParams = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    current: "us_aqi,pm2_5",
    timezone: "auto"
  });
  const resPromise = apiFetch(`${FORECAST_URL}?${params.toString()}`, { signal });
  const airPromise = apiFetch(`${AIR_QUALITY_URL}?${airParams.toString()}`, { signal, timeoutMs: AIR_TIMEOUT_MS }).catch(() => null);
  const res = await resPromise;
  if (!res.ok) throw new Error(`\u5929\u6C14\u6570\u636E\u83B7\u53D6\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
  const json = res.json;
  if (json === null) throw new Error("\u5929\u6C14\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u6570\u636E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  const current = json.current;
  if (current === void 0 || current.temperature_2m === void 0) {
    throw new Error("\u5929\u6C14\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u5F53\u524D\u6570\u636E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  }
  const hourly = json.hourly;
  const daily = json.daily;
  const nowIso = current.time;
  const hourlyFrom = containingGridIndex(hourly?.time ?? [], nowIso);
  const hourIsDay = hourly?.is_day ?? [];
  let minutely;
  let rainSoon;
  const minuteTimes = json.minutely_15?.time ?? [];
  if (minuteTimes.length > 0) {
    const minuteFrom = containingGridIndex(minuteTimes, nowIso);
    const precipitation = json.minutely_15?.precipitation ?? [];
    const steps = minuteTimes.slice(minuteFrom, minuteFrom + MINUTELY_STEPS).map((time, index) => ({
      time,
      precipitation: precipitation[minuteFrom + index] ?? 0
    }));
    minutely = steps;
    rainSoon = scanRain(steps);
  }
  let air;
  const airRes = await airPromise;
  if (airRes !== null && airRes.ok) {
    const airJson = airRes.json;
    const aqi = airJson?.current?.us_aqi ?? void 0;
    const pm25 = airJson?.current?.pm2_5 ?? void 0;
    if (aqi !== void 0 || pm25 !== void 0) {
      air = { aqi, pm25 };
    }
  }
  return {
    location,
    current: {
      temperature: current.temperature_2m,
      apparentTemperature: current.apparent_temperature ?? current.temperature_2m,
      humidity: current.relative_humidity_2m ?? void 0,
      windSpeed: current.wind_speed_10m ?? void 0,
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
    hourly: (hourly?.time ?? []).slice(hourlyFrom, hourlyFrom + 24).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[hourlyFrom + index] ?? 0,
      weatherCode: hourly?.weather_code?.[hourlyFrom + index] ?? -1,
      isDay: (hourIsDay[hourlyFrom + index] ?? 1) === 1,
      precipProb: hourly?.precipitation_probability?.[hourlyFrom + index] ?? 0,
      windSpeed: hourly?.wind_speed_10m?.[hourlyFrom + index] ?? void 0
    })),
    daily: (daily?.time ?? []).slice(0, FORECAST_DAYS).map((date, index) => ({
      date,
      weatherCode: daily?.weather_code?.[index] ?? -1,
      tempMax: daily?.temperature_2m_max?.[index] ?? 0,
      tempMin: daily?.temperature_2m_min?.[index] ?? 0,
      precipProb: daily?.precipitation_probability_max?.[index] ?? 0,
      precipSum: daily?.precipitation_sum?.[index] ?? void 0
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    uvIndexMax: daily?.uv_index_max?.[0] ?? void 0,
    air,
    minutely,
    rainSoon
  };
}
var LEAD_HOURS = 12;
function evaluateAlerts(data, fmt, windFmt = (kmh) => `${Math.round(kmh)} km/h`) {
  const alerts = [];
  const hasKey = (key) => alerts.some((alert) => alert.key === key);
  const current = data.current;
  if (current.temperature >= HEAT_C) {
    alerts.push({ key: "heat", level: "warning", title: "\u9AD8\u6E29", detail: `\u5F53\u524D ${fmt(current.temperature)}\uFF0C\u6CE8\u610F\u9632\u6691` });
  } else if (current.temperature <= COLD_C) {
    alerts.push({ key: "cold", level: "warning", title: "\u4F4E\u6E29", detail: `\u5F53\u524D ${fmt(current.temperature)}\uFF0C\u6CE8\u610F\u4FDD\u6696` });
  }
  const windKmh = current.windSpeed;
  if (windKmh !== void 0 && windKmh >= WIND_ALERT_KMH) {
    alerts.push({ key: "wind", level: "warning", title: "\u5927\u98CE", detail: `\u98CE\u901F ${windFmt(windKmh)}` });
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
  const future = data.hourly.slice(0, LEAD_HOURS);
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
    const heatMaxC = Math.max(...future.map((h) => h.temperature));
    if (heatMaxC >= HEAT_C && !hasKey("heat")) {
      alerts.push({
        key: "heat-soon",
        level: "warning",
        title: "\u9AD8\u6E29",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u6700\u9AD8\u53EF\u8FBE ${fmt(heatMaxC)}\uFF0C\u6CE8\u610F\u9632\u6691`
      });
    }
    const coldMinC = Math.min(...future.map((h) => h.temperature));
    if (coldMinC <= COLD_C && !hasKey("cold")) {
      alerts.push({
        key: "cold-soon",
        level: "warning",
        title: "\u4F4E\u6E29",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u6700\u4F4E\u5C06\u964D\u81F3 ${fmt(coldMinC)}\uFF0C\u6CE8\u610F\u4FDD\u6696`
      });
    }
    const windSpeeds = future.map((h) => h.windSpeed).filter((v) => v !== void 0);
    if (windSpeeds.length > 0 && Math.max(...windSpeeds) >= WIND_ALERT_KMH && !hasKey("wind")) {
      alerts.push({
        key: "wind-soon",
        level: "warning",
        title: "\u5927\u98CE",
        detail: `\u672A\u6765 ${LEAD_HOURS} \u5C0F\u65F6\u98CE\u529B\u8F83\u5927\uFF08\u6700\u5927 ${windFmt(Math.max(...windSpeeds))}\uFF09\uFF0C\u6CE8\u610F\u9AD8\u7A7A\u5760\u7269`
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
async function fetchDayDetail(location, date, signal) {
  const params = new URLSearchParams({
    latitude: String(location.latitude),
    longitude: String(location.longitude),
    start_date: date,
    end_date: date,
    hourly: "temperature_2m,weather_code,is_day,precipitation_probability,wind_speed_10m,relative_humidity_2m",
    daily: "sunrise,sunset,precipitation_sum,wind_gusts_10m_max",
    timezone: "auto",
    language: "zh"
  });
  const res = await apiFetch(`${FORECAST_URL}?${params.toString()}`, signal === void 0 ? {} : { signal });
  if (!res.ok) throw new Error(`\u5929\u6C14\u6570\u636E\u83B7\u53D6\u5931\u8D25\uFF08HTTP ${res.status}\uFF09`);
  const json = res.json;
  if (json === null) throw new Error("\u5929\u6C14\u670D\u52A1\u6682\u672A\u8FD4\u56DE\u6570\u636E\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5");
  const hourly = json.hourly;
  const daily = json.daily;
  const hourIsDay = hourly?.is_day ?? [];
  return {
    date,
    hourly: (hourly?.time ?? []).map((time, index) => ({
      time,
      temperature: hourly?.temperature_2m?.[index] ?? void 0,
      weatherCode: hourly?.weather_code?.[index] ?? void 0,
      precipProb: hourly?.precipitation_probability?.[index] ?? void 0,
      isDay: (hourIsDay[index] ?? 1) === 1,
      windSpeed: hourly?.wind_speed_10m?.[index] ?? void 0,
      humidity: hourly?.relative_humidity_2m?.[index] ?? void 0
    })),
    sunrise: daily?.sunrise?.[0],
    sunset: daily?.sunset?.[0],
    precipSum: daily?.precipitation_sum?.[0] ?? void 0,
    windGustsMax: daily?.wind_gusts_10m_max?.[0] ?? void 0
  };
}

// src/client/hooks.ts
var import_react = require("react");

// src/client/units.ts
function toFahrenheit(celsius) {
  return celsius * 9 / 5 + 32;
}
function toMph(kmh) {
  return kmh * 0.6213711922;
}
function tempText(celsius, units) {
  const value = units === "fahrenheit" ? toFahrenheit(celsius) : celsius;
  return `${Math.round(value)}${units === "fahrenheit" ? "\xB0F" : "\xB0C"}`;
}
function windText(kmh, units) {
  if (kmh === void 0) return "--";
  const value = units === "fahrenheit" ? toMph(kmh) : kmh;
  return `${Math.round(value)} ${windUnitLabel(units)}`;
}
function windNumber(kmh, units) {
  if (kmh === void 0) return void 0;
  return units === "fahrenheit" ? toMph(kmh) : kmh;
}
function windUnitLabel(units) {
  return units === "fahrenheit" ? "mph" : "km/h";
}
function unitLabel(units) {
  return units === "fahrenheit" ? "\xB0F" : "\xB0C";
}

// src/client/hooks.ts
var DRIFT_PROBE_MIN_GAP_MS = 6e4;
var DRIFT_PROBE_INTERVAL_MS = 60 * 6e4;
var TITLE_PREFIX_RE = /^(☀️|🌤️|⛅|☁️|🌧️|❄️|🌨️|⛈️|🌙|🌡️|🌫️|🌦️) \d+°[CF] .+? — /;
function manualDisplayName(cityName) {
  const raw = cityName?.trim();
  const reduced = raw !== void 0 && raw !== "" ? cityLevelName(raw) : "";
  return reduced !== "" ? reduced : "\u5F53\u524D\u4F4D\u7F6E";
}
function placeNameOf(effective, location) {
  if (effective.locationMode === "manual") return manualDisplayName(effective.cityName);
  const cachedName = effective.autoCityName;
  if (cachedName !== void 0 && cachedName !== "") return cachedName;
  return location?.name ?? "\u5B9A\u4F4D\u4E2D\u2026";
}
function newSavedId() {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
var EMPTY_SAVED = [];
function dayKey(date) {
  const pad = (n) => String(n).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}
function useAutoLocation(options) {
  const { scope, effective } = options;
  const [location, setLocation] = (0, import_react.useState)(null);
  const [locating, setLocating] = (0, import_react.useState)(true);
  const [error, setError] = (0, import_react.useState)(null);
  const [relocateTick, setRelocateTick] = (0, import_react.useState)(0);
  const bypassCacheRef = (0, import_react.useRef)(false);
  const lastDriftProbeRef = (0, import_react.useRef)(0);
  const driftTimerRef = (0, import_react.useRef)(null);
  const [driftNotice, setDriftNotice] = (0, import_react.useState)(null);
  const alertsEnabledRef = (0, import_react.useRef)(effective.alertsEnabled);
  alertsEnabledRef.current = effective.alertsEnabled;
  const writer = useConfigWriter(scope);
  const persistLocation = (0, import_react.useCallback)((loc) => {
    writer.write("autoLatitude", loc.latitude);
    writer.write("autoLongitude", loc.longitude);
    writer.write("autoCityName", loc.name);
    writer.write("autoSource", loc.source);
  }, [writer]);
  const showDrift = (0, import_react.useCallback)((newName, notify) => {
    setDriftNotice(`\u5DF2\u5207\u6362\u5230 ${newName}`);
    if (driftTimerRef.current !== null) window.clearTimeout(driftTimerRef.current);
    driftTimerRef.current = window.setTimeout(() => setDriftNotice(null), 6e3);
    if (notify && typeof Notification !== "undefined" && Notification.permission === "granted") {
      try {
        new Notification("\u{1F4CD} \u5929\u6C14\u4F4D\u7F6E\u5DF2\u81EA\u52A8\u5207\u6362", {
          body: `\u68C0\u6D4B\u5230\u7F51\u7EDC\u53D8\u5316\uFF0C\u5DF2\u5207\u6362\u5230 ${newName}`,
          tag: "dsh-weather-drift"
        });
      } catch {
      }
    }
  }, []);
  (0, import_react.useEffect)(() => () => {
    if (driftTimerRef.current !== null) window.clearTimeout(driftTimerRef.current);
  }, []);
  (0, import_react.useEffect)(() => {
    if (!effective.enabled) return;
    const bypassCache = bypassCacheRef.current;
    bypassCacheRef.current = false;
    const samePlace = !bypassCache && location !== null && (effective.locationMode === "manual" ? location.source === "manual" && location.latitude === effective.latitude && location.longitude === effective.longitude : location.latitude === effective.autoLatitude && location.longitude === effective.autoLongitude);
    if (samePlace) return;
    let cancelled = false;
    setLocating(true);
    setError(null);
    void (async () => {
      try {
        let loc;
        if (effective.locationMode === "manual") {
          if (effective.latitude === void 0 || effective.longitude === void 0) {
            throw new Error("\u624B\u52A8\u6A21\u5F0F\u7F3A\u5C11\u5750\u6807\uFF0C\u8BF7\u5728 \u8BBE\u7F6E \u2192 \u5929\u6C14 \u4E2D\u586B\u5199");
          }
          loc = {
            name: manualDisplayName(effective.cityName),
            latitude: effective.latitude,
            longitude: effective.longitude,
            source: "manual"
          };
        } else {
          const cached = !bypassCache && effective.autoLatitude !== void 0 && effective.autoLongitude !== void 0 ? {
            // Preserve the resolved name verbatim — it may already include a
            // district (区) resolved from a trusted browser fix.
            name: effective.autoCityName !== void 0 && effective.autoCityName !== "" ? effective.autoCityName : "\u5F53\u524D\u4F4D\u7F6E",
            latitude: effective.autoLatitude,
            longitude: effective.autoLongitude,
            source: effective.autoSource ?? "ip"
          } : null;
          loc = cached ?? await resolveAutoLocation();
          if (cancelled) return;
          if (cached === null) {
            lastDriftProbeRef.current = Date.now();
            persistLocation(loc);
          } else if ((effective.autoSource ?? "ip") !== "gps" && Date.now() - lastDriftProbeRef.current >= DRIFT_PROBE_MIN_GAP_MS) {
            const previousGate = lastDriftProbeRef.current;
            lastDriftProbeRef.current = Date.now();
            const fresh = await resolveFreshIfDrifted(cached);
            if (cancelled) {
              lastDriftProbeRef.current = previousGate;
              return;
            }
            if (fresh !== null) {
              loc = fresh;
              persistLocation(fresh);
              showDrift(fresh.name, alertsEnabledRef.current);
            }
          }
        }
        if (cancelled) return;
        setLocation(loc);
        setLocating(false);
      } catch (err) {
        if (cancelled) return;
        setLocating(false);
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [
    // Location-affecting inputs only. `cityName`/`autoCityName`/`autoSource`
    // are display metadata written by this effect itself — re-running the
    // whole locate chain when they change would cause silent refetch churn.
    // `location` is intentionally read (not listed): the early-out must see the
    // current value without re-running on every location object identity.
    effective.enabled,
    effective.locationMode,
    effective.latitude,
    effective.longitude,
    effective.autoLatitude,
    effective.autoLongitude,
    relocateTick,
    persistLocation,
    showDrift
  ]);
  (0, import_react.useEffect)(() => {
    if (!effective.enabled || effective.locationMode !== "auto") return;
    if (effective.autoLatitude === void 0 || effective.autoLongitude === void 0) return;
    if ((effective.autoSource ?? "ip") === "gps") return;
    let cancelled = false;
    const cached = {
      latitude: effective.autoLatitude,
      longitude: effective.autoLongitude,
      source: "ip"
    };
    const probe = () => {
      lastDriftProbeRef.current = Date.now();
      void resolveFreshIfDrifted(cached).then((fresh) => {
        if (cancelled || fresh === null) return;
        persistLocation(fresh);
        showDrift(fresh.name, alertsEnabledRef.current);
      });
    };
    const id = window.setInterval(probe, DRIFT_PROBE_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [
    effective.enabled,
    effective.locationMode,
    effective.autoLatitude,
    effective.autoLongitude,
    effective.autoSource,
    persistLocation,
    showDrift
  ]);
  const relocate = (0, import_react.useCallback)(() => {
    bypassCacheRef.current = true;
    setRelocateTick((n) => n + 1);
  }, []);
  return { location, locating, error, relocate, driftNotice };
}
function useWeatherFeed(options) {
  const { effective, location } = options;
  const [data, setData] = (0, import_react.useState)(null);
  const [status, setStatus] = (0, import_react.useState)("loading");
  const [error, setError] = (0, import_react.useState)(null);
  const [stale, setStale] = (0, import_react.useState)(false);
  const [updatedAt, setUpdatedAt] = (0, import_react.useState)(null);
  const [tick, setTick] = (0, import_react.useState)(0);
  const lastGoodRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    if (!effective.enabled || location === null) return;
    const controller = new AbortController();
    let cancelled = false;
    const locKey = `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
    const shown = lastGoodRef.current;
    if (shown === null || shown.key !== locKey) {
      setStatus("loading");
      setData(null);
      setStale(false);
      setError(null);
    }
    void (async () => {
      try {
        const weather = await fetchWeather(location, controller.signal);
        if (cancelled) return;
        lastGoodRef.current = { weather, key: locKey };
        setData(weather);
        setUpdatedAt(Date.now());
        setError(null);
        setStale(false);
        setStatus("ready");
      } catch (err) {
        if (cancelled) return;
        const message = err instanceof Error ? err.message : String(err);
        const cache = lastGoodRef.current;
        if (cache !== null && cache.key === locKey) {
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
      controller.abort();
    };
  }, [effective.enabled, location, tick]);
  (0, import_react.useEffect)(() => {
    if (!effective.enabled) return;
    const id = window.setInterval(() => setTick((n) => n + 1), Math.max(5, effective.refreshMinutes) * 6e4);
    return () => window.clearInterval(id);
  }, [effective.refreshMinutes, effective.enabled]);
  const refresh = (0, import_react.useCallback)(() => setTick((n) => n + 1), []);
  return { data, status, error, stale, updatedAt, refresh };
}
function writeVerified(scope, fields, clears = []) {
  const apply2 = () => Promise.all([
    ...fields.map(([field, value]) => scope.set(field, value)),
    ...clears.map((field) => scope.unset(field))
  ]);
  const landed = () => {
    const current = scope.getSnapshot().value;
    return current !== void 0 && fields.every(([field, value]) => JSON.stringify(current[field]) === JSON.stringify(value)) && clears.every((field) => current[field] === void 0);
  };
  const attempt = () => apply2().then(landed, () => false);
  return attempt().then((ok) => ok ? true : attempt());
}
function useConfigWriter(scope) {
  return (0, import_react.useMemo)(() => {
    const fieldValue = (field) => {
      const value = scope.getSnapshot().value;
      return value === void 0 ? void 0 : value[field];
    };
    const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
    return {
      writable: () => scope.getSnapshot().writable,
      write: (field, value) => {
        if (!scope.getSnapshot().writable) return Promise.resolve(false);
        return writeVerified(scope, [[field, value]]);
      },
      clear: (field) => {
        if (!scope.getSnapshot().writable) return Promise.resolve(false);
        return writeVerified(scope, [], [field]);
      },
      verify: (checks) => checks.every(([field, expected]) => same(fieldValue(field), expected))
    };
  }, [scope]);
}
function useSavedLocations(options) {
  const { scope, effective, onNotice } = options;
  const writer = useConfigWriter(scope);
  const saved = effective.savedLocations ?? EMPTY_SAVED;
  const [ownNotice, setOwnNotice] = (0, import_react.useState)(null);
  const noticeTimerRef = (0, import_react.useRef)(null);
  const pendingRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => {
    const pending = pendingRef.current;
    if (pending === null) return;
    if (pending.every((entry) => saved.some((current) => current.id === entry.id))) {
      pendingRef.current = null;
    }
  }, [saved]);
  const showNotice = (0, import_react.useCallback)((text, kind = "ok") => {
    if (onNotice !== void 0) {
      onNotice(text, kind);
      return;
    }
    setOwnNotice(text);
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
    noticeTimerRef.current = window.setTimeout(() => setOwnNotice(null), 6e3);
  }, [onNotice]);
  (0, import_react.useEffect)(() => () => {
    if (noticeTimerRef.current !== null) window.clearTimeout(noticeTimerRef.current);
  }, []);
  const baseList = (0, import_react.useCallback)(() => pendingRef.current ?? saved, [saved]);
  const isSaved = (0, import_react.useCallback)((latitude, longitude) => {
    const key = placeKey(latitude, longitude);
    return baseList().some((entry) => placeKey(entry.latitude, entry.longitude) === key);
  }, [baseList]);
  const ensureWritable = (0, import_react.useCallback)(() => {
    if (writer.writable()) return true;
    showNotice("\u5F53\u524D\u8FDE\u63A5\u4E0D\u652F\u6301\u4FEE\u6539\u8BBE\u7F6E\uFF08\u53EA\u8BFB\uFF09", "err");
    return false;
  }, [writer, showNotice]);
  const commitBatch = (0, import_react.useCallback)(async (fields, clears = []) => {
    if (!ensureWritable()) return false;
    const pending = [];
    for (const [field, value] of fields) pending.push(writer.write(field, value));
    for (const field of clears) pending.push(writer.clear(field));
    await Promise.all(pending);
    const checks = fields.map(([field, value]) => [field, value]);
    for (const field of clears) checks.push([field, void 0]);
    return writer.verify(checks);
  }, [ensureWritable, writer]);
  const switchTo = (0, import_react.useCallback)((id) => {
    const target = baseList().find((entry) => entry.id === id);
    if (target === void 0) return;
    void commitBatch([
      ["latitude", target.latitude],
      ["longitude", target.longitude],
      ["cityName", target.name],
      ["activeSavedId", target.id],
      ["locationMode", "manual"]
    ]).then((ok) => showNotice(ok ? `\u5DF2\u5207\u6362\u5230 ${target.name}` : "\u5207\u6362\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", ok ? "ok" : "err"));
  }, [baseList, commitBatch, showNotice]);
  const selectPlace = (0, import_react.useCallback)((place) => {
    const fields = [
      ["latitude", place.latitude],
      ["longitude", place.longitude],
      ["cityName", place.name]
    ];
    if (effective.locationMode !== "manual") fields.push(["locationMode", "manual"]);
    void commitBatch(fields, ["activeSavedId"]).then((ok) => {
      if (!ok) showNotice("\u5B9A\u4F4D\u5199\u5165\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "err");
    });
  }, [commitBatch, effective.locationMode, showNotice]);
  const useCurrent = (0, import_react.useCallback)(() => {
    void commitBatch([["locationMode", "auto"]], ["activeSavedId"]).then((ok) => {
      if (!ok) showNotice("\u5207\u6362\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "err");
    });
  }, [commitBatch, showNotice]);
  const addPlace = (0, import_react.useCallback)((place) => {
    if (!ensureWritable()) return;
    const list = baseList();
    if (list.some((entry) => placeKey(entry.latitude, entry.longitude) === placeKey(place.latitude, place.longitude))) {
      showNotice(`${place.name} \u5DF2\u5728\u6536\u85CF\u4E2D`, "err");
      return;
    }
    if (list.length >= MAX_SAVED_LOCATIONS) {
      showNotice(`\u6700\u591A\u6536\u85CF ${MAX_SAVED_LOCATIONS} \u4E2A\u57CE\u5E02`, "err");
      return;
    }
    const next = sanitizeSavedLocations([...list, { id: newSavedId(), ...place }]);
    pendingRef.current = next;
    void writer.write("savedLocations", next).then((ok) => {
      if (ok) {
        showNotice(`\u5DF2\u6536\u85CF ${place.name}`);
      } else {
        pendingRef.current = null;
        showNotice("\u6536\u85CF\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "err");
      }
    });
  }, [baseList, ensureWritable, writer, showNotice]);
  const addCurrent = (0, import_react.useCallback)(() => {
    if (!ensureWritable()) return;
    if (effective.locationMode === "manual") {
      if (effective.latitude === void 0 || effective.longitude === void 0 || effective.cityName === void 0) {
        showNotice("\u8BF7\u5148\u586B\u5199\u5B8C\u6574\u7684\u5750\u6807\u4E0E\u663E\u793A\u540D\u79F0", "err");
        return;
      }
      addPlace({
        name: manualDisplayName(effective.cityName),
        latitude: effective.latitude,
        longitude: effective.longitude
      });
      return;
    }
    if (effective.autoLatitude === void 0 || effective.autoLongitude === void 0 || effective.autoCityName === void 0) {
      showNotice("\u5730\u540D\u5C1A\u672A\u89E3\u6790\uFF0C\u8BF7\u7A0D\u540E\u518D\u8BD5", "err");
      return;
    }
    addPlace({
      name: manualDisplayName(effective.autoCityName),
      latitude: effective.autoLatitude,
      longitude: effective.autoLongitude
    });
  }, [effective, addPlace, ensureWritable, showNotice]);
  const remove = (0, import_react.useCallback)((id) => {
    if (!ensureWritable()) return;
    const next = baseList().filter((entry) => entry.id !== id);
    const removingActive = effective.activeSavedId === id;
    pendingRef.current = next;
    const fields = [["savedLocations", next]];
    if (removingActive) fields.push(["locationMode", "auto"]);
    void commitBatch(fields, removingActive ? ["activeSavedId"] : []).then((ok) => {
      if (!ok) {
        pendingRef.current = null;
        showNotice("\u5220\u9664\u5931\u8D25\uFF0C\u8BF7\u91CD\u8BD5", "err");
      }
    });
  }, [baseList, ensureWritable, commitBatch, effective.activeSavedId, showNotice]);
  return {
    saved,
    activeId: effective.activeSavedId,
    switchTo,
    selectPlace,
    useCurrent,
    addCurrent,
    addPlace,
    remove,
    isSaved,
    notice: onNotice !== void 0 ? null : ownNotice
  };
}
function useWeatherNotifications(options) {
  const { effective, data, placeName, stale } = options;
  const notifiedAt = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  (0, import_react.useEffect)(() => {
    if (!effective.alertsEnabled || data === null) return;
    if (stale) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const fmtLocal = (value) => tempText(value, effective.units);
    const windFmtLocal = (kmh) => windText(kmh, effective.units);
    const alerts = evaluateAlerts(data, fmtLocal, windFmtLocal);
    const rain = data.rainSoon;
    if (rain !== void 0 && !rain.rainingNow && rain.onsetMinutes !== void 0 && rain.onsetMinutes <= 60) {
      alerts.push({
        key: "rain-soon",
        level: "warning",
        title: "\u5373\u5C06\u964D\u96E8",
        detail: `\u9884\u8BA1 ${rainOnsetRounded(rain.onsetMinutes)} \u5206\u949F\u540E\u5F00\u59CB\u4E0B\u96E8\uFF0C\u51FA\u95E8\u8BB0\u5F97\u5E26\u4F1E`
      });
    }
    if (alerts.length === 0) return;
    const key = alerts.map((alert) => alert.key).sort().join("+");
    const now = Date.now();
    const dedupeMs = key.includes("-soon") ? 4 * 60 * 6e4 : 60 * 6e4;
    const last = notifiedAt.current.get(key);
    if (last !== void 0 && now - last < dedupeMs) return;
    if (notifiedAt.current.size > 24) notifiedAt.current.clear();
    notifiedAt.current.set(key, now);
    try {
      new Notification(`\u26A0 ${placeName} \u5929\u6C14\u63D0\u9192`, {
        body: alerts.map((alert) => `${alert.title}\uFF1A${alert.detail}`).join("\uFF1B"),
        tag: `dsh-weather-${key}`
      });
    } catch {
    }
  }, [data, effective.alertsEnabled, effective.units, placeName, stale]);
}
var BRIEF_KEY_PREFIX = "dsh-weather-brief-";
var BRIEF_KEY_RETENTION_DAYS = 3;
var BRIEF_GRACE_MINUTES = 120;
function briefAlreadySent(storageKey) {
  try {
    return window.localStorage.getItem(storageKey) !== null;
  } catch {
    return false;
  }
}
function markBriefSent(storageKey) {
  try {
    window.localStorage.setItem(storageKey, "1");
  } catch {
  }
}
function pruneBriefKeys(todayKey) {
  try {
    const cutoff = /* @__PURE__ */ new Date(`${todayKey}T00:00:00`);
    cutoff.setDate(cutoff.getDate() - BRIEF_KEY_RETENTION_DAYS);
    const stale = [];
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key === null || !key.startsWith(BRIEF_KEY_PREFIX)) continue;
      const stamp = key.slice(BRIEF_KEY_PREFIX.length, BRIEF_KEY_PREFIX.length + 10);
      const parsed = /* @__PURE__ */ new Date(`${stamp}T00:00:00`);
      if (!Number.isNaN(parsed.getTime()) && parsed < cutoff) stale.push(key);
    }
    for (const key of stale) window.localStorage.removeItem(key);
  } catch {
  }
}
function clockMinutes(clock) {
  const match = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(clock);
  if (match === null) return void 0;
  return Number(match[1]) * 60 + Number(match[2]);
}
function useDailyBrief(options) {
  const { effective, data, placeName, stale } = options;
  const sentRef = (0, import_react.useRef)(/* @__PURE__ */ new Set());
  const dataRef = (0, import_react.useRef)(data);
  dataRef.current = data;
  const staleRef = (0, import_react.useRef)(stale);
  staleRef.current = stale;
  (0, import_react.useEffect)(() => {
    if (!effective.enabled || !effective.briefEnabled) return;
    if (typeof Notification === "undefined" || Notification.permission !== "granted") return;
    const build = (slot) => {
      const current = dataRef.current;
      if (current === null) return null;
      const day = slot === "morning" ? current.daily[0] : current.daily[1];
      if (day === void 0) return null;
      const condition = describeCondition(day.weatherCode, true);
      const range = `${tempText(day.tempMin, effective.units)} ~ ${tempText(day.tempMax, effective.units)}`;
      const rain = day.precipProb > 0 ? ` \xB7 \u964D\u6C34 ${day.precipProb}%` : "";
      return {
        title: `${slot === "morning" ? "\u2600\uFE0F \u4ECA\u65E5\u5929\u6C14" : "\u{1F319} \u660E\u65E5\u5929\u6C14"} \xB7 ${placeName}`,
        body: `${condition.label} ${range}${rain}`
      };
    };
    const check = () => {
      const now = /* @__PURE__ */ new Date();
      if (staleRef.current) return;
      const nowMinutes = now.getHours() * 60 + now.getMinutes();
      for (const slot of ["morning", "evening"]) {
        const wanted = slot === "morning" ? effective.briefMorning : effective.briefEvening;
        const target = clockMinutes(wanted);
        if (target === void 0) continue;
        const delta = nowMinutes - target;
        if (delta < 0 || delta > BRIEF_GRACE_MINUTES) continue;
        const storageKey = `${BRIEF_KEY_PREFIX}${dayKey(now)}-${slot}`;
        if (sentRef.current.has(storageKey) || briefAlreadySent(storageKey)) continue;
        const payload = build(slot);
        if (payload === null) continue;
        try {
          new Notification(payload.title, { body: payload.body, tag: storageKey });
        } catch {
          continue;
        }
        sentRef.current.add(storageKey);
        markBriefSent(storageKey);
      }
      pruneBriefKeys(dayKey(now));
    };
    let timer = 0;
    const loop = () => {
      check();
      timer = window.setTimeout(loop, 6e4 - Date.now() % 6e4 + 20);
    };
    loop();
    return () => window.clearTimeout(timer);
  }, [
    effective.enabled,
    effective.briefEnabled,
    effective.briefMorning,
    effective.briefEvening,
    effective.units,
    placeName
  ]);
}
function useTabTitle(options) {
  const { effective, data, status, placeName } = options;
  const baseTitleRef = (0, import_react.useRef)(null);
  const lastWrittenRef = (0, import_react.useRef)(null);
  (0, import_react.useEffect)(() => () => {
    if (baseTitleRef.current !== null && lastWrittenRef.current !== null && document.title === lastWrittenRef.current) {
      document.title = baseTitleRef.current;
    }
    lastWrittenRef.current = null;
  }, []);
  (0, import_react.useEffect)(() => {
    const ours = lastWrittenRef.current;
    if (!effective.enabled) {
      if (baseTitleRef.current !== null && ours !== null && document.title === ours) {
        document.title = baseTitleRef.current;
      }
      lastWrittenRef.current = null;
      return;
    }
    if (data === null) {
      if (status === "error" && baseTitleRef.current !== null && ours !== null && document.title === ours) {
        document.title = baseTitleRef.current;
        lastWrittenRef.current = null;
      }
      return;
    }
    const current = document.title;
    if (baseTitleRef.current === null || current !== ours && !TITLE_PREFIX_RE.test(current)) {
      const match = current.match(TITLE_PREFIX_RE);
      baseTitleRef.current = match !== null ? current.slice(match[0].length) : current;
    }
    const condition = describeCondition(data.current.weatherCode, data.current.isDay);
    const title = `${condition.emoji} ${tempText(data.current.temperature, effective.units)} ${placeName} \u2014 ${baseTitleRef.current ?? current}`;
    if (document.title !== title) document.title = title;
    lastWrittenRef.current = title;
  }, [data, effective.enabled, effective.units, placeName, status]);
}
function locationKey(location) {
  return location === null ? null : `${location.latitude.toFixed(5)},${location.longitude.toFixed(5)}`;
}
function useDayDetail(location) {
  const [request, setRequest] = (0, import_react.useState)(null);
  const [detail, setDetail] = (0, import_react.useState)(null);
  const [busy, setBusy] = (0, import_react.useState)(false);
  const [error, setError] = (0, import_react.useState)(null);
  const cacheRef = (0, import_react.useRef)(/* @__PURE__ */ new Map());
  const currentKey = locationKey(location);
  const active = request !== null && currentKey !== null && request.key === currentKey;
  (0, import_react.useEffect)(() => {
    if (request === null || location === null) return;
    if (locationKey(location) !== request.key) return;
    const cacheId = `${request.key}|${request.date}`;
    const cached = request.nonce === 0 ? cacheRef.current.get(cacheId) : void 0;
    if (cached !== void 0) {
      setDetail(cached);
      setError(null);
      setBusy(false);
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setBusy(true);
    setError(null);
    setDetail(null);
    void fetchDayDetail(location, request.date, controller.signal).then((result) => {
      if (cancelled) return;
      cacheRef.current.set(cacheId, result);
      setDetail(result);
    }).catch((err) => {
      if (cancelled || controller.signal.aborted) return;
      setError(err instanceof Error ? err.message : String(err));
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [request, location]);
  const open = (0, import_react.useCallback)((next) => {
    const key = locationKey(location);
    if (key === null) return;
    setRequest((prev) => prev !== null && prev.key === key && prev.date === next && prev.nonce === 0 ? prev : { date: next, key, nonce: 0 });
  }, [location]);
  const close = (0, import_react.useCallback)(() => {
    setRequest(null);
    setDetail(null);
    setError(null);
  }, []);
  const retry = (0, import_react.useCallback)(() => {
    setRequest((prev) => prev === null ? null : { ...prev, nonce: prev.nonce + 1 });
  }, []);
  return {
    date: active && request !== null ? request.date : null,
    detail: active ? detail : null,
    busy: active && busy,
    error: active ? error : null,
    open,
    close,
    retry
  };
}

// src/client/theme.ts
var TOKEN = {
  bg: "var(--dsw-alias-bg-layer-2, #f3f4f6)",
  bgSoft: "var(--dsw-alias-bg-layer-3, rgba(0, 0, 0, 0.06))",
  /** Elevated surfaces above the base layer (inputs, dropdowns). */
  bgRaised: "var(--dsw-alias-bg-layer-1, #ffffff)",
  // Text colors flip to pure white in dark mode via .dshw-root (see styles.ts).
  fg: "var(--dshw-fg, #1f2328)",
  fgMuted: "var(--dshw-fg-muted, #5f6672)",
  border: "var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12))",
  accent: "var(--dsw-alias-brand-primary, #4f8cff)",
  danger: "#e5484d",
  warn: "#b45309"
};
var PALETTE = {
  sun: "#fbbf24",
  rainStrong: "#3b82f6",
  rain: "#60a5fa",
  rainSoft: "#93c5fd"
};
var BANNER = {
  danger: { color: TOKEN.danger, bg: "rgba(229, 72, 77, 0.1)", border: "rgba(229, 72, 77, 0.28)" },
  warning: { color: TOKEN.warn, bg: "rgba(180, 83, 9, 0.1)", border: "rgba(180, 83, 9, 0.28)" }
};
var SHADOW = {
  popover: "0 16px 48px rgba(0, 0, 0, 0.28)",
  floating: "0 8px 24px rgba(0, 0, 0, 0.18)",
  dropdown: "0 8px 24px rgba(0, 0, 0, 0.12)"
};
var NUM = { fontVariantNumeric: "tabular-nums" };
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

// src/client/icons.tsx
var import_jsx_runtime = require("react/jsx-runtime");
var CLOUD = "M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z";
var CLOUD_LOW = "M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25";
function Sun() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)("g", { stroke: PALETTE.sun, children: [
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 2v2", stroke: PALETTE.sun }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m4.93 4.93 1.41 1.41", stroke: PALETTE.sun }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M20 12h2", stroke: PALETTE.sun }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "m19.07 4.93-1.41 1.41", stroke: PALETTE.sun }),
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v2", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 19v2", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v2", stroke: PALETTE.rain })
  ] });
}
function Rain() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v3", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 19v3", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v3", stroke: PALETTE.rain })
  ] });
}
function HeavyRain() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: CLOUD_LOW }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M7.5 19v3.5", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 18.5v3.5", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M13.5 19v3.5", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16.5 18.5v3.5", stroke: PALETTE.rain })
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
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M8 19v2", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M16 19v2", stroke: PALETTE.rain }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M12 18.5v3" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M10.5 20h3" })
  ] });
}
function Thunder() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "13 11 9 17 15 17 11 23", stroke: PALETTE.sun, fill: "none" })
  ] });
}
function ThunderHail() {
  return /* @__PURE__ */ (0, import_jsx_runtime.jsxs)(import_jsx_runtime.Fragment, { children: [
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("path", { d: "M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" }),
    /* @__PURE__ */ (0, import_jsx_runtime.jsx)("polyline", { points: "13 11 9 17 15 17 11 23", stroke: PALETTE.sun, fill: "none" }),
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
    // Reuses the <Sun /> art — keep this single implementation.
    sun: /* @__PURE__ */ (0, import_jsx_runtime.jsx)(Sun, {}),
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

// src/client/panels.tsx
var import_jsx_runtime2 = require("react/jsx-runtime");
var RAIN_RAMP = [
  { atLeast: 2.5, color: PALETTE.rainStrong },
  { atLeast: 1, color: PALETTE.rain },
  { atLeast: 0, color: PALETTE.rainSoft }
];
function TodayFacts(props) {
  const { items } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { "data-block": "today", style: { display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 12, fontSize: 12, color: TOKEN.fgMuted }, children: items.map((item) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 5 }, children: [
    item.glyph !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Glyph, { name: item.glyph, size: 14 }),
    item.text
  ] }, item.text)) });
}
function StatChip(props) {
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
    "div",
    {
      style: {
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
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { color: TOKEN.fgMuted }, children: props.icon }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 10, color: TOKEN.fgMuted, lineHeight: "13px" }, children: props.label }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
          "span",
          {
            style: {
              fontSize: 12.5,
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
              props.suffix !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { fontSize: "0.8em", fontWeight: 400, marginLeft: 1 }, children: [
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
function RainStrip(props) {
  const { points } = props;
  const maxValue = Math.max(...points.map((point) => point.precipitation), 0.5);
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", gap: 3, alignItems: "flex-end" }, children: points.map((point, index) => {
    const value = point.precipitation;
    const wet = value >= RAIN_MM_PER_15MIN;
    const height = wet ? Math.max(8, Math.min(30, 6 + value / maxValue * 24)) : 4;
    const color = !wet ? TOKEN.border : (RAIN_RAMP.find((entry) => value >= entry.atLeast) ?? RAIN_RAMP[RAIN_RAMP.length - 1]).color;
    return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { flex: "1 1 0", minWidth: 0, display: "flex", flexDirection: "column", alignItems: "center", gap: 3 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "div",
        {
          title: `${timeLabel(point.time)} ${value.toFixed(1)} mm`,
          style: { width: "100%", maxWidth: 14, height, borderRadius: 3, background: color, transition: "height 0.2s ease" }
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 9, lineHeight: "12px", color: TOKEN.fgMuted, whiteSpace: "nowrap" }, children: index % 4 === 0 ? timeLabel(point.time) : "" })
    ] }, point.time);
  }) });
}
function HourlyStrip(props) {
  const { title, points, fmt } = props;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "data-block": "hourly", style: { marginTop: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }, children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4 }, children: points.map((point) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { flex: "0 0 auto", width: 46, textAlign: "center", background: TOKEN.bgSoft, borderRadius: 10, padding: "5px 2px" }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11, color: TOKEN.fgMuted, ...NUM }, children: hourLabel(point.time) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { margin: "2px 0" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WeatherIcon, { code: point.weatherCode, isDay: point.isDay, size: 18 }) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12.5, fontWeight: 600, ...NUM }, children: fmt(point.temperature) }),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { fontSize: 10, color: point.precipProb > 0 ? TOKEN.accent : "transparent", ...NUM }, children: [
        point.precipProb,
        "%"
      ] })
    ] }, point.time)) })
  ] });
}
function DailyList(props) {
  const { title, points, fmt, onSelectDay } = props;
  const weekMin = points.length > 0 ? Math.min(...points.map((d) => d.tempMin)) : 0;
  const weekMax = points.length > 0 ? Math.max(...points.map((d) => d.tempMax)) : 1;
  const weekSpan = weekMax - weekMin || 1;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "data-block": "daily", style: { marginTop: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 6 }, children: title }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { children: points.map((point, index) => {
      const left = (point.tempMin - weekMin) / weekSpan * 100;
      const width = Math.max(8, (point.tempMax - point.tempMin) / weekSpan * 100);
      const row = {
        display: "flex",
        alignItems: "center",
        gap: 10,
        padding: "3px 2px",
        borderBottom: index === points.length - 1 ? "none" : `1px solid ${TOKEN.border}`,
        fontSize: 12.5
      };
      const cells = /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(import_jsx_runtime2.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 44, flex: "0 0 auto", ...NUM }, children: dayLabel(point.date, index) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 20, textAlign: "center", flex: "0 0 auto" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WeatherIcon, { code: point.weatherCode, isDay: true, size: 18 }) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { width: 36, flex: "0 0 auto", textAlign: "right", fontSize: 11, color: point.precipProb > 0 ? TOKEN.accent : TOKEN.fgMuted, ...NUM }, children: [
          point.precipProb,
          "%"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 36, flex: "0 0 auto", textAlign: "right", color: TOKEN.fgMuted, ...NUM }, children: fmt(point.tempMin) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { position: "relative", flex: 1, height: 4, borderRadius: 2, background: TOKEN.bgSoft, overflow: "hidden" }, children: /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
          "span",
          {
            style: {
              position: "absolute",
              left: `${left}%`,
              width: `${width}%`,
              top: 0,
              bottom: 0,
              borderRadius: 3,
              background: `linear-gradient(90deg, ${TOKEN.accent}, ${PALETTE.sun})`
            }
          }
        ) }),
        /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { width: 38, flex: "0 0 auto", textAlign: "right", fontWeight: 600, ...NUM }, children: fmt(point.tempMax) })
      ] });
      if (onSelectDay === void 0) {
        return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: row, children: cells }, point.date);
      }
      return /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(
        "button",
        {
          type: "button",
          onClick: () => onSelectDay(point.date),
          "aria-label": `\u67E5\u770B ${dayLabel(point.date, index)} \u5929\u6C14\u8BE6\u60C5`,
          style: {
            ...row,
            width: "100%",
            margin: 0,
            border: "none",
            borderBottom: row.borderBottom,
            borderRadius: 6,
            background: "transparent",
            color: "inherit",
            fontFamily: "inherit",
            textAlign: "left",
            cursor: "pointer"
          },
          children: cells
        },
        point.date
      );
    }) })
  ] });
}
function detailDateLabel(date) {
  const parsed = /* @__PURE__ */ new Date(`${date}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return date;
  const weekdays = ["\u5468\u65E5", "\u5468\u4E00", "\u5468\u4E8C", "\u5468\u4E09", "\u5468\u56DB", "\u5468\u4E94", "\u5468\u516D"];
  return `${parsed.getMonth() + 1}\u6708${parsed.getDate()}\u65E5 ${weekdays[parsed.getDay()]}`;
}
function DayDetailPanel(props) {
  const { detail, units, onBack } = props;
  const hasSun = detail.sunrise !== void 0 || detail.sunset !== void 0;
  const hasSummary = detail.precipSum !== void 0 || detail.windGustsMax !== void 0;
  return /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { "data-block": "day-detail", style: { marginTop: 10 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "button",
        {
          type: "button",
          onClick: onBack,
          autoFocus: true,
          style: { ...actionButton, display: "flex", alignItems: "center", gap: 4, padding: "4px 11px 4px 8px", flex: "0 0 auto" },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { "aria-hidden": "true", style: { fontSize: 13, lineHeight: "13px" }, children: "\u2190" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { children: "\u8FD4\u56DE" })
          ]
        }
      ),
      /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 13, fontWeight: 600, ...NUM }, children: detailDateLabel(detail.date) }),
      hasSun && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { marginLeft: "auto", display: "flex", alignItems: "center", gap: 10, fontSize: 12, color: TOKEN.fgMuted }, children: [
        detail.sunrise !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Glyph, { name: "sunrise", size: 13 }),
          timeLabel(detail.sunrise)
        ] }),
        detail.sunset !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { display: "flex", alignItems: "center", gap: 4 }, children: [
          /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(Glyph, { name: "sunset", size: 13 }),
          timeLabel(detail.sunset)
        ] })
      ] })
    ] }),
    hasSummary && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", flexWrap: "wrap", gap: "8px 18px", marginTop: 8, fontSize: 12, color: TOKEN.fgMuted }, children: [
      detail.precipSum !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { ...NUM }, children: [
        "\u964D\u6C34\u91CF ",
        detail.precipSum.toFixed(1),
        " mm"
      ] }),
      detail.windGustsMax !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("span", { style: { ...NUM }, children: [
        "\u6700\u5927\u9635\u98CE ",
        windText(detail.windGustsMax, units)
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)("div", { style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 4, marginTop: 8 }, children: [
      detail.hourly.length === 0 && /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u6682\u65E0\u9010\u5C0F\u65F6\u6570\u636E" }),
      detail.hourly.map((point) => /* @__PURE__ */ (0, import_jsx_runtime2.jsxs)(
        "div",
        {
          style: { flex: "0 0 auto", width: 50, textAlign: "center", background: TOKEN.bgSoft, borderRadius: 10, padding: "5px 2px" },
          children: [
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 11, color: TOKEN.fgMuted, ...NUM }, children: hourLabel(point.time) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { margin: "2px 0", minHeight: 18 }, children: point.weatherCode !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime2.jsx)(WeatherIcon, { code: point.weatherCode, isDay: point.isDay, size: 18 }) : /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u2014" }) }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 12.5, fontWeight: 600, ...NUM }, children: point.temperature !== void 0 ? tempText(point.temperature, units) : "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 10, color: point.precipProb !== void 0 && point.precipProb > 0 ? TOKEN.accent : TOKEN.fgMuted, ...NUM }, children: point.precipProb !== void 0 ? `${point.precipProb}%` : "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 9.5, lineHeight: "12px", color: TOKEN.fgMuted, whiteSpace: "nowrap", ...NUM }, children: point.windSpeed !== void 0 ? windText(point.windSpeed, units) : "\u2014" }),
            /* @__PURE__ */ (0, import_jsx_runtime2.jsx)("div", { style: { fontSize: 9.5, lineHeight: "12px", color: TOKEN.fgMuted, whiteSpace: "nowrap", ...NUM }, children: point.humidity !== void 0 ? `${Math.round(point.humidity)}%` : "\u2014" })
          ]
        },
        point.time
      ))
    ] })
  ] });
}

// src/client/TrendChart.tsx
var import_react2 = require("react");
var import_jsx_runtime3 = require("react/jsx-runtime");
var WIDTH = 640;
var PAD_X = 52;
var PAD_Y = 16;
function TrendChart(props) {
  const { values, labels, height = 88, unit = "" } = props;
  const gradientId = (0, import_react2.useId)();
  if (values.length < 2) {
    return /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u93C1\u7248\u5D41\u6D93\u5D88\u51BB" });
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
  return /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("svg", { viewBox: `0 0 ${WIDTH} ${height}`, width: "100%", height, style: { display: "block" }, "aria-hidden": "true", children: [
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("defs", { children: /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("linearGradient", { id: gradientId, x1: "0", y1: "0", x2: "0", y2: "1", children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("stop", { offset: "0%", style: { stopColor: TOKEN.accent, stopOpacity: 0.3 } }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("stop", { offset: "100%", style: { stopColor: TOKEN.accent, stopOpacity: 0.02 } })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("polygon", { points: area, fill: `url(#${gradientId})` }),
    showExtremes && /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)(import_jsx_runtime3.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("line", { x1: PAD_X, y1: maxPoint.y, x2: WIDTH - PAD_X, y2: maxPoint.y, stroke: TOKEN.accent, strokeOpacity: 0.3, strokeWidth: 1, strokeDasharray: "3 3" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("line", { x1: PAD_X, y1: minPoint.y, x2: WIDTH - PAD_X, y2: minPoint.y, stroke: TOKEN.accent, strokeOpacity: 0.16, strokeWidth: 1, strokeDasharray: "3 3" }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("text", { x: PAD_X - 6, y: maxPoint.y + 4, textAnchor: "end", fontSize: 12, fontWeight: 700, style: { fill: TOKEN.accent }, children: [
        Math.round(max),
        unit
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime3.jsxs)("text", { x: PAD_X - 6, y: minPoint.y + 4, textAnchor: "end", fontSize: 12, fontWeight: 700, style: { fill: TOKEN.fgMuted }, children: [
        Math.round(min),
        unit
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "polyline",
      {
        points: line,
        fill: "none",
        style: { stroke: TOKEN.accent },
        strokeWidth: 2,
        strokeLinecap: "round",
        strokeLinejoin: "round"
      }
    ),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: first.x, cy: first.y, r: 3.5, fill: TOKEN.accent, style: { stroke: TOKEN.bg }, strokeWidth: 1.5 }),
    /* @__PURE__ */ (0, import_jsx_runtime3.jsx)("circle", { cx: last.x, cy: last.y, r: 2.5, fill: TOKEN.accent }),
    labels !== void 0 && labelIndices.map((index) => /* @__PURE__ */ (0, import_jsx_runtime3.jsx)(
      "text",
      {
        x: points[index].x,
        y: height - 4,
        textAnchor: index === 0 ? "start" : index === values.length - 1 ? "end" : "middle",
        fontSize: 10.5,
        style: { fill: TOKEN.fgMuted },
        children: labels[index]
      },
      index
    ))
  ] });
}

// src/client/WeatherBar.tsx
var import_jsx_runtime4 = require("react/jsx-runtime");
var POPOVER_MAX_WIDTH = 560;
var POPOVER_MIN_WIDTH = 280;
var POPOVER_EDGE_GAP = 16;
function LiveClock() {
  const [now, setNow] = (0, import_react3.useState)(() => /* @__PURE__ */ new Date());
  (0, import_react3.useEffect)(() => {
    let timer = 0;
    const refresh = () => {
      setNow(/* @__PURE__ */ new Date());
      timer = window.setTimeout(refresh, 6e4 - Date.now() % 6e4 + 20);
    };
    timer = window.setTimeout(refresh, 6e4 - Date.now() % 6e4 + 20);
    return () => window.clearTimeout(timer);
  }, []);
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: clockSpan, children: [
    clockDate(now),
    " ",
    clockTime(now)
  ] });
}
function WeatherBar(props) {
  const { scope } = props;
  const [config, setConfig] = (0, import_react3.useState)(() => sanitizeConfig(scope.getSnapshot().value));
  const [open, setOpen] = (0, import_react3.useState)(false);
  const [pop, setPop] = (0, import_react3.useState)(null);
  const barRef = (0, import_react3.useRef)(null);
  const chipRef = (0, import_react3.useRef)(null);
  const popoverRef = (0, import_react3.useRef)(null);
  const popoverId = (0, import_react3.useId)();
  (0, import_react3.useEffect)(() => {
    const sync = () => {
      const next = sanitizeConfig(scope.getSnapshot().value);
      setConfig((prev) => sameConfig(prev, next) ? prev : next);
    };
    sync();
    return scope.subscribe(sync);
  }, [scope]);
  const effective = config ?? DEFAULT_WEATHER_CONFIG;
  const { location, locating, error: locationError, relocate, driftNotice } = useAutoLocation({ scope, effective });
  const feed = useWeatherFeed({ effective, location });
  const saved = useSavedLocations({ scope, effective });
  const day = useDayDetail(location);
  const writer = useConfigWriter(scope);
  const data = feed.data;
  const name = placeNameOf(effective, location);
  const savedMatch = location === null ? void 0 : saved.saved.find((entry) => placeKey(entry.latitude, entry.longitude) === placeKey(location.latitude, location.longitude));
  const status = locating ? effective.locationMode === "manual" ? "loading" : "locating" : location === null ? "error" : feed.status;
  const error = locationError ?? feed.error;
  useWeatherNotifications({ effective, data, placeName: name, stale: feed.stale });
  useDailyBrief({ effective, data, placeName: name, stale: feed.stale });
  useTabTitle({ effective, data, status, placeName: name });
  const toast = driftNotice ?? saved.notice;
  const measurePopover = (0, import_react3.useCallback)(() => {
    if (barRef.current === null) return;
    const rect = barRef.current.getBoundingClientRect();
    const rightRoom = window.innerWidth - rect.right - POPOVER_EDGE_GAP;
    const leftRoom = rect.left - POPOVER_EDGE_GAP;
    if (rightRoom >= leftRoom) {
      setPop({ align: "start", width: Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, rect.width + rightRoom)) });
    } else {
      setPop({ align: "end", width: Math.min(POPOVER_MAX_WIDTH, Math.max(POPOVER_MIN_WIDTH, rect.width + leftRoom)) });
    }
  }, []);
  const closePopover = (0, import_react3.useCallback)((restoreFocus) => {
    setOpen(false);
    if (restoreFocus && chipRef.current !== null) chipRef.current.focus();
  }, []);
  const togglePopover = () => {
    const next = !open;
    if (next) {
      measurePopover();
    } else {
      closePopover(true);
      return;
    }
    setOpen(next);
  };
  (0, import_react3.useEffect)(() => {
    if (!open) return;
    const onPointerDown = (event) => {
      if (barRef.current !== null && !barRef.current.contains(event.target)) {
        closePopover(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === "Escape") closePopover(true);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open, closePopover]);
  (0, import_react3.useEffect)(() => {
    if (!open) return;
    window.addEventListener("resize", measurePopover);
    return () => window.removeEventListener("resize", measurePopover);
  }, [open, measurePopover]);
  (0, import_react3.useEffect)(() => {
    if (open && popoverRef.current !== null) popoverRef.current.focus();
  }, [open]);
  (0, import_react3.useEffect)(() => {
    if (day.date !== null && popoverRef.current !== null) popoverRef.current.scrollTop = 0;
  }, [day.date]);
  (0, import_react3.useEffect)(() => {
    if (!open) day.close();
  }, [open, day.close]);
  const units = effective.units;
  const fmt = (value) => tempText(value, units);
  const alerts = (0, import_react3.useMemo)(
    () => data === null ? [] : evaluateAlerts(data, fmt, (kmh) => windText(kmh, units)),
    [data, units]
  );
  const advice = (0, import_react3.useMemo)(() => data === null ? null : weatherAdvice(data), [data]);
  const trendValues = (0, import_react3.useMemo)(() => data?.hourly.map((point) => point.temperature) ?? [], [data]);
  const trendLabels = (0, import_react3.useMemo)(() => data?.hourly.map((point) => hourLabel(point.time)) ?? [], [data]);
  if (!effective.enabled) return null;
  const writable = scope.getSnapshot().writable;
  const condition = data !== null ? describeCondition(data.current.weatherCode, data.current.isDay) : null;
  const unitSuffix = unitLabel(units);
  const windSuffixLabel = windUnitLabel(units);
  const busyText = status === "locating" ? "\u5B9A\u4F4D\u4E2D\u2026" : status === "loading" ? "\u52A0\u8F7D\u4E2D\u2026" : status === "error" ? "\u52A0\u8F7D\u5931\u8D25" : null;
  const showTemp = status === "ready" && data !== null;
  const barIcon = showTemp ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(WeatherIcon, { code: data.current.weatherCode, isDay: data.current.isDay, size: 17 }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "pin", size: 15 });
  const chipTitle = [
    name,
    showTemp && condition !== null ? condition.label : void 0,
    showTemp ? fmt(data.current.temperature) : void 0
  ].filter((part) => typeof part === "string").join(" \xB7 ");
  const hasDanger = alerts.some((alert) => alert.level === "danger");
  const air = data?.air;
  const airInfo = air !== void 0 && air.aqi !== void 0 ? aqiInfo(air.aqi) : null;
  const cur = data?.current;
  const windDisplayValue = windNumber(cur?.windSpeed, units);
  const windDeg = cur?.windDirection;
  const windTextValue = windDeg !== void 0 ? windDirectionText(windDeg) : void 0;
  const gustTextValue = cur?.windGusts !== void 0 ? windText(cur.windGusts, units) : void 0;
  const dewPointTextValue = cur?.dewPoint !== void 0 ? tempText(cur.dewPoint, units) : void 0;
  const pressureTextValue = cur?.pressure !== void 0 ? `${Math.round(cur.pressure)} hPa` : void 0;
  const visibilityTextValue = cur?.visibility !== void 0 ? `${Math.round(cur.visibility)} km` : void 0;
  const cloudTextValue = cur?.cloudCover !== void 0 ? `${Math.round(cur.cloudCover)}%` : void 0;
  const rainTotal = data?.daily[0]?.precipSum;
  const rainTotalText = rainTotal !== void 0 && rainTotal >= 0.05 ? `${rainTotal.toFixed(1)} mm` : void 0;
  const fact = (glyph, text) => ({ glyph, text });
  const todayItems = [];
  if (data?.sunrise !== void 0) todayItems.push(fact("sunrise", timeLabel(data.sunrise)));
  if (data?.sunset !== void 0) todayItems.push(fact("sunset", timeLabel(data.sunset)));
  if (data?.uvIndexMax !== void 0) todayItems.push(fact("sun", `UV ${Math.round(data.uvIndexMax)} ${uvLevel(data.uvIndexMax)}`));
  if (air?.pm25 !== void 0) todayItems.push(fact(void 0, `PM2.5 ${Math.round(air.pm25)}`));
  if (windTextValue !== void 0) todayItems.push(fact("wind", windTextValue));
  if (gustTextValue !== void 0) todayItems.push(fact("wind", `\u9635\u98CE ${gustTextValue}`));
  if (dewPointTextValue !== void 0) todayItems.push(fact("droplet", `\u9732\u70B9 ${dewPointTextValue}`));
  if (pressureTextValue !== void 0) todayItems.push(fact("gauge", `\u6C14\u538B ${pressureTextValue}`));
  if (visibilityTextValue !== void 0) todayItems.push(fact("eye", `\u80FD\u89C1\u5EA6 ${visibilityTextValue}`));
  if (cloudTextValue !== void 0) todayItems.push(fact("cloud", `\u4E91\u91CF ${cloudTextValue}`));
  if (rainTotalText !== void 0) todayItems.push(fact("droplet", `\u4ECA\u65E5\u96E8\u91CF ${rainTotalText}`));
  const banner = hasDanger ? BANNER.danger : BANNER.warning;
  const retry = () => {
    if (location === null) relocate();
    else feed.refresh();
  };
  const manualMissingCoords = effective.locationMode === "manual" && (effective.latitude === void 0 || effective.longitude === void 0);
  const pendingLabel = status === "locating" ? "\u5B9A\u4F4D\u4E2D\u2026" : "\u5929\u6C14\u52A0\u8F7D\u4E2D\u2026";
  return /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { ref: barRef, className: "dshw-root", style: { position: "relative", display: "inline-flex", fontSize: 13 }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "button",
      {
        ref: chipRef,
        type: "button",
        className: "dshw-bar",
        onClick: togglePopover,
        "aria-expanded": open,
        "aria-haspopup": "dialog",
        "aria-controls": popoverId,
        title: chipTitle,
        style: chipButton,
        children: [
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: chipIconWrap, children: barIcon }),
          showTemp ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: chipTemp, children: fmt(data.current.temperature) }),
            condition !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: chipCondition, children: condition.label })
          ] }) : busyText !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 14, lineHeight: "20px", color: TOKEN.fgMuted, whiteSpace: "nowrap", ...status === "error" ? { color: TOKEN.danger } : {} }, children: busyText }) : null,
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(LiveClock, {})
        ]
      }
    ),
    open && pop !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        ref: popoverRef,
        id: popoverId,
        role: "dialog",
        "aria-modal": "false",
        "aria-label": "\u5929\u6C14\u8BE6\u60C5",
        tabIndex: -1,
        className: "dshw-popover",
        style: {
          ...popoverStyle,
          width: pop.width,
          ...pop.align === "start" ? { left: 0 } : { right: 0 },
          outline: "none"
        },
        children: [
          status === "error" && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginBottom: 10 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: TOKEN.danger }, children: error ?? "\u52A0\u8F7D\u5931\u8D25" }),
            !manualMissingCoords && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: retry, style: actionButton, children: "\u27F3 \u91CD\u8BD5" })
          ] }),
          toast !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, marginBottom: 10, fontSize: 12.5, color: TOKEN.fg, background: TOKEN.bgSoft, border: `1px solid ${TOKEN.accent}`, borderRadius: 10, padding: "6px 10px" }, children: [
            "\u{1F4CD} ",
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: toast })
          ] }),
          /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 6, minWidth: 0 }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "pin", size: 14 }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 15, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }, children: name }),
              location?.source === "gps" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { flex: "0 0 auto", fontSize: 9.5, fontWeight: 700, color: TOKEN.accent, border: `1px solid ${TOKEN.accent}`, borderRadius: 999, padding: "0 5px", lineHeight: "14px" }, children: "GPS" }),
              location?.source === "ip" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { flex: "0 0 auto", fontSize: 9.5, fontWeight: 700, color: TOKEN.fgMuted, border: `1px solid ${TOKEN.border}`, borderRadius: 999, padding: "0 5px", lineHeight: "14px" }, children: "IP" })
            ] }),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 2, flex: "0 0 auto" }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (savedMatch !== void 0) saved.remove(savedMatch.id);
                    else saved.addCurrent();
                  },
                  disabled: !writable,
                  title: savedMatch !== void 0 ? `\u53D6\u6D88\u6536\u85CF ${name}` : "\u6536\u85CF\u5F53\u524D\u57CE\u5E02",
                  "aria-label": savedMatch !== void 0 ? `\u53D6\u6D88\u6536\u85CF ${name}` : "\u6536\u85CF\u5F53\u524D\u57CE\u5E02",
                  "aria-pressed": savedMatch !== void 0,
                  style: { ...iconButton, ...writable ? {} : { opacity: 0.5, cursor: "not-allowed" } },
                  children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 15, lineHeight: "16px" }, children: savedMatch !== void 0 ? "\u2605" : "\u2606" })
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: feed.refresh, title: "\u5237\u65B0", "aria-label": "\u5237\u65B0\u5929\u6C14", style: iconButton, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "refresh", size: 14 }) })
            ] })
          ] }),
          saved.saved.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "group", "aria-label": "\u5207\u6362\u57CE\u5E02", style: { display: "flex", gap: 6, overflowX: "auto", paddingBottom: 6, marginBottom: 8 }, children: [
            /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                onClick: saved.useCurrent,
                "aria-pressed": effective.locationMode === "auto",
                style: effective.locationMode === "auto" ? switchChipActive : switchChip,
                children: "\u5F53\u524D\u4F4D\u7F6E"
              }
            ),
            saved.saved.map((entry) => /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
              "button",
              {
                type: "button",
                onClick: () => saved.switchTo(entry.id),
                title: `${entry.latitude.toFixed(3)}, ${entry.longitude.toFixed(3)}`,
                "aria-pressed": saved.activeId === entry.id,
                style: saved.activeId === entry.id ? switchChipActive : switchChip,
                children: entry.name
              },
              entry.id
            ))
          ] }),
          status === "ready" && data !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
            day.date !== null ? (
              /* ── Day detail view ─────────────────────────────────────── */
              day.error !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { marginBottom: 10 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: TOKEN.danger }, children: day.error }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", gap: 8, marginTop: 6 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: day.retry, style: actionButton, children: "\u27F3 \u91CD\u8BD5" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: day.close, style: actionButton, children: "\u2190 \u8FD4\u56DE" })
                ] })
              ] }) : day.detail !== null ? /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(DayDetailPanel, { detail: day.detail, units, onBack: day.close }) : /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: TOKEN.fgMuted, textAlign: "center", padding: 20 }, children: "\u52A0\u8F7D\u5F53\u65E5\u8BE6\u60C5\u2026" })
            ) : (
              /* ── Normal forecast view ────────────────────────────────── */
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(import_jsx_runtime4.Fragment, { children: [
                feed.stale && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginBottom: 10, fontSize: 12, lineHeight: "17px", color: BANNER.warning.color, background: BANNER.warning.bg, border: `1px solid ${BANNER.warning.border}`, borderRadius: 10, padding: "6px 10px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("span", { style: { flex: "1 1 auto", minWidth: 0 }, children: [
                    "\u6570\u636E\u66F4\u65B0\u5931\u8D25",
                    error !== null ? `\uFF08${error}\uFF09` : "",
                    "\uFF0C\u663E\u793A ",
                    feed.updatedAt !== null ? `${hhmm(feed.updatedAt)} \u7684` : "\u4E0A\u6B21",
                    "\u5FEB\u7167"
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: retry, style: actionButton, children: "\u27F3 \u91CD\u8BD5" })
                ] }),
                alerts.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
                  "div",
                  {
                    style: {
                      display: "flex",
                      alignItems: "flex-start",
                      gap: 6,
                      marginBottom: 10,
                      fontSize: 12,
                      lineHeight: "17px",
                      color: banner.color,
                      background: banner.bg,
                      border: `1px solid ${banner.border}`,
                      borderRadius: 10,
                      padding: "6px 10px"
                    },
                    children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: "\u26A0" }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: alerts.map((a) => `${a.title}\uFF1A${a.detail}`).join("\uFF1B") })
                    ]
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { "data-block": "hero-stats", style: { display: "flex", alignItems: "center", gap: 18, marginTop: 4 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { flex: "0 0 auto", display: "flex", alignItems: "center", gap: 12 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { flex: "0 0 auto", display: "flex", alignItems: "center", justifyContent: "center", width: 58, height: 58, borderRadius: 16, background: TOKEN.bgSoft, border: `1px solid ${TOKEN.border}` }, children: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(WeatherIcon, { code: data.current.weatherCode, isDay: data.current.isDay, size: 36 }) }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { minWidth: 0 }, children: [
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: 30, fontWeight: 700, lineHeight: "34px", ...NUM }, children: fmt(data.current.temperature) }),
                      /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { fontSize: 12.5, color: TOKEN.fgMuted, lineHeight: "17px", marginTop: 1 }, children: [
                        condition?.label,
                        " \xB7 \u4F53\u611F ",
                        fmt(data.current.apparentTemperature)
                      ] })
                    ] })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { flex: "1 1 0", minWidth: 0, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 6 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      StatChip,
                      {
                        icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "droplet", size: 13 }),
                        label: "\u6E7F\u5EA6",
                        value: cur?.humidity !== void 0 ? `${Math.round(cur.humidity)}%` : "--"
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      StatChip,
                      {
                        icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "wind", size: 13 }),
                        label: "\u98CE\u901F",
                        value: windDisplayValue !== void 0 ? `${Math.round(windDisplayValue)}` : "--",
                        suffix: windDisplayValue !== void 0 ? windSuffixLabel : void 0
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(StatChip, { icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "umbrella", size: 13 }), label: "\u4ECA\u65E5\u964D\u6C34", value: data.daily[0] !== void 0 ? `${data.daily[0].precipProb}%` : "--" }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                      StatChip,
                      {
                        icon: /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(Glyph, { name: "wind", size: 13 }),
                        label: "\u7A7A\u6C14",
                        value: airInfo !== null ? `${airInfo.label} ${air?.aqi}` : "--",
                        valueColor: airInfo?.color
                      }
                    )
                  ] })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(TodayFacts, { items: todayItems }),
                data.minutely !== void 0 && data.minutely.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { "data-block": "rain", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: 8, marginBottom: 6 }, children: [
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u672A\u6765 6 \u5C0F\u65F6\u964D\u6C34" }),
                    /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 12, fontWeight: 600, color: data.rainSoon?.rainingNow === true || data.rainSoon?.onsetMinutes !== void 0 ? TOKEN.accent : TOKEN.fgMuted }, children: rainTimingText(data.rainSoon ?? { rainingNow: false }) })
                  ] }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(RainStrip, { points: data.minutely })
                ] }),
                advice !== null && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { "data-block": "advice", style: { display: "flex", alignItems: "center", gap: 7, marginTop: 10, fontSize: 12.5, color: TOKEN.fgMuted, background: TOKEN.bgSoft, borderRadius: 10, padding: "8px 12px" }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: advice.icon }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { children: advice.text })
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { "data-block": "trend", style: { marginTop: 10 }, children: [
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { fontSize: 12, color: TOKEN.fgMuted, marginBottom: 4 }, children: "\u672A\u6765 24 \u5C0F\u65F6\u6E29\u5EA6" }),
                  /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                    TrendChart,
                    {
                      values: trendValues,
                      labels: trendLabels,
                      unit: unitSuffix,
                      height: 56
                    }
                  )
                ] }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(HourlyStrip, { title: "\u672A\u6765 12 \u5C0F\u65F6", points: data.hourly.slice(0, 12), fmt }),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  DailyList,
                  {
                    title: "\u672A\u6765 7 \u5929\uFF08\u70B9\u51FB\u67E5\u770B\u5F53\u65E5\u8BE6\u60C5\uFF09",
                    points: data.daily,
                    fmt,
                    onSelectDay: day.open
                  }
                )
              ] })
            ),
            /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { style: { display: "flex", alignItems: "center", gap: 8, marginTop: 10, paddingTop: 8, borderTop: `1px solid ${TOKEN.border}` }, children: [
              /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("span", { style: { fontSize: 12, color: TOKEN.fgMuted }, children: "\u5355\u4F4D" }),
              /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)("div", { role: "group", "aria-label": "\u6E29\u5EA6\u5355\u4F4D", style: { display: "flex", background: TOKEN.bgSoft, borderRadius: 999, padding: 2 }, children: [
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    disabled: !writable,
                    "aria-pressed": units === "celsius",
                    onClick: () => {
                      void writer.write("units", "celsius");
                    },
                    title: writable ? void 0 : "\u5F53\u524D\u8FDE\u63A5\u4E0D\u652F\u6301\u4FEE\u6539\u8BBE\u7F6E",
                    style: { ...segmentButton, fontWeight: units === "celsius" ? 700 : 400, background: units === "celsius" ? TOKEN.bg : "transparent", ...writable ? {} : { opacity: 0.5, cursor: "not-allowed" } },
                    children: "\xB0C"
                  }
                ),
                /* @__PURE__ */ (0, import_jsx_runtime4.jsx)(
                  "button",
                  {
                    type: "button",
                    disabled: !writable,
                    "aria-pressed": units === "fahrenheit",
                    onClick: () => {
                      void writer.write("units", "fahrenheit");
                    },
                    title: writable ? void 0 : "\u5F53\u524D\u8FDE\u63A5\u4E0D\u652F\u6301\u4FEE\u6539\u8BBE\u7F6E",
                    style: { ...segmentButton, fontWeight: units === "fahrenheit" ? 700 : 400, background: units === "fahrenheit" ? TOKEN.bg : "transparent", ...writable ? {} : { opacity: 0.5, cursor: "not-allowed" } },
                    children: "\xB0F"
                  }
                )
              ] }),
              effective.locationMode === "auto" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("button", { type: "button", onClick: relocate, style: actionButton, children: "\u{1F4CD} \u91CD\u65B0\u5B9A\u4F4D" })
            ] })
          ] }),
          status !== "ready" && status !== "error" && /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("div", { style: { color: TOKEN.fgMuted, textAlign: "center", padding: 20 }, children: pendingLabel })
        ]
      }
    ),
    toast !== null && !open && /* @__PURE__ */ (0, import_jsx_runtime4.jsxs)(
      "div",
      {
        style: {
          position: "absolute",
          top: "calc(100% + 8px)",
          ...pop?.align === "end" ? { right: 0 } : { left: 0 },
          zIndex: 70,
          display: "flex",
          alignItems: "center",
          gap: 6,
          background: TOKEN.bg,
          color: TOKEN.fg,
          border: `1px solid ${TOKEN.accent}`,
          borderRadius: 10,
          boxShadow: SHADOW.floating,
          padding: "6px 12px",
          fontSize: 12.5,
          whiteSpace: "nowrap"
        },
        children: [
          "\u{1F4CD} ",
          /* @__PURE__ */ (0, import_jsx_runtime4.jsx)("b", { children: toast })
        ]
      }
    )
  ] });
}
var chipButton = {
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
};
var chipIconWrap = {
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
};
var chipTemp = { fontSize: 17, fontWeight: 700, lineHeight: "22px", ...NUM, flex: "0 0 auto" };
var chipCondition = { fontSize: 14, lineHeight: "20px", color: TOKEN.fgMuted, whiteSpace: "nowrap", flex: "0 0 auto" };
var clockSpan = {
  flex: "0 0 auto",
  fontSize: 14,
  lineHeight: "20px",
  color: TOKEN.fgMuted,
  whiteSpace: "nowrap",
  paddingLeft: 8,
  borderLeft: `1px solid ${TOKEN.border}`,
  ...NUM
};
var switchChip = {
  ...baseButton,
  flex: "0 0 auto",
  fontSize: 12,
  lineHeight: "18px",
  color: TOKEN.fg,
  background: TOKEN.bgSoft,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 999,
  padding: "2px 10px",
  cursor: "pointer",
  maxWidth: 140,
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var switchChipActive = {
  ...switchChip,
  border: `1px solid ${TOKEN.accent}`,
  color: TOKEN.accent,
  fontWeight: 600
};
var popoverStyle = {
  position: "absolute",
  top: "calc(100% + 8px)",
  zIndex: 60,
  maxWidth: "calc(100vw - 24px)",
  maxHeight: "calc(100vh - 150px)",
  overflowY: "auto",
  background: TOKEN.bg,
  color: TOKEN.fg,
  border: `1px solid ${TOKEN.border}`,
  borderRadius: 16,
  boxShadow: SHADOW.popover,
  padding: 14,
  fontSize: 13.5,
  textAlign: "left"
};

// src/client/WeatherSettings.tsx
var import_react4 = require("react");
var import_jsx_runtime5 = require("react/jsx-runtime");
var FG = TOKEN.fg;
var MUTED = TOKEN.fgMuted;
var BORDER = TOKEN.border;
var ACCENT = TOKEN.accent;
var BG_ROW = TOKEN.bgSoft;
var INPUT_BG = TOKEN.bgRaised;
var DANGER = TOKEN.danger;
var OK = "#2f9e44";
function WeatherSettingsSection(props) {
  const { scope, probe } = props;
  const [config, setConfig] = (0, import_react4.useState)(() => sanitizeConfig(scope.getSnapshot().value));
  const [search, setSearch] = (0, import_react4.useState)("");
  const [suggestions, setSuggestions] = (0, import_react4.useState)([]);
  const [searching, setSearching] = (0, import_react4.useState)(false);
  const [notice, setNotice] = (0, import_react4.useState)(null);
  const [diag, setDiag] = (0, import_react4.useState)(null);
  const [diagBusy, setDiagBusy] = (0, import_react4.useState)(false);
  const [latInput, setLatInput] = (0, import_react4.useState)("");
  const [lonInput, setLonInput] = (0, import_react4.useState)("");
  const [nameInput, setNameInput] = (0, import_react4.useState)("");
  const [refreshInput, setRefreshInput] = (0, import_react4.useState)(DEFAULT_WEATHER_CONFIG.refreshMinutes);
  const [pendingDeleteId, setPendingDeleteId] = (0, import_react4.useState)(null);
  const [permission, setPermission] = (0, import_react4.useState)(() => typeof Notification !== "undefined" ? Notification.permission : "denied");
  const ids = (0, import_react4.useId)();
  const skipNextSearchRef = (0, import_react4.useRef)(false);
  const searchBoxRef = (0, import_react4.useRef)(null);
  const diagRunRef = (0, import_react4.useRef)(0);
  const effective = config ?? DEFAULT_WEATHER_CONFIG;
  const snapshot = scope.getSnapshot();
  const notify = (0, import_react4.useCallback)((text, kind = "ok") => {
    setNotice({ text, kind });
  }, []);
  const clearNotice = (0, import_react4.useCallback)(() => setNotice(null), []);
  (0, import_react4.useEffect)(() => {
    const sync = () => {
      const next = sanitizeConfig(scope.getSnapshot().value);
      setConfig((prev) => sameConfig(prev, next) ? prev : next);
    };
    sync();
    return scope.subscribe(sync);
  }, [scope]);
  const prevCoordsRef = (0, import_react4.useRef)({ lat: effective.latitude, lon: effective.longitude });
  (0, import_react4.useEffect)(() => {
    const prev = prevCoordsRef.current;
    if (effective.latitude !== prev.lat) setLatInput(effective.latitude?.toString() ?? "");
    if (effective.longitude !== prev.lon) setLonInput(effective.longitude?.toString() ?? "");
    prevCoordsRef.current = { lat: effective.latitude, lon: effective.longitude };
  }, [effective.latitude, effective.longitude]);
  (0, import_react4.useEffect)(() => {
    setNameInput(effective.cityName ?? "");
  }, [effective.cityName]);
  (0, import_react4.useEffect)(() => {
    setRefreshInput(effective.refreshMinutes);
  }, [effective.refreshMinutes]);
  (0, import_react4.useEffect)(() => {
    setSuggestions([]);
    setSearching(false);
  }, [effective.locationMode]);
  (0, import_react4.useEffect)(() => {
    if (suggestions.length === 0) return;
    const onPointerDown = (event) => {
      if (searchBoxRef.current !== null && !searchBoxRef.current.contains(event.target)) {
        setSuggestions([]);
      }
    };
    document.addEventListener("mousedown", onPointerDown);
    return () => document.removeEventListener("mousedown", onPointerDown);
  }, [suggestions.length]);
  (0, import_react4.useEffect)(() => {
    const refresh = () => setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, []);
  (0, import_react4.useEffect)(() => () => {
    diagRunRef.current += 1;
  }, []);
  (0, import_react4.useEffect)(() => {
    if (skipNextSearchRef.current) {
      skipNextSearchRef.current = false;
      return;
    }
    const trimmed = search.trim();
    if (trimmed === "") {
      setSuggestions([]);
      setSearching(false);
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
  const commit = (0, import_react4.useCallback)((fields, clears = []) => {
    if (!scope.getSnapshot().writable) {
      notify("\u5F53\u524D\u8FDE\u63A5\u4E0D\u652F\u6301\u4FEE\u6539\u8BBE\u7F6E\uFF08\u53EA\u8BFB\uFF09", "err");
      return;
    }
    const rawFields = fields.map(([field, value]) => [field, value]);
    const rawClears = clears.map((field) => field);
    void writeVerified(scope, rawFields, rawClears).then((accepted) => {
      if (accepted) return;
      const clientRevision = scope.getSnapshot().revision;
      void probe(rawFields, rawClears).then((result) => {
        notify(
          result.landed ? `\u5DF2\u4FDD\u5B58\uFF08\u8BE5\u5199\u5165\u88AB\u7248\u672C\u6805\u680F\u6321\u4F4F\uFF0C\u5DF2\u6539\u7528\u65E0\u6805\u680F\u5199\u5165\uFF1B\u5BA2\u6237\u7AEF rev=${clientRevision ?? "?"}\uFF09` : `\u8BE5\u8BBE\u7F6E\u672A\u88AB\u4FDD\u5B58\uFF1A${result.detail}\uFF5C\u5BA2\u6237\u7AEF rev=${clientRevision ?? "?"}`,
          result.landed ? "ok" : "err"
        );
      });
    });
  }, [scope, notify, probe]);
  const set = (0, import_react4.useCallback)((field, value) => {
    commit([[field, value]]);
  }, [commit]);
  const savedCities = useSavedLocations({ scope, effective, onNotice: notify });
  const requestNotificationPermission = (0, import_react4.useCallback)(() => {
    if (typeof Notification === "undefined" || Notification.permission !== "default") return;
    void Notification.requestPermission().then(() => {
      setPermission(typeof Notification !== "undefined" ? Notification.permission : "denied");
    });
  }, []);
  const commitCoordinate = (kind, input2) => {
    const range = kind === "latitude" ? LAT_RANGE : LON_RANGE;
    const label = kind === "latitude" ? "\u7EAC\u5EA6" : "\u7ECF\u5EA6";
    const revertDraft = () => {
      if (kind === "latitude") setLatInput(effective.latitude?.toString() ?? "");
      else setLonInput(effective.longitude?.toString() ?? "");
    };
    if (input2.validity.badInput) {
      notify(`${label}\u683C\u5F0F\u4E0D\u6B63\u786E\uFF08\u672A\u4FDD\u5B58\uFF09`, "err");
      revertDraft();
      return;
    }
    const text = input2.value.trim();
    if (text === "") {
      commit([], [kind, "activeSavedId"]);
      return;
    }
    const value = Number(text);
    if (!Number.isFinite(value) || value < range.min || value > range.max) {
      notify(`${label}\u987B\u5728 ${range.min}~${range.max} \u4E4B\u95F4\uFF08\u5F53\u524D\u8F93\u5165\u672A\u4FDD\u5B58\uFF09`, "err");
      revertDraft();
      return;
    }
    if (value === effective[kind]) return;
    commit([[kind, value]], ["activeSavedId"]);
  };
  const commitName = (input2) => {
    const next = input2.value.trim().slice(0, MAX_NAME_LENGTH);
    if (next === effective.cityName) return;
    if (next === "") {
      commit([], ["cityName", "activeSavedId"]);
      return;
    }
    commit([["cityName", next]], ["activeSavedId"]);
  };
  const commitRefresh = () => {
    if (refreshInput === effective.refreshMinutes) return;
    set("refreshMinutes", refreshInput);
  };
  const commitClockTime = (field, text) => {
    const parsed = parseClockTime(text);
    if (parsed === void 0) {
      notify("\u65F6\u95F4\u683C\u5F0F\u5E94\u4E3A HH:MM", "err");
      return;
    }
    const other = field === "briefMorning" ? effective.briefEvening : effective.briefMorning;
    if (parsed === other) {
      notify("\u65E9\u4E0A\u4E0E\u665A\u95F4\u7B80\u62A5\u65F6\u95F4\u4E0D\u80FD\u76F8\u540C", "err");
      return;
    }
    if (parsed === effective[field]) return;
    clearNotice();
    set(field, parsed);
  };
  const atSavedLimit = savedCities.saved.length >= MAX_SAVED_LOCATIONS;
  const permissionHint = permission === "denied" ? "\u901A\u77E5\u6743\u9650\u5DF2\u88AB\u6D4F\u89C8\u5668\u62D2\u7EDD\uFF0C\u8BF7\u5728\u7AD9\u70B9\u8BBE\u7F6E\u4E2D\u5141\u8BB8\u540E\u91CD\u65B0\u5F00\u542F\u3002" : permission === "default" ? "\u6D4F\u89C8\u5668\u901A\u77E5\u5C1A\u672A\u6388\u6743\u2014\u2014\u5F00\u542F\u65F6\u8BF7\u5141\u8BB8\uFF0C\u5426\u5219\u63D0\u9192\u4E0E\u7B80\u62A5\u4E0D\u4F1A\u63A8\u9001\u3002" : null;
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { maxWidth: 560, padding: "4px 0 20px", color: FG }, children: [
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { fontSize: 15, fontWeight: 600, marginBottom: 4 }, children: "\u5929\u6C14" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: MUTED, fontSize: 12.5, marginBottom: 16 }, children: "\u4F1A\u8BDD\u9876\u90E8\u64CD\u4F5C\u884C\u7684\u5929\u6C14 chip\uFF08\u6570\u636E\u6765\u6E90\uFF1AOpen-Meteo\uFF0C\u65E0\u9700 API key\uFF09\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u663E\u793A\u5929\u6C14\u680F", labelFor: `${ids}-enabled`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        id: `${ids}-enabled`,
        type: "checkbox",
        checked: effective.enabled,
        onChange: (event) => set("enabled", event.target.checked),
        style: checkbox
      }
    ) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u6076\u52A3\u5929\u6C14\u63D0\u9192", labelFor: `${ids}-alerts`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        id: `${ids}-alerts`,
        type: "checkbox",
        checked: effective.alertsEnabled,
        onChange: (event) => {
          set("alertsEnabled", event.target.checked);
          if (event.target.checked) requestNotificationPermission();
        },
        style: checkbox
      }
    ) }),
    effective.alertsEnabled && permissionHint !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: permission === "denied" ? DANGER : MUTED, fontSize: 12, margin: "-2px 0 10px 12px" }, children: permissionHint }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: MUTED, fontSize: 12, margin: "-2px 0 10px 12px" }, children: "\u5F3A\u964D\u96E8 / \u96F7\u66B4 / \u9AD8\u6E29 / \u5927\u98CE / \u5F3A\u964D\u96EA\u65F6\u53D1\u9001\u6D4F\u89C8\u5668\u901A\u77E5\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u6BCF\u65E5\u5929\u6C14\u7B80\u62A5", labelFor: `${ids}-brief`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        id: `${ids}-brief`,
        type: "checkbox",
        checked: effective.briefEnabled,
        onChange: (event) => {
          set("briefEnabled", event.target.checked);
          if (event.target.checked) requestNotificationPermission();
        },
        style: checkbox
      }
    ) }),
    effective.briefEnabled && permissionHint !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: permission === "denied" ? DANGER : MUTED, fontSize: 12, margin: "-2px 0 10px 12px" }, children: permissionHint }),
    effective.briefEnabled && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Row, { label: "\u65E9\u4E0A\u7B80\u62A5\u65F6\u95F4", labelFor: `${ids}-brief-morning`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            id: `${ids}-brief-morning`,
            type: "time",
            value: effective.briefMorning,
            "aria-label": "\u65E9\u4E0A\u7B80\u62A5\u65F6\u95F4\uFF08HH:MM\uFF09",
            onChange: (event) => commitClockTime("briefMorning", event.currentTarget.value),
            style: { ...input, width: 120 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { color: MUTED, fontSize: 12, whiteSpace: "nowrap" }, children: "\u63A8\u9001\u4ECA\u65E5\u5929\u6C14" })
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(Row, { label: "\u665A\u95F4\u7B80\u62A5\u65F6\u95F4", labelFor: `${ids}-brief-evening`, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            id: `${ids}-brief-evening`,
            type: "time",
            value: effective.briefEvening,
            "aria-label": "\u665A\u95F4\u7B80\u62A5\u65F6\u95F4\uFF08HH:MM\uFF09",
            onChange: (event) => commitClockTime("briefEvening", event.currentTarget.value),
            style: { ...input, width: 120 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { color: MUTED, fontSize: 12, whiteSpace: "nowrap" }, children: "\u63A8\u9001\u660E\u65E5\u5929\u6C14" })
      ] })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: MUTED, fontSize: 12, margin: "-2px 0 10px 12px" }, children: "\u5230\u70B9\u540E\u901A\u8FC7\u6D4F\u89C8\u5668\u901A\u77E5\u63A8\u9001\uFF08\u6309\u672C\u673A\u65F6\u95F4\uFF0C\u6700\u591A\u8865\u53D1 2 \u5C0F\u65F6\uFF09\uFF1A\u65E9\u4E0A\uFF1D\u4ECA\u65E5\u6700\u9AD8/\u6700\u4F4E\u4E0E\u964D\u6C34\u6982\u7387\uFF0C\u665A\u4E0A\uFF1D\u660E\u65E5\u6982\u51B5\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u5B9A\u4F4D\u65B9\u5F0F", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-weather-location-mode",
            checked: effective.locationMode === "auto",
            onChange: () => commit([["locationMode", "auto"]], ["activeSavedId"])
          }
        ),
        "\u81EA\u52A8\uFF08GPS \u5B9A\u4F4D\uFF0C\u5931\u8D25\u56DE\u9000 IP\uFF09"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "radio",
            name: "dsh-weather-location-mode",
            checked: effective.locationMode === "manual",
            onChange: () => commit([["locationMode", "manual"]], ["activeSavedId"])
          }
        ),
        "\u624B\u52A8"
      ] })
    ] }) }),
    effective.locationMode === "manual" && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u57CE\u5E02\u641C\u7D22", labelFor: `${ids}-search`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { ref: searchBoxRef, style: { position: "relative", flex: 1 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            id: `${ids}-search`,
            type: "text",
            value: search,
            maxLength: MAX_NAME_LENGTH,
            placeholder: "\u8F93\u5165\u57CE\u5E02\u540D\uFF0C\u5982\uFF1A\u5317\u4EAC / Beijing",
            onChange: (event) => setSearch(event.target.value),
            onKeyDown: (event) => {
              if (event.key === "Escape") setSuggestions([]);
            },
            style: { ...input, paddingRight: searching ? 72 : void 0 },
            "aria-label": "\u641C\u7D22\u57CE\u5E02",
            "aria-expanded": suggestions.length > 0
          }
        ),
        searching && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: searchingBadge, children: "\u641C\u7D22\u4E2D\u2026" }),
        suggestions.length > 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "div",
          {
            id: `${ids}-suggestions`,
            role: "list",
            "aria-label": "\u57CE\u5E02\u641C\u7D22\u7ED3\u679C",
            className: "dshw-ac-panel",
            style: suggestionPanel,
            children: suggestions.map((place) => {
              const alreadySaved = savedCities.isSaved(place.latitude, place.longitude);
              const saveBlocked = alreadySaved || atSavedLimit;
              const saveHint = alreadySaved ? `${place.name} \u5DF2\u6536\u85CF` : atSavedLimit ? `\u6700\u591A\u6536\u85CF ${MAX_SAVED_LOCATIONS} \u4E2A\u57CE\u5E02` : `\u6536\u85CF ${place.name}`;
              return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                "div",
                {
                  role: "listitem",
                  className: "dshw-ac-row",
                  style: suggestionRow,
                  children: [
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
                      "button",
                      {
                        type: "button",
                        className: "dshw-ac-pick",
                        "aria-label": `\u5207\u6362\u5230 ${place.name}`,
                        onClick: () => {
                          savedCities.selectPlace(place);
                          if (place.name !== search) {
                            skipNextSearchRef.current = true;
                            setSearch(place.name);
                          }
                          setSuggestions([]);
                        },
                        style: suggestionPick,
                        children: [
                          /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: suggestionPin, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Glyph, { name: "pin", size: 14 }) }),
                          /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: suggestionLines, children: [
                            /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: suggestionName, children: place.name }),
                            /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: suggestionCoords, children: [
                              place.latitude.toFixed(2),
                              ", ",
                              place.longitude.toFixed(2)
                            ] })
                          ] })
                        ]
                      }
                    ),
                    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                      "button",
                      {
                        type: "button",
                        className: "dshw-ac-save",
                        disabled: saveBlocked,
                        title: saveHint,
                        "aria-label": saveHint,
                        onClick: () => savedCities.addPlace({ name: place.name, latitude: place.latitude, longitude: place.longitude }),
                        style: {
                          ...suggestionSave,
                          ...saveBlocked ? { color: MUTED, cursor: "default" } : {}
                        },
                        children: alreadySaved ? "\u5DF2\u6536\u85CF" : "\u6536\u85CF"
                      }
                    )
                  ]
                },
                `${place.latitude},${place.longitude},${place.name}`
              );
            })
          }
        )
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u7EAC\u5EA6 / \u7ECF\u5EA6", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 8, alignItems: "center" }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "number",
            step: "0.0001",
            min: LAT_RANGE.min,
            max: LAT_RANGE.max,
            value: latInput,
            "aria-label": "\u7EAC\u5EA6\uFF08-90 ~ 90\uFF09",
            placeholder: "\u7EAC\u5EA6",
            onChange: (event) => {
              clearNotice();
              setLatInput(event.target.value);
            },
            onBlur: (event) => commitCoordinate("latitude", event.currentTarget),
            onKeyDown: (event) => {
              if (event.key === "Enter") commitCoordinate("latitude", event.currentTarget);
            },
            style: { ...input, width: 120 }
          }
        ),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { color: MUTED }, children: "/" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "input",
          {
            type: "number",
            step: "0.0001",
            min: LON_RANGE.min,
            max: LON_RANGE.max,
            value: lonInput,
            "aria-label": "\u7ECF\u5EA6\uFF08-180 ~ 180\uFF09",
            placeholder: "\u7ECF\u5EA6",
            onChange: (event) => {
              clearNotice();
              setLonInput(event.target.value);
            },
            onBlur: (event) => commitCoordinate("longitude", event.currentTarget),
            onKeyDown: (event) => {
              if (event.key === "Enter") commitCoordinate("longitude", event.currentTarget);
            },
            style: { ...input, width: 120 }
          }
        )
      ] }) }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u663E\u793A\u540D\u79F0", labelFor: `${ids}-cityname`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
        "input",
        {
          id: `${ids}-cityname`,
          type: "text",
          value: nameInput,
          maxLength: MAX_NAME_LENGTH,
          placeholder: "\u5982\uFF1A\u5317\u4EAC",
          onChange: (event) => {
            clearNotice();
            setNameInput(event.target.value);
          },
          onBlur: (event) => commitName(event.currentTarget),
          onKeyDown: (event) => {
            if (event.key === "Enter") commitName(event.currentTarget);
          },
          style: input
        }
      ) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { padding: "10px 12px", marginBottom: 8, background: BG_ROW, borderRadius: 10 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { fontSize: 13 }, children: [
          "\u6536\u85CF\u57CE\u5E02\uFF08",
          savedCities.saved.length,
          "/",
          MAX_SAVED_LOCATIONS,
          "\uFF09"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            onClick: savedCities.addCurrent,
            disabled: atSavedLimit,
            title: atSavedLimit ? `\u6700\u591A\u6536\u85CF ${MAX_SAVED_LOCATIONS} \u4E2A\u57CE\u5E02` : void 0,
            style: { ...inputButton, padding: "5px 12px", fontSize: 12.5, ...atSavedLimit ? { opacity: 0.5, cursor: "not-allowed" } : {} },
            children: "\uFF0B \u6536\u85CF\u5F53\u524D\u4F4D\u7F6E"
          }
        )
      ] }),
      savedCities.saved.length === 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: MUTED, fontSize: 12 }, children: "\u8FD8\u6CA1\u6709\u6536\u85CF\u57CE\u5E02\u2014\u2014\u641C\u7D22\u57CE\u5E02\u540E\u70B9 \u2606 \u6536\u85CF\uFF0C\u6216\u6536\u85CF\u5F53\u524D\u4F4D\u7F6E\u3002" }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", flexDirection: "column", gap: 6 }, children: savedCities.saved.map((place) => {
        const active = savedCities.activeId === place.id;
        const confirming = pendingDeleteId === place.id;
        return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(
          "div",
          {
            style: {
              display: "flex",
              alignItems: "center",
              gap: 8,
              padding: "6px 8px",
              border: `1px solid ${active ? ACCENT : BORDER}`,
              borderRadius: 8,
              background: active ? INPUT_BG : "transparent"
            },
            children: [
              /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { flex: 1, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", fontSize: 13 }, children: [
                place.name,
                /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("span", { style: { color: MUTED, fontSize: 12 }, children: [
                  "\u3000",
                  place.latitude.toFixed(3),
                  ", ",
                  place.longitude.toFixed(3)
                ] })
              ] }),
              active && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { "aria-current": "true", style: { fontSize: 11, color: ACCENT, border: `1px solid ${ACCENT}`, borderRadius: 6, padding: "0 5px", whiteSpace: "nowrap" }, children: "\u5F53\u524D" }),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => savedCities.switchTo(place.id),
                  "aria-label": `\u5207\u6362\u5230 ${place.name}`,
                  style: { ...inputButton, padding: "4px 10px", fontSize: 12.5 },
                  children: "\u5207\u6362"
                }
              ),
              /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
                "button",
                {
                  type: "button",
                  onClick: () => {
                    if (!confirming) {
                      setPendingDeleteId(place.id);
                      return;
                    }
                    setPendingDeleteId(null);
                    savedCities.remove(place.id);
                  },
                  onBlur: () => setPendingDeleteId((prev) => prev === place.id ? null : prev),
                  "aria-label": confirming ? `\u786E\u8BA4\u5220\u9664 ${place.name}` : `\u5220\u9664 ${place.name}`,
                  style: { ...inputButton, padding: "4px 10px", fontSize: 12.5, color: DANGER, borderColor: DANGER },
                  children: confirming ? "\u786E\u8BA4\u5220\u9664" : "\u5220\u9664"
                }
              )
            ]
          },
          place.id
        );
      }) })
    ] }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: "\u6E29\u5EA6\u5355\u4F4D", children: /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", gap: 14 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "radio", name: "dsh-weather-units", checked: effective.units === "celsius", onChange: () => set("units", "celsius") }),
        "\u6444\u6C0F \xB0C"
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("label", { style: radioLabel, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("input", { type: "radio", name: "dsh-weather-units", checked: effective.units === "fahrenheit", onChange: () => set("units", "fahrenheit") }),
        "\u534E\u6C0F \xB0F"
      ] })
    ] }) }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(Row, { label: `\u5237\u65B0\u95F4\u9694\uFF08\u5206\u949F\uFF0C\u5F53\u524D ${effective.refreshMinutes}\uFF09`, labelFor: `${ids}-refresh`, children: /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "input",
      {
        id: `${ids}-refresh`,
        type: "range",
        min: REFRESH_RANGE.min,
        max: REFRESH_RANGE.max,
        step: REFRESH_RANGE.step,
        value: refreshInput,
        onChange: (event) => setRefreshInput(Number(event.target.value)),
        onPointerUp: commitRefresh,
        onBlur: commitRefresh,
        onKeyUp: commitRefresh,
        style: { flex: 1, accentColor: ACCENT }
      }
    ) }),
    notice !== null && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
      "div",
      {
        role: "status",
        "aria-live": "polite",
        style: { color: notice.kind === "err" ? DANGER : OK, fontSize: 12.5, marginTop: 8 },
        children: notice.text
      }
    ),
    snapshot.mode === "memory" && /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { color: MUTED, fontSize: 12.5, marginTop: 8 }, children: "\u5F53\u524D\u8FDE\u63A5\u4E3A\u8FDB\u7A0B\u5185\u6A21\u5F0F\uFF0C\u914D\u7F6E\u4EC5\u5728\u672C\u6B21\u4F1A\u8BDD\u751F\u6548\u3002" }),
    /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { marginTop: 20, fontSize: 12, lineHeight: "19px", color: MUTED, background: BG_ROW, border: `1px solid ${BORDER}`, borderRadius: 10, padding: 12 }, children: [
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 8, marginBottom: 6 }, children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { fontWeight: 600, color: FG }, children: "\u5B9A\u4F4D\u8BCA\u65AD" }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsx)(
          "button",
          {
            type: "button",
            disabled: diagBusy,
            onClick: () => {
              if (diagBusy) return;
              const run = diagRunRef.current + 1;
              diagRunRef.current = run;
              setDiag(null);
              setDiagBusy(true);
              void runLocationDiagnostics().then((result) => {
                if (diagRunRef.current === run) setDiag(result);
              }).catch(() => {
                if (diagRunRef.current === run) notify("\u5B9A\u4F4D\u8BCA\u65AD\u5931\u8D25\uFF0C\u8BF7\u7A0D\u540E\u91CD\u8BD5", "err");
              }).finally(() => {
                if (diagRunRef.current === run) setDiagBusy(false);
              });
            },
            style: inputButton,
            children: diagBusy ? "\u68C0\u6D4B\u4E2D\u2026" : "\u91CD\u65B0\u68C0\u6D4B"
          }
        )
      ] }),
      /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
        "\u914D\u7F6E\u5750\u6807\uFF1A",
        effective.locationMode === "manual" ? `${effective.latitude?.toFixed(3) ?? "--"}, ${effective.longitude?.toFixed(3) ?? "--"}\uFF08\u624B\u52A8\uFF1A${effective.cityName ?? "\u672A\u8BBE\u7F6E"}\uFF09` : effective.autoLatitude !== void 0 ? `${effective.autoLatitude.toFixed(3)}, ${effective.autoLongitude?.toFixed(3)}\uFF08\u7F13\u5B58\uFF1A${effective.autoCityName ?? ""}\uFF09` : "\u81EA\u52A8\u6A21\u5F0F\uFF08\u5C1A\u672A\u5B9A\u4F4D\uFF09"
      ] }),
      diag !== null ? /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)(import_jsx_runtime5.Fragment, { children: [
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          "\u6D4F\u89C8\u5668 GPS\uFF1A",
          diag.gps.status === "ok" ? `${diag.gps.latitude?.toFixed(3)}, ${diag.gps.longitude?.toFixed(3)}${diag.gps.accuracy !== void 0 ? `\uFF08\u7CBE\u5EA6 \xB1${Math.round(diag.gps.accuracy)} m\uFF09` : ""}` : diag.gps.status === "timeout" ? "\u8D85\u65F6" : `\u5931\u8D25\uFF08${diag.gps.error ?? "\u672A\u77E5"}\uFF09`
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          "IP \u5B9A\u4F4D\uFF1A",
          diag.ip.status === "ok" ? `${diag.ip.city}\uFF08${diag.ip.latitude?.toFixed(3)}, ${diag.ip.longitude?.toFixed(3)}\uFF09` : `\u5931\u8D25 ${diag.ip.error ?? ""}`
        ] }),
        diag.gpsIpDistanceKm !== void 0 && /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          "GPS \u2194 IP \u8DDD\u79BB\uFF1A",
          Math.round(diag.gpsIpDistanceKm),
          " km"
        ] }),
        /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { children: [
          "\u91C7\u7528\uFF1A",
          diag.chosen === "gps" ? `GPS\uFF08${precisionLabel(diag.precision)}\u7CBE\u5EA6\uFF09` : diag.chosen === "ip" ? "IP\uFF08\u6D4F\u89C8\u5668\u5B9A\u4F4D\u7F3A\u5931\u6216\u8FC7\u7C97\uFF09" : "\u65E0"
        ] })
      ] }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { children: '\u70B9\u51FB"\u91CD\u65B0\u68C0\u6D4B"\u67E5\u770B GPS / IP \u5404\u81EA\u7684\u539F\u59CB\u7ED3\u679C\u3002' })
    ] })
  ] });
}
function precisionLabel(precision) {
  if (precision === "district") return "\u533A\u7EA7";
  if (precision === "city") return "\u5E02\u7EA7";
  return "\u672A\u5206\u7EA7";
}
function Row(props) {
  const { label, labelFor, children } = props;
  const labelNode = labelFor !== void 0 ? /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("label", { htmlFor: labelFor, style: { flex: "0 0 auto", cursor: "pointer" }, children: label }) : /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("span", { style: { flex: "0 0 auto" }, children: label });
  return /* @__PURE__ */ (0, import_jsx_runtime5.jsxs)("div", { style: { display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12, padding: "10px 12px", marginBottom: 8, background: BG_ROW, borderRadius: 10 }, children: [
    labelNode,
    /* @__PURE__ */ (0, import_jsx_runtime5.jsx)("div", { style: { display: "flex", alignItems: "center", gap: 8, minWidth: 0 }, children })
  ] });
}
var checkbox = { width: 16, height: 16, accentColor: ACCENT, cursor: "pointer" };
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
  background: INPUT_BG,
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
var searchingBadge = {
  position: "absolute",
  right: 10,
  top: "50%",
  transform: "translateY(-50%)",
  fontSize: 11.5,
  color: MUTED,
  pointerEvents: "none"
};
var suggestionPanel = {
  position: "absolute",
  top: "calc(100% + 6px)",
  left: 0,
  right: 0,
  zIndex: 20,
  padding: 4,
  background: INPUT_BG,
  border: `1px solid ${BORDER}`,
  borderRadius: 12,
  boxShadow: SHADOW.dropdown,
  maxHeight: 268,
  overflowY: "auto",
  overscrollBehavior: "contain"
};
var suggestionRow = {
  display: "flex",
  alignItems: "center",
  gap: 2,
  borderRadius: 9
};
var suggestionPick = {
  display: "flex",
  alignItems: "center",
  gap: 9,
  flex: 1,
  minWidth: 0,
  padding: "7px 8px",
  background: "transparent",
  border: "none",
  borderRadius: 9,
  cursor: "pointer",
  textAlign: "left",
  font: "inherit",
  color: FG
};
var suggestionPin = {
  display: "flex",
  flex: "0 0 auto",
  color: MUTED
};
var suggestionLines = {
  display: "flex",
  flexDirection: "column",
  gap: 1,
  minWidth: 0
};
var suggestionName = {
  fontSize: 13,
  lineHeight: "17px",
  overflow: "hidden",
  textOverflow: "ellipsis",
  whiteSpace: "nowrap"
};
var suggestionCoords = {
  fontVariantNumeric: "tabular-nums",
  fontSize: 11.5,
  lineHeight: "15px",
  color: MUTED
};
var suggestionSave = {
  fontFamily: "inherit",
  flex: "0 0 auto",
  padding: "5px 10px",
  fontSize: 12,
  whiteSpace: "nowrap",
  color: ACCENT,
  background: "transparent",
  border: "1px solid transparent",
  borderRadius: 8,
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
    ".dshw-popover { animation: dshw-pop-in 0.15s ease; }",
    // City-search dropdown (settings page). Pseudo-class states cannot be
    // expressed inline, so the interaction feedback lives here: a row highlight
    // that also follows keyboard focus, a focus ring for the row's pick target,
    // and a quiet ghost treatment for the save action until it is hovered.
    ".dshw-ac-row { transition: background-color 0.12s ease; }",
    ".dshw-ac-row:hover, .dshw-ac-row:focus-within { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.05)); }",
    ".dshw-ac-pick:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff); outline-offset: -2px; }",
    ".dshw-ac-save { transition: background-color 0.12s ease, border-color 0.12s ease; }",
    ".dshw-ac-save:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06)); border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12)); }",
    ".dshw-ac-panel::-webkit-scrollbar { width: 8px; }",
    ".dshw-ac-panel::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18)); border-radius: 4px; }"
  ].join("\n");
  document.head.appendChild(style);
}

// src/client/index.tsx
var inject = ["slots", "settingsScope"];
function createWriteProbe(ctx) {
  const message = (error) => error instanceof Error ? error.message : String(error);
  return async (fields, clears) => {
    const remote = ctx.get?.("remote");
    const settings = remote?.settings;
    if (settings === void 0) return { landed: false, detail: "remote.settings \u4E0D\u53EF\u7528" };
    let serverRevision;
    let stored = "\u672A\u77E5";
    try {
      const described = await settings.describe();
      if (described.ok) {
        const row = (described.value.namespaces ?? []).find((candidate) => candidate.ns === WEATHER_NS);
        serverRevision = row?.revision;
        const user = row?.user;
        stored = fields.map(([field]) => `${field}=${JSON.stringify(user?.[field])}`).join(" ") || "\u2014";
      } else {
        stored = `describe \u88AB\u62D2\uFF1A${described.error.message}`;
      }
    } catch (error) {
      stored = `describe \u5F02\u5E38\uFF1A${message(error)}`;
    }
    const ops = [
      ...fields.map(([field, value]) => ({ op: "set", path: [field], value })),
      ...clears.map((field) => ({ op: "unset", path: [field] }))
    ];
    const context = `\u670D\u52A1\u7AEF rev=${serverRevision ?? "?"} \u670D\u52A1\u7AEF\u5DF2\u5B58 ${stored}`;
    try {
      const response = await settings.mutate(WEATHER_NS, ops, void 0);
      return response.ok ? { landed: true, detail: context } : { landed: false, detail: `Host \u62D2\u7EDD\uFF08\u65E0\u6805\u680F\uFF09\uFF1A${response.error.message}\uFF5C${context}` };
    } catch (error) {
      return { landed: false, detail: `mutate \u5F02\u5E38\uFF1A${message(error)}\uFF5C${context}` };
    }
  };
}
function apply(ctx) {
  ensureWeatherStyles();
  const scope = ctx.settingsScope.bind({
    namespace: WEATHER_NS,
    // The stored section can be hand-edited or written by an older schema
    // version — normalize every snapshot to a structurally valid config so a
    // missing field (e.g. `refreshMinutes`) can never surface as NaN upstream.
    decode: (section) => sanitizeConfig(section)
  });
  const probe = createWriteProbe(ctx);
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
    inject: () => ({ scope, probe })
  }, WeatherSettingsSection));
}
return module.exports;
} });
