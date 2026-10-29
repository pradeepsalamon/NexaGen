// Renders a game as a Nexa-branded highlight video entirely in the browser:
// frames are painted on a canvas and recorded with MediaRecorder from
// `canvas.captureStream()`. Nothing is uploaded — the file only exists on this
// device until the coach downloads it. Recording runs in real time, so the tab
// must stay open (a hidden tab throttles timers and stalls the frames).

import { Chess } from "@/lib/chess";
import { bodyFont, brandColors, roundRect, wrapText } from "./canvas";

export type VideoGame = {
  /** Starting FEN (standard start when omitted). */
  startFen?: string;
  /** SAN moves from the start position. */
  moves: string[];
  white: string;
  black: string;
  result?: string | null;
};

export type VideoOptions = {
  title: string;
  orientation: "white" | "black";
  /** Seconds each move stays on screen. */
  secondsPerMove: number;
  /** Only the last N moves (0 = the whole game). Earlier moves are skipped, not shown. */
  lastPlies: number;
  pieceSet: string;
};

type Frame = {
  fen: string;
  from: string | null;
  to: string | null;
  caption: string;
};

const SIZE = 1080;
const BOARD = 840;
const BOARD_X = (SIZE - BOARD) / 2;
const BOARD_Y = 170;
const SQ = BOARD / 8;
const FPS = 30;
const TITLE_SECONDS = 2.5;
const END_SECONDS = 3;

const MIME_CANDIDATES = [
  "video/mp4;codecs=avc1",
  "video/mp4",
  "video/webm;codecs=vp9",
  "video/webm;codecs=vp8",
  "video/webm",
];

/** The recordable type this browser supports, or null when it can't record a canvas at all. */
export function supportedVideoMime(): string | null {
  if (typeof window === "undefined" || typeof MediaRecorder === "undefined")
    return null;
  if (typeof HTMLCanvasElement.prototype.captureStream !== "function")
    return null;
  return MIME_CANDIDATES.find((t) => MediaRecorder.isTypeSupported(t)) ?? null;
}

/** Replays the game into frames; throws with a readable message on an illegal move. */
export function buildFrames(game: VideoGame, lastPlies: number): Frame[] {
  const chess = game.startFen ? new Chess(game.startFen) : new Chess();
  const frames: Frame[] = [
    { caption: "", fen: chess.fen(), from: null, to: null },
  ];
  game.moves.forEach((san, i) => {
    const color = chess.turn();
    const moveNo = chess.moveNumber();
    let move;
    try {
      move = chess.move(san);
    } catch {
      throw new Error(`Move ${i + 1} (${san}) isn't legal in this game.`);
    }
    frames.push({
      caption: `${moveNo}.${color === "b" ? ".." : ""} ${move.san}`,
      fen: chess.fen(),
      from: move.from,
      to: move.to,
    });
  });
  if (lastPlies > 0 && frames.length - 1 > lastPlies) {
    return frames.slice(frames.length - 1 - lastPlies);
  }
  return frames;
}

export function estimateSeconds(
  frameCount: number,
  secondsPerMove: number,
): number {
  return (
    TITLE_SECONDS + Math.max(0, frameCount - 1) * secondsPerMove + END_SECONDS
  );
}

async function loadPieces(
  pieceSet: string,
): Promise<Record<string, HTMLImageElement>> {
  const codes = [
    "wK",
    "wQ",
    "wR",
    "wB",
    "wN",
    "wP",
    "bK",
    "bQ",
    "bR",
    "bB",
    "bN",
    "bP",
  ];
  const entries = await Promise.all(
    codes.map(async (code) => {
      const img = new Image();
      img.src = `/chess/pieces/${pieceSet}/${code}.svg`;
      await img.decode();
      return [code, img] as const;
    }),
  );
  return Object.fromEntries(entries);
}

function squareXY(square: string, orientation: "white" | "black") {
  const file = square.charCodeAt(0) - 97;
  const rank = Number(square[1]) - 1;
  const col = orientation === "white" ? file : 7 - file;
  const row = orientation === "white" ? 7 - rank : rank;
  return { x: BOARD_X + col * SQ, y: BOARD_Y + row * SQ };
}

