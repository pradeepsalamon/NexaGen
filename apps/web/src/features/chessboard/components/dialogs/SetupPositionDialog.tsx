import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { loadPgnIntoBoard } from "../../lib/loadPgn";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Role, Color } from "chessground/types";
import { Chess } from "chess.js";
import { toast } from "sonner";
import { Trash2, Upload } from "lucide-react";

const START_FEN = "rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR";

export function SetupPositionDialog() {
  const { isSetupPositionOpen, setIsSetupPositionOpen, pushHistory } = useBoardStore();
  const [tab, setTab] = useState<"setup" | "game">("setup");
  const boardRef = useRef<HTMLDivElement>(null);
  const [cgApi, setCgApi] = useState<Api | null>(null);

  // Local FEN parts
  const [boardFen, setBoardFen] = useState(START_FEN);
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [castling, setCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [enPassant, setEnPassant] = useState("-");
  const [halfMove, setHalfMove] = useState("0");
  const [fullMove, setFullMove] = useState("1");

  const [fenInput, setFenInput] = useState("");

  // Load Game tab
  const [pgnText, setPgnText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  const computeFen = () => {
    let castlingStr = "";
    if (castling.K) castlingStr += "K";
    if (castling.Q) castlingStr += "Q";
    if (castling.k) castlingStr += "k";
    if (castling.q) castlingStr += "q";
    if (castlingStr === "") castlingStr = "-";

    return `${boardFen} ${turn} ${castlingStr} ${enPassant} ${halfMove} ${fullMove}`;
  };

  const handleFenInput = (val: string) => {
    setFenInput(val);
    const [board, side, castlingPart = "-", ep = "-", half = "0", full = "1"] =
      val.trim().split(/\s+/);

    // Update the visible board for any well-formed piece-placement field, even
    // if the full position is not yet legal (e.g. mid-edit, or a cleared board).
    if (/^([pnbrqkPNBRQK1-8]+\/){7}[pnbrqkPNBRQK1-8]+$/.test(board)) {
      setBoardFen(board);
      cgApi?.set({ fen: board });
    }

    if (side === "w" || side === "b") setTurn(side);
    setCastling({
      K: castlingPart.includes("K"),
      Q: castlingPart.includes("Q"),
      k: castlingPart.includes("k"),
      q: castlingPart.includes("q"),
    });
    if (ep) setEnPassant(ep);
    if (half) setHalfMove(half);
    if (full) setFullMove(full);
  };

  useEffect(() => {
    setFenInput(computeFen());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [boardFen, turn, castling, enPassant, halfMove, fullMove]);

  // Reset transient state whenever the dialog opens.
  useEffect(() => {
    if (isSetupPositionOpen) {
      setTab("setup");
      setPgnText("");
    }
  }, [isSetupPositionOpen]);

  // Init chessground — re-run when the dialog opens or the setup tab becomes
  // active (Radix unmounts inactive tab content, so the board div comes and goes).
  useEffect(() => {
    if (!isSetupPositionOpen || tab !== "setup" || !boardRef.current) return;

    const cg = Chessground(boardRef.current, {
      fen: boardFen,
      movable: { free: true, color: "both" },
      draggable: { deleteOnDropOff: true, showGhost: true },
      events: {
        change: () => setBoardFen(cg.getFen()),
      },
      animation: { enabled: false },
    });
    setCgApi(cg);

    return () => {
      cg.destroy();
      setCgApi(null);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isSetupPositionOpen, tab]);

  const handleDragNewPiece = (e: React.MouseEvent | React.TouchEvent, role: Role, color: Color) => {
    e.preventDefault();
    if (cgApi) {
      cgApi.dragNewPiece({ role, color }, e.nativeEvent as any, true);
    }
  };

  const SparePiece = ({ role, color }: { role: Role; color: Color }) => (
    <div
      className="w-12 h-12 relative cursor-grab hover:scale-105 transition-transform flex items-center justify-center bg-gray-50/5 hover:bg-gray-50/10 rounded-md"
      onMouseDown={(e) => handleDragNewPiece(e, role, color)}
      onTouchStart={(e) => handleDragNewPiece(e, role, color)}
    >
      <div className={`${role} ${color} w-full h-full block bg-contain bg-center bg-no-repeat`} />
    </div>
  );

  const applyPosition = () => {
    const finalFen = computeFen();
    try {
      new Chess(finalFen); // Validate
    } catch (e) {
      toast.error(
        e instanceof Error && e.message
          ? `Invalid position: ${e.message}`
          : "Invalid position — check for missing or adjacent kings.",
      );
      return;
    }
    pushHistory(finalFen, "");
    toast.success("Position loaded");
    setIsSetupPositionOpen(false);
  };

  const applyGame = () => {
    const result = loadPgnIntoBoard(pgnText, pushHistory);
    if (result.ok) {
      toast.success(
        result.moveCount > 0 ? `Game loaded (${result.moveCount} moves)` : "Position loaded",
      );
      setIsSetupPositionOpen(false);
    } else {
      toast.error(result.error);
    }
  };

  const handleFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPgnText(String(reader.result ?? ""));
    reader.onerror = () => toast.error("Could not read that file.");
    reader.readAsText(file);
    e.target.value = "";
  };

  return (
    <Dialog open={isSetupPositionOpen} onOpenChange={setIsSetupPositionOpen}>
      <DialogContent className="max-w-[800px] w-[95vw] max-h-[calc(100vh-2rem)] overflow-y-auto p-0 bg-background border-border">
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b border-border">
          <DialogTitle>Load Games / Positions</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "setup" | "game")} className="p-4 sm:p-6">
          <TabsList>
            <TabsTrigger value="setup">Setup Position</TabsTrigger>
            <TabsTrigger value="game">Load Game (PGN)</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <div className="flex flex-col md:flex-row gap-4 sm:gap-6">
              {/* Left Spare Pieces (White) */}
              <div className="flex md:flex-col justify-center gap-2 cg-wrap cburnett">
                <SparePiece role="pawn" color="white" />
                <SparePiece role="knight" color="white" />
                <SparePiece role="bishop" color="white" />
                <SparePiece role="rook" color="white" />
                <SparePiece role="queen" color="white" />
                <SparePiece role="king" color="white" />
                <div className="w-12 h-12 flex items-center justify-center mt-auto opacity-50">
                  <Trash2 size={24} />
                </div>
              </div>

              {/* Center Board */}
              <div className="md:flex-shrink-0 mx-auto w-full max-w-[400px] md:w-[400px] aspect-square bg-[#e0d8c8] dark:bg-slate-800 shadow-md">
                <div
                  ref={boardRef}
                  className="cg-wrap cg-board-wrap cg-wrap-piece brown cburnett"
                  style={{ width: "100%", height: "100%" }}
                />
              </div>

              {/* Right Spare Pieces (Black) */}
              <div className="flex md:flex-col justify-center gap-2 cg-wrap cburnett">
                <SparePiece role="pawn" color="black" />
                <SparePiece role="knight" color="black" />
                <SparePiece role="bishop" color="black" />
                <SparePiece role="rook" color="black" />
                <SparePiece role="queen" color="black" />
                <SparePiece role="king" color="black" />
                <div className="w-12 h-12 flex items-center justify-center mt-auto opacity-50">
                  <Trash2 size={24} />
                </div>
              </div>

              {/* Right Panel Config */}
              <div className="flex flex-col gap-6 flex-1 min-w-[200px]">
                <div>
                  <label className="text-sm font-medium mb-2 block">To Play</label>
                  <select
                    className="w-full border border-border bg-background rounded-md p-2 text-sm"
                    value={turn}
                    onChange={(e) => setTurn(e.target.value as "w" | "b")}
                  >
                    <option value="w">White</option>
                    <option value="b">Black</option>
                  </select>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">White Castling</label>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={castling.K} onChange={(e) => setCastling((c) => ({ ...c, K: e.target.checked }))} />
                      O-O
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={castling.Q} onChange={(e) => setCastling((c) => ({ ...c, Q: e.target.checked }))} />
                      O-O-O
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Black Castling</label>
                  <div className="flex items-center gap-4 text-sm">
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={castling.k} onChange={(e) => setCastling((c) => ({ ...c, k: e.target.checked }))} />
                      O-O
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer">
                      <input type="checkbox" checked={castling.q} onChange={(e) => setCastling((c) => ({ ...c, q: e.target.checked }))} />
                      O-O-O
                    </label>
                  </div>
                </div>

                <div>
                  <label className="text-sm font-medium mb-2 block">Move number</label>
                  <input
                    type="number"
                    min={1}
                    className="w-24 border border-border bg-background rounded-md p-2 text-sm"
                    value={fullMove}
                    onChange={(e) => setFullMove(String(Math.max(1, parseInt(e.target.value, 10) || 1)))}
                  />
                </div>

                <div className="flex flex-col gap-2 mt-auto">
                  <button
                    className="w-full border border-border py-2 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleFenInput("8/8/8/8/8/8/8/8 w - - 0 1")}
                  >
                    Clear Board
                  </button>
                  <button
                    className="w-full border border-border py-2 text-sm rounded-md hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
                    onClick={() => handleFenInput(`${START_FEN} w KQkq - 0 1`)}
                  >
                    Starting Position
                  </button>
                </div>
              </div>
            </div>

            <div className="mt-4 pt-4 border-t border-border flex flex-col gap-4">
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">FEN:</span>
                <input
                  className="flex-1 bg-background border border-border px-3 py-1.5 text-sm rounded-md font-mono"
                  value={fenInput}
                  onChange={(e) => handleFenInput(e.target.value)}
                />
              </div>
              <div className="flex justify-end gap-3">
                <Button variant="outline" onClick={() => setIsSetupPositionOpen(false)}>
                  Cancel
                </Button>
                <Button variant="primary" onClick={applyPosition}>
                  Load Position
                </Button>
              </div>
            </div>
          </TabsContent>

          <TabsContent value="game">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-app-muted">
                Paste a PGN game (or the moves of a study line) and load it onto the board.
                The move list and navigation controls populate automatically.
              </p>
              <textarea
                className="w-full min-h-[220px] bg-background border border-border rounded-md p-3 text-sm font-mono resize-y"
                placeholder={'[Event "Casual game"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 *'}
                value={pgnText}
                onChange={(e) => setPgnText(e.target.value)}
              />
              <input
                ref={fileRef}
                type="file"
                accept=".pgn,.txt,text/plain"
                className="hidden"
                onChange={handleFile}
              />
              <div className="flex flex-wrap justify-between gap-3">
                <Button variant="outline" onClick={() => fileRef.current?.click()}>
                  <Upload size={16} strokeWidth={2.5} className="mr-2" />
                  Upload .pgn file
                </Button>
                <div className="flex gap-3">
                  <Button variant="outline" onClick={() => setIsSetupPositionOpen(false)}>
                    Cancel
                  </Button>
                  <Button variant="primary" onClick={applyGame} disabled={!pgnText.trim()}>
                    Load Game
                  </Button>
                </div>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
