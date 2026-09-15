// src/index.ts
import z from "@deepseek-ai/schemastery";

// src/config-shared.ts
var WEATHER_NS = "weather";
var MAX_SAVED_LOCATIONS = 8;
var MAX_NAME_LENGTH = 40;
var MAX_ID_LENGTH = 64;
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
  cityName: z.string().max(MAX_NAME_LENGTH).required(false),
  savedLocations: z.array(z.object({
    id: z.string().max(MAX_ID_LENGTH),
    name: z.string().max(MAX_NAME_LENGTH),
    latitude: z.number(),
    longitude: z.number()
  })).max(MAX_SAVED_LOCATIONS).default([]),
  activeSavedId: z.string().max(MAX_ID_LENGTH).required(false),
  units: z.union([z.const("celsius"), z.const("fahrenheit")]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number().step(REFRESH_RANGE.step).min(REFRESH_RANGE.min).max(REFRESH_RANGE.max).default(DEFAULT_WEATHER_CONFIG.refreshMinutes),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled),
  briefMorning: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.morning),
  briefEvening: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.evening),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  autoCityName: z.string().max(MAX_NAME_LENGTH).required(false),
  autoSource: z.union([z.const("gps"), z.const("ip")]).required(false)
});
function defaultConfig() {
  return { ...DEFAULT_WEATHER_CONFIG };
}
function apply(ctx, config) {
  ctx.inject(["settings"], (settingsCtx) => {
    settingsCtx.settings.installSection(ctx, WEATHER_NS, WeatherConfigSchema, config, {
      setSource: () => {
      },
      onChange: () => {
      }
    });
  });
}
export {
  WeatherConfigSchema,
  apply,
  defaultConfig
};
