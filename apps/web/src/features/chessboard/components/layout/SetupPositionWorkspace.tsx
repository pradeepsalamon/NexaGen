import React, { useEffect, useRef, useState } from "react";
import dynamic from "next/dynamic";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { useBoardStore } from "../../context/BoardProvider";
import { useShallow } from "zustand/react/shallow";
import { loadPgnIntoBoard } from "../../lib/loadPgn";
import { inspectFen } from "../../lib/fen";
import { PositionEditor } from "../board/PositionEditor";
import { toast } from "sonner";
import { Maximize2, Minimize2, PanelRightClose, PanelRightOpen, Upload } from "lucide-react";
import { SimpleTooltip } from "@/components/ui/Tooltip";
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
 * Load a position or game onto the board, in place: while
 * `isSetupPositionOpen`, the board workspace renders this where the main board
 * stands, and the set-up board starts from the main board's position (same
 * orientation, same appearance). Nothing reaches the main board — or, in a live
 * class, the students — until "Load Position". `pdfImport` adds the "From PDF"
 * tab (PDF chess-diagram import) — the live classroom passes it for the coach.
 *
 * Layout controls: "Collapse settings" hides the side-to-move / castling /
 * FEN column so the board takes its width; "Maximize board" lifts the
 * workspace over the rest of the page; "Restore layout" undoes both. They
 * only change classes — the editor stays mounted, so the position and the
 * selected tool survive every switch.
 */
