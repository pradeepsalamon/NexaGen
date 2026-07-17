"use client";

import { MeetingHeader } from "./MeetingHeader";
import { MeetingVideoGrid } from "./MeetingVideoGrid";
import { MeetingToolbar } from "./MeetingToolbar";
import { MeetingSidebar } from "./MeetingSidebar";
import { useKeyboardShortcuts } from "../../hooks/useKeyboardShortcuts";

/**
 * Main meeting layout orchestrator.
 *
 * Structure:
 *  ┌─────────────────────────────────┐
 *  │  MeetingHeader                  │
 *  ├───────────────────────┬─────────┤
 *  │                       │         │
 *  │  MeetingVideoGrid     │ Sidebar │
 *  │                       │         │
 *  ├───────────────────────┴─────────┤
 *  │  MeetingToolbar (floating)      │
 *  └─────────────────────────────────┘
 */
export function MeetingLayout() {
  // Register keyboard shortcuts (M, V, Escape)
  useKeyboardShortcuts();

  return (
    <div className="flex h-[100dvh] flex-col overflow-hidden bg-app-background text-app-text pt-16">
      {/* Fixed header */}
      <MeetingHeader />

      {/* Main content — fills remaining space */}
      <main className="relative flex flex-1 overflow-hidden">
        {/* Video grid — takes all available space */}
        <div className="flex-1 min-w-0 overflow-hidden">
          <MeetingVideoGrid />
        </div>

        {/* Sidebar — slides in from right */}
        <MeetingSidebar />
      </main>

      {/* Floating toolbar — positioned from within MeetingToolbar */}
      <MeetingToolbar />
    </div>
  );
}
