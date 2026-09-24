/**
 * Tiny injected stylesheet: the popover entrance animation and the
 * `className`-referenced interaction states. The plugin bundle has no CSS
 * pipeline, so this `<style>` is owned by the package and removed on unload.
 */

/** Rules of the `dsh-weather-styles` sheet, in source order. */
const STYLE_TEXT = [
  '@keyframes dshw-pop-in {',
  '  from { opacity: 0; transform: translateY(8px) scale(0.97); }',
  '  to { opacity: 1; transform: translateY(0) scale(1); }',
  '}',
  // Plugin text colors: dark on light, pure white under body[data-ds-dark-theme].
  // Document-wide (not under .dshw-root) so the settings page resolves them too.
  ':root {',
  '  --dshw-fg: #1f2328;',
  '  --dshw-fg-muted: #5f6672;',
  '}',
  'body[data-ds-dark-theme] {',
  '  --dshw-fg: #ffffff;',
  '  --dshw-fg-muted: rgba(255, 255, 255, 0.8);',
  '}',
  // The chip sits in the conversation header, so hover only brightens — a
  // translate would nudge the row. A real tint, since brightness() cannot lift white.
  '.dshw-bar { transition: filter 0.15s ease, background-color 0.15s ease; }',
  '.dshw-bar:hover { filter: brightness(1.08); background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }',
  '.dshw-popover { animation: dshw-pop-in 0.15s ease; }',
  // ── City picker (settings page) ──────────────────────────────────────────
  // Interactive states that cannot be inline; the aria-activedescendant active row needs its own rule, not :hover.
  '.dshw-ac-panel { animation: dshw-pop-in 0.12s ease; }',
  '.dshw-ac-row { transition: background-color 0.1s ease; }',
  '.dshw-ac-row:hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }',
  '.dshw-ac-row[data-active="true"] { background: var(--dsw-alias-interactive-bg-active, rgba(0, 0, 0, 0.1)); }',
  '.dshw-ac-star { transition: background-color 0.1s ease, color 0.1s ease; }',
  '.dshw-ac-star:not(:disabled):hover { background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.08)); }',
  '.dshw-ac-panel::-webkit-scrollbar { width: 8px; }',
  '.dshw-ac-panel::-webkit-scrollbar-track { background: transparent; }',
  '.dshw-ac-panel::-webkit-scrollbar-thumb {',
  '  background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.16));',
  '  border-radius: 4px;',
  '}',
  // Keyboard focus was invisible on every plugin control: outline in
  // `currentColor` so it follows the host palette instead of one accent color.
  '.dshw-bar:focus-visible, .dshw-root button:focus-visible, .dshw-popover a:focus-visible,',
  '.dshw-ac-row:focus-visible, .dshw-ac-star:focus-visible {',
  '  outline: 2px solid currentColor;',
  '  outline-offset: 2px;',
  '}',
  // Entrance animation and hover transitions are decoration, dropped for reduced-motion.
  '@media (prefers-reduced-motion: reduce) {',
  '  .dshw-popover, .dshw-ac-panel { animation: none; }',
  '  .dshw-bar, .dshw-ac-row, .dshw-ac-star { transition: none; }',
  '}',
].join('\n')

/**
 * Ensure the `dsh-weather-styles` sheet is present AND current. A plugin reload
 * re-runs in the same document with the old sheet still present, so bailing out
 * on it would pin stale CSS until a full page refresh.
 */
export function ensureWeatherStyles(): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-weather-styles'
  const existing = document.getElementById(id)
  if (existing !== null) {
    if (existing.textContent !== STYLE_TEXT) existing.textContent = STYLE_TEXT
    return
  }
  const style = document.createElement('style')
  style.id = id
  style.textContent = STYLE_TEXT
  document.head.appendChild(style)
}
