import { useState } from "react";
import { Copy, ClipboardPaste, Cpu, Loader2, Redo2, Undo2 } from "lucide-react";
import { MoveHistory } from "../panels/MoveHistory";
import { StockfishPanel } from "./StockfishPanel";
import { MasterbasePanel } from "./MasterbasePanel";
import { PgnPanel } from "./PgnPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { uploadPgn } from "@/lib/uploadApi";
import { toast } from "sonner";
import { useBoardStore } from "../../context/BoardProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { isHumanParticipant } from "@/features/live-class/lib/participants";
import { BoardControlSideToggle } from "@/features/live-class/components/meeting/BoardControlSideToggle";
import type { BoardControlSide } from "../../types/sync";
import { useParticipants } from "@livekit/components-react";
import { analyzePosition } from "../../api/stockfishApi";
import { NavIconButton } from "../toolbars/BoardNavigation";

export function SidebarTabs() {
  const {
    fen,
    pgn,
    undo,
    redo,
    historyIndex,
    moveHistory,
    isGameOver,
    makeMove,
    setIsSetupPositionOpen,
    activeTab,
    setActiveTab,
  } = useBoardStore();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const [isEngineMoving, setIsEngineMoving] = useState(false);

  // Live class context (only defined when board is inside a live class)
  const liveClassState = useOptionalLiveClassState();

  const handleSaveToCloud = async () => {
    if (!pgn) {
      toast.error("No PGN to save.");
      return;
    }
    try {
      const { url } = await uploadPgn(pgn, "game.pgn");
      await navigator.clipboard.writeText(url);
      toast.success("PGN saved to Cloud! URL copied to clipboard.");
    } catch (error) {
      toast.error("Failed to save PGN to Cloud.");
    }
  };

  const handleCopyPGN = async () => {
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      toast.success("PGN copied to clipboard!");
    } else {
      toast.error("No PGN to copy");
    }
  };

  const handlePastePGN = () => {
    setActiveTab("pgn");
  };

  const handleSetupPosition = () => {
    setIsSetupPositionOpen(true);
  };

  const handleEngineMove = async () => {
    if (isGameOver) {
      toast.error("The game is already over.");
      return;
    }
    setIsEngineMoving(true);
    try {
      const analysis = await analyzePosition(fen);
      const uci = analysis.bestMoveUci;
      if (!uci || uci.length < 4) {
        toast.error("Engine could not find a move for this position.");
        return;
      }
      const from = uci.slice(0, 2);
      const to = uci.slice(2, 4);
      const promotion = uci.length > 4 ? uci.slice(4, 5) : undefined;
      if (!makeMove(from, to, promotion)) {
        toast.error("Could not play the engine's move.");
      }
    } catch (error: any) {
      toast.error(error?.message || "Failed to get the engine's move.");
    } finally {
      setIsEngineMoving(false);
    }
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 p-4 shadow-sm border-l border-gray-200 dark:border-slate-800">

      {/* Action Buttons Row */}
      {isCoach && (
        <div className="flex flex-wrap items-center gap-2 mb-6">
          <Button variant="primary" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 h-auto text-xs font-medium" onClick={handleSaveToCloud}>Save</Button>
          <SidebarButton onClick={handleSetupPosition}>Setup Position</SidebarButton>
          <SimpleTooltip label="Undo">
            <NavIconButton
              aria-label="Undo"
              icon={<Undo2 size={16} />}
              onClick={undo}
              disabled={historyIndex < 0}
            />
          </SimpleTooltip>
          <SimpleTooltip label="Redo">
            <NavIconButton
              aria-label="Redo"
              icon={<Redo2 size={16} />}
              onClick={redo}
              disabled={historyIndex >= moveHistory.length - 1}
            />
          </SimpleTooltip>
          <SimpleTooltip label="Copy PGN">
            <NavIconButton aria-label="Copy PGN" icon={<Copy size={16} />} onClick={handleCopyPGN} />
          </SimpleTooltip>
          <SimpleTooltip label="Paste PGN">
            <NavIconButton aria-label="Paste PGN" icon={<ClipboardPaste size={16} />} onClick={handlePastePGN} />
          </SimpleTooltip>
          <SimpleTooltip label={isEngineMoving ? "Thinking…" : "Engine Move"}>
            <NavIconButton
              aria-label={isEngineMoving ? "Thinking…" : "Engine Move"}
              icon={
                isEngineMoving ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Cpu size={16} />
                )
              }
              onClick={handleEngineMove}
              disabled={isEngineMoving || isGameOver}
            />
          </SimpleTooltip>
        </div>
      )}

      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-gray-200 dark:border-slate-800 rounded-none h-auto p-0 space-x-4 mb-4 overflow-x-auto">
          <TabsTrigger 
            value="moves" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap"
          >
            Moves
          </TabsTrigger>
          {isCoach && (
            <TabsTrigger value="engine" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
              Engine
            </TabsTrigger>
          )}
          {isCoach && (
            <TabsTrigger value="pgn" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
              PGN
            </TabsTrigger>
          )}
          {isCoach && liveClassState && (
             <TabsTrigger value="class" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
              Live Class
            </TabsTrigger>
          )}
          <TabsTrigger value="masterbase" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
            Masterbase
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="moves" className="flex-1 min-h-0 overflow-y-auto mt-0">
          <div className="h-full light-theme-overrides text-gray-800 dark:text-slate-200">
            <MoveHistory />
          </div>
        </TabsContent>
        {isCoach && (
          <TabsContent value="engine" className="flex-1 mt-0">
            <StockfishPanel />
          </TabsContent>
        )}
        {isCoach && (
          <TabsContent value="pgn" className="flex-1 min-h-0 overflow-y-auto mt-0">
            <PgnPanel />
          </TabsContent>
        )}
        {isCoach && liveClassState && (
          <TabsContent value="class" className="flex-1 mt-0 overflow-y-auto">
            <LiveClassControlPanel liveClassState={liveClassState} />
          </TabsContent>
        )}
        <TabsContent value="masterbase" className="flex-1 min-h-0 overflow-y-auto mt-0">
          <MasterbasePanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}

