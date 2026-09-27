"use client";

import { lazy, Suspense, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessageSquareText, Users, Settings, Puzzle, Loader2 } from "lucide-react";
import { useLiveClassState, type SidebarTab } from "../../providers/LiveClassProvider";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { useReducedMotion } from "../../lib/meetingUi";
import { cn } from "@/lib/utils";

// Lazy-load sidebar panel contents for code splitting
const MeetingChat = lazy(() =>
  import("./MeetingChat").then((m) => ({ default: m.MeetingChat })),
);
const MeetingParticipants = lazy(() =>
  import("./MeetingParticipants").then((m) => ({ default: m.MeetingParticipants })),
);
const MeetingSettings = lazy(() =>
  import("./MeetingSettings").then((m) => ({ default: m.MeetingSettings })),
);
const MeetingPuzzlePanel = lazy(() =>
  import("./MeetingPuzzlePanel").then((m) => ({ default: m.MeetingPuzzlePanel })),
);

type PanelTab = Exclude<SidebarTab, null>;

interface SidebarPanelConfig {
  id: PanelTab;
  label: string;
  icon: React.ReactNode;
}

const sidebarPanels: SidebarPanelConfig[] = [
  { id: "chat", label: "Chat", icon: <MessageSquareText className="size-4" /> },
  { id: "participants", label: "People", icon: <Users className="size-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="size-4" /> },
  { id: "puzzle", label: "Puzzle", icon: <Puzzle className="size-4" /> },
];

function PanelLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary-ink" />
    </div>
  );
}

function SidebarContent({ tab }: { tab: PanelTab }) {
  return (
    <Suspense fallback={<PanelLoading />}>
      {tab === "chat" && <MeetingChat />}
      {tab === "participants" && <MeetingParticipants />}
      {tab === "settings" && <MeetingSettings />}
      {tab === "puzzle" && <MeetingPuzzlePanel />}
    </Suspense>
  );
}

const SidebarTabs = memo(function SidebarTabs({
  active,
  unreadChatCount,
  onTabChange,
}: {
  active: PanelTab;
  unreadChatCount: number;
  onTabChange: (tab: PanelTab) => void;
}) {
  return (
    <div className="flex items-center gap-0.5" role="tablist">
      {sidebarPanels.map((panel) => (
        <button
          key={panel.id}
          type="button"
          role="tab"
          aria-selected={active === panel.id}
          onClick={() => onTabChange(panel.id)}
          className={cn(
            "flex min-h-11 items-center gap-1.5 rounded-control px-3 text-xs font-semibold transition-colors sm:min-h-9",
            active === panel.id
              ? "bg-primary/10 text-primary-ink"
              : "text-app-muted hover:bg-app-soft hover:text-app-text",
          )}
        >
          <span className="relative">
            {panel.icon}
            {panel.id === "chat" && unreadChatCount > 0 && (
              <span className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-app-danger px-1 text-[8px] font-bold text-white ring-2 ring-app-surface">
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </span>
            )}
          </span>
          <span className="hidden sm:inline">{panel.label}</span>
        </button>
      ))}
    </div>
  );
});

export function MeetingSidebar() {
  const { activeSidebar, setActiveSidebar } = useLiveClassState();
  const { unreadCount } = useLiveClassChat();
  const reducedMotion = useReducedMotion();

  return (
    <AnimatePresence>
      {activeSidebar && activeSidebar !== "notes" && (
        <motion.aside
          key="meeting-sidebar"
          initial={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
          animate={reducedMotion ? { opacity: 1 } : { x: 0, opacity: 1 }}
          exit={reducedMotion ? { opacity: 0 } : { x: "100%", opacity: 0 }}
          transition={{ duration: 0.22, ease: [0.25, 0.1, 0.25, 1] }}
          className="fixed inset-0 z-50 flex h-full w-full flex-col bg-app-background sm:relative sm:inset-auto sm:z-30 sm:w-[360px] sm:border-l sm:border-app-border/70"
          role="complementary"
          aria-label={`${activeSidebar} panel`}
        >
          <div className="flex h-14 shrink-0 items-center justify-between gap-2 border-b border-app-border/60 bg-app-surface/50 px-2 backdrop-blur">
            <div className="custom-scrollbar-hide min-w-0 flex-1 overflow-x-auto">
              <SidebarTabs
                active={activeSidebar}
                unreadChatCount={unreadCount}
                onTabChange={(tab) => setActiveSidebar(tab)}
              />
            </div>
            <button
              type="button"
              onClick={() => setActiveSidebar(null)}
              className="flex size-9 shrink-0 items-center justify-center rounded-control bg-app-soft text-app-muted transition-colors hover:bg-app-danger hover:text-white"
              aria-label="Close panel"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="min-h-0 flex-1 overflow-hidden">
            <SidebarContent tab={activeSidebar} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
