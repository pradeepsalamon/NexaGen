"use client";

import { useState, useMemo, memo } from "react";
import { Search, Mic, MicOff, Video, VideoOff, MonitorUp, Hand, Crown, X } from "lucide-react";
import { useConnectionQualityIndicator, useParticipants } from "@livekit/components-react";
import { ConnectionQuality } from "livekit-client";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { PanelHeader } from "./PanelHeader";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";

type LkParticipant = ReturnType<typeof useParticipants>[number];

interface ParticipantMeta {
  role?: string;
  handRaised?: boolean;
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
  if (participant.attributes?.handRaised === "true") meta.handRaised = true;
  else if (participant.attributes?.handRaised === "false") meta.handRaised = false;
  return meta;
}

function ConnectionDot({ participant }: { participant: LkParticipant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const color =
    quality === ConnectionQuality.Poor
      ? "bg-amber-500"
      : quality === ConnectionQuality.Unknown
        ? "bg-app-border"
        : "bg-emerald-500";
  return (
    <SimpleTooltip label={`Connection: ${quality === ConnectionQuality.Unknown ? "calculating…" : quality}`}>
      <span className={cn("size-2 shrink-0 rounded-full", color)} aria-hidden="true" />
    </SimpleTooltip>
  );
}

interface ParticipantItemProps {
  participant: LkParticipant;
  isCoachRow?: boolean;
  showBoardControl?: boolean;
  hasBoardControl?: boolean;
  onToggleBoardControl?: (identity: string) => void;
}

const ParticipantListItem = memo(function ParticipantListItem({
  participant,
  isCoachRow,
  showBoardControl,
  hasBoardControl,
  onToggleBoardControl,
}: ParticipantItemProps) {
  const user = useAuthStore((state) => state.user);
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraEnabled = participant.isCameraEnabled;
  const isScreenSharing = participant.isScreenShareEnabled;
  const localName = user ? `${user.firstName} ${user.lastName || ""}`.trim() : "You";
  const name = participant.name || (participant.isLocal ? localName : participant.identity) || "Unknown";
  const meta = parseMeta(participant);

  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-xl px-3 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <ConnectionDot participant={participant} />
        <ParticipantAvatar name={name} size="sm" className="size-8 shrink-0 text-[10px]" />
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-sm font-medium text-app-text">{name}</span>
          {participant.isLocal && (
            <span className="shrink-0 text-xs font-normal text-app-muted">(You)</span>
          )}
          {isCoachRow && (
            <span className="shrink-0 rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-primary">
              Coach
            </span>
          )}
        </span>
      </div>

      <div className="flex shrink-0 items-center gap-2 text-app-muted">
        {meta.handRaised && <Hand className="size-4 text-amber-500" aria-label="Hand raised" />}
        {isScreenSharing && (
          <MonitorUp className="size-4 text-primary" aria-label="Sharing screen" />
        )}
        {isCameraEnabled ? (
          <Video className="size-4" aria-label="Camera on" />
        ) : (
          <VideoOff className="size-4 opacity-40" aria-label="Camera off" />
        )}
        {isMuted ? (
          <MicOff className="size-4 text-app-danger/80" aria-label="Muted" />
        ) : (
          <Mic className="size-4" aria-label="Microphone on" />
        )}
        {showBoardControl && onToggleBoardControl && (
          <SimpleTooltip label={hasBoardControl ? "Revoke board control" : "Grant board control"}>
            <button
              type="button"
              onClick={() => onToggleBoardControl(participant.identity)}
              className={cn(
                "flex size-6 items-center justify-center rounded-md transition-colors",
                hasBoardControl
                  ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                  : "text-app-muted/50 hover:bg-app-soft hover:text-app-muted",
              )}
              aria-label={hasBoardControl ? "Revoke board control" : "Grant board control"}
            >
              <Crown className="size-3.5" />
            </button>
          </SimpleTooltip>
        )}
      </div>
    </div>
  );
});

export function MeetingParticipants() {
  const participants = useParticipants().filter((p) => !p.identity.endsWith("_board"));
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { isChessboardOpen, boardControlStudentIds, toggleBoardControl } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const query = searchQuery.toLowerCase();
    return participants.filter((p) => (p.name || p.identity || "").toLowerCase().includes(query));
  }, [participants, searchQuery]);

  const grouped = useMemo(() => {
    const coaches: LkParticipant[] = [];
    const students: LkParticipant[] = [];
    filteredParticipants.forEach((p) => {
      const role = parseMeta(p).role?.toLowerCase();
      if (role === "coach" || role === "teacher") coaches.push(p);
      else students.push(p);
    });
    return { coaches, students };
  }, [filteredParticipants]);

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
              "flex size-8 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-app-soft hover:text-app-text",
              showSearch && "bg-app-soft text-app-text",
            )}
            aria-label={showSearch ? "Close search" : "Search participants"}
          >
            {showSearch ? <X className="size-4" /> : <Search className="size-4" />}
          </button>
        }
      />

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

      <div className="custom-scrollbar flex-1 overflow-y-auto overscroll-contain px-2 py-3" role="list">
        {grouped.coaches.length > 0 && (
          <div className="mb-2">
            <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              Coaches ({grouped.coaches.length})
            </h3>
            <div className="flex flex-col gap-0.5">
              {grouped.coaches.map((p) => (
                <ParticipantListItem key={p.identity} participant={p} isCoachRow />
              ))}
            </div>
          </div>
        )}

        <div>
          {grouped.coaches.length > 0 && (
            <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-app-muted">
              Students ({grouped.students.length})
            </h3>
          )}
          <div className="flex flex-col gap-0.5">
            {grouped.students.map((p) => (
              <ParticipantListItem
                key={p.identity}
                participant={p}
                showBoardControl={isChessboardOpen && isCoach}
                hasBoardControl={boardControlStudentIds.includes(p.identity)}
                onToggleBoardControl={toggleBoardControl}
              />
            ))}
          </div>
        </div>

        {filteredParticipants.length === 0 && searchQuery && (
          <div className="flex h-32 items-center justify-center text-sm text-app-muted">
            No participants found.
          </div>
        )}
      </div>
    </div>
  );
}
