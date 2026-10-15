/** Saves a PGN as a file through a temporary object URL. */
export function downloadPgn(pgn: string, title: string) {
  const safe = title.replace(/[^\w\- ]+/g, "").trim().replace(/\s+/g, "-").slice(0, 80) || "game";
  const blob = new Blob([pgn], { type: "application/x-chess-pgn" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `${safe}.pgn`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
