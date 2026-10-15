"use client";

import { memo, useCallback, useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useConnectionQualityIndicator } from "@livekit/components-react";
import { ConnectionQuality, type Participant } from "livekit-client";
import { compareNatural, type PullRosterStudent } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import type { BoardControlSide } from "@/features/chessboard/types/sync";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { getPullRoster } from "../../../../api/live-class";
import { useRoster } from "../../../../hooks/useRoster";
import { isHumanParticipant } from "../../../../lib/participants";
import { useLiveClassState } from "../../../../providers/LiveClassProvider";
import { BoardControlSideToggle } from "../../BoardControlSideToggle";
import { ParticipantAvatar } from "../../ParticipantAvatar";
import { SidebarListHeader, SidebarSearch } from "./SidebarParts";

/** One person in the room. A student with two tabs open is one member with two connections. */
export type RoomMember = {
  userId: string;
  name: string;
  isCoach: boolean;
  /** Every LiveKit identity (one per tab) — a board grant goes to all of them. */
  identities: string[];
  /** The connection the status dot reports on. */
  participant: Participant;
};

function roleOf(participant: Participant) {
  try {
    return (JSON.parse(participant.metadata || "{}") as { role?: string }).role?.toLowerCase();
  } catch {
    return undefined;
  }
}

/** Everyone in the room, one entry per user: coaches first, then A–Z. */
export function useRoomMembers(): RoomMember[] {
  const participants = useRoster();
  return useMemo(() => {
    const byUser = new Map<string, RoomMember>();
    for (const p of participants) {
      if (!isHumanParticipant(p)) continue;
      const userId = p.identity.split("_")[0];
      const role = roleOf(p);
      const existing = byUser.get(userId);
      if (existing) {
        existing.identities.push(p.identity);
        continue;
      }
      byUser.set(userId, {
        identities: [p.identity],
        isCoach: role === "coach" || role === "teacher",
        name: p.name || p.identity,
        participant: p,
        userId
      });
    }
    return [...byUser.values()].sort(
      (a, b) => Number(b.isCoach) - Number(a.isCoach) || compareNatural(a.name, b.name)
    );
  }, [participants]);
}

/**
 * Members: who is in the class, and which pieces each student may move on the
 * shared board — White, Black or Both, set per student. A grant changes the
 * board's permissions, which the coach's board broadcasts; every receiver
 * re-checks each incoming move against them (colour, turn and legality), so
 * the buttons are not just decoration. Batch students who aren't connected
 * are listed underneath with their app presence.
 */
export function MembersPanel({ classId, members }: { classId: string; members: RoomMember[] }) {
  const [query, setQuery] = useState("");
  const [searchOpen, setSearchOpen] = useState(false);
  const { boardControlStudents, isChessboardOpen, setBoardControlSide } = useLiveClassState(
    "boardControlStudents",
    "isChessboardOpen",
    "setBoardControlSide"
  );
  // Shares its cache (and 10s refresh) with the People tab's "Not in class".
  const roster = useQuery({
    queryKey: queryKeys.livePull.roster(classId),
    queryFn: () => getPullRoster(classId),
    refetchInterval: 10_000
  });

  const setSide = useCallback(
    (member: RoomMember, side: BoardControlSide | null) => {
      for (const identity of member.identities) setBoardControlSide(identity, side);
    },
    [setBoardControlSide]
  );

  const q = query.trim().toLowerCase();
  const matches = (name: string) => !q || name.toLowerCase().includes(q);
  const visible = members.filter((m) => matches(m.name));
  const inRoom = new Set(members.map((m) => m.userId));
  const away = (roster.data?.students ?? [])
    .filter((s) => s.inBatch && !s.inClass && !inRoom.has(s.studentId) && matches(s.name))
    .sort((a, b) => Number(b.online) - Number(a.online) || compareNatural(a.name, b.name));
  const granted = members.filter((m) => !m.isCoach && m.identities.some((id) => boardControlStudents[id])).length;

  return (
    <div className="flex h-full min-h-0 flex-col">
      <SidebarListHeader
        searchOpen={searchOpen}
        onToggleSearch={() => {
          setSearchOpen((v) => !v);
          if (searchOpen) setQuery("");
        }}
        searchLabel="Search members"
      >
        {isChessboardOpen
          ? granted > 0
            ? `${granted} with board control`
            : "Board control: coach only"
          : "Share the board to hand out control"}
      </SidebarListHeader>
      {searchOpen ? <SidebarSearch value={query} onChange={setQuery} placeholder="Search members…" /> : null}

      <div className="custom-scrollbar min-h-0 flex-1 overflow-y-auto overscroll-contain px-1.5 py-1.5" role="list">
        {visible.map((member) => (
          <MemberRow
            key={member.userId}
            member={member}
            side={member.identities.map((id) => boardControlStudents[id]).find(Boolean) ?? null}
            canGrant={isChessboardOpen}
            onSide={setSide}
          />
        ))}
        {visible.length === 0 && q ? (
          <p className="py-4 text-center text-xs text-app-muted">No member matches &ldquo;{query.trim()}&rdquo;.</p>
        ) : null}

        {away.length > 0 ? (
          <>
            <h3 className="px-2 pb-1 pt-3 text-[10px] font-bold uppercase tracking-widest text-app-muted">
              Not in class ({away.length})
            </h3>
            {away.map((student) => (
              <AwayRow key={student.studentId} student={student} />
            ))}
          </>
        ) : null}
      </div>
    </div>
  );
}

