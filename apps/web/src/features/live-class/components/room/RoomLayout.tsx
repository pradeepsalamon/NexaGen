"use client";

import { Header } from "@/components/layout/Header";
import { ConnectionBadge } from "../meeting/ConnectionBadge";
import { ParticipantGrid } from "../meeting/ParticipantGrid";
import { MeetingControls } from "../meeting/MeetingControls";
import { ChatPanel } from "../chat/ChatPanel";
import { ParticipantsPanel } from "../meeting/ParticipantsPanel";
import { useLiveClassState } from "../../providers/LiveClassProvider";

export function RoomLayout() {
  const { topic } = useLiveClassState();

  const centerSlot = (
    <h1 className="text-sm font-semibold text-app-text tracking-tight truncate max-w-[200px] sm:max-w-xs">
      {topic || "Live Class"}
    </h1>
  );

  const rightSlot = (
    <div className="flex items-center mr-1">
      <ConnectionBadge />
    </div>
  );

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background text-app-text pt-16">
      {/* Fixed header */}
      <Header centerSlot={centerSlot} rightSlot={rightSlot} />

      {/* Main content — fills remaining space, never scrolls */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Participant grid — takes all available space */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <ParticipantGrid />
        </div>

        {/* Sidebars */}
        <ParticipantsPanel />
        <ChatPanel />
      </main>

      {/* Floating controls — positioned fixed from within MeetingControls */}
      <MeetingControls />
    </div>
  );
}
