import type { LiveClassSettingsOverride } from "@nexa-chess/types";
import { isEmptyOverride } from "./fields";

/**
 * The class-settings override a coach last saved, remembered per user so the
 * next class they configure starts on the same choices instead of back at the
 * inherited defaults.
 *
 * Deliberately per-browser (localStorage), not a server field: it is a
 * convenience for whoever is sitting at this machine, and it never changes what
 * a class actually resolves to — nothing applies until the coach saves.
 */
const KEY_PREFIX = "nexa:last-class-settings:";

interface StoredLastUsed {
  v: 1;
  override: LiveClassSettingsOverride;
  savedAt: string;
}

function keyFor(userId: string) {
  return `${KEY_PREFIX}${userId}`;
}

export function readLastUsedClassSettings(
  userId: string | undefined,
): { override: LiveClassSettingsOverride; savedAt: string } | null {
  if (!userId || typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(keyFor(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as StoredLastUsed;
    if (parsed?.v !== 1 || !parsed.override || typeof parsed.override !== "object") return null;
    if (isEmptyOverride(parsed.override)) return null;
    return { override: parsed.override, savedAt: parsed.savedAt };
  } catch {
    // Private mode, cleared storage, or a shape from an older build.
    return null;
  }
}

/** Records a saved override as this user's "last used". An empty one clears it. */
export function writeLastUsedClassSettings(
  userId: string | undefined,
  override: LiveClassSettingsOverride | null | undefined,
) {
  if (!userId || typeof window === "undefined") return;
  try {
    if (!override || isEmptyOverride(override)) {
      window.localStorage.removeItem(keyFor(userId));
      return;
    }
    const payload: StoredLastUsed = { v: 1, override, savedAt: new Date().toISOString() };
    window.localStorage.setItem(keyFor(userId), JSON.stringify(payload));
  } catch {
    // Storage unavailable — remembering is best-effort.
  }
}
