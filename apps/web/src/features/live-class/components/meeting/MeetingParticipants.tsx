"use client";

import { useCallback, useState, useMemo, memo, useRef } from "react";
import {
  Lock,
  Search,
  Mic,
  MicOff,
  Video,
  VideoOff,
  MonitorUp,
  MonitorX,
  Hand,
  Crown,
  UserCheck,
  UserMinus,
  UserX,
  X,
} from "lucide-react";
import { useConnectionQualityIndicator, useParticipants } from "@livekit/components-react";
import { ConnectionQuality } from "livekit-client";
import type { ModeratableSource, ScreenShareRequestEntry, WaitingRoomEntry } from "@nexa-chess/types";
import { MODERATED_SOURCE_LABEL, compareNatural } from "@nexa-chess/types";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { PullStudentsSection } from "./PullStudentsSection";
import { CoachRoomControls } from "./CoachRoomControls";
import { SCROLL_RAIL_GUTTER, ScrollToTopRail, useScrollPosition } from "./ScrollToTopRail";
import { PanelHeader } from "./PanelHeader";
import { BoardControlSideToggle, boardControlSideLabel } from "./BoardControlSideToggle";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
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

function ConnectionDot({ participant }: { participant: LkParticipant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const color =
    quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost
      ? "bg-warning"
      : quality === ConnectionQuality.Unknown
        ? "bg-app-border"
        : "bg-success";
  return (
    <SimpleTooltip label={`Connection: ${quality === ConnectionQuality.Unknown ? "calculating…" : quality}`}>
      <span className={cn("size-2 shrink-0 rounded-full", color)} aria-hidden="true" />
    </SimpleTooltip>
  );
}

/**
 * A track control in a participant row.
 *
 * For everyone it is a status icon. For a coach looking at a student whose
 * track is live it is also a button that switches that track off at the SFU —
 * mute only, since re-opening someone's microphone for them is a privacy hole
 * (`moderateParticipant` on the API side refuses to do it either).
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
    return <>{isActive ? activeIcon : idleIcon}</>;
  }

  return (
    <SimpleTooltip label={moderateLabel}>
      <button
        type="button"
        onClick={onModerate}
        aria-label={moderateLabel}
        className="flex size-6 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-danger hover:text-white"
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
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraEnabled = participant.isCameraEnabled;
  const isScreenSharing = participant.isScreenShareEnabled;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  // Identity is `<userId>` or `<userId>_<clientId>`; cuids carry no underscore.
  const participantUserId = participant.identity.split("_")[0];
  const canAct = !!canModerate && !participant.isLocal;

  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ConnectionDot participant={participant} />
        <ParticipantAvatar
          name={name}
          size="sm"
          className={cn(
            "size-8 shrink-0 text-[10px] transition-shadow",
            speaking && "ring-2 ring-primary ring-offset-1 ring-offset-app-surface",
          )}
        />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-app-text">{name}</span>
          {participant.isLocal && (
            <span className="shrink-0 text-xs font-normal text-app-muted">(You)</span>
          )}
          {speaking && <span className="sr-only">(speaking)</span>}
          {isCoachRow && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-semibold text-primary-ink">
              Coach
            </span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5 text-app-muted">
        {handRaised && <Hand className="size-4 text-warning-ink" aria-label="Hand raised" />}

        {canAct && onMessagePrivately && (
          <SimpleTooltip label={`Message ${name} privately`}>
            <button
              type="button"
              onClick={() => onMessagePrivately(participantUserId, name)}
              aria-label={`Message ${name} privately`}
              className="flex size-6 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-primary hover:text-on-primary"
            >
              <Lock className="size-3.5" />
            </button>
          </SimpleTooltip>
        )}

        <TrackStateControl
          isActive={isScreenSharing}
          activeIcon={<MonitorUp className="size-4 text-primary-ink" aria-label="Sharing screen" />}
          idleIcon={null}
          moderateLabel={`Stop ${name}'s screen share`}
          onModerate={
            canAct && onModerate
              ? () => onModerate(participant.identity, "screen_share", name)
              : undefined
          }
        />

        <TrackStateControl
          isActive={isCameraEnabled}
          activeIcon={<Video className="size-4" aria-label="Camera on" />}
          idleIcon={<VideoOff className="size-4 opacity-40" aria-label="Camera off" />}
          moderateLabel={`Turn off ${name}'s camera`}
          onModerate={
            canAct && onModerate
              ? () => onModerate(participant.identity, "camera", name)
              : undefined
          }
        />

        <TrackStateControl
          isActive={!isMuted}
          activeIcon={<Mic className="size-4" aria-label="Microphone on" />}
          idleIcon={<MicOff className="size-4 text-app-danger/80" aria-label="Muted" />}
          moderateLabel={`Turn off ${name}'s microphone`}
          onModerate={
            canAct && onModerate
              ? () => onModerate(participant.identity, "microphone", name)
              : undefined
          }
        />
        {showBoardControl && onSetBoardControlSide && (
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                // `title` rather than SimpleTooltip: this is already an
                // `asChild` Radix trigger, and double-wrapping breaks it.
                title={`Board control: ${boardControlSideLabel(boardControlSide)}`}
                className={cn(
                  "flex h-6 items-center gap-0.5 rounded-control px-1 transition-colors",
                  boardControlSide
                    ? "bg-success/15 text-success-ink ring-1 ring-success/30 hover:bg-success/25"
                    : "text-app-muted/50 hover:bg-app-soft hover:text-app-muted",
                )}
                aria-label={`Board control for ${name}: ${boardControlSideLabel(boardControlSide)}`}
              >
                <Crown className="size-3.5" />
                {(boardControlSide === "white" || boardControlSide === "black") && (
                  <span className="text-[10px] font-bold leading-none">
                    {boardControlSide === "white" ? "W" : "B"}
                  </span>
                )}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-auto p-3">
              <p className="mb-2 text-xs font-semibold text-app-text">Board control</p>
              <p className="mb-2 max-w-[15rem] text-[11px] leading-snug text-app-muted">
                Which pieces {name} may move on the shared board.
              </p>
              <BoardControlSideToggle
                studentName={name}
                value={boardControlSide}
                onChange={(side) => onSetBoardControlSide(participant.identity, side)}
              />
            </PopoverContent>
          </Popover>
        )}

        {canAct && onKick && (
          <Popover open={kickOpen} onOpenChange={setKickOpen}>
            <PopoverTrigger asChild>
              <button
                type="button"
                // `title` rather than SimpleTooltip: already an `asChild` Radix trigger.
                title={`Remove ${name} from class`}
                aria-label={`Remove ${name} from class`}
                className="flex size-6 items-center justify-center rounded-full text-app-muted transition-colors hover:bg-app-danger hover:text-white"
              >
                <UserMinus className="size-3.5" strokeWidth={2.5} />
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64 p-3">
              <p className="text-xs font-semibold text-app-text">Remove {name}?</p>
              <p className="mt-1 text-[11px] leading-snug text-app-muted">
                They are disconnected and can&apos;t rejoin this class unless you pull them back in
                from &ldquo;Not in class&rdquo;.
              </p>
              <button
                type="button"
                disabled={isKicking}
                onClick={async () => {
                  const success = await onKick(participant.identity, name);
                  if (success !== false) {
                    setKickOpen(false);
                  }
                }}
                className="mt-2.5 w-full rounded-control bg-app-danger px-3 py-1.5 text-xs font-semibold text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {isKicking ? "Removing…" : "Remove from class"}
              </button>
            </PopoverContent>
          </Popover>
        )}
      </div>
    </div>
  );
});

const WaitingRoomListItem = memo(function WaitingRoomListItem({
  entry,
  onResolve,
}: {
  entry: WaitingRoomEntry;
  onResolve: (studentId: string, action: "ADMIT" | "DENY", name: string) => void;
}) {
  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ParticipantAvatar name={entry.studentName} size="sm" className="size-8 shrink-0 text-[10px]" />
        <span className="truncate text-sm font-medium text-app-text">{entry.studentName}</span>
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        <SimpleTooltip label={`Admit ${entry.studentName}`}>
          <button
            type="button"
            aria-label={`Admit ${entry.studentName}`}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-success-ink transition-colors hover:bg-success hover:text-white"
            onClick={() => onResolve(entry.studentId, "ADMIT", entry.studentName)}
          >
            <UserCheck className="size-4" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
        <SimpleTooltip label={`Deny ${entry.studentName}`}>
          <button
            type="button"
            aria-label={`Deny ${entry.studentName}`}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-danger-ink transition-colors hover:bg-app-danger hover:text-white"
            onClick={() => onResolve(entry.studentId, "DENY", entry.studentName)}
          >
            <UserX className="size-4" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      </div>
    </div>
  );
});

const ScreenShareRequestListItem = memo(function ScreenShareRequestListItem({
  entry,
  onResolve,
}: {
  entry: ScreenShareRequestEntry;
  onResolve: (studentId: string, action: "APPROVE" | "DENY" | "REVOKE", name: string) => void;
}) {
  const isApproved = entry.status === "APPROVED";
  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ParticipantAvatar name={entry.studentName} size="sm" className="size-8 shrink-0 text-[10px]" />
        <span className="truncate text-sm font-medium text-app-text">{entry.studentName}</span>
        {isApproved && <span className="shrink-0 text-[10px] font-semibold text-success-ink">Sharing allowed</span>}
      </div>

      <div className="flex shrink-0 items-center gap-1.5">
        {isApproved ? (
          <SimpleTooltip label={`Revoke ${entry.studentName}'s screen-share access`}>
            <button
              type="button"
              aria-label={`Revoke ${entry.studentName}'s screen-share access`}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-danger-ink transition-colors hover:bg-app-danger hover:text-white"
              onClick={() => onResolve(entry.studentId, "REVOKE", entry.studentName)}
            >
              <MonitorX className="size-4" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
        ) : (
          <>
            <SimpleTooltip label={`Approve ${entry.studentName}'s screen-share request`}>
              <button
                type="button"
                aria-label={`Approve ${entry.studentName}'s screen-share request`}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-success-ink transition-colors hover:bg-success hover:text-white"
                onClick={() => onResolve(entry.studentId, "APPROVE", entry.studentName)}
              >
                <UserCheck className="size-4" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
            <SimpleTooltip label={`Deny ${entry.studentName}'s screen-share request`}>
              <button
                type="button"
                aria-label={`Deny ${entry.studentName}'s screen-share request`}
                className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-danger-ink transition-colors hover:bg-app-danger hover:text-white"
                onClick={() => onResolve(entry.studentId, "DENY", entry.studentName)}
              >
                <UserX className="size-4" strokeWidth={2.5} />
              </button>
            </SimpleTooltip>
          </>
        )}
      </div>
    </div>
  );
});

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

      {isCoach && roomId && showRoomControls ? <CoachRoomControls classId={roomId} /> : null}

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
              <h3 className="px-3 pb-1 text-xs font-semibold text-primary-ink">
                Sharing screen ({grouped.sharing.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {grouped.sharing.map((p) => (isCoachParticipant(p) ? renderCoachRow(p) : renderStudentRow(p)))}
              </div>
            </div>
          )}

          {isCoach && waitingList.length > 0 && (
            <div className="mb-2">
              <h3 className="px-3 pb-1 text-xs font-semibold text-warning-ink">
                Waiting to join ({waitingList.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {waitingList.map((entry) => (
                  <WaitingRoomListItem key={entry.studentId} entry={entry} onResolve={handleResolveWaiting} />
                ))}
              </div>
            </div>
          )}

          {isCoach && screenShareList.length > 0 && (
            <div className="mb-2">
              <h3 className="px-3 pb-1 text-xs font-semibold text-warning-ink">
                Screen-share requests ({screenShareList.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {screenShareList.map((entry) => (
                  <ScreenShareRequestListItem key={entry.studentId} entry={entry} onResolve={handleResolveScreenShare} />
                ))}
              </div>
            </div>
          )}

          {grouped.coaches.length > 0 && (
            <div className="mb-2">
              <h3 className="px-3 pb-1 text-xs font-semibold text-primary-ink">
                Coaches ({grouped.coaches.length})
              </h3>
              <div className="flex flex-col gap-0.5">
                {grouped.coaches.map(renderCoachRow)}
              </div>
            </div>
          )}

          <div>
            {(grouped.coaches.length > 0 || grouped.sharing.length > 0) && (
              <h3 className="px-3 pb-1 text-xs font-semibold text-app-muted">
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
