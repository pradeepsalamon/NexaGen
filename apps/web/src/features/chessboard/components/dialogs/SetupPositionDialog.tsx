import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { useBoardStore } from "../../store/boardStore";
import { Chessground } from "chessground";
import type { Api } from "chessground/api";
import { Role, Color } from "chessground/types";
import { Chess } from "chess.js";
import { Trash2 } from "lucide-react";

export function SetupPositionDialog() {
  const { isSetupPositionOpen, setIsSetupPositionOpen, pushHistory } = useBoardStore();
  const boardRef = useRef<HTMLDivElement>(null);
  const [cgApi, setCgApi] = useState<Api | null>(null);

  // Local FEN parts
  const [boardFen, setBoardFen] = useState("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR");
  const [turn, setTurn] = useState<"w" | "b">("w");
  const [castling, setCastling] = useState({ K: true, Q: true, k: true, q: true });
  const [enPassant] = useState("-");
  const [halfMove] = useState("0");
  const [fullMove] = useState("1");
  
  const [fenInput, setFenInput] = useState("");

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
    try {
      const chess = new Chess(val); // validate
      setTurn(chess.turn());
      setBoardFen(val.split(" ")[0]);
      
      const castlingPart = val.split(" ")[2] || "-";
      setCastling({
        K: castlingPart.includes("K"),
        Q: castlingPart.includes("Q"),
        k: castlingPart.includes("k"),
        q: castlingPart.includes("q"),
      });
      
      if (cgApi) {
        cgApi.set({ fen: val.split(" ")[0] });
      }
    } catch (e) {
      // Invalid FEN, don't update board
    }
  };

  useEffect(() => {
    setFenInput(computeFen());
  }, [boardFen, turn, castling, enPassant, halfMove, fullMove]);

  // Init chessground
  useEffect(() => {
    if (!isSetupPositionOpen || !boardRef.current) return;

    const cg = Chessground(boardRef.current, {
      fen: boardFen,
      movable: { free: true, color: 'both' },
      draggable: { deleteOnDropOff: true, showGhost: true },
      events: {
        change: () => {
          setBoardFen(cg.getFen());
        }
      },
      animation: { enabled: false }
    });
    setCgApi(cg);

    return () => {
      cg.destroy();
      setCgApi(null);
    };
  }, [isSetupPositionOpen]); // Only re-init when opened, changes handled by cg onChange

  const handleDragNewPiece = (e: React.MouseEvent | React.TouchEvent, role: Role, color: Color) => {
    e.preventDefault();
    if (cgApi) {
      cgApi.dragNewPiece({ role, color }, e.nativeEvent as any, true);
    }
  };

  const SparePiece = ({ role, color }: { role: Role, color: Color }) => (
    <div 
      className="w-12 h-12 relative cursor-grab hover:scale-105 transition-transform flex items-center justify-center bg-gray-50/5 hover:bg-gray-50/10 rounded-md"
      onMouseDown={(e) => handleDragNewPiece(e, role, color)}
      onTouchStart={(e) => handleDragNewPiece(e, role, color)}
    >
      <div className={`${role} ${color} w-full h-full block bg-contain bg-center bg-no-repeat`} />
    </div>
  );

  const applyPosition = () => {
    try {
      const finalFen = computeFen();
      new Chess(finalFen); // Validate
      pushHistory(finalFen, "");
      setIsSetupPositionOpen(false);
    } catch (e) {
      alert("Invalid Position Setup. E.g. Missing Kings or Kings can capture each other.");
    }
  };

  return (
    <Dialog open={isSetupPositionOpen} onOpenChange={setIsSetupPositionOpen}>
      <DialogContent className="max-w-[800px] w-[95vw] p-0 bg-background border-border">
        <DialogHeader className="px-6 py-4 border-b border-border">
          <DialogTitle>Setup Position</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col md:flex-row p-6 gap-6">
          
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
          <div className="flex-shrink-0 mx-auto bg-[#e0d8c8] dark:bg-slate-800 shadow-md">
            <div 
              ref={boardRef} 
              className="cg-wrap cg-board-wrap cg-wrap-piece brown cburnett"
              style={{ width: "400px", height: "400px" }}
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
                  <input type="checkbox" checked={castling.K} onChange={(e) => setCastling(c => ({...c, K: e.target.checked}))} />
                  O-O
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={castling.Q} onChange={(e) => setCastling(c => ({...c, Q: e.target.checked}))} />
                  O-O-O
                </label>
              </div>
            </div>

            <div>
              <label className="text-sm font-medium mb-2 block">Black Castling</label>
              <div className="flex items-center gap-4 text-sm">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={castling.k} onChange={(e) => setCastling(c => ({...c, k: e.target.checked}))} />
                  O-O
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input type="checkbox" checked={castling.q} onChange={(e) => setCastling(c => ({...c, q: e.target.checked}))} />
                  O-O-O
                </label>
              </div>
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
                onClick={() => handleFenInput("rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1")}
              >
                Starting Position
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="px-6 py-4 bg-muted/50 border-t border-border flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium">FEN:</span>
            <input 
              className="flex-1 bg-background border border-border px-3 py-1.5 text-sm rounded-md font-mono"
              value={fenInput}
              onChange={(e) => handleFenInput(e.target.value)}
            />
          </div>
          <div className="flex justify-end gap-3">
            <button 
              className="px-4 py-2 border border-border rounded-md text-sm hover:bg-gray-50 dark:hover:bg-slate-800 transition-colors"
              onClick={() => setIsSetupPositionOpen(false)}
            >
              Cancel
            </button>
            <button 
              className="px-6 py-2 bg-primary text-white rounded-md text-sm hover:bg-primary/90 transition-colors"
              onClick={applyPosition}
            >
              Load Position
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
