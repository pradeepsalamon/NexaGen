"use client";

import { useCallback, useState, useMemo, memo, useRef } from "react";
import {
  MessageSquareLock,
  MoreVertical,
  Search,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  Hand,
  Crown,
  UserMinus,
  X,
} from "lucide-react";
import { useConnectionQualityIndicator, useParticipants } from "@livekit/components-react";
import { ConnectionQuality } from "livekit-client";
import type { ModeratableSource, ScreenShareRequestEntry, WaitingRoomEntry } from "@nexa-chess/types";
import { MODERATED_SOURCE_LABEL, compareNatural } from "@nexa-chess/types";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { Button } from "@/components/ui/Button";
import { RequestRow, RowSectionHeader } from "../room-ui/RequestRow";
import { PullStudentsSection } from "./PullStudentsSection";
import { StudentControlsList } from "./CoachRoomControls";
import { SCROLL_RAIL_GUTTER, ScrollToTopRail, useScrollPosition } from "./ScrollToTopRail";
import { PanelHeader } from "./PanelHeader";
import { Badge } from "@/components/ui/Badge";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/DropdownMenu";
import { ConfirmationModal } from "@/components/common/ConfirmationModal";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import type { BoardControlSide } from "@/features/chessboard/types/sync";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useLiveClassChat } from "../../providers/ChatProvider";
import { isHumanParticipant } from "../../lib/participants";
import { useParticipantActivity } from "../../hooks/useParticipantActivity";
import { isActivelySpeaking, isSharingScreen } from "../../lib/participantActivity";
import {
  kickParticipant,
  moderateParticipant,
  resolveScreenShareRequest,
  resolveWaitingRoomEntry,
} from "../../api/live-class";
import { meetingToast } from "../../lib/meetingToasts";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useMemberClassId } from "../../providers/LiveRoomContext";

type LkParticipant = ReturnType<typeof useParticipants>[number];

interface ParticipantMeta {
  role?: string;
}

function parseMeta(participant: LkParticipant): ParticipantMeta {
  const meta: ParticipantMeta = {};
  if (participant.metadata) {
    try {
      Object.assign(meta, JSON.parse(participant.metadata));
    } catch {
      // ignore
    }
  }
  return meta;
}

function isCoachParticipant(participant: LkParticipant) {
  const role = parseMeta(participant).role?.toLowerCase();
  return role === "coach" || role === "teacher";
}

