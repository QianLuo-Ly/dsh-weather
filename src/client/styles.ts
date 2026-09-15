/**
 * Tiny stylesheet injected once by the client plugin: the popover entrance
 * animation and hover transitions referenced by `className` in the components.
 * The plugin bundle has no CSS pipeline, so the styles live in an injected
 * `<style>` tag owned by this package (removed with the plugin's DOM effects
 * on unload).
 */
/** Ensure the `dsh-weather-styles` stylesheet exists in the document. */
export function ensureWeatherStyles(): void {
  if (typeof document === 'undefined') return
  const id = 'dsh-weather-styles'
  // DOM 检查优先：插件卸载/重载（HMR）后 style 标签会被移除，下次挂载需重新注入。
  if (document.getElementById(id) !== null) return
  const style = document.createElement('style')
  style.id = id
  style.textContent = [
    '@keyframes dshw-pop-in {',
    '  from { opacity: 0; transform: translateY(8px) scale(0.97); }',
    '  to { opacity: 1; transform: translateY(0) scale(1); }',
    '}',
    // Plugin text colors: dark text on the light palette, PURE WHITE in dark
    // mode (the harness marks dark mode with body[data-ds-dark-theme]).
    // Defined document-wide (not under .dshw-root) so both the weather chip and
    // the settings page (rendered inside the DSH Settings panel, outside the
    // chip's root) resolve them. Direct colors avoid a var()-chain that would
    // become guaranteed-invalid if an alias token were ever missing.
    ':root {',
    '  --dshw-fg: #1f2328;',
    '  --dshw-fg-muted: #5f6672;',
    '}',
    'body[data-ds-dark-theme] {',
    '  --dshw-fg: #ffffff;',
    '  --dshw-fg-muted: rgba(255, 255, 255, 0.8);',
    '}',
    // The chip lives inside the conversation header, so hover only brightens —
    // a translate would nudge the header row mid-layout.
    '.dshw-bar { transition: filter 0.15s ease, background-color 0.15s ease; }',
    '.dshw-bar:hover { filter: brightness(1.08); }',
    '.dshw-popover { animation: dshw-pop-in 0.15s ease; }',
    // City-search dropdown (settings page). Pseudo-class states cannot be
    // expressed inline, so the interaction feedback lives here: a row highlight
    // that also follows keyboard focus, a focus ring for the row's pick target,
    // and a quiet ghost treatment for the save action until it is hovered.
    '.dshw-ac-row { transition: background-color 0.12s ease; }',
    '.dshw-ac-row:hover, .dshw-ac-row:focus-within { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.05)); }',
    '.dshw-ac-pick:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary, #4f8cff); outline-offset: -2px; }',
    '.dshw-ac-save { transition: background-color 0.12s ease, border-color 0.12s ease; }',
    '.dshw-ac-save:not(:disabled):hover { background: var(--dsw-alias-bg-layer-2, rgba(0, 0, 0, 0.06)); border-color: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.12)); }',
    '.dshw-ac-panel::-webkit-scrollbar { width: 8px; }',
    '.dshw-ac-panel::-webkit-scrollbar-thumb { background: var(--dsw-alias-border-l3, rgba(0, 0, 0, 0.18)); border-radius: 4px; }',
  ].join('\n')
  document.head.appendChild(style)
}
