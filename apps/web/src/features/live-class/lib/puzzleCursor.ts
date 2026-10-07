/**
 * Where the coach is in the puzzle library — the folder last opened in the
 * share dialog and the puzzle last shared or loaded. Share and Load step from
 * the same place, so loading a puzzle then sharing "next" moves on past it.
 * Per browser, like the share options.
 */
const CURSOR_KEY = "nexa-live-puzzle-cursor";

export type PuzzleCursor = { folderId: string | null; puzzleId: string | null };

const EMPTY: PuzzleCursor = { folderId: null, puzzleId: null };

export function loadPuzzleCursor(): PuzzleCursor {
  if (typeof window === "undefined") return EMPTY;
  try {
    const raw = window.localStorage.getItem(CURSOR_KEY);
    if (!raw) return EMPTY;
    // A short-lived version kept separate `askedId` / `loadedId`.
    const { folderId, puzzleId, askedId, loadedId } = JSON.parse(raw) as Partial<PuzzleCursor> & {
      askedId?: string | null;
      loadedId?: string | null;
    };
    return { folderId: folderId ?? null, puzzleId: puzzleId ?? askedId ?? loadedId ?? null };
  } catch {
    return EMPTY;
  }
}

export function savePuzzleCursor(patch: Partial<PuzzleCursor>) {
  try {
    window.localStorage.setItem(CURSOR_KEY, JSON.stringify({ ...loadPuzzleCursor(), ...patch }));
  } catch {
    // Storage blocked — the position just isn't remembered.
  }
}
