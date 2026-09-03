/**
 * Weather icon set: Feather-style stroke SVGs keyed by WMO weather code and
 * day/night. Clouds, moon and snow follow `currentColor` so they adapt to the
 * theme; the sun, raindrops and lightning carry their own weather colors.
 * No gradients, no shared defs — safe to render many instances at once.
 */
import type { ReactElement } from 'react'

const SUN = '#fbbf24'
const RAIN = '#60a5fa'
const LIGHTNING = '#fbbf24'

/** Feather cloud (upper area). */
const CLOUD = 'M18 10h-1.26A8 8 0 1 0 9 20h9a5 5 0 0 0 0-10z'
/** Feather cloud lowered to leave room for drops below. */
const CLOUD_LOW = 'M20 16.58A5 5 0 0 0 18 7h-1.26A8 8 0 1 0 4 15.25'

function Sun(): ReactElement {
  return (
    <g stroke={SUN}>
      <circle cx="12" cy="12" r="5" />
      <line x1="12" y1="1" x2="12" y2="3" />
      <line x1="12" y1="21" x2="12" y2="23" />
      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
      <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
      <line x1="1" y1="12" x2="3" y2="12" />
      <line x1="21" y1="12" x2="23" y2="12" />
      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
      <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
    </g>
  )
}

function Moon(): ReactElement {
  return <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
}

function Cloud(): ReactElement {
  return <path d={CLOUD} />
}

function CloudSun(): ReactElement {
  return (
    <>
      <path d="M12 2v2" stroke={SUN} />
      <path d="m4.93 4.93 1.41 1.41" stroke={SUN} />
      <path d="M20 12h2" stroke={SUN} />
      <path d="m19.07 4.93-1.41 1.41" stroke={SUN} />
      <path d="M15.95 8.05a5 5 0 0 0-7.9 6.95" />
      <path d={CLOUD} />
    </>
  )
}

function CloudMoon(): ReactElement {
  return (
    <>
      <path d="M15.5 6.5a5.5 5.5 0 1 1-7.5 7.5 6 6 0 0 0 7.5-7.5z" />
      <path d="M18 12h-1.26A7 7 0 1 0 10 19h8a4.5 4.5 0 0 0 0-7z" />
    </>
  )
}

function Fog(): ReactElement {
  return (
    <>
      <path d={CLOUD} />
      <path d="M8 17h8" opacity={0.75} />
      <path d="M10.5 20h5" opacity={0.45} />
    </>
  )
}

function Drizzle(): ReactElement {
  return (
    <>
      <path d={CLOUD_LOW} />
      <path d="M8 19v2" stroke={RAIN} />
      <path d="M12 19v2" stroke={RAIN} />
      <path d="M16 19v2" stroke={RAIN} />
    </>
  )
}

function Rain(): ReactElement {
  return (
    <>
      <path d={CLOUD_LOW} />
      <path d="M8 19v3" stroke={RAIN} />
      <path d="M12 19v3" stroke={RAIN} />
      <path d="M16 19v3" stroke={RAIN} />
    </>
  )
}

function HeavyRain(): ReactElement {
  return (
    <>
      <path d={CLOUD_LOW} />
      <path d="M7.5 19v3.5" stroke={RAIN} />
      <path d="M10.5 18.5v3.5" stroke={RAIN} />
      <path d="M13.5 19v3.5" stroke={RAIN} />
      <path d="M16.5 18.5v3.5" stroke={RAIN} />
    </>
  )
}

function Snow(): ReactElement {
  return (
    <>
      <path d={CLOUD_LOW} />
      <path d="M8 18.5v3" />
      <path d="M6.5 20h3" />
      <path d="M12 18v3" />
      <path d="M10.5 19.5h3" />
      <path d="M16 18.5v3" />
      <path d="M14.5 20h3" />
    </>
  )
}

function Sleet(): ReactElement {
  return (
    <>
      <path d={CLOUD_LOW} />
      <path d="M8 19v2" stroke={RAIN} />
      <path d="M16 19v2" stroke={RAIN} />
      <path d="M12 18.5v3" />
      <path d="M10.5 20h3" />
    </>
  )
}

function Thunder(): ReactElement {
  return (
    <>
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
      <polyline points="13 11 9 17 15 17 11 23" stroke={LIGHTNING} fill="none" />
    </>
  )
}

function ThunderHail(): ReactElement {
  return (
    <>
      <path d="M19 16.9A5 5 0 0 0 18 7h-1.26a8 8 0 1 0-11.62 9" />
      <polyline points="13 11 9 17 15 17 11 23" stroke={LIGHTNING} fill="none" />
      <circle cx="7" cy="21" r="1" fill="currentColor" stroke="none" />
      <circle cx="11" cy="22" r="1" fill="currentColor" stroke="none" />
      <circle cx="15" cy="21" r="1" fill="currentColor" stroke="none" />
    </>
  )
}

function Unknown(): ReactElement {
  return <path d="M14 14.76V3.5a2.5 2.5 0 0 0-5 0v11.26a4.5 4.5 0 1 0 5 0z" />
}

