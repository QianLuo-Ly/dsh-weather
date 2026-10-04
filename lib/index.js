// src/index.ts
import z from "@deepseek-ai/schemastery";

// src/config-shared.ts
var BRIEF_TIMES = { morning: "08:00", evening: "20:00" };
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

// src/index.ts
var WeatherConfigSchema = z.object({
  enabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.enabled).volatile(),
  locationMode: z.union([z.const("auto"), z.const("manual")]).default(DEFAULT_WEATHER_CONFIG.locationMode).volatile(),
  latitude: z.number().required(false).volatile(),
  longitude: z.number().required(false).volatile(),
  // No length bound: a legacy unbounded name must not abort registration.
  cityName: z.string().required(false).volatile(),
  // No count bound: `sanitizeSavedLocations` caps at MAX_SAVED_LOCATIONS on read.
  savedLocations: z.array(z.object({
    id: z.string(),
    name: z.string(),
    latitude: z.number(),
    longitude: z.number()
  })).default([]).volatile(),
  activeSavedId: z.string().required(false).volatile(),
  units: z.union([z.const("celsius"), z.const("fahrenheit")]).default(DEFAULT_WEATHER_CONFIG.units).volatile(),
  // No `.step()`/`.min()`/`.max()`: a stored 7.5 or 0 must not be rejected at registration.
  refreshMinutes: z.number().default(DEFAULT_WEATHER_CONFIG.refreshMinutes).volatile(),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled).volatile(),
  briefEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.briefEnabled).volatile(),
  // No `.pattern()`: a stored `9:30` (no leading zero) must not abort registration;
  // `parseClockTime` in sanitizeConfig falls back to the default instead.
  briefMorning: z.string().default(BRIEF_TIMES.morning).volatile(),
  briefEvening: z.string().default(BRIEF_TIMES.evening).volatile(),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().required(false).volatile(),
  autoLongitude: z.number().required(false).volatile(),
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
