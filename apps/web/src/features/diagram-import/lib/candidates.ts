// Diagram candidates: what the recognizer found on a page, and the coach's
// review of it. Pure apart from the Chess probe (the castling-safe wrapper).

import {
  diagramGridToPlacement,
  diagramSquareName,
  possibleCastlingFlags,
  validateDiagramPosition,
  type DiagramCandidateStatus,
  type DiagramChessProbe,
  type DiagramIssue,
  type DiagramOrientation,
  type DiagramRect,
  type DiagramSide,
  type OrientationEvidence,
} from "@nexa-chess/types";
import { Chess } from "@/lib/chess";
import { hintsFromText, type BoardAnalysis } from "./analysis";
import { cropToDataUrl } from "./crop";
import { readTextInRegions, type OpenedDocument, type RenderedPage } from "@/lib/document-reader";
import { recognizePage, recognizeSelection } from "./recognizer";
import { toDiagramText } from "./text";

export type DiagramCandidate = {
  id: string;
  page: number;
  /** 1-based position on its page, in reading order. */
  index: number;
  rect: DiagramRect;
  /** The source diagram as cut from the page (data URL). */
  crop: string;
  /** How it was found: the detector, or the coach drawing a box. */
  origin: "detected" | "manual";
  /** Printed grid, before orientation. */
  grid: (string | null)[][];
  /** Squares the recognizer was unsure of, as printed (row, col, its runner-up). */
  doubtful: { row: number; col: number; alternative: string | null }[];
  meanConfidence: number;
  orientation: OrientationEvidence;
  sideHint: { side: DiagramSide; phrase: string } | null;
  /** Arrows or lines are drawn over the board, so every square needs checking. */
  annotated: boolean;
  /** Text printed under the board, where a book prints the moves. */
  printedText: string;
  /** Where the page's words came from, if it has any. */
  textSource: "text-layer" | "ocr" | null;
};

export type CastlingRights = { K: boolean; Q: boolean; k: boolean; q: boolean };

/** The coach's working copy. Nothing in here is "certain" until they confirm it. */
export type CandidateReview = {
  /** FEN placement (White's perspective) the coach is editing. */
  placement: string;
  orientation: DiagramOrientation;
  orientationConfirmed: boolean;
  sideToMove: DiagramSide | null;
  /** Where the side to move came from — a caption, or the coach. */
  sideSource: "caption" | "coach" | null;
  /** null until the coach has answered the castling question. */
  castlingMode: "none" | "choose" | null;
  /** The ticked rights; only used while castlingMode is "choose". */
  castling: CastlingRights;
  enPassant: string;
  halfMove: string;
  fullMove: string;
  /** The coach accepted the en-passant / move-number values (a diagram never shows them). */
  countersAccepted: boolean;
  /** Warnings acknowledged ("load anyway"). */
  warningsAccepted: boolean;
  confirmed: boolean;
};

const NO_CASTLING: CastlingRights = { K: false, Q: false, k: false, q: false };

export function rotatePlacement(placement: string): string {
  return placement.split("/").reverse().map((rank) => [...expandRank(rank)].reverse().join("")).map(compressRank).join("/");
}

function expandRank(rank: string): string {
  return rank.replace(/[1-8]/g, (n) => ".".repeat(Number(n)));
}

function compressRank(rank: string): string {
  return rank.replace(/\.+/g, (dots) => String(dots.length));
}

export function initialReview(c: DiagramCandidate): CandidateReview {
  const placement = diagramGridToPlacement(c.grid, c.orientation.orientation);
  const possible = possibleCastlingFlags(placement);
  const anyCastling = possible.K || possible.Q || possible.k || possible.q;
  return {
    placement,
    orientation: c.orientation.orientation,
    orientationConfirmed: !c.orientation.needsConfirmation,
    sideToMove: c.sideHint?.side ?? null,
    sideSource: c.sideHint ? "caption" : null,
    // With no king and rook on their home squares there is nothing to ask.
    castlingMode: anyCastling ? null : "none",
    castling: NO_CASTLING,
    enPassant: "-",
    halfMove: "0",
    fullMove: "1",
    countersAccepted: false,
    warningsAccepted: false,
    confirmed: false,
  };
}

/** The recognizer's own placement for the orientation the coach chose. */
export function recognizedPlacement(c: DiagramCandidate, orientation: DiagramOrientation): string {
  return diagramGridToPlacement(c.grid, orientation);
}

export function composeReviewFen(r: CandidateReview, sideFallback: DiagramSide = "w"): string {
  const c = r.castlingMode === "choose" ? r.castling : NO_CASTLING;
  const castling = `${c.K ? "K" : ""}${c.Q ? "Q" : ""}${c.k ? "k" : ""}${c.q ? "q" : ""}` || "-";
  return [r.placement, r.sideToMove ?? sideFallback, castling, r.enPassant || "-", r.halfMove || "0", r.fullMove || "1"].join(" ");
}

export const chessProbe: DiagramChessProbe = (fen) => {
  try {
    const chess = new Chess(fen);
    return { ok: true, inCheck: chess.inCheck(), legalMoves: chess.moves().length };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message.replace(/^Invalid FEN:\s*/i, "") : "Invalid position." };
  }
};

export type ReviewAssessment = {
  status: DiagramCandidateStatus;
  fen: string;
  errors: DiagramIssue[];
  warnings: DiagramIssue[];
  /** Questions the coach still has to answer before confirming. */
  pending: string[];
  /** The position differs from what the recognizer read. */
  corrected: boolean;
};