/** Render the weather icon for a WMO code (+ day/night). */
export function WeatherIcon(props: { code: number; isDay: boolean; size?: number }): ReactElement {
  const { code, isDay, size = 24 } = props
  let node: ReactElement
  if (code === 0 || code === 1) {
    node = isDay ? <Sun /> : <Moon />
  } else if (code === 2) {
    node = isDay ? <CloudSun /> : <CloudMoon />
  } else if (code === 3) {
    node = <Cloud />
  } else if (code === 45 || code === 48) {
    node = <Fog />
  } else if (code === 51 || code === 53 || code === 55 || code === 56 || code === 57) {
    node = <Drizzle />
  } else if (code === 61 || code === 63 || code === 65 || code === 66 || code === 67) {
    node = <Rain />
  } else if (code === 80 || code === 81 || code === 82) {
    node = <HeavyRain />
  } else if (code === 71 || code === 73 || code === 75 || code === 77) {
    node = <Snow />
  } else if (code === 85 || code === 86) {
    node = <Sleet />
  } else if (code === 95) {
    node = <Thunder />
  } else if (code === 96 || code === 99) {
    node = <ThunderHail />
  } else {
    node = <Unknown />
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {node}
    </svg>
  )
}

export type GlyphName = 'droplet' | 'wind' | 'umbrella' | 'refresh' | 'pin' | 'sunrise' | 'sunset' | 'sun' | 'sliders' | 'chevron-left' | 'cloud' | 'eye' | 'gauge'

/** Small utility glyphs used inside the popover. */
export function Glyph(props: { name: GlyphName; size?: number }): ReactElement {
  const { name, size = 14 } = props
  const paths: Record<GlyphName, ReactElement> = {
    droplet: <path d="M12 2.69l5.66 5.66a8 8 0 1 1-11.31 0z" />,
    wind: (
      <g>
        <path d="M9.59 4.59A2 2 0 1 1 11 8H2" />
        <path d="M12.59 19.41A2 2 0 1 0 14 16H2" />
        <path d="M17.73 7.73A2.5 2.5 0 1 1 19.5 12H2" />
      </g>
    ),
    umbrella: <path d="M23 12a11.05 11.05 0 0 0-22 0zm-5 7a3 3 0 0 1-6 0v-7" />,
    refresh: (
      <g>
        <polyline points="23 4 23 10 17 10" />
        <path d="M20.49 15a9 9 0 1 1-2.12-9.36L23 10" />
      </g>
    ),
    pin: (
      <g>
        <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
        <circle cx="12" cy="10" r="3" />
      </g>
    ),
    sunrise: (
      <g>
        <path d="M17 18a5 5 0 0 0-10 0" />
        <line x1="12" y1="2" x2="12" y2="9" />
        <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
        <line x1="1" y1="18" x2="3" y2="18" />
        <line x1="21" y1="18" x2="23" y2="18" />
        <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
        <line x1="23" y1="22" x2="1" y2="22" />
        <polyline points="8 6 12 2 16 6" />
      </g>
    ),
    sunset: (
      <g>
        <path d="M17 18a5 5 0 0 0-10 0" />
        <line x1="12" y1="9" x2="12" y2="2" />
        <line x1="4.22" y1="10.22" x2="5.64" y2="11.64" />
        <line x1="1" y1="18" x2="3" y2="18" />
        <line x1="21" y1="18" x2="23" y2="18" />
        <line x1="18.36" y1="11.64" x2="19.78" y2="10.22" />
        <line x1="23" y1="22" x2="1" y2="22" />
        <polyline points="16 5 12 9 8 5" />
      </g>
    ),
    sun: (
      <g>
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1" x2="12" y2="3" />
        <line x1="12" y1="21" x2="12" y2="23" />
        <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1" y1="12" x2="3" y2="12" />
        <line x1="21" y1="12" x2="23" y2="12" />
        <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
      </g>
    ),
    sliders: (
      <g>
        <line x1="4" y1="21" x2="4" y2="14" />
        <line x1="4" y1="10" x2="4" y2="3" />
        <line x1="12" y1="21" x2="12" y2="12" />
        <line x1="12" y1="8" x2="12" y2="3" />
        <line x1="20" y1="21" x2="20" y2="16" />
        <line x1="20" y1="12" x2="20" y2="3" />
        <line x1="1" y1="14" x2="7" y2="14" />
        <line x1="9" y1="8" x2="15" y2="8" />
        <line x1="17" y1="16" x2="23" y2="16" />
      </g>
    ),
    'chevron-left': <polyline points="15 18 9 12 15 6" />,
    cloud: <path d={CLOUD} />,
    eye: (
      <g>
        <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
        <circle cx="12" cy="12" r="3" />
      </g>
    ),
    gauge: (
      <g>
        <path d="M5 15a7 7 0 1 1 14 0" />
        <path d="M12 15l4.2-4.2" />
        <circle cx="12" cy="15" r="1.3" fill="currentColor" stroke="none" />
      </g>
    ),
  }
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
