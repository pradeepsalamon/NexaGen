import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { ImageResponse } from "next/og";
import { PIECE_SET_CATALOG } from "@nexa-chess/types";

/**
 * A chess position as a PNG, drawn on the server (Puzzle of the Day's WhatsApp
 * picture, docs/PUZZLE_OF_THE_DAY.md step 3). Satori can't read CSS variables,
 * so the square colours copy `styles/boards.css`; keep them equal.
 */
const BOARD_COLORS: Record<string, { light: string; dark: string; border: string }> = {
  blue: { border: "#4c6a94", dark: "#6c8ebf", light: "#e4eaf3" },
  brown: { border: "#8a5f3d", dark: "#b58863", light: "#f0d9b5" },
  "classic-green": { border: "#4c6938", dark: "#6e9552", light: "#eeeed2" },
  dark: { border: "#1c1f24", dark: "#2e333b", light: "#5b6472" },
  minimal: { border: "#a8a8a8", dark: "#c4c4c4", light: "#f7f7f7" },
  "nexa-classic": { border: "#7a5330", dark: "#ad7a4c", light: "#ecd3a6" },
  walnut: { border: "#6b4423", dark: "#a5754c", light: "#dfc094" }
};

const SQUARE = 96;
const EDGE = 28;
const CAPTION = 64;
export const BOARD_PICTURE_SIZE = { height: SQUARE * 8 + EDGE * 2 + CAPTION, width: SQUARE * 8 + EDGE * 2 };
const FILES = "abcdefgh";
const TEXT = "#ffffff";

/** The FEN's placement as 8 ranks (8 → 1) of 8 squares: a piece code ("wN") or null. */
function placement(fen: string): (string | null)[][] {
  return fen
    .split(" ")[0]
    .split("/")
    .map((rank) =>
      [...rank].flatMap((ch) =>
        /\d/.test(ch) ? Array<null>(Number(ch)).fill(null) : [`${ch === ch.toUpperCase() ? "w" : "b"}${ch.toUpperCase()}`]
      )
    );
}

async function pieceImages(pieceSet: string): Promise<Map<string, string>> {
  const set = PIECE_SET_CATALOG.some((p) => p.id === pieceSet) ? pieceSet : "classic";
  const codes = ["K", "Q", "R", "B", "N", "P"].flatMap((p) => [`w${p}`, `b${p}`]);
  const entries = await Promise.all(
    codes.map(async (code) => {
      const svg = await readFile(join(process.cwd(), "public/chess/pieces", set, `${code}.svg`));
      return [code, `data:image/svg+xml;base64,${svg.toString("base64")}`] as const;
    })
  );
  return new Map(entries);
}

export async function renderBoardPicture(input: { fen: string; flip: boolean; boardTheme: string; pieceSet: string }) {
  const colors = BOARD_COLORS[input.boardTheme] ?? BOARD_COLORS["nexa-classic"];
  const pieces = await pieceImages(input.pieceSet);
  const ranks = placement(input.fen);
  // Rows top to bottom, columns left to right, from the side to move.
  const rowIdx = input.flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const colIdx = input.flip ? [7, 6, 5, 4, 3, 2, 1, 0] : [0, 1, 2, 3, 4, 5, 6, 7];
  const label = { color: TEXT, display: "flex", fontSize: 18, fontWeight: 700, justifyContent: "center" } as const;

  return new ImageResponse(
    (
      <div style={{ background: colors.border, display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
        <div style={{ display: "flex", height: EDGE }} />
        <div style={{ display: "flex" }}>
          <div style={{ display: "flex", flexDirection: "column", width: EDGE }}>
            {rowIdx.map((r) => (
              <div key={r} style={{ ...label, alignItems: "center", height: SQUARE }}>
                {8 - r}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {rowIdx.map((r) => (
              <div key={r} style={{ display: "flex" }}>
                {colIdx.map((c) => {
                  const code = ranks[r]?.[c] ?? null;
                  const src = code ? pieces.get(code) : undefined;
                  return (
                    <div
                      key={c}
                      style={{
                        alignItems: "center",
                        background: (r + c) % 2 === 0 ? colors.light : colors.dark,
                        display: "flex",
                        height: SQUARE,
                        justifyContent: "center",
                        width: SQUARE
                      }}
                    >
                      {/* eslint-disable-next-line @next/next/no-img-element -- ImageResponse renders plain <img> */}
                      {src ? <img alt="" height={SQUARE - 8} src={src} width={SQUARE - 8} /> : null}
                    </div>
                  );
                })}
              </div>
            ))}
          </div>
          <div style={{ display: "flex", width: EDGE }} />
        </div>
        <div style={{ display: "flex", height: EDGE, paddingLeft: EDGE }}>
          {colIdx.map((c) => (
            <div key={c} style={{ ...label, alignItems: "center", width: SQUARE }}>
              {FILES[c]}
            </div>
          ))}
        </div>
        <div style={{ ...label, alignItems: "center", fontSize: 30, height: CAPTION }}>
          {input.flip ? "Black to move" : "White to move"}
        </div>
      </div>
    ),
    BOARD_PICTURE_SIZE
  );
}
