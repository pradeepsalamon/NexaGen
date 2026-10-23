import { create } from "zustand";

/**
 * The coach's single-page board shortcuts. One list feeds the key handler,
 * the toolbar's shortcut guide and the Share / Load menu hints, so they can't drift.
 */
export const COACH_BOARD_SHORTCUTS = [
  { id: "setup", key: "S", label: "Setup position" },
  { id: "illegalMoves", key: "I", label: "Allow illegal moves on/off" },
  { id: "shareNext", key: ".", label: "Share next puzzle" },
  { id: "sharePrevious", key: ",", label: "Share previous puzzle" },
  { id: "loadNext", key: "]", label: "Load next puzzle" },
  { id: "loadPrevious", key: "[", label: "Load previous puzzle" },
  { id: "askCurrent", key: "/", label: "Ask current position" }
] as const;

export type CoachBoardShortcutId = (typeof COACH_BOARD_SHORTCUTS)[number]["id"];

export const COACH_BOARD_SHORTCUT_KEY = Object.fromEntries(
  COACH_BOARD_SHORTCUTS.map((s) => [s.id, s.key])
) as Record<CoachBoardShortcutId, string>;

/**
 * Which coach board shortcut a keydown is, or null. Ignores typing (inputs,
 * textareas, selects, contenteditable), anything inside an open dialog or menu,
 * auto-repeat, and Ctrl / Cmd / Alt chords so browser shortcuts stay untouched.
 * `.` / `,` also match the unshifted Period / Comma physical keys, for layouts
 * (Cyrillic, Greek, …) whose `key` there isn't reported as `.` / `,`. Shift+Period
 * (`>`) and Shift+Comma (`<`) deliberately match nothing.
 */
export function matchCoachBoardShortcut(e: KeyboardEvent): CoachBoardShortcutId | null {
  if (e.defaultPrevented || e.repeat || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return null;
  const target = e.target instanceof HTMLElement ? e.target : null;
  if (target && (target.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(target.tagName))) return null;
  if (target?.closest('[role="dialog"],[role="menu"],[role="listbox"],[contenteditable="true"]')) return null;

  if (e.key === "." || (!e.shiftKey && e.code === "Period")) return "shareNext";
  if (e.key === "," || (!e.shiftKey && e.code === "Comma")) return "sharePrevious";
  // `[`, `]` and `/` match the produced character, so layouts that need Shift for them still work.
  switch (e.key) {
    case "s":
    case "S": // Caps Lock, not Shift
      return e.shiftKey ? null : "setup";
    case "i":
    case "I":
      return e.shiftKey ? null : "illegalMoves";
    case "]":
      return "loadNext";
    case "[":
      return "loadPrevious";
    case "/":
      return "askCurrent";
    default:
      return null;
  }
}

/**
 * Set while the coach's classroom board is on stage, so the floating toolbar
 * (rendered outside the `BoardProvider`) can open its Setup Position dialog.
 */
export const useCoachBoardActions = create<{ openSetup: (() => void) | null }>(() => ({ openSetup: null }));