const MemberRow = memo(function MemberRow({
  member,
  side,
  canGrant,
  onSide
}: {
  member: RoomMember;
  side: BoardControlSide | null;
  canGrant: boolean;
  onSide: (member: RoomMember, side: BoardControlSide | null) => void;
}) {
  return (
    <div role="listitem" className="flex min-h-10 items-center gap-2 rounded-control px-1.5 py-1 hover:bg-app-soft">
      <span className="relative shrink-0">
        <ParticipantAvatar name={member.name} size="xs" />
        <StatusDot participant={member.participant} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-app-text">{member.name}</span>
        {member.isCoach ? (
          <span className="block text-[10px] font-semibold uppercase tracking-wide text-primary-ink">Coach</span>
        ) : member.identities.length > 1 ? (
          <span className="block text-[10px] text-app-muted">{member.identities.length} tabs open</span>
        ) : null}
      </span>
      {member.isCoach ? null : (
        <BoardControlSideToggle
          hideOff
          disabled={!canGrant}
          studentName={member.name}
          value={side}
          onChange={(next) => onSide(member, next)}
        />
      )}
    </div>
  );
});

/** In class: green, amber on a poor connection. */
function StatusDot({ participant }: { participant: Participant }) {
  const { quality } = useConnectionQualityIndicator({ participant });
  const poor = quality === ConnectionQuality.Poor || quality === ConnectionQuality.Lost;
  return (
    <SimpleTooltip label={poor ? "In class · poor connection" : "In class"}>
      <span
        aria-label={poor ? "In class, poor connection" : "In class"}
        className={cn(
          "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-app-surface",
          poor ? "bg-amber-500" : "bg-emerald-500"
        )}
      />
    </SimpleTooltip>
  );
}

function presenceLabel(student: PullRosterStudent) {
  if (student.online) return "Away · in the app";
  if (!student.lastSeenAt) return "Offline";
  const minutes = Math.floor((Date.now() - Date.parse(student.lastSeenAt)) / 60_000);
  if (minutes < 60) return `Offline · ${Math.max(minutes, 1)}m ago`;
  const hours = Math.floor(minutes / 60);
  return hours < 24 ? `Offline · ${hours}h ago` : `Offline · ${Math.floor(hours / 24)}d ago`;
}

function AwayRow({ student }: { student: PullRosterStudent }) {
  return (
    <div role="listitem" className="flex min-h-9 items-center gap-2 rounded-control px-1.5 py-1 opacity-75">
      <span className="relative shrink-0">
        <ParticipantAvatar name={student.name} imageUrl={student.avatarUrl ?? undefined} size="xs" />
        <span
          className={cn(
            "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-app-surface",
            student.online ? "bg-amber-400" : "bg-app-border"
          )}
          aria-hidden="true"
        />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-medium text-app-text">{student.name}</span>
        <span className="block truncate text-[10px] text-app-muted">{presenceLabel(student)}</span>
      </span>
    </div>
  );
}