function drawBoard(
  ctx: CanvasRenderingContext2D,
  frame: Frame,
  pieces: Record<string, HTMLImageElement>,
  orientation: "white" | "black",
  c: ReturnType<typeof brandColors>,
) {
  for (let r = 0; r < 8; r++) {
    for (let f = 0; f < 8; f++) {
      ctx.fillStyle = (r + f) % 2 === 0 ? c.soft : c.primary;
      ctx.globalAlpha = (r + f) % 2 === 0 ? 1 : 0.72;
      ctx.fillRect(BOARD_X + f * SQ, BOARD_Y + r * SQ, SQ, SQ);
    }
  }
  ctx.globalAlpha = 1;
  for (const sq of [frame.from, frame.to]) {
    if (!sq) continue;
    const { x, y } = squareXY(sq, orientation);
    ctx.fillStyle = c.secondary;
    ctx.globalAlpha = 0.55;
    ctx.fillRect(x, y, SQ, SQ);
  }
  ctx.globalAlpha = 1;

  const rows = frame.fen.split(" ")[0].split("/");
  rows.forEach((row, ri) => {
    let fi = 0;
    for (const ch of row) {
      if (/\d/.test(ch)) {
        fi += Number(ch);
        continue;
      }
      const square = `${String.fromCharCode(97 + fi)}${8 - ri}`;
      const code = `${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`;
      const { x, y } = squareXY(square, orientation);
      const img = pieces[code];
      if (img)
        ctx.drawImage(img, x + SQ * 0.06, y + SQ * 0.06, SQ * 0.88, SQ * 0.88);
      fi += 1;
    }
  });
}

function drawChrome(
  ctx: CanvasRenderingContext2D,
  game: VideoGame,
  opts: VideoOptions,
  c: ReturnType<typeof brandColors>,
) {
  ctx.fillStyle = c.primary;
  ctx.fillRect(0, 0, SIZE, SIZE);
  ctx.fillStyle = c.secondary;
  ctx.fillRect(0, 0, SIZE, 10);
  ctx.textBaseline = "middle";
  ctx.fillStyle = c.onPrimary;
  ctx.font = bodyFont(800, 46);
  ctx.fillText(wrapText(ctx, opts.title, SIZE - 120, 1)[0] ?? "", 60, 64);
  ctx.globalAlpha = 0.85;
  ctx.font = bodyFont(600, 28);
  ctx.fillText(
    wrapText(ctx, `${game.white} vs ${game.black}`, SIZE - 120, 1)[0] ?? "",
    60,
    120,
  );
  ctx.globalAlpha = 0.7;
  ctx.font = bodyFont(700, 24);
  ctx.textAlign = "right";
  ctx.fillText("NEXA CHESS", SIZE - 60, SIZE - 36);
  ctx.textAlign = "left";
  ctx.globalAlpha = 1;
}

function drawCaption(
  ctx: CanvasRenderingContext2D,
  text: string,
  c: ReturnType<typeof brandColors>,
) {
  if (!text) return;
  ctx.font = bodyFont(800, 34);
  const w = ctx.measureText(text).width + 48;
  ctx.fillStyle = c.surface;
  roundRect(ctx, 60, BOARD_Y + BOARD + 14, w, 52, 26);
  ctx.fill();
  ctx.fillStyle = c.text;
  ctx.textBaseline = "middle";
  ctx.fillText(text, 84, BOARD_Y + BOARD + 41);
}

