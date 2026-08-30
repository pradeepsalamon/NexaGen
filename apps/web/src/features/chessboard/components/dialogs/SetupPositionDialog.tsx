import React, { useEffect, useRef, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { loadPgnIntoBoard } from "../../lib/loadPgn";
import { START_FEN, validateFen } from "../../lib/fen";
import { PositionEditor } from "../board/PositionEditor";
import { toast } from "sonner";
import { Upload } from "lucide-react";

export function SetupPositionDialog() {
  const { isSetupPositionOpen, setIsSetupPositionOpen, pushHistory } = useBoardStore();
  const [tab, setTab] = useState<"setup" | "game">("setup");

  const [fen, setFen] = useState(START_FEN);

  // Load Game tab
  const [pgnText, setPgnText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset transient state whenever the dialog opens.
  useEffect(() => {
    if (isSetupPositionOpen) {
      setTab("setup");
      setPgnText("");
      setFen(START_FEN);
    }
  }, [isSetupPositionOpen]);

  const applyPosition = () => {
    const result = validateFen(fen);
    if (!result.ok) {
      toast.error(`Invalid position: ${result.error}`);
      return;
    }
    pushHistory(fen, "");
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
      <DialogContent className="max-w-[820px] w-[95vw] max-h-[calc(100vh-2rem)] overflow-y-auto p-0 bg-app-surface border-app-border">
        <DialogHeader className="px-4 py-3 sm:px-6 sm:py-4 border-b border-app-border">
          <DialogTitle>Load Games / Positions</DialogTitle>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as "setup" | "game")} className="p-4 sm:p-6">
          <TabsList>
            <TabsTrigger value="setup">Setup Position</TabsTrigger>
            <TabsTrigger value="game">Load Game (PGN)</TabsTrigger>
          </TabsList>

          <TabsContent value="setup">
            <PositionEditor value={fen} onChange={setFen} />

            <div className="mt-6 flex justify-end gap-3 border-t border-app-border pt-4">
              <Button variant="outline" onClick={() => setIsSetupPositionOpen(false)}>
                Cancel
              </Button>
              <Button variant="primary" onClick={applyPosition}>
                Load Position
              </Button>
            </div>
          </TabsContent>

          <TabsContent value="game">
            <div className="flex flex-col gap-4">
              <p className="text-sm text-app-muted">
                Paste a PGN game (or the moves of a study line) and load it onto the board.
                The move list and navigation controls populate automatically.
              </p>
              <textarea
                className="w-full min-h-[220px] bg-app-surface border border-app-border rounded-md p-3 text-sm font-mono resize-y text-app-text"
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
