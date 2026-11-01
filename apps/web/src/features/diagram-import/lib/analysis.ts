// What the recognizer says about a page: pure, no DOM, so it runs in the
// recognizer's Web Worker and, if a worker can't start, on the main thread.

import {
  detectDiagramBoards,
  fontReadingAgrees,
  readChessFontBoard,
  inferOrientationFromLabels,
  inferOrientationFromPieces,
  parseSideToMoveHint,
  recognizeDiagramBoard,
  refineDiagramBoard,
  textBelowDiagram,
  textNearDiagram,
  DIAGRAM_LOW_CONFIDENCE,
  type DiagramRect,
  type DiagramSide,
  type DiagramTextItem,
  type GrayImage,
  type OrientationEvidence,
} from "@nexa-chess/types";

export type TextHints = {
  orientation: OrientationEvidence | null;
  sideHint: { side: DiagramSide; phrase: string } | null;
  /** Text printed under the board, where a book prints the moves. */
  printedText: string;
};

export type BoardAnalysis = TextHints & {
  rect: DiagramRect;
  /** Printed grid, before orientation. */
  grid: (string | null)[][];
  /** Squares the recognizer was unsure of, as printed (row, col, its runner-up). */
  doubtful: { row: number; col: number; alternative: string | null }[];
  meanConfidence: number;
  /** Arrows or lines are drawn over the board, so every square needs checking. */
  annotated: boolean;
};

export function hintsFromText(text: DiagramTextItem[], rect: DiagramRect): TextHints {
  return {
    orientation: inferOrientationFromLabels(text, rect),
    printedText: textBelowDiagram(text, rect),
    sideHint: parseSideToMoveHint(textNearDiagram(text, rect)),
  };
}

/** Reads one refined board. `textRect` is where it sits on the page `text` came from. */
export function analyseBoard(image: GrayImage, rect: DiagramRect, text: DiagramTextItem[], textRect: DiagramRect = rect): BoardAnalysis {
  const reading = recognizeDiagramBoard(image, rect);
  const hints = hintsFromText(text, textRect);
  // A chess font in the text layer is exact, once the page's pixels back it up.
  const font = readChessFontBoard(text, textRect);
  if (font && fontReadingAgrees(font, reading.grid)) {
    return {
      ...hints,
      annotated: false,
      doubtful: [],
      grid: font,
      meanConfidence: 1,
      orientation: hints.orientation ?? inferOrientationFromPieces(font),
      rect,
    };
  }
  return {
    ...hints,
    annotated: reading.annotated,
    doubtful: reading.squares
      .filter((s) => s.confidence < DIAGRAM_LOW_CONFIDENCE)
      .map((s) => ({ alternative: s.alternative, col: s.col, row: s.row })),
    grid: reading.grid,
    meanConfidence: reading.meanConfidence,
    orientation: hints.orientation ?? inferOrientationFromPieces(reading.grid),
    rect,
  };
}

export function analysePage(image: GrayImage, text: DiagramTextItem[]): BoardAnalysis[] {
  return detectDiagramBoards(image).map((board) => analyseBoard(image, board.rect, text));
}

/**
 * A rough rectangle snapped to its grid but not required to pass the light/dark
 * check: a coach's selection, or a sharper render of a board already found.
 */
export function analyseSelection(
  image: GrayImage,
  selection: DiagramRect,
  text: DiagramTextItem[],
  textRect?: DiagramRect,
): BoardAnalysis | null {
  const refined = refineDiagramBoard(image, selection);
  return refined ? analyseBoard(image, refined.rect, text, textRect ?? refined.rect) : null;
}
