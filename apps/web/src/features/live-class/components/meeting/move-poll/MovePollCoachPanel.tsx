"use client";

import { useEffect, useMemo, useState } from "react";
import { useParams } from "next/navigation";
import { Eye, EyeOff, Lock, LockOpen, MessageCircleQuestion, Plus, X } from "lucide-react";
import type { LiveMovePoll } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { useBoardStore } from "@/features/chessboard/context/BoardProvider";
import type { OverlayArrow } from "@/features/chessboard/store/createBoardStore";
import { isHumanParticipant } from "../../../lib/participants";
import {
  useEndLiveMovePoll,
  useLiveMovePollState,
  useLiveMovePollSync,
  useStartLiveMovePoll,
  useUpdateLiveMovePoll
} from "../../../hooks/useLiveMovePoll";
import { MovePollResults } from "./MovePollResults";
import { useRoster } from "@/features/live-class/hooks/useRoster";

/** Placement + side to move; move counters don't make it a different question. */
const positionKey = (fen: string) => fen.split(" ").slice(0, 2).join(" ");

function studentRole(metadata: string | undefined): boolean {
  if (!metadata) return false;
  try {
    return (JSON.parse(metadata) as { role?: string }).role?.toUpperCase() === "STUDENT";
  } catch {
    return false;
  }
}

function useStudentsInRoom() {
  const participants = useRoster();
  return useMemo(
    () =>
      participants
        .filter((p) => isHumanParticipant(p) && studentRole(p.metadata))
        .map((p) => ({ userId: p.identity.split("_")[0], name: p.name || p.identity })),
    [participants]
  );
}

function tallyArrows(poll: LiveMovePoll): OverlayArrow[] {
  const max = Math.max(1, ...poll.options.map((o) => o.count));
  return poll.options.map((o) => ({
    orig: o.uci.slice(0, 2),
    dest: o.uci.slice(2, 4),
    brush: o.uci === poll.correctUci ? "primaryGreen" : "blue",
    weight: o.count / max
  }));
}

/** Coach's "Response" tab on the shared board: ask the class about the current position. */
export function MovePollCoachPanel() {
  const params = useParams();
  const classId = (params?.roomId as string) ?? "";
  useLiveMovePollSync(classId, { isManager: true });
  const { data, isLoading } = useLiveMovePollState(classId);
  const poll = data?.poll ?? null;

  const fen = useBoardStore((s) => s.fen);
  const setOverlayArrows = useBoardStore((s) => s.setOverlayArrows);
  const start = useStartLiveMovePoll(classId);
  const update = useUpdateLiveMovePoll(classId);
  const end = useEndLiveMovePoll(classId);
  const students = useStudentsInRoom();

  const [prompt, setPrompt] = useState("");
  const [showArrows, setShowArrows] = useState(true);

  const onBoard = !!poll && positionKey(poll.fen) === positionKey(fen);

  useEffect(() => {
    setOverlayArrows(poll && showArrows && onBoard ? tallyArrows(poll) : []);
  }, [poll, showArrows, onBoard, setOverlayArrows]);
  useEffect(() => () => setOverlayArrows([]), [setOverlayArrows]);

  const ask = () =>
    start.mutate({ fen, prompt: prompt.trim() || undefined }, { onSuccess: () => setPrompt("") });

  const waiting = useMemo(() => {
    if (!poll) return [];
    const answered = new Set(poll.answers.map((a) => a.studentId));
    return students.filter((s) => !answered.has(s.userId));
  }, [poll, students]);

  if (isLoading) return <p className="p-4 text-sm text-app-muted">Loading…</p>;

  if (!poll) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-start gap-3 rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">
          <MessageCircleQuestion className="mt-0.5 size-5 shrink-0 text-primary" />
          <p>
            Ask the class about the position on the board. Each student plays one move privately, and you see
            what everyone chose.
          </p>
        </div>
        <Input
          aria-label="Question"
          placeholder="What would you play?"
          maxLength={200}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && ask()}
        />
        <Button className="w-full" onClick={ask} disabled={start.isPending}>
          Ask the class
        </Button>
      </div>
    );
  }

  const isOpen = poll.status === "OPEN";
  const toggleCorrect = (uci: string) =>
    update.mutate({ correctUci: poll.correctUci === uci ? null : uci });

  return (
    <div className="space-y-4 p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="truncate font-semibold text-app-text">{poll.prompt || "What would you play?"}</p>
          <p className="text-xs text-app-muted">
            {poll.answerCount} answered
            {students.length > 0 ? ` · ${students.length} student${students.length === 1 ? "" : "s"} in class` : ""}
          </p>
        </div>
        <Badge variant={isOpen ? "success" : poll.revealed ? "info" : "secondary"}>
          {isOpen ? "Open" : poll.revealed ? "Revealed" : "Closed"}
        </Badge>
      </div>

      {!onBoard ? (
        <p className="rounded-app border border-warning/40 bg-warning/10 px-3 py-2 text-xs text-warning-ink">
          The board has moved on from the question&apos;s position, so the answer arrows are hidden.
        </p>
      ) : null}

      <MovePollResults
        options={poll.options}
        total={poll.answerCount}
        correctUci={poll.correctUci}
        onToggleCorrect={toggleCorrect}
      />

      {isOpen && waiting.length > 0 ? (
        <p className="text-xs text-app-muted">
          <span className="font-semibold">Waiting on:</span> {waiting.map((s) => s.name).join(", ")}
        </p>
      ) : null}

      <Switch checked={showArrows} onCheckedChange={setShowArrows} label="Show answers as arrows on my board" />

      <div className="flex flex-wrap gap-2">
        {isOpen ? (
          <Button size="sm" onClick={() => update.mutate({ status: "CLOSED" })} disabled={update.isPending}>
            <Lock className="size-4" /> Close answers
          </Button>
        ) : (
          <>
            <Button
              size="sm"
              variant={poll.revealed ? "outline" : "primary"}
              onClick={() => update.mutate({ revealed: !poll.revealed })}
              disabled={update.isPending}
            >
              {poll.revealed ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              {poll.revealed ? "Hide results" : "Show results to students"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => update.mutate({ status: "OPEN" })} disabled={update.isPending}>
              <LockOpen className="size-4" /> Reopen
            </Button>
          </>
        )}
        <Button size="sm" variant="outline" onClick={ask} disabled={start.isPending}>
          <Plus className="size-4" /> New question
        </Button>
        <Button size="sm" variant="ghost" onClick={() => end.mutate()} disabled={end.isPending}>
          <X className="size-4" /> Dismiss
        </Button>
      </div>
      {!isOpen && !poll.correctUci ? (
        <p className="text-xs text-app-muted">Tip: tick a move to mark it as the answer before revealing.</p>
      ) : null}
    </div>
  );
}
