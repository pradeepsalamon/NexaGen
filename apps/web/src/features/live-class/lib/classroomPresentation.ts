/**
 * What the coach presents as everyone's main stage on the single-page live
 * class (md+). A class always starts on `gallery`:
 *  - `gallery` — every participant's video (`MeetingVideoGrid`), no board tile
 *  - `board`   — the main board ("Pull back to main board")
 *  - `pushed`  — the gallery with the main board's content (position, PGN,
 *                and the class puzzle when one runs) as tiles ("Push to video")
 *
 * The coach publishes it as a participant attribute; students follow it
 * whenever it changes but can still switch stage tabs themselves.
 */
export type ClassroomPresentation = "gallery" | "board" | "pushed";

export const CLASSROOM_PRESENTATION_ATTRIBUTE = "classroomPresentation";

/**
 * One press of Pull back / Push to video. `seq` grows with every press, so
 * presenting what is already presented still moves everyone back to it (a
 * student who wandered off to the puzzle, or another tab).
 */
export type PresentationState = { presentation: ClassroomPresentation; seq: number };

const isPresentation = (value: unknown): value is ClassroomPresentation =>
  value === "gallery" || value === "board" || value === "pushed";

/** Attribute / storage form: `board:3`. */
export function encodeClassroomPresentation({ presentation, seq }: PresentationState): string {
  return `${presentation}:${seq}`;
}

export function parseClassroomPresentation(value: unknown): PresentationState | null {
  if (typeof value !== "string") return null;
  const [presentation, rawSeq] = value.split(":");
  const seq = Number(rawSeq ?? 0);
  return isPresentation(presentation) && Number.isInteger(seq) && seq >= 0 ? { presentation, seq } : null;
}

/** The stage tab a presentation lands on. */
export function stageForPresentation(presentation: ClassroomPresentation): "board" | "video" {
  return presentation === "board" ? "board" : "video";
}

// Per tab, per class: a coach who reloads mid-class keeps presenting the same
// thing; a new class (new id) starts on the gallery.
const storageKey = (classId: string) => `nexa-live-class-presentation:${classId}`;

export function loadClassroomPresentation(classId: string): PresentationState | null {
  try {
    return parseClassroomPresentation(window.sessionStorage.getItem(storageKey(classId)));
  } catch {
    return null;
  }
}

export function saveClassroomPresentation(classId: string, state: PresentationState) {
  try {
    window.sessionStorage.setItem(storageKey(classId), encodeClassroomPresentation(state));
  } catch {
    // per-tab convenience only
  }
}
