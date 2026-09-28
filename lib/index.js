// src/index.ts
import z from "@deepseek-ai/schemastery";

// src/config-shared.ts
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
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled).volatile(),
  locationMode: z.union([z.const("auto"), z.const("manual")]).default(DEFAULT_WEATHER_CONFIG.locationMode).volatile(),
  latitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false).volatile(),
  longitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false).volatile(),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false).volatile(),
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number()
  })).max(MAX_SAVED_LOCATIONS).default([]).volatile(),
  activeSavedId: z.string().required(false).volatile(),
  units: z.union([z.const("celsius"), z.const("fahrenheit")]).default(DEFAULT_WEATHER_CONFIG.units).volatile(),
  refreshMinutes: z.number().step(1).min(REFRESH_RANGE.min).max(REFRESH_RANGE.max).default(DEFAULT_WEATHER_CONFIG.refreshMinutes).volatile(),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled).volatile(),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled).volatile(),
  briefMorning: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.morning).volatile(),
  briefEvening: z.string().pattern(CLOCK_TIME_PATTERN).default(BRIEF_TIMES.evening).volatile(),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false).volatile(),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false).volatile(),
  autoCityName: z.string().required(false).volatile(),
  autoSource: z.union([z.const("gps"), z.const("ip")]).required(false).volatile()
});
var Config = WeatherConfigSchema;
function apply(ctx) {
  ctx.logger?.debug?.("dsh-weather: host half active (settings form projected from Config)");
}
export {
  Config,
  WeatherConfigSchema,
  apply
};
