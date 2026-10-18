"use client";

import { useCallback, useEffect, useState } from "react";
import { useLiveClassChat } from "../../../../providers/ChatProvider";
import { useLiveClassState } from "../../../../providers/LiveClassProvider";
import { useLiveClassChapters } from "../../../../hooks/useLiveClassChapters";
import { MeetingChat } from "../../MeetingChat";
import { SidebarClassLeaderboard } from "../../MeetingPuzzlePanel";
import { ChaptersPanel } from "./ChaptersPanel";
import { MembersPanel, useRoomMembers } from "./MembersPanel";
import { SidebarTabs } from "./SidebarParts";

type TopTab = "chapters" | "members";
type BottomTab = "leaderboard" | "chat";
type Tabs = { top: TopTab; bottom: BottomTab };

const TABS_KEY = "nexa-live-class-sidebar-tabs";
const DEFAULT_TABS: Tabs = { bottom: "leaderboard", top: "chapters" };

function readTabs(): Tabs {
  try {
    const raw = JSON.parse(window.localStorage.getItem(TABS_KEY) ?? "null") as Partial<Tabs> | null;
    return {
      bottom: raw?.bottom === "chat" ? "chat" : "leaderboard",
      top: raw?.top === "members" ? "members" : "chapters"
    };
  } catch {
    return DEFAULT_TABS;
  }
}

/**
 * The coach's left column on the single page (Lichess Study-style), two
 * stacked panels whose tabs are independent of each other:
 *
 *   ┌──────────────────────────┐
 *   │ [Chapters (5)|Members (8)]│  saved boards: Load / Ask · or members with
 *   │  …scrolls inside…         │  per-student White / Black / Both control
 *   ├──────────────────────────┤
 *   │ [Leaderboard | Chat]      │  whole-class standings · or the room chat
 *   │  …scrolls inside…         │
 *   └──────────────────────────┘
 *
 * Neither panel grows past its share, so a long member list never pushes the
 * bottom one off screen. The selection is remembered per browser, and survives
 * the column unmounting (a stage switch or resize). Must render inside the
 * coach's `BoardProvider`, `ChatProvider` and `<LiveKitRoom>`.
 */
export function ClassroomSidebar({ classId, width }: { classId: string; width: number }) {
  const [tabs, setTabs] = useState<Tabs>(DEFAULT_TABS);
  useEffect(() => setTabs(readTabs()), []);
  const choose = useCallback(
    (patch: Partial<Tabs>) =>
      setTabs((prev) => {
        const next = { ...prev, ...patch };
        try {
          window.localStorage.setItem(TABS_KEY, JSON.stringify(next));
        } catch {
          // per-browser convenience only
        }
        return next;
      }),
    []
  );

  const { activePuzzle, activeSidebar, setActiveSidebar, setClassroomChatOpen } = useLiveClassState(
    "activePuzzle",
    "activeSidebar",
    "setActiveSidebar",
    "setClassroomChatOpen"
  );
  const { unreadCount } = useLiveClassChat();
  const chapters = useLiveClassChapters(classId);
  const members = useRoomMembers();

  // Chat is read only while its tab is showing (drives the unread badge).
  useEffect(() => {
    setClassroomChatOpen(tabs.bottom === "chat");
    return () => setClassroomChatOpen(false);
  }, [tabs.bottom, setClassroomChatOpen]);

  // "Open chat" / "open the puzzle" from the toolbar, toasts or "message
  // privately" land on this column's bottom tabs while it is showing.
  useEffect(() => {
    if (activeSidebar === "chat") choose({ bottom: "chat" });
    else if (activeSidebar === "puzzle") choose({ bottom: "leaderboard" });
    else return;
    setActiveSidebar(null);
  }, [activeSidebar, setActiveSidebar, choose]);

  return (
    <aside className="flex min-h-0 shrink-0 flex-col gap-3" style={{ width }} aria-label="Chapters, members, leaderboard and chat">
      <section
        className="flex min-h-[180px] flex-[1_1_0] flex-col overflow-hidden rounded-panel border border-app-border bg-app-surface/60 shadow-card"
        aria-label="Chapters and members"
      >
        <SidebarTabs
          label="Chapters and members"
          value={tabs.top}
          onChange={(top) => choose({ top })}
          tabs={[
            { count: chapters.data?.chapters.length ?? 0, id: "chapters", label: "Chapters" },
            { count: members.length, id: "members", label: "Members" }
          ]}
        />
        <div className="min-h-0 flex-1" role="tabpanel">
          {tabs.top === "chapters" ? (
            <ChaptersPanel classId={classId} activePuzzleId={activePuzzle?.puzzleId ?? null} />
          ) : (
            <MembersPanel classId={classId} members={members} />
          )}
        </div>
      </section>

      <section
        className="flex min-h-[220px] flex-[1.15_1_0] flex-col overflow-hidden rounded-panel border border-app-border bg-app-surface/60 shadow-card"
        aria-label="Leaderboard and chat"
      >
        <SidebarTabs
          label="Leaderboard and chat"
          value={tabs.bottom}
          onChange={(bottom) => choose({ bottom })}
          tabs={[
            { id: "leaderboard", label: "Leaderboard" },
            { badge: tabs.bottom === "chat" ? 0 : unreadCount, id: "chat", label: "Chat" }
          ]}
        />
        <div className="min-h-0 flex-1 overflow-hidden" role="tabpanel">
          {tabs.bottom === "leaderboard" ? <SidebarClassLeaderboard classId={classId} isCoach /> : <MeetingChat />}
        </div>
      </section>
    </aside>
  );
}
