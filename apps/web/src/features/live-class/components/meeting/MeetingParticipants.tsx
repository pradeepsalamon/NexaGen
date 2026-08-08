"use client";

import { useState, useMemo, memo } from "react";
import { Users, Search, Mic, MicOff, Video, VideoOff, MonitorUp, Hand, Crown, X } from "lucide-react";
import { useParticipants } from "@livekit/components-react";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { cn } from "@/lib/utils";
import { useLiveClassState } from "../../providers/LiveClassProvider";
import { useAuthStore } from "@/stores/authStore";

// ─── Types ───────────────────────────────────────────────────

interface ParticipantMeta {
  role?: string;
  handRaised?: boolean;
}

function parseMeta(participant: ReturnType<typeof useParticipants>[number]): ParticipantMeta {
  const meta: ParticipantMeta = {};
  if (participant.metadata) {
    try {
      Object.assign(meta, JSON.parse(participant.metadata));
    } catch {
      // ignore
    }
  }
  // Attributes take precedence for handRaised since client can update them
  if (participant.attributes?.handRaised === "true") {
    meta.handRaised = true;
  } else if (participant.attributes?.handRaised === "false") {
    meta.handRaised = false;
  }
  return meta;
}

// ─── Participant List Item ───────────────────────────────────

interface ParticipantItemProps {
  participant: ReturnType<typeof useParticipants>[number];
  showBoardControl?: boolean;
  hasBoardControl?: boolean;
  onToggleBoardControl?: (identity: string) => void;
}

const ParticipantListItem = memo(function ParticipantListItem({
  participant,
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
      className="flex items-center justify-between gap-3 rounded-xl p-3 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex items-center gap-3 min-w-0">
        <ParticipantAvatar
          name={name}
          size="sm"
          className="size-8 text-[10px] shrink-0"
        />
        <div className="flex flex-col overflow-hidden justify-center">
          <span className="truncate text-sm font-medium text-app-text flex items-center gap-1.5">
            {name}
            {meta.role && meta.role.toUpperCase() === "COACH" && (
              <span className="text-app-muted text-xs font-normal">(Coach)</span>
            )}
            {participant.isLocal && (
              <span className="text-app-muted text-xs font-normal">(You)</span>
            )}
          </span>
        </div>
      </div>

      <div className="flex items-center gap-2 text-app-muted shrink-0">
        {meta.handRaised && (
          <Hand className="size-4 text-amber-400" aria-label="Hand raised" />
        )}
        {isScreenSharing && (
          <MonitorUp className="size-4 text-primary" aria-label="Sharing screen" />
        )}
        {isCameraEnabled ? (
          <Video className="size-4" aria-label="Camera on" />
        ) : (
          <VideoOff className="size-4 opacity-40" aria-label="Camera off" />
        )}
        {isMuted ? (
          <MicOff className="size-4 text-red-500/80" aria-label="Muted" />
        ) : (
          <Mic className="size-4" aria-label="Microphone on" />
        )}
        {showBoardControl && onToggleBoardControl && (
          <button
            type="button"
            onClick={() => onToggleBoardControl(participant.identity)}
            className={cn(
              "flex size-6 items-center justify-center rounded-md transition-all duration-150",
              hasBoardControl
                ? "bg-emerald-500/15 text-emerald-500 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25"
                : "text-app-muted/50 hover:bg-app-soft hover:text-app-muted",
            )}
            aria-label={hasBoardControl ? "Revoke board control" : "Grant board control"}
            title={hasBoardControl ? "Revoke board control" : "Grant board control"}
          >
            <Crown className="size-3.5" />
          </button>
        )}
      </div>
    </div>
  );
});

// ─── Participants Panel Content ──────────────────────────────

export function MeetingParticipants() {
  const participants = useParticipants();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);
  const { isChessboardOpen, boardControlStudentId, setBoardControlStudent } = useLiveClassState();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || user?.role === "SUPER_ADMIN";

  const filteredParticipants = useMemo(() => {
    if (!searchQuery.trim()) return participants;
    const query = searchQuery.toLowerCase();
    return participants.filter((p) => {
      const name = (p.name || p.identity || "").toLowerCase();
      return name.includes(query);
    });
  }, [participants, searchQuery]);

  // Group by role
  const grouped = useMemo(() => {
    const coaches: typeof filteredParticipants = [];
    const students: typeof filteredParticipants = [];

    filteredParticipants.forEach((p) => {
      const meta = parseMeta(p);
      if (meta.role?.toLowerCase() === "coach" || meta.role?.toLowerCase() === "teacher") {
        coaches.push(p);
      } else {
        students.push(p);
      }
    });

    return { coaches, students };
  }, [filteredParticipants]);

  return (
    <div className="flex h-full flex-col">
      {/* Sub-header with search and count */}
      <div className="flex h-12 shrink-0 items-center justify-between border-b border-app-border/40 px-4">
        {showSearch ? (
          <div className="flex items-center gap-2 w-full animate-in fade-in slide-in-from-right-4 duration-200">
            <div className="flex-1 flex items-center bg-app-soft rounded-full px-3 py-1.5 ring-1 ring-app-border/50 focus-within:ring-primary/40 focus-within:bg-app-background transition-all">
              <Search className="size-3.5 text-app-muted mr-2 shrink-0" />
              <input
                autoFocus
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search participants..."
                className="w-full bg-transparent text-[13px] font-medium text-app-text outline-none placeholder:text-app-muted focus:ring-0"
              />
              <button
                type="button"
                onClick={() => {
                  setShowSearch(false);
                  setSearchQuery("");
                }}
                className="ml-1 shrink-0 p-0.5 text-app-muted hover:bg-app-border/60 hover:text-app-text rounded-full transition-colors"
                aria-label="Close search"
              >
                <X className="size-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <>
            <div className="flex items-center gap-2 min-w-0 flex-1 mr-2 animate-in fade-in slide-in-from-left-4 duration-200">
              <Users className="size-3.5 text-app-muted" />
              <span className="text-xs font-semibold text-app-muted uppercase tracking-wider">
                {participants.length} participant{participants.length !== 1 ? "s" : ""}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowSearch(true)}
              className="flex size-7 items-center justify-center rounded-lg text-app-muted hover:bg-app-soft hover:text-app-text transition-colors"
              aria-label="Search participants"
            >
              <Search className="size-3.5" />
            </button>
          </>
        )}
      </div>

      {/* Participant list */}
      <div className="flex-1 overflow-y-auto overscroll-contain px-2 py-3 custom-scrollbar" role="list">
        {/* Coaches section */}
        {grouped.coaches.length > 0 && (
          <div className="mb-2">
            <h3 className="px-3 pb-1 text-[10px] font-bold uppercase tracking-widest text-primary">
              Coaches ({grouped.coaches.length})
            </h3>
            <div className="flex flex-col gap-0.5">
              {grouped.coaches.map((p) => (
                <ParticipantListItem
                key={p.identity}
                participant={p}
                showBoardControl={isChessboardOpen && isCoach}
                hasBoardControl={boardControlStudentId === p.identity}
                onToggleBoardControl={(identity) =>
                  setBoardControlStudent(
                    boardControlStudentId === identity ? null : identity
                  )
                }
              />
              ))}
            </div>
          </div>
        )}

        {/* Students / Others section */}
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
                hasBoardControl={boardControlStudentId === p.identity}
                onToggleBoardControl={(identity) =>
                  setBoardControlStudent(
                    boardControlStudentId === identity ? null : identity
                  )
                }
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
