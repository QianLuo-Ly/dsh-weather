// src/index.ts
import z from "@deepseek-ai/schemastery";

// src/config-shared.ts
var WEATHER_NS = "weather";
var MAX_SAVED_LOCATIONS = 8;
var BRIEF_TIMES = { morning: "08:00", evening: "20:00" };
var CLOCK_TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;
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
var REFRESH_RANGE = { min: 5, max: 120, step: 5 };
var LAT_RANGE = { min: -90, max: 90 };
var LON_RANGE = { min: -180, max: 180 };

// src/index.ts
var WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled),
  locationMode: z.union([z.const("auto"), z.const("manual")]).default(DEFAULT_WEATHER_CONFIG.locationMode),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false),
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number()
  })).max(MAX_SAVED_LOCATIONS).default([]),
  activeSavedId: z.string().required(false),
  units: z.union([z.const("celsius"), z.const("fahrenheit")]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number().step(1).min(REFRESH_RANGE.min).max(REFRESH_RANGE.max).default(DEFAULT_WEATHER_CONFIG.refreshMinutes),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled),
  briefMorning: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.morning),
  briefEvening: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.evening),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  autoCityName: z.string().required(false),
  autoSource: z.union([z.const("gps"), z.const("ip")]).required(false)
});
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function apply(ctx, config) {
  ctx.inject(["settings"], (settingsCtx) => {
    const hooks = {
      setSource: () => {
      },
      onChange: () => {
      }
    };
    const provider = settingsCtx.settings;
    if (typeof provider?.installSection === "function") {
      try {
        provider.installSection(ctx, WEATHER_NS, WeatherConfigSchema, config, hooks);
      } catch (error) {
        ctx.logger?.warn?.("dsh-weather: \u5929\u6C14\u8BBE\u7F6E\u547D\u540D\u7A7A\u95F4\u6CE8\u518C\u5931\u8D25\uFF0C\u672C\u6B21\u4EE5\u53EA\u8BFB\u6A21\u5F0F\u8FD0\u884C\uFF1A%s", errorText(error));
      }
      return;
    }
    void import("@deepseek-ai/dsh-settings").then((mod) => {
      const legacy = mod.installSettingsSection;
      if (typeof legacy !== "function") {
        throw new Error("dsh-settings \u65E2\u4E0D\u652F\u6301 installSection \u4E5F\u4E0D\u652F\u6301 installSettingsSection");
      }
      legacy(ctx, WEATHER_NS, WeatherConfigSchema, config, hooks);
    }).catch((error) => {
      ctx.logger?.warn?.("dsh-weather: \u8BE5 Host \u65E0\u53EF\u7528\u7684\u8BBE\u7F6E\u6CE8\u518C\u63A5\u53E3\uFF0C\u8BBE\u7F6E\u9875\u4E3A\u53EA\u8BFB\uFF1A%s", errorText(error));
    });
  });
}
export {
  WeatherConfigSchema,
  apply
};
