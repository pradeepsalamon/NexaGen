import type { DrawBrush, DrawBrushes } from "chessground/draw";

/**
 * Arrow / circle drawing shared by every interactive board, so a student's
 * right-click arrows look and behave exactly like the coach's.
 */

/** The four drawing colours (lichess's palette). */
export const ARROW_BRUSH_COLORS: Record<string, string> = {
  green: "#15781B",
  red: "#882020",
  blue: "#003088",
  yellow: "#e68f00"
};

/** Stored brush name for a palette colour ("green" is aliased to the palette brush in chessground). */
export const paletteBrush = (colorId: string) => (colorId === "green" ? "primaryGreen" : colorId);

function brushConfig(colorId: string): DrawBrush {
  return {
    key: colorId.charAt(0),
    color: ARROW_BRUSH_COLORS[colorId] || ARROW_BRUSH_COLORS.green,
    opacity: 1,
    lineWidth: 10
  };
}

/**
 * chessground `drawable.brushes`. Plain "green" follows the selected palette
 * colour (`activeBrush`); `primaryGreen` is always green.
 */
export function arrowBrushes(activeBrush = "green"): DrawBrushes {
  return {
    green: brushConfig(activeBrush),
    primaryGreen: brushConfig("green"),
    red: brushConfig("red"),
    blue: brushConfig("blue"),
    yellow: brushConfig("yellow")
  };
}

/** True for the gestures chessground treats as drawing: right button, or Shift + left. */
export function isDrawGesture(e: MouseEvent | TouchEvent): boolean {
  if (!("button" in e)) return false;
  return e.button === 2 || (e.button === 0 && e.shiftKey);
}

/** The brush a drawing gesture uses: Ctrl red, Alt blue, Shift yellow, else the palette colour. */
export function brushForGesture(e: MouseEvent | TouchEvent, activeBrush = "green"): string {
  if (e.ctrlKey) return "red";
  if (e.altKey) return "blue";
  if (e.shiftKey) return "yellow";
  return paletteBrush(activeBrush);
}

/**
 * Stamp the gesture's brush onto the shape chessground just started. Its own
 * modifier mapping differs, and an exact brush match is what lets a repeat
 * right-click remove the mark. Call from a capture-phase mousedown listener.
 */
export function stampGestureBrush(
  getState: () => { drawable?: { current?: { brush: string } }; dom: { redraw: () => void } } | undefined,
  brush: string
) {
  window.setTimeout(() => {
    const state = getState();
    if (state?.drawable?.current) {
      state.drawable.current.brush = brush;
      state.dom.redraw();
    }
  }, 0);
}
