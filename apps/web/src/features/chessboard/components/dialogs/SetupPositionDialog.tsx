import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { loadPgnIntoBoard } from "../../lib/loadPgn";
import { START_FEN, validateFen } from "../../lib/fen";
import { PositionEditor } from "../board/PositionEditor";
import { toast } from "sonner";
import { Upload } from "lucide-react";
import { Textarea } from "@/components/ui/Textarea";
import { cn } from "@/lib/utils";

// The PDF import (recognizer, piece templates, pdf.js) loads only when the tab is opened.
const ClassBoardDiagramImport = dynamic(
  () => import("@/features/diagram-import/components/ClassBoardDiagramImport").then((m) => m.ClassBoardDiagramImport),
  { ssr: false, loading: () => <p className="py-8 text-center text-sm text-app-muted">Loading the PDF importer…</p> },
);

type Tab = "setup" | "game" | "pdf";

export type SetupPositionPdfImport = {
  /** Where the coach's "New puzzle" form lives (/coach/puzzles or /admin/puzzles). */
  libraryBasePath: string;
  /** Shown in the replace-the-board confirmation (e.g. a puzzle is running). */
  activityNote?: string;
};

/**
 * Load a position or game onto the board. `pdfImport` adds the "From PDF"
 * tab (PDF chess-diagram import) — the live classroom passes it for the coach.
 */
export function SetupPositionDialog({ pdfImport }: { pdfImport?: SetupPositionPdfImport } = {}) {
  const { isSetupPositionOpen, setIsSetupPositionOpen, pushHistory } = useBoardStore(
    useShallow((s) => ({
      isSetupPositionOpen: s.isSetupPositionOpen,
      setIsSetupPositionOpen: s.setIsSetupPositionOpen,
      pushHistory: s.pushHistory,
    })),
  );
  const [tab, setTab] = useState<Tab>("setup");

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

  const applyDiagram = (diagramFen: string) => {
    const result = validateFen(diagramFen);
    if (!result.ok) {
      toast.error(`Invalid position: ${result.error}`);
      return;
    }
    pushHistory(diagramFen, "");
    toast.success("Position loaded on the class board");
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
      {/* Fixed height + pinned footer: switching tabs or editing never
          re-centres the dialog, and the actions stay on screen on a tablet. */}
      <DialogContent
        className={cn(
          "flex h-[min(calc(100dvh-2rem),780px)] w-[95vw] flex-col gap-0 overflow-hidden p-0 bg-app-surface border-app-border",
          tab === "pdf" ? "max-w-[1100px]" : "max-w-[820px]",
        )}
      >
        <DialogHeader className="shrink-0 px-4 py-3 sm:px-6 sm:py-4 border-b border-app-border">
          <DialogTitle>Load Games / Positions</DialogTitle>
        </DialogHeader>

        <Tabs
          value={tab}
          onValueChange={(v) => setTab(v as Tab)}
          className="flex min-h-0 flex-1 flex-col"
        >
          <div className="shrink-0 px-4 pt-3 sm:px-6">
            <TabsList>
              <TabsTrigger value="setup">Setup Position</TabsTrigger>
              <TabsTrigger value="game">Load Game (PGN)</TabsTrigger>
              {pdfImport ? <TabsTrigger value="pdf">From PDF</TabsTrigger> : null}
            </TabsList>
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 pb-4 sm:px-6">
            <TabsContent value="setup">
              <PositionEditor value={fen} onChange={setFen} />
            </TabsContent>

            <TabsContent value="game">
              <div className="flex flex-col gap-4">
                <p className="text-sm text-app-muted">
                  Paste a PGN game (or the moves of a study line) and load it onto the board.
                  The move list and navigation controls populate automatically.
                </p>
                <Textarea
                  aria-label="PGN"
                  className="min-h-[220px] font-mono"
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
                <div>
                  <Button variant="outline" onClick={() => fileRef.current?.click()}>
                    <Upload strokeWidth={2.5} className="size-4 mr-2" />
                    Upload .pgn file
                  </Button>
                </div>
              </div>
            </TabsContent>

            {pdfImport ? (
              <TabsContent value="pdf">
                <ClassBoardDiagramImport
                  activityNote={pdfImport.activityNote}
                  libraryBasePath={pdfImport.libraryBasePath}
                  onLoad={applyDiagram}
                />
              </TabsContent>
            ) : null}
          </div>
        </Tabs>

        <div className="flex shrink-0 justify-end gap-3 border-t border-app-border px-4 py-3 sm:px-6">
          <Button variant="outline" onClick={() => setIsSetupPositionOpen(false)}>
            Cancel
          </Button>
          {tab === "setup" ? (
            <Button variant="primary" onClick={applyPosition}>
              Load Position
            </Button>
          ) : tab === "game" ? (
            <Button variant="primary" onClick={applyGame} disabled={!pgnText.trim()}>
              Load Game
            </Button>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
