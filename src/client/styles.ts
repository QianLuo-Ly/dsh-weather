/**
 * Tiny stylesheet injected once by the client plugin: the popover entrance
 * animation and the interaction states referenced by `className` in the
 * components. The plugin bundle has no CSS pipeline, so the styles live in an
 * injected `<style>` tag owned by this package (removed with the plugin's DOM
 * effects on unload).
 */

/** Rules of the `dsh-weather-styles` sheet, in source order. */
const STYLE_TEXT = [
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
  // a translate would nudge the header row mid-layout. `filter` alone is not
  // enough: the platform's light theme fills the surface with pure white, and
  // no brightness multiplier can lift a clamped channel, so a real background
  // tint carries the affordance.
  '.dshw-bar { transition: filter 0.15s ease, background-color 0.15s ease; }',
  '.dshw-bar:hover { filter: brightness(1.08); background: var(--dsw-alias-interactive-bg-hover, rgba(0, 0, 0, 0.06)); }',
  '.dshw-popover { animation: dshw-pop-in 0.15s ease; }',
  // ── City picker (settings page) ──────────────────────────────────────────
  // Pseudo-classes cannot be expressed inline, so every interactive state of
  // the suggestion list lives here. The active row is driven by keyboard
  // navigation (aria-activedescendant), which is why it needs its own rule
  // rather than relying on :hover. Both use the interactive tokens: the
  // bg-layer tokens are pure white in light mode, which made the highlight
  // invisible exactly where the keyboard path depends on seeing it.
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
].join('\n')

/**
 * Ensure the `dsh-weather-styles` stylesheet is present AND current.
 *
 * The content is rewritten on every activation rather than skipped when the tag
 * already exists: a plugin reload (HMR, or a rebuilt bundle pushed by the module
 * table) re-runs `apply` in the SAME document, so the previous sheet is still
 * there with the previous rules. Bailing out on its presence would silently pin
 * the old CSS — every rule added to this file would then only ever appear after
 * a full page refresh, which reads as "the style change did nothing".
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
