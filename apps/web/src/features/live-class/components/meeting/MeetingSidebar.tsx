"use client";

import { lazy, Suspense, memo } from "react";
import { AnimatePresence, motion } from "framer-motion";
import { X, MessageSquareText, Users, Settings, StickyNote } from "lucide-react";
import { useLiveClassState, type SidebarTab } from "../../providers/LiveClassProvider";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";

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

// ─── Sidebar Config ──────────────────────────────────────────

interface SidebarPanelConfig {
  id: Exclude<SidebarTab, null>;
  label: string;
  icon: React.ReactNode;
}

const sidebarPanels: SidebarPanelConfig[] = [
  { id: "chat", label: "Chat", icon: <MessageSquareText className="size-4" /> },
  { id: "participants", label: "Participants", icon: <Users className="size-4" /> },
  { id: "settings", label: "Settings", icon: <Settings className="size-4" /> },
  { id: "notes", label: "Notes", icon: <StickyNote className="size-4" /> },
];

// ─── Loading Fallback ────────────────────────────────────────

function PanelLoading() {
  return (
    <div className="flex h-full items-center justify-center">
      <Loader2 className="size-6 animate-spin text-primary" />
    </div>
  );
}

// ─── Notes Placeholder ───────────────────────────────────────

function NotesPlaceholder() {
  return (
    <div className="flex h-full flex-col items-center justify-center px-8 text-center">
      <div className="mb-4 flex size-16 items-center justify-center rounded-2xl bg-primary/10">
        <StickyNote className="size-8 text-primary" strokeWidth={1.5} />
      </div>
      <h3 className="text-base font-semibold text-app-text mb-1">Teacher Notes</h3>
      <p className="text-sm text-app-muted leading-relaxed max-w-[220px]">
        Coach notes and class resources will appear here in a future update.
      </p>
    </div>
  );
}

// ─── Panel Content Router ────────────────────────────────────

function SidebarContent({ tab }: { tab: Exclude<SidebarTab, null> }) {
  return (
    <Suspense fallback={<PanelLoading />}>
      {tab === "chat" && <MeetingChat />}
      {tab === "participants" && <MeetingParticipants />}
      {tab === "settings" && <MeetingSettings />}
      {tab === "notes" && <NotesPlaceholder />}
    </Suspense>
  );
}

// ─── Sidebar Tabs ────────────────────────────────────────────

const SidebarTabs = memo(function SidebarTabs({
  active,
  unreadChatCount,
  onTabChange,
}: {
  active: Exclude<SidebarTab, null>;
  unreadChatCount: number;
  onTabChange: (tab: Exclude<SidebarTab, null>) => void;
}) {
  return (
    <div className="flex items-center gap-0.5 px-2">
      {sidebarPanels.map((panel) => (
        <button
          key={panel.id}
          type="button"
          onClick={() => onTabChange(panel.id)}
          className={cn(
            "flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-all duration-150",
            active === panel.id
              ? "bg-primary/10 text-primary"
              : "text-app-muted hover:bg-app-soft hover:text-app-text",
          )}
          aria-selected={active === panel.id}
          role="tab"
        >
          <div className="relative">
            {panel.icon}
            {panel.id === "chat" && unreadChatCount > 0 && (
              <div className="absolute -right-1.5 -top-1.5 flex h-3.5 min-w-3.5 items-center justify-center rounded-full bg-red-500 px-1 text-[8px] font-bold text-white shadow-sm ring-2 ring-app-background">
                {unreadChatCount > 99 ? "99+" : unreadChatCount}
              </div>
            )}
          </div>
          <span className="hidden sm:inline">{panel.label}</span>
        </button>
      ))}
    </div>
  );
});

// ─── Main Sidebar ────────────────────────────────────────────

export function MeetingSidebar() {
  const { activeSidebar, setActiveSidebar } = useLiveClassState();
  const { unreadCount } = useLiveClassChat();

  return (
    <AnimatePresence>
      {activeSidebar && (
        <motion.aside
          key="meeting-sidebar"
          initial={{ x: "100%", opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          exit={{ x: "100%", opacity: 0 }}
          transition={{ duration: 0.25, ease: [0.25, 0.1, 0.25, 1] }}
          className="absolute right-0 top-0 bottom-0 z-40 flex h-full w-[380px] max-w-full flex-col border-l border-app-border/60 bg-app-background/95 shadow-[-8px_0_32px_rgba(0,0,0,0.05)] backdrop-blur-xl sm:relative"
          role="complementary"
          aria-label={`${activeSidebar} panel`}
        >
          {/* Header with tabs and close */}
          <div className="flex h-14 shrink-0 items-center justify-between border-b border-app-border/60 bg-app-surface/40 backdrop-blur-md px-2 gap-2">
            <div className="flex-1 min-w-0 overflow-x-auto custom-scrollbar-hide">
              <SidebarTabs
                active={activeSidebar}
                unreadChatCount={unreadCount}
                onTabChange={(tab) => setActiveSidebar(tab)}
              />
            </div>
            <button
              type="button"
              onClick={() => setActiveSidebar(null)}
              className="flex shrink-0 size-9 items-center justify-center rounded-lg text-app-text/70 bg-app-soft transition-colors hover:bg-red-500 hover:text-white mr-1"
              aria-label="Close panel"
            >
              <X className="size-5" />
            </button>
          </div>

          {/* Panel content */}
          <div className="flex-1 min-h-0 overflow-hidden">
            <SidebarContent tab={activeSidebar} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
