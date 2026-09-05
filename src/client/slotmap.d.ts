/**
 * Local SlotMap augmentation for the seats dsh-weather registers into.
 *
 * The `conversation.session.header.actions` seat is declared by the running
 * shell's ui-conversation (a core bundle, always present at runtime), but it
 * is intentionally NOT a compile-time dependency of this plugin — adding it
 * would drag a full product package into devDependencies just for types.
 * Mirrors the augmentation pattern the core packages themselves use.
 */
import '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Title-adjacent session-header actions (ascending order). */
    'conversation.session.header.actions': { kind: 'list'; scope: 'session' }
  }
}
