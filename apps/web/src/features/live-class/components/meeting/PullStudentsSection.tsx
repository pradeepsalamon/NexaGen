"use client";

import { memo, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronDown, Magnet, Search, X } from "lucide-react";
import { compareNatural, type PullRosterStudent } from "@nexa-chess/types";
import { SimpleTooltip } from "@/components/ui/Tooltip";
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
  onCancel
}: {
  student: PullRosterStudent;
  busy: boolean;
  onPull: (student: PullRosterStudent) => void;
  onCancel: (student: PullRosterStudent) => void;
}) {
  const pending = student.pull?.status === "PENDING";
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
              student.online ? "bg-emerald-500" : "bg-app-muted/50"
            )}
          />
        </span>
        <div className="min-w-0">
          <div className="truncate text-sm font-medium text-app-text">{student.name}</div>
          <div
            className={cn(
              "truncate text-[11px] font-semibold",
              pending ? "text-amber-600" : student.online ? "text-emerald-600" : "text-app-muted"
            )}
          >
            {pending
              ? student.online
                ? "Joining…"
                : "Will join when they open the app"
              : student.online
                ? "Online in app"
                : lastSeenLabel(student.lastSeenAt)}
          </div>
        </div>
      </div>

      {pending ? (
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
 * online, or the moment they next open the app.
 */
export function PullStudentsSection({ classId }: { classId: string }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [open, setOpen] = useState(true);
  const [query, setQuery] = useState("");
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

  const absent = useMemo(
    () =>
      (roster.data?.students ?? [])
        .filter((s) => !s.inClass)
        .sort((a, b) => compareNatural(a.name, b.name)),
    [roster.data]
  );
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return q ? absent.filter((s) => s.name.toLowerCase().includes(q)) : absent;
  }, [absent, query]);
  const onlineIdle = absent.filter((s) => s.online && s.pull?.status !== "PENDING");

  if (!roster.data || absent.length === 0) return null;

  const busyId = pull.isPending ? pull.variables?.studentId : cancel.isPending ? cancel.variables?.studentId : null;

  return (
    <div className="mt-3 border-t border-app-border/60 pt-3">
      <div className="flex items-center justify-between gap-2 px-3 pb-1">
        <button
          type="button"
          aria-expanded={open}
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-app-muted hover:text-app-text"
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
          {absent.length > 5 ? (
            <div className="px-3 pb-2">
              <div className="flex items-center gap-2 rounded-full bg-app-soft px-3 py-1.5 ring-1 ring-app-border/50 focus-within:ring-primary/40">
                <Search className="size-3.5 shrink-0 text-app-muted" />
                <input
                  aria-label="Search batch students"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Search batch students…"
                  className="w-full bg-transparent text-[13px] font-medium text-app-text outline-none placeholder:text-app-muted"
                />
              </div>
            </div>
          ) : null}
          <div className="flex flex-col gap-0.5" role="list">
            {shown.map((s) => (
              <PullRow
                key={s.studentId}
                student={s}
                busy={busyId === s.studentId}
                onPull={(st) => pull.mutate(st)}
                onCancel={(st) => cancel.mutate(st)}
              />
            ))}
            {shown.length === 0 ? (
              <p className="px-3 py-2 text-xs text-app-muted">No students match.</p>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