export function SetupPositionWorkspace({
  pdfImport,
  className,
}: {
  pdfImport?: SetupPositionPdfImport;
  className?: string;
} = {}) {
  const { boardFen, orientation, localFlip, setIsSetupPositionOpen, pushHistory } = useBoardStore(
    useShallow((s) => ({
      boardFen: s.fen,
      orientation: s.orientation,
      localFlip: s.localFlip,
      setIsSetupPositionOpen: s.setIsSetupPositionOpen,
      pushHistory: s.pushHistory,
    })),
  );
  const viewOrientation = localFlip ? (orientation === "white" ? "black" : "white") : orientation;
  const [tab, setTab] = useState<Tab>("setup");
  const [settingsCollapsed, setSettingsCollapsed] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const maximizedRef = useRef(maximized);
  maximizedRef.current = maximized;
  // Mounted only while open, so this is the main board's position at opening.
  const [fen, setFen] = useState(boardFen);

  // Load Game tab
  const [pgnText, setPgnText] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const rootRef = useRef<HTMLElement>(null);

  const close = () => setIsSetupPositionOpen(false);

  const restoreLayout = () => {
    setMaximized(false);
    setSettingsCollapsed(false);
  };

  // Escape cancels, as the dialog it replaced did — unless something inside
  // (the editor's selected piece, an open menu) used it first. Maximized, it
  // restores the layout first.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      const target = e.target instanceof Element ? e.target : null;
      if (target?.closest('[role="dialog"],[role="alertdialog"],[role="menu"],[role="listbox"]')) return;
      if (maximizedRef.current) {
        setMaximized(false);
        return;
      }
      setIsSetupPositionOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [setIsSetupPositionOpen]);

  useEffect(() => {
    rootRef.current?.scrollIntoView({ block: "nearest" });
  }, []);

  const loadFen = (input: string, loadedMessage: string) => {
    const read = inspectFen(input);
    if (!read.ok) {
      toast.error(`Can't load this FEN: ${read.error}.`);
      return;
    }
    pushHistory(read.fen, "");
    if (read.issues.length > 0) {
      toast.info(`${loadedMessage} as a set-up position`, {
        description: `${read.issues.join(", ")} — moves and the engine are off until it is a legal position.`,
      });
    } else {
      toast.success(loadedMessage);
    }
    close();
  };

  const applyGame = () => {
    const result = loadPgnIntoBoard(pgnText, pushHistory);
    if (result.ok) {
      toast.success(
        result.moveCount > 0 ? `Game loaded (${result.moveCount} moves)` : "Position loaded",
      );
      close();
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
    <section
      ref={rootRef}
      aria-labelledby="setup-position-title"
      data-testid="setup-position-workspace"
      data-maximized={maximized ? "true" : undefined}
      className={cn(
        "flex min-h-0 w-full flex-1 flex-col overflow-hidden rounded-app border border-app-border bg-app-surface shadow-card",
        className,
        // Over the room's panels and toolbars; tooltips, menus and dialogs (z-50) stay above.
        maximized && "fixed inset-0 z-40 m-0 rounded-none border-0 md:m-0",
      )}
    >
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)} className="flex min-h-0 flex-1 flex-col">
        {/* One header row holds the actions too: every pixel of height goes to the board. */}
        <header className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-2 border-b border-app-border px-3 py-2 sm:px-4">
          <h2 id="setup-position-title" className="sr-only 2xl:not-sr-only 2xl:text-base 2xl:font-semibold 2xl:text-app-text">
            Load Games / Positions
          </h2>
          <TabsList className="max-w-full overflow-x-auto">
            <TabsTrigger value="setup">Setup Position</TabsTrigger>
            <TabsTrigger value="game">Load Game (PGN)</TabsTrigger>
            {pdfImport ? <TabsTrigger value="pdf">From PDF</TabsTrigger> : null}
          </TabsList>
          <div className="ml-auto flex items-center gap-2">
            {tab === "setup" ? (
              <LayoutButton
                label={settingsCollapsed ? "Expand settings" : "Collapse settings"}
                icon={settingsCollapsed ? <PanelRightOpen className="size-4" strokeWidth={2.5} /> : <PanelRightClose className="size-4" strokeWidth={2.5} />}
                onClick={() => setSettingsCollapsed((c) => !c)}
                testId="setup-toggle-settings"
                expanded={!settingsCollapsed}
              />
            ) : null}
            <LayoutButton
              label={maximized ? "Restore layout" : "Maximize board"}
              icon={maximized ? <Minimize2 className="size-4" strokeWidth={2.5} /> : <Maximize2 className="size-4" strokeWidth={2.5} />}
              onClick={maximized ? restoreLayout : () => setMaximized(true)}
              testId="setup-toggle-maximize"
            />
            <Button variant="outline" size="sm" onClick={close}>
              Cancel
            </Button>
            {tab === "setup" ? (
              <Button variant="primary" size="sm" onClick={() => loadFen(fen, "Position loaded")}>
                Load Position
              </Button>
            ) : tab === "game" ? (
              <Button variant="primary" size="sm" onClick={applyGame} disabled={!pgnText.trim()}>
                Load Game
              </Button>
            ) : null}
          </div>
        </header>

        <div
          className={cn(
            "min-h-0 flex-1",
            // The editor is its own (single) scroller and sizes the board to
            // this box; the other tabs scroll here.
            tab === "setup" ? "flex flex-col" : "overflow-y-auto overscroll-contain px-3 py-3 sm:px-4",
          )}
        >
          <TabsContent value="setup" className="mt-0 flex min-h-0 flex-1 flex-col">
            <PositionEditor
              value={fen}
              onChange={setFen}
              orientation={viewOrientation}
              fill
              detailsCollapsed={settingsCollapsed}
              className="h-auto flex-1"
            />
          </TabsContent>

          <TabsContent value="game" className="mt-0">
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
            <TabsContent value="pdf" className="mt-0">
              <ClassBoardDiagramImport
                activityNote={pdfImport.activityNote}
                libraryBasePath={pdfImport.libraryBasePath}
                onLoad={(diagramFen) => loadFen(diagramFen, "Position loaded on the class board")}
              />
            </TabsContent>
          ) : null}
        </div>
      </Tabs>
    </section>
  );
}

function LayoutButton({
  label,
  icon,
  onClick,
  testId,
  expanded,
}: {
  label: string;
  icon: React.ReactNode;
  onClick: () => void;
  testId: string;
  expanded?: boolean;
}) {
  return (
    <SimpleTooltip label={label}>
      <Button
        aria-expanded={expanded}
        aria-label={label}
        className="size-8 rounded-full"
        data-testid={testId}
        onClick={onClick}
        size="icon"
        type="button"
        variant="outline"
      >
        {icon}
      </Button>
    </SimpleTooltip>
  );
}
