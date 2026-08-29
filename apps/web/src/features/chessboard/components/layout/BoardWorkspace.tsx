import { ChessgroundBoard } from "../board/ChessgroundBoard";
import { DrawingToolbar } from "../toolbars/DrawingToolbar";
import { PromotionDialog } from "../dialogs/PromotionDialog";
import { SetupPositionDialog } from "../dialogs/SetupPositionDialog";
import { useBoardShortcuts } from "../../hooks/useBoardShortcuts";
import { BoardNavigation } from "../toolbars/BoardNavigation";
import { ChessClock } from "../panels/ChessClock";
import { SidebarTabs } from "../panels/SidebarTabs";

export function BoardWorkspace() {
  useBoardShortcuts();

  return (
    // Light gray background to match the screenshot
    <div className="flex flex-col md:flex-row h-full w-full bg-transparent text-app-text p-0 md:p-4 overflow-hidden gap-4">
      
      {/* Left: Board Area */}
      <div className="flex-1 flex flex-col items-center justify-center min-w-0 min-h-0 relative md:h-full">
        <PromotionDialog />
        
        <div className="absolute right-4 top-4 z-10 flex gap-2">
           <DrawingToolbar />
        </div>

        <div className="w-full h-full flex flex-col justify-center max-w-4xl px-4 md:px-8 relative" style={{ containerType: "size" }}>
            <div className="absolute inset-0 m-auto flex flex-col items-center justify-center">
              {/* The board itself, bounded by a square */}
              <div 
                className="shadow-md overflow-hidden bg-[#e0d8c8] dark:bg-slate-800" 
                style={{ 
                  width: "min(100cqw - 2rem, 100cqh - 6rem)", 
                  height: "min(100cqw - 2rem, 100cqh - 6rem)" 
                }}
              >
                <ChessgroundBoard />
              </div>
              
              {/* Clock + Board Navigation Row */}
              <div className="mt-4 flex w-full flex-col items-center gap-2">
                <ChessClock />
                <BoardNavigation />
              </div>
            </div>
        </div>
      </div>

      {/* Right Sidebar Area */}
      <div className="w-full h-[46vh] md:w-[480px] lg:w-[550px] flex-shrink-0 bg-white dark:bg-slate-900 shadow-sm border border-gray-200 dark:border-slate-800 md:h-full flex flex-col overflow-hidden">
        <SidebarTabs />
      </div>

      <SetupPositionDialog />
    </div>
  );
}
