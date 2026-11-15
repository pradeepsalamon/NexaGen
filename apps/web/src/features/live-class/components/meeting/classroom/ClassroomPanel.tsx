"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import {
  BookOpen,
  Cpu,
  FileText,
  ListChecks,
  ListOrdered,
  MessageCircleQuestion,
  MessageSquareText,
  Trophy,
  Users,
} from "lucide-react";
import { EngineEvalSummary } from "@/features/chessboard/components/panels/EngineEvalSummary";
import { MasterbasePanel } from "@/features/chessboard/components/panels/MasterbasePanel";
import { MoveHistory } from "@/features/chessboard/components/panels/MoveHistory";
import { PgnPanel } from "@/features/chessboard/components/panels/PgnPanel";
import { StockfishPanel } from "@/features/chessboard/components/panels/StockfishPanel";
import { useEngineEvalCache } from "@/features/chessboard/hooks/useEngineAnalysis";
import { RoomTabs } from "../../room-ui/RoomTabs";
import { cn } from "@/lib/utils";
import { useChatUnreadCount } from "../../../providers/ChatProvider";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { MeetingChat } from "../MeetingChat";
import { MeetingParticipants } from "../MeetingParticipants";
import { MeetingPuzzlePanel } from "../MeetingPuzzlePanel";
import { MovePollCoachPanel } from "../move-poll/MovePollCoachPanel";
import { ActivityQueueRoomPanel, LazyView } from "../lazyViews";
import { ClassroomVideo } from "./ClassroomVideo";
import { useMemberClassId } from "../../../providers/LiveRoomContext";

type TabId =
  | "moves"
  | "chat"
  | "people"
  | "puzzles"
  | "response"
  | "queue"
  | "engine"
  | "pgn"
  | "games";

const TABS: {
  id: TabId;
  label: string;
  icon: ReactNode;
  coachOnly?: boolean;
}[] = [
  { id: "puzzles", label: "Leaderboard", icon: <Trophy aria-hidden="true" className="size-4" strokeWidth={1.75} /> },
  { id: "moves", label: "Moves", icon: <ListOrdered aria-hidden="true" className="size-4" strokeWidth={1.75} /> },
  { id: "chat", label: "Chat", icon: <MessageSquareText aria-hidden="true" className="size-4" strokeWidth={1.75} /> },
  { id: "people", label: "People", icon: <Users aria-hidden="true" className="size-4" strokeWidth={1.75} /> },
  {
    id: "response",
    label: "Response",
    icon: <MessageCircleQuestion aria-hidden="true" className="size-4" strokeWidth={1.75} />,
    coachOnly: true,
  },
  {
    id: "queue",
    label: "Queue",
    icon: <ListChecks aria-hidden="true" className="size-4" strokeWidth={1.75} />,
    coachOnly: true,
  },
  {
    id: "engine",
    label: "Engine",
    icon: <Cpu aria-hidden="true" className="size-4" strokeWidth={1.75} />,
    coachOnly: true,
  },
  {
    id: "pgn",
    label: "PGN",
    icon: <FileText aria-hidden="true" className="size-4" strokeWidth={1.75} />,
    coachOnly: true,
  },
  {
    id: "games",
    label: "Games",
    icon: <BookOpen aria-hidden="true" className="size-4" strokeWidth={1.75} />,
    coachOnly: true,
  },
];

const COACH_TAB_ORDER: TabId[] = ["moves", "chat", "people", "puzzles", "response", "queue", "engine", "pgn", "games"];

/** Sidebar requests from the toolbar, toasts and People panel land on a classroom tab instead. */
const SIDEBAR_TO_TAB = {
  chat: "chat",
  participants: "people",
  puzzle: "puzzles",
} as const;

/** Tabs the coach's side column takes over while it is showing. */
const SIDE_COLUMN_TABS = new Set<TabId>(["chat", "puzzles"]);

