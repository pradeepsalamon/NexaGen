"use client";

import { memo, useMemo } from "react";
import { Lock, Users } from "lucide-react";
import { useParticipants } from "@livekit/components-react";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../../providers/ChatProvider";
import { isHumanParticipant } from "../../../lib/participants";

function staffFromMetadata(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    const role = (JSON.parse(metadata) as { role?: string }).role;
    return role === "COACH" || isStaffRole(role);
  } catch {
    return false;
  }
}

/**
 * Thread switcher above the message list.
 *
 * A student sees at most two: the room, and one private thread with the coach —
 * there is deliberately no way to reach another student, so this never grows a
 * "new message to…" picker on their side. A coach gets one tab per student who
 * has a private thread open, added from the People panel.
 */
export const ChatThreadBar = memo(function ChatThreadBar() {
  const { activeThread, openPrivateThread, privateChatEnabled, setActiveThread, threads } =
    useLiveClassChat();
  const participants = useParticipants();
  const user = useAuthStore((state) => state.user);
  const isStaff = user?.role === "COACH" || isStaffRole(user?.role);

  // A student's one permitted counterpart: the coach currently in the room.
  const coachUserId = useMemo(() => {
    if (isStaff) return null;
    const coach = participants.find((p) => isHumanParticipant(p) && staffFromMetadata(p.metadata));
    return coach ? coach.identity.split("_")[0] : null;
  }, [isStaff, participants]);

  const hasCoachThread = threads.some((t) => t.id === coachUserId);
  const showCoachShortcut = !!coachUserId && !hasCoachThread && privateChatEnabled;

  if (!privateChatEnabled && threads.length <= 1) return null;
  if (threads.length <= 1 && !showCoachShortcut) return null;

  return (
    <div
      className="custom-scrollbar-hide flex shrink-0 items-center gap-1.5 overflow-x-auto border-b border-app-border/40 px-3 py-2"
      role="tablist"
      aria-label="Chat threads"
    >
      {threads.map((thread) => (
        <button
          key={thread.id}
          type="button"
          role="tab"
          aria-selected={activeThread === thread.id}
          onClick={() => setActiveThread(thread.id)}
          className={cn(
            "flex min-h-8 shrink-0 items-center gap-1.5 rounded-full px-3 text-xs font-semibold transition-colors",
            activeThread === thread.id
              ? thread.isPrivate
                ? "bg-secondary/20 text-app-text ring-1 ring-secondary/50"
                : "bg-primary/10 text-primary ring-1 ring-primary/30"
              : "text-app-muted hover:bg-app-soft hover:text-app-text",
          )}
        >
          {thread.isPrivate ? (
            <Lock className="size-3.5 shrink-0" />
          ) : (
            <Users className="size-3.5 shrink-0" />
          )}
          <span className="max-w-[9rem] truncate">{thread.label}</span>
          {thread.unreadCount > 0 && activeThread !== thread.id && (
            <span className="flex h-4 min-w-4 items-center justify-center rounded-full bg-app-danger px-1 text-[9px] font-bold text-white">
              {thread.unreadCount > 99 ? "99+" : thread.unreadCount}
            </span>
          )}
        </button>
      ))}

      {showCoachShortcut && (
        <button
          type="button"
          onClick={() => openPrivateThread(coachUserId)}
          className="flex min-h-8 shrink-0 items-center gap-1.5 rounded-full border border-dashed border-app-border px-3 text-xs font-semibold text-app-muted transition-colors hover:border-secondary/50 hover:text-app-text"
        >
          <Lock className="size-3.5 shrink-0" />
          Message coach
        </button>
      )}
    </div>
  );
});
