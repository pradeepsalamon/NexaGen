"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";
import { useParams } from "next/navigation";
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
import { BoardActionsRow } from "@/features/chessboard/components/panels/BoardActionsRow";
import { MasterbasePanel } from "@/features/chessboard/components/panels/MasterbasePanel";
import { MoveHistory } from "@/features/chessboard/components/panels/MoveHistory";
import { PgnPanel } from "@/features/chessboard/components/panels/PgnPanel";
import { StockfishPanel } from "@/features/chessboard/components/panels/StockfishPanel";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useLiveClassChat } from "../../../providers/ChatProvider";
import { useLiveClassState } from "../../../providers/LiveClassProvider";
import { CoachRoomControls } from "../CoachRoomControls";
import { MeetingChat } from "../MeetingChat";
import { MeetingParticipants } from "../MeetingParticipants";
import { MeetingPuzzlePanel } from "../MeetingPuzzlePanel";
import { MovePollCoachPanel } from "../move-poll/MovePollCoachPanel";
import { ActivityQueueRoomPanel } from "../../activity-queue/ActivityQueueRoomPanel";
import { ClassroomVideo } from "./ClassroomVideo";

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
  { id: "puzzles", label: "Leaderboard", icon: <Trophy className="size-4" /> },
  { id: "moves", label: "Moves", icon: <ListOrdered className="size-4" /> },
  { id: "chat", label: "Chat", icon: <MessageSquareText className="size-4" /> },
  { id: "people", label: "People", icon: <Users className="size-4" /> },
  {
    id: "response",
    label: "Response",
    icon: <MessageCircleQuestion className="size-4" />,
    coachOnly: true,
  },
  {
    id: "queue",
    label: "Queue",
    icon: <ListChecks className="size-4" />,
    coachOnly: true,
  },
  {
    id: "engine",
    label: "Engine",
    icon: <Cpu className="size-4" />,
    coachOnly: true,
  },
  {
    id: "pgn",
    label: "PGN",
    icon: <FileText className="size-4" />,
    coachOnly: true,
  },
  {
    id: "games",
    label: "Games",
    icon: <BookOpen className="size-4" />,
    coachOnly: true,
  },
];

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
  const { unreadCount } = useLiveClassChat();
  const roomId = useParams()?.roomId as string | undefined;
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

  const tabs = TABS.filter((t) => (isCoach || !t.coachOnly) && !inSideColumn(t.id));

  return (
    // Below lg the panel sits under the stage (video beside the tabs); the floating toolbar overlays its bottom.
    <aside
      className="flex h-[42%] min-h-0 w-full shrink-0 border-t border-app-border/70 bg-app-surface/40 pb-24 lg:h-auto lg:w-[var(--classroom-panel-w,380px)] lg:flex-col lg:border-l lg:border-t-0 lg:pb-0 xl:w-[var(--classroom-panel-w,420px)] lg:max-w-[calc(100vw-420px)]"
      aria-label="Class panel"
      data-classroom-panel
    >
      {showVideo ? (
        <>
          <div
            ref={video.ref}
            className={cn(
              "custom-scrollbar w-[260px] shrink-0 overflow-y-auto border-r border-app-border/60 lg:w-auto lg:overflow-visible lg:border-r-0",
              video.height !== null && !videoCollapsed && "lg:h-[var(--classroom-video-h)] lg:overflow-hidden"
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
        {/* Gallery → class-wide controls → tabs (People and the rest). */}
        {isCoach && roomId ? <CoachRoomControls classId={roomId} /> : null}
        <div className="custom-scrollbar-hide shrink-0 overflow-x-auto border-b border-app-border/60 px-1.5">
          <div className="flex items-center gap-0.5 py-1.5" role="tablist">
            {/* Only the active tab carries its label, so every tab fits without scrolling. */}
            {tabs.map((t) => (
              <SimpleTooltip key={t.id} label={t.label}>
                <button
                  type="button"
                  role="tab"
                  aria-label={t.label}
                  aria-selected={activeTab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors",
                    activeTab === t.id
                      ? "bg-primary/10 text-primary-ink"
                      : "text-app-muted hover:bg-app-soft hover:text-app-text",
                  )}
                >
                  <span className="relative">
                    {t.icon}
                    {t.id === "chat" && unreadCount > 0 ? (
                      <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-app-danger px-1 text-[8px] font-bold text-white ring-2 ring-app-surface">
                        {unreadCount > 99 ? "99+" : unreadCount}
                      </span>
                    ) : null}
                  </span>
                  {activeTab === t.id ? t.label : null}
                </button>
              </SimpleTooltip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
          {activeTab === "moves" ? (
            <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
              {isCoach ? (
                <BoardActionsRow onPastePgn={() => setTab("pgn")} />
              ) : null}
              <div className="light-theme-overrides min-h-0 flex-1 text-app-text">
                <MoveHistory />
              </div>
            </div>
          ) : null}
          {activeTab === "chat" ? <MeetingChat /> : null}
          {activeTab === "people" ? <MeetingParticipants showRoomControls={!(isCoach && roomId)} /> : null}
          {activeTab === "puzzles" ? <MeetingPuzzlePanel /> : null}
          {activeTab === "response" ? (
            <div className="h-full overflow-y-auto">
              <MovePollCoachPanel />
            </div>
          ) : null}
          {activeTab === "queue" && roomId ? (
            <ActivityQueueRoomPanel classId={roomId} onOpenResponses={() => setTab("response")} />
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

const VIDEO_HEIGHT_KEY = "nexa-live-class-video-height";
const VIDEO_MIN = 140;
// Room-control strip + tab bar + a usable slice of the active tab.
const TOOLS_MIN = 240;

/** Height of the panel's video section (lg+), null = natural 16:9. Remembered per browser. */
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
    // eslint-disable-next-line react-hooks/exhaustive-deps
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

/** Drag handle between the video and the tools under it (lg+). Double-click resets to 16:9. */
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
      className="group relative z-10 -my-1.5 hidden h-3 shrink-0 cursor-row-resize touch-none items-center justify-center outline-none lg:flex"
    >
      <span className="h-1 w-12 rounded-full bg-app-border transition-colors group-hover:bg-primary group-focus-visible:bg-primary group-active:bg-primary" />
    </div>
  );
}