/** Right-hand column of the single-page layout: video on top, one tab bar for everything else. */
export function ClassroomPanel({
  isCoach,
  showVideo,
  sideColumn = false,
  onOpenGallery,
}: {
  isCoach: boolean;
  showVideo: boolean;
  /** Switch the stage to the gallery (every participant's video in a grid). */
  onOpenGallery?: () => void;
  /** Leaderboard and chat are already shown in the coach's sidebar left of the board. */
  sideColumn?: boolean;
}) {
  // A student opens on the leaderboard.
  const [tab, setTab] = useState<TabId>(isCoach ? "moves" : "puzzles");
  const [videoCollapsed, setVideoCollapsed] = useState(false);
  const video = useVideoHeight();
  const { activeSidebar, setActiveSidebar, setClassroomChatOpen } = useLiveClassState(
    "activeSidebar",
    "setActiveSidebar",
    "setClassroomChatOpen",
  );
  const unreadCount = useChatUnreadCount();
  const roomId = useMemberClassId();
  const inSideColumn = (id: TabId) => sideColumn && SIDE_COLUMN_TABS.has(id);
  const activeTab: TabId = inSideColumn(tab) ? "moves" : tab;

  useEffect(() => {
    if (activeSidebar && activeSidebar in SIDEBAR_TO_TAB) {
      const next: TabId = SIDEBAR_TO_TAB[activeSidebar as keyof typeof SIDEBAR_TO_TAB];
      // The side column's own tabs answer chat / puzzle requests while it shows.
      if (sideColumn && SIDE_COLUMN_TABS.has(next)) return;
      setTab(next);
      setActiveSidebar(null);
    }
  }, [activeSidebar, setActiveSidebar, sideColumn]);

  useEffect(() => {
    // While the side column shows, its Chat tab owns the read state.
    if (sideColumn) return;
    setClassroomChatOpen(activeTab === "chat");
    return () => setClassroomChatOpen(false);
  }, [activeTab, sideColumn, setClassroomChatOpen]);

  // The coach's first three are the teaching tabs; a student opens on the leaderboard.
  const tabs = TABS.filter((t) => (isCoach || !t.coachOnly) && !inSideColumn(t.id)).sort(
    (a, b) => (isCoach ? COACH_TAB_ORDER.indexOf(a.id) - COACH_TAB_ORDER.indexOf(b.id) : 0),
  );

  return (
    // Panel (spec component 9): 300–760px, raised surface, hairline on the stage side. Stacked (tall tablet) it sits under the stage, video beside the tabs.
    <aside
      className="flex h-[42%] min-h-0 w-full shrink-0 border-t border-app-border bg-app-surface room:h-auto room:w-[var(--classroom-panel-w,380px)] room:flex-col room:border-l room:border-t-0 xl:w-[var(--classroom-panel-w,420px)] room:max-w-[calc(100vw-420px)]"
      aria-label="Class panel"
      data-classroom-panel
    >
      {showVideo ? (
        <>
          <div
            ref={video.ref}
            className={cn(
              "custom-scrollbar w-[260px] shrink-0 overflow-y-auto border-r border-app-border/60 room:w-auto room:overflow-visible room:border-r-0",
              video.height !== null && !videoCollapsed && "room:h-[var(--classroom-video-h)] room:overflow-hidden"
            )}
            style={video.height !== null ? ({ "--classroom-video-h": `${video.height}px` } as React.CSSProperties) : undefined}
          >
            <ClassroomVideo
              isCoach={isCoach}
              collapsed={videoCollapsed}
              onCollapsedChange={setVideoCollapsed}
              fill={video.height !== null}
              onOpenGallery={onOpenGallery}
            />
          </div>
          {!videoCollapsed ? <VideoResizer video={video} /> : null}
        </>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="flex shrink-0 items-center border-b border-app-border px-2 py-2">
          {/* Three tabs show; the rest go under More. Unselected tabs show their icon, so they fit a 300px panel. */}
          <RoomTabs
            ariaLabel="Class panel"
            items={tabs.map((t) => ({
              id: t.id,
              label: t.label,
              icon: t.icon,
              badge: t.id === "chat" ? unreadCount : undefined,
            }))}
            value={activeTab}
            onChange={setTab}
            maxVisible={3}
            iconOnly
          />
        </div>

        {/* Each tab mounts fresh, so its content fades up on a switch. */}
        <div className="min-h-0 flex-1 overflow-hidden motion-safe:[&>*]:animate-tab-panel-in" role="tabpanel">
          {activeTab === "moves" ? (
            // Lichess-style: engine header → its lines → the move list, one continuous column.
            <div className="custom-scrollbar flex h-full flex-col overflow-y-auto">
              {/* Engine analysis is coach / admin only (the API refuses students). */}
              {isCoach ? <EngineEvalSummary className="shrink-0" /> : null}
              {/* Never squeezed below a few rows by the engine lines: the tab scrolls instead. */}
              <div className="light-theme-overrides min-h-40 flex-1 text-app-text">
                <ClassroomMoveList withEvaluations={isCoach} />
              </div>
            </div>
          ) : null}
          {activeTab === "chat" ? <MeetingChat /> : null}
          {activeTab === "people" ? <MeetingParticipants showRoomControls={false} /> : null}
          {activeTab === "puzzles" ? <MeetingPuzzlePanel /> : null}
          {activeTab === "response" ? (
            <div className="h-full overflow-y-auto">
              <MovePollCoachPanel />
            </div>
          ) : null}
          {activeTab === "queue" && roomId ? (
            <LazyView>
              <ActivityQueueRoomPanel classId={roomId} onOpenResponses={() => setTab("response")} />
            </LazyView>
          ) : null}
          {activeTab === "engine" ? <StockfishPanel /> : null}
          {activeTab === "pgn" ? (
            <div className="h-full overflow-y-auto">
              <PgnPanel />
            </div>
          ) : null}
          {activeTab === "games" ? (
            <div className="h-full overflow-y-auto">
              <MasterbasePanel />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}

/** The board's moves one per row, with the engine's score beside each position it has analysed. */
function ClassroomMoveList({ withEvaluations }: { withEvaluations: boolean }) {
  const evaluations = useEngineEvalCache((s) => s.evals);
  return <MoveHistory layout="rows" embedded evaluations={withEvaluations ? evaluations : undefined} />;
}

const VIDEO_HEIGHT_KEY = "nexa-live-class-video-height";
const VIDEO_MIN = 140;
// Room-control strip + tab bar + a usable slice of the active tab.
const TOOLS_MIN = 240;

/** Height of the panel's video section (side by side), null = natural 16:9. Remembered per browser. */
function useVideoHeight() {
  const ref = useRef<HTMLDivElement>(null);
  const [height, setHeight] = useState<number | null>(null);

  const clamp = (value: number) => {
    const panel = ref.current?.parentElement?.offsetHeight ?? window.innerHeight;
    return Math.round(Math.min(Math.max(VIDEO_MIN, panel - TOOLS_MIN), Math.max(VIDEO_MIN, value)));
  };

  useEffect(() => {
    try {
      // A height saved on a taller window must still leave room for the tools.
      const raw = Number(window.localStorage.getItem(VIDEO_HEIGHT_KEY));
      if (raw > 0) setHeight(clamp(raw));
    } catch {
      // per-browser convenience only
    }
  }, []);

  const commit = (next: number | null) => {
    setHeight(next);
    try {
      if (next === null) window.localStorage.removeItem(VIDEO_HEIGHT_KEY);
      else window.localStorage.setItem(VIDEO_HEIGHT_KEY, String(next));
    } catch {
      // per-browser convenience only
    }
  };

  return { clamp, commit, height, ref, setHeight };
}

/** Drag handle between the video and the tools under it (side by side). Double-click resets to 16:9. */
function VideoResizer({ video }: { video: ReturnType<typeof useVideoHeight> }) {
  const current = () => video.height ?? video.ref.current?.offsetHeight ?? 280;

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const top = video.ref.current?.getBoundingClientRect().top;
    if (top === undefined) return;
    event.preventDefault();
    const handle = event.currentTarget;
    handle.setPointerCapture(event.pointerId);
    document.body.style.cursor = "row-resize";
    document.body.style.userSelect = "none";
    let latest = current();
    const onMove = (e: PointerEvent) => {
      latest = video.clamp(e.clientY - top);
      video.setHeight(latest);
    };
    const onUp = () => {
      handle.removeEventListener("pointermove", onMove);
      handle.removeEventListener("pointerup", onUp);
      handle.removeEventListener("pointercancel", onUp);
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
      video.commit(latest);
    };
    handle.addEventListener("pointermove", onMove);
    handle.addEventListener("pointerup", onUp);
    handle.addEventListener("pointercancel", onUp);
  };

  return (
    <div
      role="separator"
      aria-orientation="horizontal"
      aria-label="Resize video and tools"
      aria-valuenow={video.height ?? undefined}
      tabIndex={0}
      onPointerDown={onPointerDown}
      onDoubleClick={() => video.commit(null)}
      onKeyDown={(e) => {
        // Only when reached by keyboard: after a drag the handle keeps focus, and the arrows belong to the board.
        if (!e.currentTarget.matches(":focus-visible")) return;
        if (e.key === "ArrowUp") video.commit(video.clamp(current() - 24));
        else if (e.key === "ArrowDown") video.commit(video.clamp(current() + 24));
        else return;
        e.preventDefault();
      }}
      className="group relative z-10 -my-1.5 hidden h-3 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none room:flex"
    >
      <span className="h-1 w-12 rounded-full bg-app-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
