"use client";

import { LiveKitRoom } from "@livekit/components-react";
import { BoardWorkspace } from "@/features/chessboard/components/layout/BoardWorkspace";
import { BoardProvider } from "@/features/chessboard/context/BoardProvider";

export default function TestBoardPage() {
  return (
    <div className="flex flex-col h-screen bg-app-background text-foreground">
      {/* Main content - Full screen height */}

      {/* Main content - Full screen height minus header */}
      <main className="flex-1 min-h-0 relative">
        <LiveKitRoom
          serverUrl="ws://localhost:7880"
          token="test-token"
          connect={false}
          className="h-full w-full"
        >
          <BoardProvider>
            <BoardWorkspace />
          </BoardProvider>
        </LiveKitRoom>
      </main>
    </div>
  );
}
