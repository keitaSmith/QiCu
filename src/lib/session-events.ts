export const SESSIONS_CHANGED_EVENT = 'qicu:sessions-changed'

export function emitSessionsChanged() {
  if (typeof window === 'undefined') return
  window.dispatchEvent(new Event(SESSIONS_CHANGED_EVENT))
}