function parseParticipantMeta(raw?: string) {
  if (!raw) return {} as { role?: string; firstName?: string; lastName?: string };
  try {
    return JSON.parse(raw) as { role?: string; firstName?: string; lastName?: string };
  } catch {
    return {};
  }
}

function LiveClassControlPanel({ liveClassState }: { liveClassState: any }) {
  const participants = useParticipants();
  const granted: Record<string, BoardControlSide> = liveClassState.boardControlStudents ?? {};
  const grantedIds = Object.keys(granted);

  // Everyone in the meeting except the coach's own board pop-out and the
  // recording bot — neither is a person who can be granted board control.
  const people = participants
    .filter(isHumanParticipant)
    .map((p) => {
      const meta = parseParticipantMeta(p.metadata);
      const isCoachRole =
        meta.role?.toUpperCase() === "COACH" || meta.role?.toUpperCase() === "TEACHER";
      const name = meta.firstName
        ? `${meta.firstName} ${meta.lastName || ""}`.trim()
        : p.name || p.identity;
      return { identity: p.identity, name, isCoachRole };
    });

  const students = people.filter((p) => !p.isCoachRole);

  return (
    <div className="flex flex-col h-full gap-4 p-2 text-sm">
      <div className="flex items-center justify-between border-b border-gray-200 dark:border-slate-800 pb-2">
        <h3 className="font-bold">Board Control</h3>
        {grantedIds.length > 0 && (
          <button
            type="button"
            onClick={() => liveClassState.clearBoardControl()}
            className="text-xs font-medium text-blue-500 hover:text-blue-600"
          >
            Revoke all
          </button>
        )}
      </div>
      <p className="text-xs text-gray-500 dark:text-slate-400 -mt-2">
        Choose which pieces each student may move — white, black, or both. Several can hold
        control at once, so two students can play each other; the coach always has full control.
      </p>

      <div className="flex flex-col gap-2">
        {people
          .filter((p) => p.isCoachRole)
          .map((p) => (
            <div
              key={p.identity}
              className="flex items-center justify-between rounded-control border border-gray-200 dark:border-slate-800 px-3 h-8 text-xs text-gray-500 dark:text-slate-400"
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 font-medium">Coach · full control</span>
            </div>
          ))}

        {students.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No students in room.</p>
        ) : (
          students.map((p) => (
            <div
              key={p.identity}
              className="flex items-center justify-between gap-2 rounded-control border border-gray-200 dark:border-slate-800 pl-3 pr-1 h-9"
            >
              <span className="truncate text-xs font-medium text-app-text">{p.name}</span>
              <BoardControlSideToggle
                studentName={p.name}
                value={granted[p.identity] ?? null}
                onChange={(side) => liveClassState.setBoardControlSide(p.identity, side)}
              />
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function SidebarButton({ children, onClick, disabled }: { children: React.ReactNode, onClick?: () => void, disabled?: boolean }) {
  return (
    <Button
      variant="outline"
      onClick={onClick}
      disabled={disabled}
      className="bg-white dark:bg-slate-800 hover:bg-gray-50 dark:hover:bg-slate-700 text-gray-600 dark:text-slate-300 border-gray-300 dark:border-slate-700 px-3 py-1.5 h-auto text-xs font-normal"
    >
      {children}
    </Button>
  );
}
