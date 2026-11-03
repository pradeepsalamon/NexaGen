"use client";

import { memo, useMemo } from "react";
import { Lock, Users } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { RoomTabs } from "../../room-ui/RoomTabs";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useLiveClassChat } from "../../../providers/ChatProvider";
import { isHumanParticipant } from "../../../lib/participants";
import { useRoster } from "@/features/live-class/hooks/useRoster";

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
  const participants = useRoster();
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
    <div className="flex shrink-0 items-center gap-2 border-b border-app-border px-3 py-2">
      {/* Room + one tab per private thread; three show, the rest under More. */}
      <RoomTabs
        ariaLabel="Chat threads"
        items={threads.map((thread) => ({
          id: thread.id,
          label: thread.label,
          icon: thread.isPrivate ? (
            <Lock aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
          ) : (
            <Users aria-hidden="true" className="size-3.5 shrink-0" strokeWidth={2} />
          ),
          badge: activeThread === thread.id ? 0 : thread.unreadCount,
        }))}
        value={activeThread}
        onChange={setActiveThread}
        maxVisible={3}
      />

      {showCoachShortcut && (
        <Button size="sm" variant="neutral" onClick={() => openPrivateThread(coachUserId)}>
          <Lock aria-hidden="true" className="size-3.5" strokeWidth={2} />
          Message coach
        </Button>
      )}
    </div>
  );
});