function drawCard(
  ctx: CanvasRenderingContext2D,
  lines: [string, string],
  c: ReturnType<typeof brandColors>,
) {
  ctx.fillStyle = c.text;
  ctx.globalAlpha = 0.72;
  ctx.fillRect(BOARD_X, BOARD_Y, BOARD, BOARD);
  ctx.globalAlpha = 1;
  ctx.fillStyle = "white";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = bodyFont(800, 64);
  wrapText(ctx, lines[0], BOARD - 80, 2).forEach((l, i) =>
    ctx.fillText(l, SIZE / 2, BOARD_Y + BOARD / 2 - 40 + i * 72),
  );
  ctx.font = bodyFont(600, 32);
  ctx.fillText(lines[1], SIZE / 2, BOARD_Y + BOARD / 2 + 110);
  ctx.textAlign = "left";
}

/**
 * Records the video. `onProgress` gets 0..1. Resolves with the file; rejects
 * when recording isn't supported or fails, and on `signal` abort.
 */
export async function renderGameVideo(
  game: VideoGame,
  opts: VideoOptions,
  onProgress: (p: number) => void,
  signal: AbortSignal,
): Promise<{ blob: Blob; mime: string }> {
  const mime = supportedVideoMime();
  if (!mime)
    throw new Error(
      "This browser can't record video from the page. Try Chrome, Edge or Safari.",
    );

  // A cancel before or during the piece load must not start a recording.
  const cancelled = () => new DOMException("Cancelled", "AbortError");
  if (signal.aborted) throw cancelled();
  const frames = buildFrames(game, opts.lastPlies);
  const pieces = await loadPieces(opts.pieceSet);
  if (signal.aborted) throw cancelled();
  const c = brandColors();

  const canvas = document.createElement("canvas");
  canvas.width = SIZE;
  canvas.height = SIZE;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Couldn't start the video canvas.");

  const total = estimateSeconds(frames.length, opts.secondsPerMove);
  const resultLine =
    game.result && game.result !== "*"
      ? game.result === "1-0"
        ? `${game.white} wins`
        : game.result === "0-1"
          ? `${game.black} wins`
          : "Draw"
      : "Well played!";

  const paint = (t: number) => {
    drawChrome(ctx, game, opts, c);
    if (t < TITLE_SECONDS) {
      drawBoard(ctx, frames[0], pieces, opts.orientation, c);
      drawCard(ctx, [opts.title, `${game.white} vs ${game.black}`], c);
      return;
    }
    const moveIndex = Math.min(
      frames.length - 1,
      1 + Math.floor((t - TITLE_SECONDS) / opts.secondsPerMove),
    );
    const frame = frames.length > 1 ? frames[moveIndex] : frames[0];
    drawBoard(ctx, frame, pieces, opts.orientation, c);
    drawCaption(ctx, frame.caption, c);
    if (t >= total - END_SECONDS)
      drawCard(
        ctx,
        [resultLine, game.result && game.result !== "*" ? game.result : ""],
        c,
      );
  };

  paint(0);
  const stream = canvas.captureStream(FPS);
  const recorder = new MediaRecorder(stream, {
    mimeType: mime,
    videoBitsPerSecond: 4_000_000,
  });
  const chunks: Blob[] = [];
  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  return new Promise((resolve, reject) => {
    let timer: ReturnType<typeof setInterval> | undefined;
    const stop = () => {
      if (timer) clearInterval(timer);
      stream.getTracks().forEach((track) => track.stop());
    };
    recorder.onerror = () => {
      stop();
      reject(new Error("The browser stopped recording."));
    };
    recorder.onstop = () => {
      stop();
      if (signal.aborted) {
        reject(new DOMException("Cancelled", "AbortError"));
        return;
      }
      const blob = new Blob(chunks, { type: mime.split(";")[0] });
      if (blob.size === 0) reject(new Error("The recording came out empty."));
      else resolve({ blob, mime: mime.split(";")[0] });
    };
    signal.addEventListener("abort", () => {
      if (recorder.state !== "inactive") recorder.stop();
    });

    const startedAt = performance.now();
    recorder.start(1000);
    timer = setInterval(() => {
      const t = (performance.now() - startedAt) / 1000;
      if (t >= total) {
        onProgress(1);
        if (recorder.state !== "inactive") recorder.stop();
        return;
      }
      paint(t);
      onProgress(t / total);
    }, 1000 / FPS);
  });
}