export function assessReview(c: DiagramCandidate, r: CandidateReview): ReviewAssessment {
  const fen = composeReviewFen(r);
  let { errors, warnings } = validateDiagramPosition(fen, chessProbe);
  if (!r.sideToMove) {
    // Until the side is chosen, judge the placement alone: a check-related
    // error may just mean "it must be the other side's turn".
    const other = validateDiagramPosition(composeReviewFen(r, "b"), chessProbe);
    const shared = errors.filter((e) => other.errors.some((o) => o.code === e.code));
    const onlyOneSide = errors.length !== shared.length || other.errors.length !== shared.length;
    errors = shared;
    warnings = warnings.filter((w) => w.code !== "game-over");
    if (onlyOneSide && shared.length === 0) {
      warnings = [
        ...warnings,
        { code: "side-forced", message: "Only one side can be to move here — a king is in check. Pick the side to move." },
      ];
    }
  }
  const pending: string[] = [];
  if (!r.orientationConfirmed) pending.push("Confirm which side is at the bottom of the diagram.");
  if (!r.sideToMove) pending.push("Choose the side to move — the diagram doesn't show it.");
  if (!r.castlingMode) pending.push("Answer the castling question — a diagram can't show castling rights.");
  if (!r.countersAccepted) pending.push("Accept or edit the en-passant square and move number.");
  if (warnings.length > 0 && !r.warningsAccepted) pending.push("Review the warnings below.");
  const corrected = r.placement !== recognizedPlacement(c, r.orientation);
  let status: DiagramCandidateStatus;
  if (errors.length > 0) status = "invalid";
  else if (r.confirmed) status = "confirmed";
  else if (pending.length > 0) status = "needs-review";
  else status = "valid";
  return { status, fen, errors, warnings, pending, corrected };
}

/** Squares to double-check, named for the orientation the coach chose. */
export function doubtfulSquareNames(c: DiagramCandidate, orientation: DiagramOrientation): string[] {
  return c.doubtful.map((d) => diagramSquareName(d.row, d.col, orientation));
}

let nextId = 0;

/** Boards printed smaller than this are read again from a sharper render. */
const SHARPEN_BELOW = 400;
const SHARPEN_TO = 640;

/** Above a board for its caption, below it for the caption and printed moves. */
function regionsAroundBoard(rect: DiagramRect): DiagramRect[] {
  const cell = rect.h / 8;
  const x = rect.x - rect.w * 0.25;
  const w = rect.w * 1.5;
  return [
    { h: cell * 1.5, w, x, y: rect.y - cell * 1.5 },
    { h: cell * 6, w, x, y: rect.y + rect.h },
  ];
}

async function buildCandidate(
  doc: Pick<OpenedDocument, "renderRegion">,
  page: RenderedPage,
  analysis: BoardAnalysis,
  index: number,
  origin: DiagramCandidate["origin"],
): Promise<DiagramCandidate> {
  let reading = analysis;
  let crop = cropToDataUrl(page.image, analysis.rect);
  if (doc.renderRegion && analysis.rect.w < SHARPEN_BELOW) {
    const region = await doc.renderRegion(page.pageNumber, analysis.rect, SHARPEN_TO);
    const sharper = region ? await recognizeSelection(region.image, region.rect, toDiagramText(page.text), analysis.rect) : null;
    if (region && sharper) {
      reading = { ...sharper, rect: analysis.rect };
      crop = cropToDataUrl(region.image, sharper.rect);
    }
  }
  // No text layer: a screenshot, a photo or a scan without OCR.
  let textSource: DiagramCandidate["textSource"] = page.text.length > 0 ? "text-layer" : null;
  if (page.text.length === 0) {
    const words = toDiagramText(await readTextInRegions(page.image, regionsAroundBoard(analysis.rect)));
    if (words.length > 0) {
      const hints = hintsFromText(words, analysis.rect);
      reading = {
        ...reading,
        orientation: hints.orientation ?? reading.orientation,
        printedText: hints.printedText,
        sideHint: hints.sideHint,
      };
      textSource = "ocr";
    }
  }
  nextId += 1;
  return {
    annotated: reading.annotated,
    crop,
    doubtful: reading.doubtful,
    grid: reading.grid,
    id: `p${page.pageNumber}-${index}-${nextId}`,
    index,
    meanConfidence: reading.meanConfidence,
    orientation: reading.orientation ?? { needsConfirmation: true, orientation: "white", source: "none" },
    origin,
    page: page.pageNumber,
    printedText: reading.printedText,
    rect: analysis.rect,
    sideHint: reading.sideHint,
    textSource,
  };
}

/** Every diagram the detector finds on one rendered page. */
export async function findCandidates(doc: Pick<OpenedDocument, "renderRegion">, page: RenderedPage): Promise<DiagramCandidate[]> {
  const boards = await recognizePage(page.image, toDiagramText(page.text));
  return Promise.all(boards.map((board, i) => buildCandidate(doc, page, board, i + 1, "detected")));
}

/**
 * A board the coach marked by hand (the detector missed it — unshaded squares,
 * a merged frame…). The selection is snapped to the grid but not required to
 * pass the light/dark check.
 */
export async function candidateFromSelection(
  doc: Pick<OpenedDocument, "renderRegion">,
  page: RenderedPage,
  selection: DiagramRect,
  index: number,
): Promise<DiagramCandidate | null> {
  const board = await recognizeSelection(page.image, selection, toDiagramText(page.text));
  return board ? buildCandidate(doc, page, board, index, "manual") : null;
}
