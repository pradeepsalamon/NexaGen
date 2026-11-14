import { MoveHistory } from "../panels/MoveHistory";
import { BoardActionsRow } from "./BoardActionsRow";
import { StockfishPanel } from "./StockfishPanel";
import { MasterbasePanel } from "./MasterbasePanel";
import { PgnPanel } from "./PgnPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { useBoardStore } from "../../context/BoardProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassState, useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { isHumanParticipant } from "@/features/live-class/lib/participants";
import { BoardControlSideToggle } from "@/features/live-class/components/meeting/BoardControlSideToggle";
import { MeetingPuzzlePanel } from "@/features/live-class/components/meeting/MeetingPuzzlePanel";
import { MovePollCoachPanel } from "@/features/live-class/components/meeting/move-poll/MovePollCoachPanel";
import type { BoardControlSide } from "../../types/sync";
import { useRoster } from "@/features/live-class/hooks/useRoster";

export function SidebarTabs() {
  const activeTab = useBoardStore((s) => s.activeTab);
  const setActiveTab = useBoardStore((s) => s.setActiveTab);
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  // Live class context (only defined when board is inside a live class)
  const liveClassState = useOptionalLiveClassState(() => true);

  return (
    <div className="flex flex-col h-full w-full bg-app-surface text-app-text p-4 shadow-card border-l border-app-border">

      {/* Action Buttons Row */}
      {isCoach && <BoardActionsRow onPastePgn={() => setActiveTab("pgn")} className="mb-6" />}

      {/* Tabs Section */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-app-border rounded-none h-auto p-0 space-x-4 mb-4 overflow-x-auto">
          <TabsTrigger 
            value="moves" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap"
          >
            Moves
          </TabsTrigger>
          {isCoach && (
            <TabsTrigger value="engine" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
              Engine
            </TabsTrigger>
          )}
          {isCoach && (
            <TabsTrigger value="pgn" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
              PGN
            </TabsTrigger>
          )}
          {isCoach && liveClassState && (
             <TabsTrigger value="class" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
              Live Class
            </TabsTrigger>
          )}
          {isCoach && liveClassState && (
            <TabsTrigger value="puzzles" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
              Puzzles
            </TabsTrigger>
          )}
          {isCoach && liveClassState && (
            <TabsTrigger value="response" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
              Response
            </TabsTrigger>
          )}
          <TabsTrigger value="masterbase" className="rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:text-primary-ink data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-app-muted hover:text-app-text data-[state=active]:shadow-none whitespace-nowrap">
            Masterbase
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="moves" className="flex-1 min-h-0 overflow-y-auto mt-0">
          <div className="h-full light-theme-overrides text-app-text">
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
            <LiveClassControlPanel />
          </TabsContent>
        )}
        {isCoach && liveClassState && (
          <TabsContent value="puzzles" className="flex-1 min-h-0 mt-0">
            <MeetingPuzzlePanel />
          </TabsContent>
        )}
        {isCoach && liveClassState && (
          <TabsContent value="response" className="flex-1 min-h-0 mt-0 overflow-y-auto">
            <MovePollCoachPanel />
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

function LiveClassControlPanel() {
  const participants = useRoster();
  const liveClassState = useLiveClassState(
    "boardControlStudents",
    "clearBoardControl",
    "setBoardControlSide",
  );
  const granted: Record<string, BoardControlSide> = liveClassState.boardControlStudents;
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
      <div className="flex items-center justify-between border-b border-app-border pb-2">
        <h3 className="font-bold">Board Control</h3>
        {grantedIds.length > 0 && (
          <button
            type="button"
            onClick={() => liveClassState.clearBoardControl()}
            className="text-xs font-medium text-primary-ink hover:text-primary-ink"
          >
            Revoke all
          </button>
        )}
      </div>
      <p className="text-xs text-app-muted -mt-2">
        Choose which pieces each student may move — white, black, or both. Several can hold
        control at once, so two students can play each other; the coach always has full control.
      </p>

      <div className="flex flex-col gap-2">
        {people
          .filter((p) => p.isCoachRole)
          .map((p) => (
            <div
              key={p.identity}
              className="flex items-center justify-between rounded-control border border-app-border px-3 h-8 text-xs text-app-muted"
            >
              <span className="truncate">{p.name}</span>
              <span className="shrink-0 font-medium">Coach · full control</span>
            </div>
          ))}

        {students.length === 0 ? (
          <p className="text-xs text-app-muted italic py-2">No students in room.</p>
        ) : (
          students.map((p) => (
            <div
              key={p.identity}
              className="flex items-center justify-between gap-2 rounded-control border border-app-border pl-3 pr-1 h-9"
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
