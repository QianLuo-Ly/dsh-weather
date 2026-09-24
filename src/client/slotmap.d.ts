/**
 * Local SlotMap augmentation for the seats dsh-weather registers into. `conversation.session.header.actions`
 * is declared by the shell's ui-conversation (always present at runtime) but is not a compile-time
 * dependency — that would drag a full product package into devDependencies just for types.
 */
import '@deepseek-ai/dsh-client-ui-slots'

declare module '@deepseek-ai/dsh-client-ui-slots' {
  interface SlotMap {
    /** Title-adjacent session-header actions (ascending order). */
    'conversation.session.header.actions': { kind: 'list'; scope: 'session' }
  }
}