/** Presence dot on the avatar: green good, amber weak, grey still measuring. Paired with words in its tooltip and label. */
function PresenceDot({ participant }: { participant: LkParticipant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const weak = quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;
  const label = quality === ConnectionQuality.Unknown ? "Connection: measuring" : weak ? "Weak connection" : "Good connection";
  return (
    <span
      role="img"
      aria-label={label}
      className={cn(
        "absolute -bottom-0.5 -right-0.5 size-3 rounded-full ring-2 ring-app-surface",
        weak ? "bg-warning" : quality === ConnectionQuality.Unknown ? "bg-app-line-strong" : "bg-success",
      )}
    />
  );
}

/** Whether a row shows "Weak connection" as a badge too (status is never colour alone). */
function useWeakConnection(participant: LkParticipant) {
  const { quality } = useConnectionQualityIndicator({ participant });
  return quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;
}

/**
 * A track state in a participant row: a status icon for everyone. For a coach
 * looking at a student whose track is live it is also a 32px button that
 * switches that track off at the SFU — off only, since re-opening someone's
 * microphone for them is a privacy hole (`moderateParticipant` refuses it too).
 */
function TrackStateControl({
  activeIcon,
  idleIcon,
  isActive,
  moderateLabel,
  onModerate,
}: {
  activeIcon: React.ReactNode;
  idleIcon: React.ReactNode;
  isActive: boolean;
  moderateLabel: string;
  onModerate?: () => void;
}) {
  if (!isActive || !onModerate) {
    return <span className="flex size-8 items-center justify-center">{isActive ? activeIcon : idleIcon}</span>;
  }

  return (
    <SimpleTooltip label={moderateLabel}>
      <button
        type="button"
        onClick={onModerate}
        aria-label={moderateLabel}
        className="flex size-8 items-center justify-center rounded-control text-app-text transition-colors hover:bg-app-danger-soft hover:text-app-danger-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
      >
        {activeIcon}
      </button>
    </SimpleTooltip>
  );
}

interface ParticipantItemProps {
  participant: LkParticipant;
  isCoachRow?: boolean;
  showBoardControl?: boolean;
  handRaised?: boolean;
  /** Speaking now (or within the short hold) — rings the avatar. */
  speaking?: boolean;
  /** Coach/admin viewing a student: enables the force-mute + private-message actions. */
  canModerate?: boolean;
  onModerate?: (identity: string, source: ModeratableSource, name: string) => void;
  onKick?: (identity: string, name: string) => Promise<boolean> | void;
  isKicking?: boolean;
  onMessagePrivately?: (userId: string, name: string) => void;
  /** Side this student may move, or null when they hold no control. */
  boardControlSide?: BoardControlSide | null;
  onSetBoardControlSide?: (identity: string, side: BoardControlSide | null) => void;
}

const BOARD_SIDES: { value: BoardControlSide | "none"; label: string }[] = [
  { value: "none", label: "None" },
  { value: "white", label: "White" },
  { value: "black", label: "Black" },
  { value: "both", label: "Both" },
];

/**
 * People row (spec component 16): 48–64px. Avatar with a presence dot, name,
 * role and state badges, mic and camera (the two visible actions for a
 * coach), then a ⋮ menu: message privately, board control (None, White,
 * Black, Both), stop screen share, and Remove from class last, red and confirmed.
 */
const ParticipantListItem = memo(function ParticipantListItem({
  participant,
  isCoachRow,
  showBoardControl,
  handRaised,
  speaking = false,
  canModerate,
  onModerate,
  onKick,
  isKicking = false,
  onMessagePrivately,
  boardControlSide = null,
  onSetBoardControlSide,
}: ParticipantItemProps) {
  const [kickOpen, setKickOpen] = useState(false);
  const user = useAuthStore((state) => state.user);
  const weak = useWeakConnection(participant);
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraEnabled = participant.isCameraEnabled;
  const isScreenSharing = participant.isScreenShareEnabled;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  // Identity is `<userId>` or `<userId>_<clientId>`; cuids carry no underscore.
  const participantUserId = participant.identity.split("_")[0];
  const canAct = !!canModerate && !participant.isLocal;
  const hasMenu = canAct && (!!onMessagePrivately || (showBoardControl && !!onSetBoardControlSide) || !!onKick || isScreenSharing);

  return (
    <div
      className="flex min-h-12 items-center justify-between gap-2 rounded-control px-2 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative shrink-0">
          <ParticipantAvatar
            name={name}
            size="sm"
            className={cn("transition-shadow", speaking && "ring-2 ring-success ring-offset-2 ring-offset-app-surface")}
          />
          <PresenceDot participant={participant} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="flex min-w-0 items-center gap-1">
            <span className="truncate text-sm font-medium text-app-text">{name}</span>
            {participant.isLocal && <span className="shrink-0 text-xs text-app-muted">(you)</span>}
            {speaking && <span className="sr-only">(speaking)</span>}
          </span>
          {/* Role and state badges; each says its state in words. */}
          <span className="flex min-w-0 flex-wrap items-center gap-1 empty:hidden">
            {isCoachRow ? <Badge variant="accent">Coach</Badge> : null}
            {handRaised ? (
              <Badge variant="warning">
                <Hand aria-hidden="true" className="size-3" strokeWidth={2} />
                Hand up
              </Badge>
            ) : null}
            {boardControlSide ? (
              <Badge variant="info">
                <Crown aria-hidden="true" className="size-3" strokeWidth={2} />
                {boardControlSide === "both" ? "Moves both" : `Moves ${boardControlSide}`}
              </Badge>
            ) : null}
            {isScreenSharing ? (
              <Badge variant="default">
                <MonitorUp aria-hidden="true" className="size-3" strokeWidth={2} />
                Sharing
              </Badge>
            ) : null}
            {weak ? <Badge variant="warning">Weak connection</Badge> : null}
          </span>
        </span>
      </div>

      <div className="flex shrink-0 items-center text-app-muted">
        <TrackStateControl
          isActive={!isMuted}
          activeIcon={<Mic className="size-4" strokeWidth={1.75} aria-label="Microphone on" />}
          idleIcon={<MicOff className="size-4 text-app-danger-ink" strokeWidth={1.75} aria-label="Muted" />}
          moderateLabel={`Turn off ${name}'s microphone`}
          onModerate={canAct && onModerate ? () => onModerate(participant.identity, "microphone", name) : undefined}
        />
        <TrackStateControl
          isActive={isCameraEnabled}
          activeIcon={<Video className="size-4" strokeWidth={1.75} aria-label="Camera on" />}
          idleIcon={<VideoOff className="size-4 text-app-subtle" strokeWidth={1.75} aria-label="Camera off" />}
          moderateLabel={`Turn off ${name}'s camera`}
          onModerate={canAct && onModerate ? () => onModerate(participant.identity, "camera", name) : undefined}
        />

        {hasMenu ? (
          <DropdownMenu>
            <SimpleTooltip label={`Actions for ${name}`}>
              <DropdownMenuTrigger asChild>
                <button
                  type="button"
                  aria-label={`Actions for ${name}`}
                  className="flex size-8 items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text focus-visible:outline focus-visible:outline-2 focus-visible:outline-app-focus"
                >
                  <MoreVertical className="size-4" strokeWidth={2} />
                </button>
              </DropdownMenuTrigger>
            </SimpleTooltip>
            <DropdownMenuContent align="end" className="w-56">
              {onMessagePrivately ? (
                <DropdownMenuItem className="gap-2" onSelect={() => onMessagePrivately(participantUserId, name)}>
                  <MessageSquareLock aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Message privately
                </DropdownMenuItem>
              ) : null}
              {isScreenSharing && onModerate ? (
                <DropdownMenuItem className="gap-2" onSelect={() => onModerate(participant.identity, "screen_share", name)}>
                  <MonitorX aria-hidden="true" className="size-4" strokeWidth={1.75} />
                  Stop screen share
                </DropdownMenuItem>
              ) : null}
              {showBoardControl && onSetBoardControlSide ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuLabel className="text-xs font-semibold text-app-muted">Board control</DropdownMenuLabel>
                  <DropdownMenuRadioGroup
                    value={boardControlSide ?? "none"}
                    onValueChange={(value) =>
                      onSetBoardControlSide(participant.identity, value === "none" ? null : (value as BoardControlSide))
                    }
                  >
                    {BOARD_SIDES.map((side) => (
                      <DropdownMenuRadioItem key={side.value} value={side.value} className="rounded-chip">
                        {side.label}
                      </DropdownMenuRadioItem>
                    ))}
                  </DropdownMenuRadioGroup>
                </>
              ) : null}
              {onKick ? (
                <>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem className="gap-2 text-app-danger-ink focus:text-app-danger-ink" onSelect={() => setKickOpen(true)}>
                    <UserMinus aria-hidden="true" className="size-4" strokeWidth={1.75} />
                    Remove from class
                  </DropdownMenuItem>
                </>
              ) : null}
            </DropdownMenuContent>
          </DropdownMenu>
        ) : null}
      </div>

      {onKick ? (
        <ConfirmationModal
          isOpen={kickOpen}
          title={`Remove ${name} from class?`}
          confirmLabel={isKicking ? "Removing…" : "Remove from class"}
          isConfirming={isKicking}
          icon={UserMinus}
          onCancel={() => setKickOpen(false)}
          onConfirm={async () => {
            const success = await onKick(participant.identity, name);
            if (success !== false) setKickOpen(false);
          }}
        >
          They are disconnected and can&apos;t rejoin this class unless you pull them back in from &ldquo;Not in class&rdquo;.
        </ConfirmationModal>
      ) : null}
    </div>
  );
});

