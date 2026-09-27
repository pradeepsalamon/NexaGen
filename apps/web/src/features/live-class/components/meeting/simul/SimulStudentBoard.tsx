"use client";

import { useState } from "react";
import { Flag, Handshake, Loader2 } from "lucide-react";
import { SIMUL_END_REASON_LABELS, type LiveSimulGame } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { cn } from "@/lib/utils";
import { useLiveSimulAction, useLiveSimulMove } from "../../../hooks/useLiveSimul";
import { useSimul } from "../../../providers/SimulProvider";
import { SimulMoveList } from "./SimulMoveList";

function statusLine(game: LiveSimulGame, simulActive: boolean): { text: string; tone: "turn" | "wait" | "done" } {
  if (game.status === "FINISHED") {
    const reason = game.endReason ? SIMUL_END_REASON_LABELS[game.endReason] : "";
    if (!game.result) return { text: "The simul ended before this game finished.", tone: "done" };
    if (game.result === "DRAW") return { text: `Draw · ${reason}`, tone: "done" };
    return {
      text: `${game.result === "STUDENT_WON" ? "You won!" : "Your coach won"} · ${reason}`,
      tone: "done"
    };
  }
  if (!simulActive) return { text: "The simul has ended.", tone: "done" };
  return game.turn === "STUDENT"
    ? { text: "Your move", tone: "turn" }
    : { text: "Your coach is playing the other boards…", tone: "wait" };
}

/** The student's one simul game. Rendered once in the meeting room. */
export function SimulStudentBoard() {
  const { classId, simul, myGame, studentOpen, setStudentOpen } = useSimul();
  const move = useLiveSimulMove(classId, "STUDENT");
  const action = useLiveSimulAction(classId);
  const [confirmResign, setConfirmResign] = useState(false);

  if (!simul || !myGame) return null;
  const game = myGame;
  const active = simul.status === "ACTIVE";
  const ongoing = active && game.status === "ONGOING";
  const myColor = game.coachColor === "white" ? "black" : "white";
  const last = game.moves[game.moves.length - 1];
  const status = statusLine(game, active);

  const onMove = (m: PracticeBoardMove) => {
    move.mutate({ game, uci: m.uci, san: m.san, fen: m.fen });
  };
  const act = (body: Parameters<typeof action.mutate>[0]["body"]) => action.mutate({ game, body });

  return (
    <Dialog open={studentOpen} onOpenChange={setStudentOpen}>
      {/* No backdrop blur: blurring over live <video> flashes black on mobile GPUs. */}
      <DialogContent className="max-h-[94dvh] max-w-lg overflow-y-auto" overlayClassName="bg-black/60 backdrop-blur-none">
        <DialogHeader>
          <DialogTitle>Simul vs your coach</DialogTitle>
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
            {status.tone === "wait" ? <Loader2 className="size-4 animate-spin" /> : null}
            {status.text}
            <span className="ml-auto text-xs font-medium text-app-muted">
              You play {myColor === "white" ? "White" : "Black"}
            </span>
          </div>

          <div className="flex justify-center">
            <PracticeBoard
              fen={game.fen}
              orientation={myColor}
              playerColor={myColor}
              interactive={ongoing && game.turn === "STUDENT" && !move.isPending}
              lastMove={last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null}
              onMove={onMove}
              resetKey={game.ply}
              className="max-w-[min(440px,70dvh)]"
            />
          </div>

          {ongoing && game.drawOfferedBy === "COACH" ? (
            <div className="flex flex-wrap items-center gap-2 rounded-app border border-info/40 bg-info/10 p-2 text-sm text-info-ink">
              <Handshake className="size-4" />
              Your coach offers a draw.
              <div className="ml-auto flex gap-2">
                <Button size="sm" onClick={() => act({ action: "ACCEPT_DRAW" })} disabled={action.isPending}>
                  Accept
                </Button>
                <Button size="sm" variant="outline" onClick={() => act({ action: "DECLINE_DRAW" })} disabled={action.isPending}>
                  Decline
                </Button>
              </div>
            </div>
          ) : null}

          {ongoing ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                size="sm"
                variant="outline"
                onClick={() => act({ action: "OFFER_DRAW" })}
                disabled={action.isPending || game.drawOfferedBy !== null}
              >
                <Handshake className="mr-1.5 size-4" />
                {game.drawOfferedBy === "STUDENT" ? "Draw offered" : "Offer draw"}
              </Button>
              {confirmResign ? (
                <>
                  <span className="text-sm text-app-muted">Resign this game?</span>
                  <Button
                    size="sm"
                    variant="destructive"
                    onClick={() => {
                      setConfirmResign(false);
                      act({ action: "RESIGN" });
                    }}
                  >
                    Yes, resign
                  </Button>
                  <Button size="sm" variant="ghost" onClick={() => setConfirmResign(false)}>
                    Keep playing
                  </Button>
                </>
              ) : (
                <Button size="sm" variant="ghost" onClick={() => setConfirmResign(true)} disabled={action.isPending}>
                  <Flag className="mr-1.5 size-4" />
                  Resign
                </Button>
              )}
            </div>
          ) : null}

          <SimulMoveList
            moves={game.moves}
            blackStarts={simul.startFen.split(" ")[1] === "b"}
            className="max-h-40 rounded-app border border-app-border p-2"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}
