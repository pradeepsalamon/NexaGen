// Moves printed next to a diagram, as algebraic notation. Pure text handling: the
// caller plays them on a chess board, and only a line that is legal from the
// confirmed position is ever offered. Older descriptive notation (P-K4) isn't read.

const SAN = /^(?:O-O(?:-O)?|[KQRBN]?[a-h]?[1-8]?x?[a-h][1-8](?:=?[QRBN])?)[+#]?$/;
const FIGURINES: Record<string, string> = {
  "♔": "K",
  "♕": "Q",
  "♖": "R",
  "♗": "B",
  "♘": "N",
  "♙": "",
  "♚": "K",
  "♛": "Q",
  "♜": "R",
  "♝": "B",
  "♞": "N",
  "♟": "",
};

function normalize(token: string): string {
  return token
    .replace(/[♔♕♖♗♘♙♚♛♜♝♞♟]/g, (figurine) => FIGURINES[figurine])
    .replace(/×/g, "x")
    .replace(/[0Oo]-[0Oo]-[0Oo]/, "O-O-O")
    .replace(/[0Oo]-[0Oo]/, "O-O")
    .replace(/[!?]+$/, "")
    .replace(/[.,;:)]+$/, "")
    .replace(/^\(+/, "");
}

/** Runs of consecutive moves in `text`, longest first. Move numbers don't break a run. */
export function parsePrintedMoves(text: string): string[][] {
  const runs: string[][] = [];
  let run: string[] = [];
  const close = () => {
    if (run.length > 0) runs.push(run);
    run = [];
  };
  for (const raw of text.split(/\s+/)) {
    // "1.e4" and "12...Nf6" print the number and the move as one word.
    const token = normalize(raw.replace(/^\d+\.+/, ""));
    if (token === "" || /^\d+\.*$/.test(token) || /^\.+$/.test(token)) continue;
    if (SAN.test(token)) run.push(token);
    else close();
  }
  close();
  return runs.sort((a, b) => b.length - a.length);
}