const WaitingRoomListItem = memo(function WaitingRoomListItem({
  entry,
  onResolve,
}: {
  entry: WaitingRoomEntry;
  onResolve: (studentId: string, action: "ADMIT" | "DENY", name: string) => Promise<void>;
}) {
  return (
    <RequestRow
      name={entry.studentName}
      note="Waiting to join"
      actions={[
        { label: "Deny", spokenLabel: `Deny ${entry.studentName}`, tone: "deny", onClick: () => onResolve(entry.studentId, "DENY", entry.studentName) },
        { label: "Admit", spokenLabel: `Admit ${entry.studentName}`, tone: "allow", onClick: () => onResolve(entry.studentId, "ADMIT", entry.studentName) },
      ]}
    />
  );
});

const ScreenShareRequestListItem = memo(function ScreenShareRequestListItem({
  entry,
  onResolve,
}: {
  entry: ScreenShareRequestEntry;
  onResolve: (studentId: string, action: "APPROVE" | "DENY" | "REVOKE", name: string) => Promise<void>;
}) {
  const isApproved = entry.status === "APPROVED";
  return (
    <RequestRow
      name={entry.studentName}
      note={isApproved ? "Sharing allowed" : "Asking to share their screen"}
      actions={
        isApproved
          ? [
              {
                label: "Revoke",
                spokenLabel: `Revoke ${entry.studentName}'s screen-share access`,
                tone: "deny",
                onClick: () => onResolve(entry.studentId, "REVOKE", entry.studentName),
              },
            ]
          : [
              { label: "Deny", spokenLabel: `Deny ${entry.studentName}'s screen-share request`, tone: "deny", onClick: () => onResolve(entry.studentId, "DENY", entry.studentName) },
              { label: "Allow", spokenLabel: `Allow ${entry.studentName} to share their screen`, tone: "allow", onClick: () => onResolve(entry.studentId, "APPROVE", entry.studentName) },
            ]
      }
    />
  );
});

