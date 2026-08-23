import { MoveHistory } from "../panels/MoveHistory";
import { StockfishPanel } from "./StockfishPanel";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";
import { uploadPgn } from "@/lib/uploadApi";
import { toast } from "sonner";
import { useBoardStore } from "../../context/BoardProvider";
import { useAuthStore } from "@/stores/authStore";
import { Chess } from "chess.js";
import { useOptionalLiveClassState } from "@/features/live-class/providers/LiveClassProvider";
import { useParticipants } from "@livekit/components-react";

export function SidebarTabs() {
  const { pgn, reset, undo, pushHistory, historyIndex, setIsSetupPositionOpen } = useBoardStore();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

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

  const handleNew = () => {
    reset();
    toast.success("Board reset to starting position");
  };

  const handleCopyPGN = async () => {
    if (pgn) {
      await navigator.clipboard.writeText(pgn);
      toast.success("PGN copied to clipboard!");
    } else {
      toast.error("No PGN to copy");
    }
  };

  const handlePastePGN = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const chess = new Chess();
      chess.loadPgn(text);
      pushHistory(chess.fen(), chess.pgn());
      toast.success("PGN loaded successfully");
    } catch (err) {
      toast.error("Failed to load PGN from clipboard. Ensure it is a valid PGN.");
    }
  };

  const handleSetupPosition = () => {
    setIsSetupPositionOpen(true);
  };

  return (
    <div className="flex flex-col h-full w-full bg-white dark:bg-slate-900 text-gray-800 dark:text-slate-200 p-4 shadow-sm border-l border-gray-200 dark:border-slate-800">
      
      {/* Top right link */}
      <div className="flex justify-end mb-4">
        <button 
          onClick={handleSetupPosition}
          className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1"
        >
          <span>&lt;</span> Load Games/Positions
        </button>
      </div>

      {/* Action Buttons Row */}
      {isCoach && (
        <div className="flex flex-wrap gap-2 mb-6">
          <Button variant="primary" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 h-auto text-xs font-medium" onClick={handleSaveToCloud}>Save</Button>
          <SidebarButton onClick={handleNew}>New</SidebarButton>
          <SidebarButton onClick={handleSetupPosition}>Setup Position</SidebarButton>
          <SidebarButton onClick={undo} disabled={historyIndex <= 0}>Undo</SidebarButton>
          <SidebarButton onClick={handlePastePGN}>Paste PGN</SidebarButton>
          <SidebarButton onClick={handleCopyPGN}>Copy PGN</SidebarButton>
        </div>
      )}

      {/* Tabs Section */}
      <Tabs defaultValue="moves" className="flex-1 flex flex-col min-h-0">
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
          {isCoach && liveClassState && (
             <TabsTrigger value="class" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
              Live Class
            </TabsTrigger>
          )}
          <TabsTrigger value="pdf" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 dark:text-slate-400 hover:text-gray-700 dark:hover:text-slate-300 data-[state=active]:shadow-none whitespace-nowrap">
            PDF
          </TabsTrigger>
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
        {isCoach && liveClassState && (
          <TabsContent value="class" className="flex-1 mt-0 overflow-y-auto">
            <LiveClassControlPanel liveClassState={liveClassState} />
          </TabsContent>
        )}
        <TabsContent value="pdf" className="flex-1 mt-0">
          <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-slate-400 p-4 text-center">
            <span className="font-semibold mb-2">PDF Viewer</span>
            <p>A built-in PDF viewer for reading chess books side-by-side with the board is coming soon.</p>
          </div>
        </TabsContent>
        <TabsContent value="masterbase" className="flex-1 mt-0">
          <div className="flex flex-col items-center justify-center h-full text-sm text-gray-500 dark:text-slate-400 p-4 text-center">
            <span className="font-semibold mb-2">Masterbase Explorer</span>
            <p>Lichess Master Games integration is coming soon to explore opening theory.</p>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function LiveClassControlPanel({ liveClassState }: { liveClassState: any }) {
  const participants = useParticipants();
  const students = participants.filter(p => {
    if (!p.metadata) return true;
    try {
      const meta = JSON.parse(p.metadata);
      return meta.role === "STUDENT";
    } catch {
      return true;
    }
  });

  return (
    <div className="flex flex-col h-full gap-4 p-2 text-sm">
      <h3 className="font-bold border-b border-gray-200 dark:border-slate-800 pb-2">Board Control</h3>
      <p className="text-xs text-gray-500 dark:text-slate-400 mb-2">
        Select a student below to grant them permission to move pieces on the shared board.
      </p>
      
      <div className="flex flex-col gap-2">
        <Button 
          variant={liveClassState.boardControlStudentId === null ? "primary" : "outline"}
          className="w-full justify-start text-xs h-8"
          onClick={() => liveClassState.setBoardControlStudent(null)}
        >
          Coach Only (No Student Control)
        </Button>
        
        {students.length === 0 ? (
          <p className="text-xs text-gray-400 italic py-2">No students in room.</p>
        ) : (
          students.map(p => {
            let name = p.identity;
            try {
              if (p.metadata) {
                const meta = JSON.parse(p.metadata);
                name = meta.firstName ? `${meta.firstName} ${meta.lastName || ''}` : p.identity;
              }
            } catch {}
            // strip _board suffix from identity if present
            const actualIdentity = p.identity.replace('_board', '');
            
            const isSelected = liveClassState.boardControlStudentId === actualIdentity;
            
            return (
              <Button 
                key={p.identity}
                variant={isSelected ? "primary" : "outline"}
                className="w-full justify-start text-xs h-8 truncate"
                onClick={() => liveClassState.setBoardControlStudent(actualIdentity)}
              >
                {name}
              </Button>
            );
          })
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
