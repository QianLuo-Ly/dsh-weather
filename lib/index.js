// src/index.ts
import z from "@deepseek-ai/schemastery";

// src/config-shared.ts
var WEATHER_NS = "weather";
var DEFAULT_WEATHER_CONFIG = {
  enabled: true,
  locationMode: "auto",
  units: "celsius",
  refreshMinutes: 15,
  alertsEnabled: false
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
  cityName: z.string().required(false),
  units: z.union([z.const("celsius"), z.const("fahrenheit")]).default(DEFAULT_WEATHER_CONFIG.units),
  refreshMinutes: z.number().step(REFRESH_RANGE.step).min(REFRESH_RANGE.min).max(REFRESH_RANGE.max).default(DEFAULT_WEATHER_CONFIG.refreshMinutes),
  alertsEnabled: z.boolean().default(DEFAULT_WEATHER_CONFIG.alertsEnabled),
  // Internal auto-location cache (written by the browser half, kept out of the
  // settings UI so the resolved location stays stable across refreshes).
  autoLatitude: z.number().min(LAT_RANGE.min).max(LAT_RANGE.max).required(false),
  autoLongitude: z.number().min(LON_RANGE.min).max(LON_RANGE.max).required(false),
  autoCityName: z.string().required(false),
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
