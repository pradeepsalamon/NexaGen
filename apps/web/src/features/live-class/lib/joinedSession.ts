/**
 * Tracks, per browser tab, whether the user has already passed the PreJoin
 * screen for a given room. Persisting this in `sessionStorage` means a mid-class
 * refresh (or a reload after a network drop) drops the student straight back
 * into the meeting instead of the PreJoin card (AUDIT H16).
 *
 * `sessionStorage` is tab-scoped and cleared when the tab closes, so it does not
 * leak a "joined" state into a genuinely new session.
 */
export const joinedSessionKey = (roomId: string) => `nexa:live-class-joined:${roomId}`;

export function hasJoinedSession(roomId: string): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.sessionStorage.getItem(joinedSessionKey(roomId)) === "1";
  } catch {
    return false;
  }
}

export function markJoinedSession(roomId: string) {
  try {
    window.sessionStorage.setItem(joinedSessionKey(roomId), "1");
  } catch {
    // sessionStorage unavailable (private mode / disabled) — non-fatal
  }
}

export function clearJoinedSession(roomId: string) {
  try {
    window.sessionStorage.removeItem(joinedSessionKey(roomId));
  } catch {
    // ignore
  }
}

/**
 * A stable-per-tab id used as the LiveKit `clientId` (→ participant identity
 * suffix). Without it, two tabs of the same user resolve to the same identity
 * and LiveKit evicts the first for "duplicate identity" (AUDIT M23).
 */
export function getTabClientId(): string {
  const key = "nexa:live-tab-id";
  try {
    let id = window.sessionStorage.getItem(key);
    if (!id) {
      id = `tab-${Math.random().toString(36).slice(2)}${Date.now().toString(36)}`;
      window.sessionStorage.setItem(key, id);
    }
    return id;
  } catch {
    return `tab-${Math.random().toString(36).slice(2)}`;
  }
}
