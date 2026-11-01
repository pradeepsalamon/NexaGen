"use client";

import { memo, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Clock, Magnet, Search, Send, X } from "lucide-react";
import { compareNatural, type PullRosterStudent } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { RequestApprovalDialog } from "@/features/approvals/components/RequestApprovalDialog";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { queryKeys } from "@/lib/queryKeys";
import { cn } from "@/lib/utils";
import { useToast } from "@/providers/ToastProvider";
import { cancelPull, getPullRoster, pullStudent } from "../../api/live-class";
import { ParticipantAvatar } from "./ParticipantAvatar";

function lastSeenLabel(iso: string | null): string {
  if (!iso) return "Offline";
  const minutes = Math.floor((Date.now() - new Date(iso).getTime()) / 60_000);
  if (minutes < 1) return "Offline · just now";
  if (minutes < 60) return `Offline · ${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Offline · ${hours}h ago`;
  return `Offline · ${Math.floor(hours / 24)}d ago`;
}

const PullRow = memo(function PullRow({
  student,
  busy,
  onPull,
  onCancel,
  onAsk
}: {
  student: PullRosterStudent;
  busy: boolean;
  onPull: (student: PullRosterStudent) => void;
  onCancel: (student: PullRosterStudent) => void;
  onAsk: (student: PullRosterStudent) => void;
}) {
  const pending = student.pull?.status === "PENDING";
  // V4: outside the coach's batches → an admin request, not a pull.
  const gated = student.needsApproval && !pending;
  return (
    <div
      className="flex min-h-11 items-center justify-between gap-3 rounded-control px-3 py-2 transition-colors hover:bg-app-soft"
      role="listitem"
    >
      <div className="flex min-w-0 items-center gap-2.5">
        <span className="relative shrink-0">
          <ParticipantAvatar name={student.name} size="sm" className="size-8 text-[10px]" />
          <span
            aria-hidden="true"
            className={cn(
              "absolute -bottom-0.5 -right-0.5 size-2.5 rounded-full ring-2 ring-app-surface",
              student.online ? "bg-success" : "bg-app-muted/50"
            )}
          />
        </span>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-1.5">
            <span className="truncate text-sm font-medium text-app-text">{student.name}</span>
            {student.username ? (
              <span className="min-w-0 shrink truncate text-[11px] text-app-muted">@{student.username}</span>
            ) : null}
            {!student.inBatch ? (
              <span className="shrink-0 rounded-full bg-app-soft px-1.5 py-0.5 text-[10px] font-semibold text-app-muted">
                Other batch
              </span>
            ) : null}
          </div>
          <div
            className={cn(
              "truncate text-[11px] font-semibold",
              pending ? "text-warning-ink" : student.online ? "text-success-ink" : "text-app-muted"
            )}
          >
            {gated
              ? student.approvalPending
                ? "Waiting for an admin"
                : "Not in your batches · needs an admin"
              : pending
              ? student.online
                ? "Joining…"
                : "Will join when they open the app"
              : student.online
                ? "Online in app"
                : lastSeenLabel(student.lastSeenAt)}
          </div>
        </div>
      </div>

      {gated ? (
        student.approvalPending ? (
          <SimpleTooltip label="Request sent. An admin will decide.">
            <span
              aria-label={`Request for ${student.name} is waiting for an admin`}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border text-app-muted"
              role="img"
            >
              <Clock className="size-4" strokeWidth={2.5} />
            </span>
          </SimpleTooltip>
        ) : (
          <SimpleTooltip label={`Ask an admin to let ${student.name} join`}>
            <button
              type="button"
              aria-label={`Ask an admin to let ${student.name} join`}
              disabled={busy}
              className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-text transition-colors hover:bg-app-soft disabled:opacity-50"
              onClick={() => onAsk(student)}
            >
              <Send className="size-4" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
        )
      ) : pending ? (
        <SimpleTooltip label={`Cancel pull for ${student.name}`}>
          <button
            type="button"
            aria-label={`Cancel pull for ${student.name}`}
            disabled={busy}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-app-border p-0 text-app-muted transition-colors hover:bg-app-danger hover:text-white disabled:opacity-50"
            onClick={() => onCancel(student)}
          >
            <X className="size-4" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      ) : (
        <SimpleTooltip label={`Pull ${student.name} into class`}>
          <button
            type="button"
            aria-label={`Pull ${student.name} into class`}
            disabled={busy}
            className="grid size-8 shrink-0 place-items-center rounded-full border border-primary p-0 text-primary-ink transition-colors hover:bg-primary hover:text-white disabled:opacity-50"
            onClick={() => onPull(student)}
          >
            <Magnet className="size-4" strokeWidth={2.5} />
          </button>
        </SimpleTooltip>
      )}
    </div>
  );
});

/**
 * Coach-only: the batch's students who are not in the room, with whether they
 * have the app open. "Pull" sends them straight in — immediately if they are
 * online, or the moment they next open the app. Students from other batches
 * are never listed up front (only while a pull to them is pending); searching
 * by name or username finds any active student in the academy, but one outside
 * the coach's own batches needs an admin's approval first (V4) — the row offers
 * that request instead of a pull.
 */
