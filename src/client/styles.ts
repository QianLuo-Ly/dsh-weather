/**
 * Tiny stylesheet injected once by the client plugin: entrance animations and
 * hover transitions referenced by `className` in the components. The plugin
 * bundle has no CSS pipeline, so the styles live in an injected `<style>` tag
 * owned by this package (removed with the plugin's DOM effects on unload).
 */
let ensured = false

/** Ensure the `dsh-weather-styles` stylesheet exists in the document. */
export function ensureWeatherStyles(): void {
  if (ensured) return
  ensured = true
  if (typeof document === 'undefined') return
  const id = 'dsh-weather-styles'
  if (document.getElementById(id) !== null) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = [
    '@keyframes dshw-slide-in {',
    '  from { opacity: 0; transform: translate(-50%, -10px); }',
    '  to { opacity: 1; transform: translate(-50%, 0); }',
    '}',
    // Keep translate(-50%) from the element's inline centering transform
    // throughout the animation — dropping it would shift the popover right
    // for the duration and then snap it back to center.
    '@keyframes dshw-pop-in {',
    '  from { opacity: 0; transform: translate(-50%, 8px) scale(0.97); }',
    '  to { opacity: 1; transform: translate(-50%, 0) scale(1); }',
    '}',
    // Plugin text colors: theme tokens by default, pure white in dark mode
    // (the harness marks dark mode with body[data-ds-dark-theme]).
    '.dshw-root {',
    '  --dshw-fg: var(--dsw-alias-label-primary, #1f2328);',
    '  --dshw-fg-muted: var(--dsw-alias-label-secondary, #5f6672);',
    '}',
    'body[data-ds-dark-theme] .dshw-root {',
    '  --dshw-fg: #ffffff;',
    '  --dshw-fg-muted: rgba(255, 255, 255, 0.8);',
    '}',
    '.dshw-bar { transition: transform 0.15s ease, box-shadow 0.15s ease, filter 0.15s ease; }',
    '.dshw-bar:hover { transform: translateY(-1px); filter: brightness(1.08); }',
    '.dshw-popover { animation: dshw-pop-in 0.15s ease; }',
  ].join('\n')
  document.head.appendChild(style)
}
