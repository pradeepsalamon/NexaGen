// A tab opened before a deploy still asks for the old build's JS/CSS chunks,
// which the new build no longer serves. That is not a bug in the page: the fix
// is a reload onto the new version. docs/SERVICE_STATUS.md § "In the app".

const CHUNK_ERROR_PATTERNS = [
  /ChunkLoadError/i,
  /Loading (CSS )?chunk [\w./-]+ failed/i,
  /Failed to fetch dynamically imported module/i,
  /Importing a module script failed/i,
  /error loading dynamically imported module/i
];

export function isChunkLoadError(error: unknown): boolean {
  if (!error) return false;
  if (typeof error === "string") return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(error));
  const { message, name } = error as { message?: unknown; name?: unknown };
  const text = `${typeof name === "string" ? name : ""} ${typeof message === "string" ? message : ""}`;
  return CHUNK_ERROR_PATTERNS.some((pattern) => pattern.test(text));
}

const RELOAD_KEY = "nexa-version-reload";
// A second chunk error inside this window means the reload did not help
// (e.g. the server is mid-swap): stop and let the person press Reload.
const RELOAD_GUARD_MS = 60_000;

/** Reloads once onto the new build. False (and no reload) when it already did so recently or can't tell. */
export function reloadForNewVersion(): boolean {
  try {
    const last = Number(window.sessionStorage.getItem(RELOAD_KEY) || 0);
    if (Date.now() - last < RELOAD_GUARD_MS) return false;
    window.sessionStorage.setItem(RELOAD_KEY, String(Date.now()));
  } catch {
    // Storage blocked: without the guard an automatic reload could loop.
    return false;
  }
  window.location.reload();
  return true;
}
