import { MoveHistory } from "../panels/MoveHistory";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Button } from "@/components/ui/Button";

export function SidebarTabs() {
  return (
    <div className="flex flex-col h-full w-full bg-white text-gray-800 p-4 shadow-sm border-l border-gray-200">
      
      {/* Top right link */}
      <div className="flex justify-end mb-4">
        <button className="text-blue-500 hover:text-blue-600 text-sm font-medium flex items-center gap-1">
          <span>&lt;</span> Load Games/Positions
        </button>
      </div>

      {/* Action Buttons Row */}
      <div className="flex flex-wrap gap-2 mb-6">
        <Button variant="primary" className="bg-blue-500 hover:bg-blue-600 text-white px-4 py-1.5 h-auto text-xs font-medium">Save</Button>
        <SidebarButton>New</SidebarButton>
        <SidebarButton>Setup Position</SidebarButton>
        <SidebarButton>Undo</SidebarButton>
        <SidebarButton>Paste PGN game</SidebarButton>
        <SidebarButton>Copy PGN</SidebarButton>
      </div>

      {/* Tabs Section */}
      <Tabs defaultValue="moves" className="flex-1 flex flex-col min-h-0">
        <TabsList className="w-full justify-start bg-transparent border-b border-gray-200 rounded-none h-auto p-0 space-x-4 mb-4">
          <TabsTrigger 
            value="moves" 
            className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:shadow-none"
          >
            Moves
          </TabsTrigger>
          <TabsTrigger value="engine" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:shadow-none">
            Engine
          </TabsTrigger>
          <TabsTrigger value="pdf" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:shadow-none">
            PDF
          </TabsTrigger>
          <TabsTrigger value="masterbase" className="rounded-none border-b-2 border-transparent data-[state=active]:border-blue-500 data-[state=active]:text-blue-500 data-[state=active]:bg-transparent px-2 py-2 text-sm font-medium text-gray-500 hover:text-gray-700 data-[state=active]:shadow-none">
            Masterbase
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="moves" className="flex-1 min-h-0 overflow-y-auto mt-0">
          {/* We reuse the MoveHistory component. It might need lighter text styling for the light theme. */}
          <div className="h-full light-theme-overrides text-gray-800">
            <MoveHistory />
          </div>
        </TabsContent>
        <TabsContent value="engine" className="flex-1 mt-0">
          <div className="text-sm text-gray-500 p-4">Stockfish engine analysis goes here...</div>
        </TabsContent>
        <TabsContent value="pdf" className="flex-1 mt-0">
          <div className="text-sm text-gray-500 p-4">PDF viewer goes here...</div>
        </TabsContent>
        <TabsContent value="masterbase" className="flex-1 mt-0">
          <div className="text-sm text-gray-500 p-4">Masterbase Explorer goes here...</div>
        </TabsContent>
      </Tabs>
    </div>
  );
}

function SidebarButton({ children }: { children: React.ReactNode }) {
  return (
    <Button 
      variant="outline" 
      className="bg-white hover:bg-gray-50 text-gray-600 border-gray-300 px-3 py-1.5 h-auto text-xs font-normal"
    >
      {children}
    </Button>
  );
}
