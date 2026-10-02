"use client";

import { useEffect, useState, type ReactNode } from "react";
import {
  BookOpen,
  Cpu,
  FileText,
  ListOrdered,
  MessageCircleQuestion,
  MessageSquareText,
  Puzzle,
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
import { MeetingChat } from "../MeetingChat";
import { MeetingParticipants } from "../MeetingParticipants";
import { MeetingPuzzlePanel } from "../MeetingPuzzlePanel";
import { MovePollCoachPanel } from "../move-poll/MovePollCoachPanel";
import { ClassroomVideo } from "./ClassroomVideo";

type TabId =
  | "moves"
  | "chat"
  | "people"
  | "puzzles"
  | "response"
  | "engine"
  | "pgn"
  | "games";

const TABS: {
  id: TabId;
  label: string;
  icon: ReactNode;
  coachOnly?: boolean;
}[] = [
  { id: "moves", label: "Moves", icon: <ListOrdered className="size-4" /> },
  { id: "chat", label: "Chat", icon: <MessageSquareText className="size-4" /> },
  { id: "people", label: "People", icon: <Users className="size-4" /> },
  { id: "puzzles", label: "Puzzles", icon: <Puzzle className="size-4" /> },
  {
    id: "response",
    label: "Response",
    icon: <MessageCircleQuestion className="size-4" />,
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

/** Right-hand column of the single-page layout: video on top, one tab bar for everything else. */
export function ClassroomPanel({
  isCoach,
  showVideo,
}: {
  isCoach: boolean;
  showVideo: boolean;
}) {
  const [tab, setTab] = useState<TabId>(isCoach ? "moves" : "chat");
  const { activeSidebar, setActiveSidebar, setClassroomChatOpen } = useLiveClassState(
    "activeSidebar",
    "setActiveSidebar",
    "setClassroomChatOpen",
  );
  const { unreadCount } = useLiveClassChat();

  useEffect(() => {
    if (activeSidebar && activeSidebar in SIDEBAR_TO_TAB) {
      setTab(SIDEBAR_TO_TAB[activeSidebar as keyof typeof SIDEBAR_TO_TAB]);
      setActiveSidebar(null);
    }
  }, [activeSidebar, setActiveSidebar]);

  useEffect(() => {
    setClassroomChatOpen(tab === "chat");
    return () => setClassroomChatOpen(false);
  }, [tab, setClassroomChatOpen]);

  const tabs = TABS.filter((t) => isCoach || !t.coachOnly);

  return (
    // Below lg the panel sits under the stage (video beside the tabs); the floating toolbar overlays its bottom.
    <aside
      className="flex h-[42%] min-h-0 w-full shrink-0 border-t border-app-border/70 bg-app-surface/40 pb-24 lg:h-auto lg:w-[380px] lg:flex-col lg:border-l lg:border-t-0 lg:pb-0 xl:w-[420px]"
      aria-label="Class panel"
    >
      {showVideo ? (
        <div className="custom-scrollbar w-[260px] shrink-0 overflow-y-auto border-r border-app-border/60 lg:w-auto lg:overflow-visible lg:border-r-0">
          <ClassroomVideo isCoach={isCoach} />
        </div>
      ) : null}

      <div className="flex min-h-0 min-w-0 flex-1 flex-col">
        <div className="custom-scrollbar-hide shrink-0 overflow-x-auto border-b border-app-border/60 px-1.5">
          <div className="flex items-center gap-0.5 py-1.5" role="tablist">
            {/* Only the active tab carries its label, so every tab fits without scrolling. */}
            {tabs.map((t) => (
              <SimpleTooltip key={t.id} label={t.label}>
                <button
                  type="button"
                  role="tab"
                  aria-label={t.label}
                  aria-selected={tab === t.id}
                  onClick={() => setTab(t.id)}
                  className={cn(
                    "flex min-h-9 shrink-0 items-center gap-1.5 rounded-control px-2.5 text-xs font-semibold transition-colors",
                    tab === t.id
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
                  {tab === t.id ? t.label : null}
                </button>
              </SimpleTooltip>
            ))}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
          {tab === "moves" ? (
            <div className="flex h-full flex-col gap-3 overflow-y-auto p-3">
              {isCoach ? (
                <BoardActionsRow onPastePgn={() => setTab("pgn")} />
              ) : null}
              <div className="light-theme-overrides min-h-0 flex-1 text-app-text">
                <MoveHistory />
              </div>
            </div>
          ) : null}
          {tab === "chat" ? <MeetingChat /> : null}
          {tab === "people" ? <MeetingParticipants /> : null}
          {tab === "puzzles" ? <MeetingPuzzlePanel /> : null}
          {tab === "response" ? (
            <div className="h-full overflow-y-auto">
              <MovePollCoachPanel />
            </div>
          ) : null}
          {tab === "engine" ? <StockfishPanel /> : null}
          {tab === "pgn" ? (
            <div className="h-full overflow-y-auto">
              <PgnPanel />
            </div>
          ) : null}
          {tab === "games" ? (
            <div className="h-full overflow-y-auto">
              <MasterbasePanel />
            </div>
          ) : null}
        </div>
      </div>
    </aside>
  );
}