/** "Admit all": admits each waiting person in turn through the same per-person route. */
function AdmitAllButton({
  entries,
  onResolve,
}: {
  entries: WaitingRoomEntry[];
  onResolve: (studentId: string, action: "ADMIT" | "DENY", name: string) => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  if (entries.length < 2) return null;
  return (
    <Button
      size="sm"
      variant="ghost"
      isLoading={busy}
      onClick={async () => {
        setBusy(true);
        try {
          for (const entry of entries) await onResolve(entry.studentId, "ADMIT", entry.studentName);
        } finally {
          setBusy(false);
        }
      }}
    >
      Admit all
    </Button>
  );
}

export function MeetingParticipants({
  showRoomControls = true,
}: {
  /** The single page shows the coach's room controls under the panel video instead. */
  showRoomControls?: boolean;
} = {}) {
  const participants = useParticipants().filter(isHumanParticipant);
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const listPosition = useScrollPosition(listRef);
  const {
    boardControlStudents,
    isChessboardOpen,
    raisedHands,
    setActiveSidebar,
    setBoardControlSide,
    waitingRoomEntries,
    removeWaitingRoomEntry,
    screenShareRequests,
    upsertScreenShareRequest,
  } = useLiveClassState(
    "boardControlStudents",
    "isChessboardOpen",
    "raisedHands",
    "setActiveSidebar",
    "setBoardControlSide",
    "waitingRoomEntries",
    "removeWaitingRoomEntry",
    "screenShareRequests",
    "upsertScreenShareRequest",
  );
  const { canMessagePrivately, openPrivateThread } = useLiveClassChat();
  const roomId = useMemberClassId();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const handleModerate = useCallback(
    async (identity: string, source: ModeratableSource, name: string) => {
      if (!roomId) return;
      const label = MODERATED_SOURCE_LABEL[source];
      try {
        const result = await moderateParticipant(roomId, { identity, source });
        meetingToast({
          tone: result.muted ? "success" : "info",
          title: result.muted
            ? `Turned off ${name}'s ${label}`
            : `${name}'s ${label} was already off`,
          description: result.muted
            ? `${name} can turn it back on unless the class settings lock it off.`
            : undefined,
        });
      } catch (error) {
        meetingToast({
          tone: "warning",
          title: `Couldn't turn off ${name}'s ${label}`,
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [roomId],
  );

  const kickingRef = useRef<string | null>(null);
  const [kickingIdentity, setKickingIdentity] = useState<string | null>(null);

  const handleKick = useCallback(
    async (identity: string, name: string) => {
      if (!roomId || kickingRef.current) return false;
      kickingRef.current = identity;
      setKickingIdentity(identity);
      try {
        await kickParticipant(roomId, { identity });
        meetingToast({
          tone: "warning",
          title: `Removed ${name} from the class`,
          description: "Pull them back in from \"Not in class\" to let them rejoin.",
        });
        return true;
      } catch (error) {
        meetingToast({
          tone: "warning",
          title: `Couldn't remove ${name}`,
          description: error instanceof Error ? error.message : undefined,
        });
        return false;
      } finally {
        kickingRef.current = null;
        setKickingIdentity(null);
      }
    },
    [roomId],
  );

  const handleResolveWaiting = useCallback(
    async (studentId: string, action: "ADMIT" | "DENY", name: string) => {
      if (!roomId) return;
      try {
        await resolveWaitingRoomEntry(roomId, { studentId, action });
        // The `REQUEST_RESOLVED` broadcast this triggers also reaches this
        // client, but remove locally now too so the row disappears instantly
        // rather than waiting on the round trip.
        removeWaitingRoomEntry(studentId);
      } catch (error) {
        meetingToast({
          tone: "warning",
          title: `Couldn't ${action === "ADMIT" ? "admit" : "deny"} ${name}`,
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [roomId, removeWaitingRoomEntry],
  );

  const handleResolveScreenShare = useCallback(
    async (studentId: string, action: "APPROVE" | "DENY" | "REVOKE", name: string) => {
      if (!roomId) return;
      try {
        const entry = await resolveScreenShareRequest(roomId, { studentId, action });
        // The broadcast this triggers also reaches this client, but update
        // locally now too so the row reflects the new state instantly.
        upsertScreenShareRequest(entry);
      } catch (error) {
        meetingToast({
          tone: "warning",
          title: `Couldn't ${action.toLowerCase()} ${name}'s screen-share request`,
          description: error instanceof Error ? error.message : undefined,
        });
      }
    },
    [roomId, upsertScreenShareRequest],
  );

  const handleMessagePrivately = useCallback(
    (targetUserId: string) => {
      openPrivateThread(targetUserId);
      setActiveSidebar("chat");
    },
    [openPrivateThread, setActiveSidebar],
  );

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const query = searchQuery.toLowerCase();
    return participants.filter((p) => (p.name || p.identity || "").toLowerCase().includes(query));
  }, [participants, searchQuery]);

  const waitingList = useMemo(
    () => Object.values(waitingRoomEntries).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    [waitingRoomEntries],
  );

  const screenShareList = useMemo(
    () => Object.values(screenShareRequests).sort((a, b) => a.requestedAt.localeCompare(b.requestedAt)),
    [screenShareRequests],
  );

  // Still needed for the speaking indicator on each row.
  const activity = useParticipantActivity();
  // A–Z within each group, so rows don't jump around as people talk. Whoever
  // is sharing their screen is pinned above every other section.
  const grouped = useMemo(() => {
    const sharing: LkParticipant[] = [];
    const coaches: LkParticipant[] = [];
    const students: LkParticipant[] = [];
    const nameOf = (p: LkParticipant) => p.name || p.identity;
    [...filteredParticipants]
      .sort((a, b) => compareNatural(nameOf(a), nameOf(b)))
      .forEach((p) => {
        if (isSharingScreen(p)) sharing.push(p);
        else if (isCoachParticipant(p)) coaches.push(p);
        else students.push(p);
      });
    return { sharing, coaches, students };
    // `activity` re-runs this when someone starts / stops sharing.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activity, filteredParticipants]);

  const renderCoachRow = (p: LkParticipant) => (
    <ParticipantListItem
      key={p.identity}
      participant={p}
      isCoachRow
      handRaised={!!raisedHands[p.identity]}
      speaking={isActivelySpeaking(p, activity)}
      onMessagePrivately={
        canMessagePrivately(p.identity.split("_")[0]) ? handleMessagePrivately : undefined
      }
      canModerate={canMessagePrivately(p.identity.split("_")[0])}
    />
  );

  const renderStudentRow = (p: LkParticipant) => (
    <ParticipantListItem
      key={p.identity}
      participant={p}
      handRaised={!!raisedHands[p.identity]}
      speaking={isActivelySpeaking(p, activity)}
      canModerate={isCoach}
      onModerate={isCoach ? handleModerate : undefined}
      onKick={isCoach ? handleKick : undefined}
      isKicking={kickingIdentity === p.identity}
      onMessagePrivately={
        canMessagePrivately(p.identity.split("_")[0]) ? handleMessagePrivately : undefined
      }
      showBoardControl={isChessboardOpen && isCoach}
      boardControlSide={boardControlStudents[p.identity] ?? null}
      onSetBoardControlSide={setBoardControlSide}
    />
  );

  return (
    <div className="flex h-full flex-col">
      <PanelHeader
        title="People"
        count={participants.length}
        actions={
          <button
            type="button"
            onClick={() => {
              setShowSearch((v) => !v);
              if (showSearch) setSearchQuery("");
            }}
            className={cn(
              "flex size-8 items-center justify-center rounded-control text-app-muted transition-colors hover:bg-app-soft hover:text-app-text",
              showSearch && "bg-app-soft text-app-text",
            )}
            aria-label={showSearch ? "Close search" : "Search participants"}
          >
            {showSearch ? <X className="size-4" /> : <Search className="size-4" />}
          </button>
        }
      />

      {isCoach && roomId && showRoomControls ? (
        <StudentControlsList classId={roomId} className="shrink-0 border-b border-app-border px-3 py-2" />
      ) : null}

      {showSearch && (
        <div className="shrink-0 border-b border-app-border/40 px-3 py-2">
          <div className="flex items-center gap-2 rounded-full bg-app-soft px-3 py-1.5 ring-1 ring-app-border/50 focus-within:ring-primary/40">
            <Search className="size-3.5 shrink-0 text-app-muted" />
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participants…"
              className="w-full bg-transparent text-[13px] font-medium text-app-text outline-none placeholder:text-app-muted"
            />
          </div>
        </div>
      )}

      <div className="relative min-h-0 flex-1">
        <div
          ref={listRef}
          className={cn(
            "custom-scrollbar h-full overflow-y-auto overscroll-contain px-2 py-3",
            listPosition !== "none" && SCROLL_RAIL_GUTTER,
          )}
          role="list"
        >
          {grouped.sharing.length > 0 && (
            <div className="mb-2">
              <h3 className="px-2 pb-1 text-xs font-semibold text-app-muted">
                Sharing screen ({grouped.sharing.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {grouped.sharing.map((p) => (isCoachParticipant(p) ? renderCoachRow(p) : renderStudentRow(p)))}
              </div>
            </div>
          )}

          {isCoach && waitingList.length > 0 && (
            <div className="mb-2">
              <RowSectionHeader action={<AdmitAllButton entries={waitingList} onResolve={handleResolveWaiting} />}>
                Waiting to join ({waitingList.length})
              </RowSectionHeader>
              <div className="flex flex-col gap-0.5">
                {waitingList.map((entry) => (
                  <WaitingRoomListItem key={entry.studentId} entry={entry} onResolve={handleResolveWaiting} />
                ))}
              </div>
            </div>
          )}

          {isCoach && screenShareList.length > 0 && (
            <div className="mb-2">
              <RowSectionHeader>Asking to share ({screenShareList.length})</RowSectionHeader>
              <div className="flex flex-col gap-0.5">
                {screenShareList.map((entry) => (
                  <ScreenShareRequestListItem key={entry.studentId} entry={entry} onResolve={handleResolveScreenShare} />
                ))}
              </div>
            </div>
          )}

          {grouped.coaches.length > 0 && (
            <div className="mb-2">
              <h3 className="px-2 pb-1 text-xs font-semibold text-app-muted">
                Coaches ({grouped.coaches.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {grouped.coaches.map(renderCoachRow)}
              </div>
            </div>
          )}

          <div>
            {(grouped.coaches.length > 0 || grouped.sharing.length > 0) && (
              <h3 className="px-2 pb-1 text-xs font-semibold text-app-muted">
                Students ({grouped.students.length})
              </h3>
            )}
            <div className="flex flex-col gap-0.5">
              {grouped.students.map(renderStudentRow)}
            </div>
          </div>

          {isCoach && roomId ? <PullStudentsSection classId={roomId} /> : null}

          {filteredParticipants.length === 0 && searchQuery && (
            <div className="flex h-32 items-center justify-center text-sm text-app-muted">
              No participants found.
            </div>
          )}
        </div>
        <ScrollToTopRail targetRef={listRef} position={listPosition} label="Back to the top of the people list" />
      </div>
    </div>
  );
}