export function PullStudentsSection({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
  const [asking, setAsking] = useState<PullRosterStudent | null>(null);
  const rosterKey = queryKeys.livePull.roster(classId);

  const roster = useQuery({
    queryKey: rosterKey,
    queryFn: () => getPullRoster(classId),
    refetchInterval: 10_000
  });

  const pull = useMutation({
    mutationFn: (s: PullRosterStudent) => pullStudent(classId, s.studentId),
    onSuccess: (_data, s) => {
      toast.success({
        title: `Pulling ${s.name} in`,
        message: s.online ? "They'll join in a few seconds." : "They'll join as soon as they open the app."
      });
      void qc.invalidateQueries({ queryKey: rosterKey });
    },
    onError: (error: Error) => toast.error({ title: "Couldn't pull student", message: error.message })
  });

  const cancel = useMutation({
    mutationFn: (s: PullRosterStudent) => cancelPull(classId, s.studentId),
    onSuccess: () => void qc.invalidateQueries({ queryKey: rosterKey }),
    onError: (error: Error) => toast.error({ title: "Couldn't cancel", message: error.message })
  });

  const debounced = useDebouncedValue(query.trim(), 300);
  const searching = debounced.replace(/^@/, "").length >= 2;
  const search = useQuery({
    queryKey: queryKeys.livePull.search(classId, debounced),
    queryFn: () => getPullRoster(classId, debounced),
    enabled: searching,
    staleTime: 10_000
  });

  const absent = useMemo(
    () =>
      (roster.data?.students ?? [])
        .filter((s) => !s.inClass)
        .sort((a, b) => compareNatural(a.name, b.name)),
    [roster.data]
  );
  const shown = useMemo(() => {
    const q = query.trim().replace(/^@/, "").toLowerCase();
    if (!q) return absent;
    const matchesLocally = (s: PullRosterStudent) =>
      s.name.toLowerCase().includes(q) || !!s.username?.toLowerCase().includes(q);
    const local = absent.filter(matchesLocally);
    if (!searching || !search.data) return local;
    // The server's answer is authoritative (it searches usernames and every
    // batch); the local filter only fills the gap while it loads.
    return search.data.students.filter((s) => !s.inClass);
  }, [absent, query, searching, search.data]);
  const onlineIdle = absent.filter((s) => s.online && !s.needsApproval && s.pull?.status !== "PENDING");

  if (!roster.data) return null;

  const busyId = pull.isPending ? pull.variables?.studentId : cancel.isPending ? cancel.variables?.studentId : null;

  return (
    <div className="mt-3 border-t border-app-border/60 pt-3">
      <div className="flex items-center justify-between gap-2 px-3 pb-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs font-semibold text-app-muted hover:text-app-text"
        >
          Not in class ({absent.length})
          <ChevronDown className={cn("size-3.5 transition-transform", !open && "-rotate-90")} strokeWidth={2.5} />
        </button>
        {open && onlineIdle.length > 1 ? (
          <button
            type="button"
            className="text-[11px] font-bold text-primary-ink hover:underline disabled:opacity-50"
            disabled={pull.isPending}
            onClick={() => onlineIdle.forEach((s) => pull.mutate(s))}
          >
            Pull all online ({onlineIdle.length})
          </button>
        ) : null}
      </div>

      {open ? (
        <>
          <div className="px-3 pb-2">
            <div className="flex items-center gap-2 rounded-full bg-app-soft px-3 py-1.5 ring-1 ring-app-border/50 focus-within:ring-primary/40">
              <Search className="size-3.5 shrink-0 text-app-muted" />
              <input
                aria-label="Search any student by name or username"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search name or username…"
                className="w-full bg-transparent text-[13px] font-medium text-app-text outline-none placeholder:text-app-muted"
              />
            </div>
          </div>
          <div className="flex flex-col gap-0.5" role="list">
            {shown.map((s) => (
              <PullRow
                key={s.studentId}
                student={s}
                busy={busyId === s.studentId}
                onPull={(st) => pull.mutate(st)}
                onCancel={(st) => cancel.mutate(st)}
                onAsk={setAsking}
              />
            ))}
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs text-app-muted">
                {query.trim()
                  ? searching && search.isFetching
                    ? "Searching…"
                    : query.trim().replace(/^@/, "").length < 2
                      ? "Type at least 2 letters to search every batch."
                      : "No students match."
                  : "Everyone in the batch is here. Search a name or username to pull in any student."}
              </p>
            ) : null}
          </div>
        </>
      ) : null}
      <RequestApprovalDialog
        open={asking !== null}
        onOpenChange={(isOpen) => {
          if (!isOpen) {
            setAsking(null);
            void qc.invalidateQueries({ queryKey: rosterKey });
            if (debounced) void qc.invalidateQueries({ queryKey: queryKeys.livePull.search(classId, debounced) });
          }
        }}
        actionType="LIVE_CLASS_GUEST_STUDENT"
        payload={{ classId, studentId: asking?.studentId ?? "" }}
        title={`Let ${asking?.name ?? "this student"} join?`}
        description="This student isn't in any of your batches, so an admin has to approve bringing them into this class. Once approved you can pull them in (if the class is live, they're invited straight away)."
        submitLabel="Ask an admin"
      />
    </div>
  );
}
