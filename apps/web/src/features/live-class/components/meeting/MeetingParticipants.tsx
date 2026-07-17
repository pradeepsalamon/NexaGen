"use client";

import { useState, useMemo, memo } from "react";
import { Users, Search, Mic, MicOff, Video, VideoOff, MonitorUp, Hand } from "lucide-react";
import { useParticipants } from "@livekit/components-react";
import { ParticipantAvatar } from "./ParticipantAvatar";
import { cn } from "@/lib/utils";

// ─── Types ───────────────────────────────────────────────────

interface ParticipantMeta {
  role?: string;
  handRaised?: boolean;
}

function parseMeta(metadata: string | undefined): ParticipantMeta {
  if (!metadata) return {};
  try {
    return JSON.parse(metadata) as ParticipantMeta;
  } catch {
    return {};
  }
}

// ─── Participant List Item ───────────────────────────────────

interface ParticipantItemProps {
  participant: ReturnType<typeof useParticipants>[number];
}

const ParticipantListItem = memo(function ParticipantListItem({
  participant,
}: ParticipantItemProps) {
  const isMuted = !participant.isMicrophoneEnabled;
  const isCameraEnabled = participant.isCameraEnabled;
  const isScreenSharing = participant.isScreenShareEnabled;
  const name = participant.name || participant.identity || "Unknown";
  const meta = parseMeta(participant.metadata);

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
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-app-text truncate">
            {name}{" "}
            {participant.isLocal && (
              <span className="text-app-muted text-xs font-normal">(You)</span>
            )}
          </span>
          {meta.role && (
            <span className="text-[10px] font-semibold uppercase tracking-wider text-primary">
              {meta.role}
            </span>
          )}
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
      </div>
    </div>
  );
});

// ─── Participants Panel Content ──────────────────────────────

export function MeetingParticipants() {
  const participants = useParticipants();
  const [searchQuery, setSearchQuery] = useState("");
  const [showSearch, setShowSearch] = useState(false);

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
      const meta = parseMeta(p.metadata);
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
        <div className="flex items-center gap-2 min-w-0 flex-1 mr-2">
          {showSearch ? (
            <input
              autoFocus
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Search participants..."
              className="w-full bg-transparent text-sm font-medium text-app-text outline-none placeholder:text-app-muted"
            />
          ) : (
            <div className="flex items-center gap-2">
              <Users className="size-3.5 text-app-muted" />
              <span className="text-xs font-semibold text-app-muted uppercase tracking-wider">
                {participants.length} participant{participants.length !== 1 ? "s" : ""}
              </span>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={() => {
            setShowSearch(!showSearch);
            setSearchQuery("");
          }}
          className={cn(
            "flex size-7 items-center justify-center rounded-lg transition-colors hover:bg-app-soft",
            showSearch
              ? "text-primary bg-primary/10 hover:bg-primary/20"
              : "text-app-muted hover:text-app-text",
          )}
          aria-label="Search participants"
        >
          <Search className="size-3.5" />
        </button>
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
                <ParticipantListItem key={p.identity} participant={p} />
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
              <ParticipantListItem key={p.identity} participant={p} />
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
