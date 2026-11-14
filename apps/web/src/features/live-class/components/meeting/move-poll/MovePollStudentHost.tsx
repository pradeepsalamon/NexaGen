"use client";

import { useEffect, useRef, useState } from "react";
import { Loader2, MessageCircleQuestion } from "lucide-react";
import { Chess } from "@/lib/chess";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { PracticeBoard } from "@/features/chessboard/components/board/PracticeBoard";
import { cn } from "@/lib/utils";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { useAnswerLiveMovePoll, useLiveMovePollState, useLiveMovePollSync } from "../../../hooks/useLiveMovePoll";
import { MovePollResults } from "./MovePollResults";

function sideToMove(fen: string): "white" | "black" {
  try {
    return new Chess(fen).turn() === "b" ? "black" : "white";
  } catch {
    return "white";
  }
}

const squares = (uci: string | null | undefined) => (uci ? { from: uci.slice(0, 2), to: uci.slice(2, 4) } : null);

/** The student's side of the coach's "what would you play?" question. Rendered once in `MeetingRoom`. */
export function MovePollStudentHost({ classId }: { classId: string }) {
  const role = useAuthStore((state) => state.user?.role);
  if (!role || role === "COACH" || isStaffRole(role)) return null;
  return <StudentMovePoll classId={classId} />;
}

function StudentMovePoll({ classId }: { classId: string }) {
  useLiveMovePollSync(classId, { isManager: false });
  const { data } = useLiveMovePollState(classId);
  const answer = useAnswerLiveMovePoll(classId);
  const poll = data?.poll ?? null;
  const [open, setOpen] = useState(false);

  // Pop the dialog when a question is asked, and again when results are revealed.
  const seen = useRef<string | null>(null);
  const showResults = poll?.status === "CLOSED" && poll.revealed;
  const stage = poll ? `${poll.id}:${poll.status === "OPEN" ? "open" : showResults ? "results" : "closed"}` : null;
  useEffect(() => {
    if (!stage || stage === seen.current) return;
    seen.current = stage;
    if (!stage.endsWith(":closed")) setOpen(true);
  }, [stage]);

  if (!poll) return null;

  const isOpen = poll.status === "OPEN";
  const side = sideToMove(poll.fen);
  const mine = poll.myAnswer;

  let status: { text: string; tone: "turn" | "wait" | "done" };
  if (isOpen) {
    status = mine
      ? { text: `You answered ${mine.san}. You can change it until your coach closes the question.`, tone: "done" }
      : { text: `${side === "white" ? "White" : "Black"} to play. Make your move on the board.`, tone: "turn" };
  } else if (showResults) {
    status = poll.correctSan
      ? {
          text: mine?.uci === poll.correctUci ? `Correct! The answer was ${poll.correctSan}.` : `The answer was ${poll.correctSan}.`,
          tone: mine?.uci === poll.correctUci ? "turn" : "done"
        }
      : { text: "Here's what the class played.", tone: "done" };
  } else {
    status = { text: "Answers are closed. Waiting for your coach…", tone: "wait" };
  }

  return (
    <>
      {!open && (isOpen || showResults) ? (
        <div className="fixed bottom-24 right-4 z-40">
          <SimpleTooltip label={isOpen ? "Answer your coach's question" : "See the results"}>
            <button
              type="button"
              aria-label={isOpen ? "Answer your coach's question" : "See the results"}
              onClick={() => setOpen(true)}
              className={cn(
                "flex size-12 items-center justify-center rounded-full bg-primary text-white shadow-card transition hover:scale-105",
                isOpen && !mine && "animate-pulse"
              )}
            >
              <MessageCircleQuestion className="size-6" strokeWidth={2.5} />
            </button>
          </SimpleTooltip>
        </div>
      ) : null}

      <Dialog open={open} onOpenChange={setOpen}>
        {/* No backdrop blur: blurring over live <video> flashes black on mobile GPUs. */}
        <DialogContent className="max-h-[94dvh] max-w-lg overflow-y-auto" overlayClassName="bg-black/60 backdrop-blur-none">
          <DialogHeader>
            <DialogTitle>{poll.prompt || "What would you play?"}</DialogTitle>
          </DialogHeader>

          <div className="space-y-3">
            <div
              className={cn(
                "flex items-center gap-2 rounded-app border px-3 py-2 text-sm font-semibold",
                status.tone === "turn" && "border-success/40 bg-success/10 text-success-ink",
                status.tone === "wait" && "border-app-border bg-app-soft text-app-muted",
                status.tone === "done" && "border-primary/40 bg-primary/10 text-primary-ink"
              )}
              role="status"
              aria-live="polite"
            >
              {status.tone === "wait" || answer.isPending ? <Loader2 className="size-4 animate-spin" /> : null}
              {status.text}
            </div>

            <div className="flex justify-center">
              <PracticeBoard
                fen={poll.fen}
                orientation={side}
                playerColor={side}
                interactive={isOpen && !answer.isPending}
                hintSquares={squares(showResults && poll.correctUci ? poll.correctUci : mine?.uci)}
                onMove={(m) => answer.mutate(m.uci)}
                resetKey={`${poll.id}:${mine?.uci ?? ""}:${answer.isPending ? 1 : 0}`}
                className="max-w-[min(440px,70dvh)]"
              />
            </div>

            {showResults ? (
              <MovePollResults
                options={poll.options}
                total={poll.answerCount}
                correctUci={poll.correctUci}
                myUci={mine?.uci}
              />
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
