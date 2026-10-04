"use client";

import { useEffect, useState } from "react";
import { Flag, Handshake, Swords, Trophy } from "lucide-react";
import type { LiveMatchGame, MatchColor } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { PracticeBoard, type PracticeBoardMove } from "@/features/chessboard/components/board/PracticeBoard";
import { cn } from "@/lib/utils";
import {
  useChallengeLiveMatch,
  useLiveMatchAction,
  useLiveMatchMove,
  useRespondLiveMatchChallenge
} from "../../../hooks/useLiveMatch";
import { matchResultText, useMatch } from "../../../providers/MatchProvider";
import { SimulMoveList } from "../simul/SimulMoveList";
import { MatchClock } from "./MatchClock";

function PlayerRow({ name, game, color, onFlag }: { name: string; game: LiveMatchGame; color: MatchColor; onFlag: () => void }) {
  const toMove = game.status === "ONGOING" && game.turn === color;
  return (
    <div className="flex w-full items-center justify-between gap-2">
      <span className={cn("flex min-w-0 items-center gap-2 text-sm", toMove ? "font-semibold text-app-text" : "text-app-muted")}>
        <span
          className={cn("size-3 shrink-0 rounded-full border border-app-border", color === "white" ? "bg-white" : "bg-neutral-900")}
          aria-hidden="true"
        />
        <span className="truncate">{name}</span>
      </span>
      <MatchClock game={game} color={color} onFlag={onFlag} />
    </div>
  );
}

function MatchBoard({ game }: { game: LiveMatchGame }) {
  const { classId, myId, round } = useMatch();
  const move = useLiveMatchMove(classId);
  const action = useLiveMatchAction(classId);
  const [confirmResign, setConfirmResign] = useState(false);

  const myColor: MatchColor = game.white.id === myId ? "white" : "black";
  const theirColor: MatchColor = myColor === "white" ? "black" : "white";
  const opponent = myColor === "white" ? game.black : game.white;
  const ongoing = round?.status === "ACTIVE" && game.status === "ONGOING";
  const last = game.moves[game.moves.length - 1];
  const act = (body: Parameters<typeof action.mutate>[0]["body"]) => action.mutate({ game, body });
  const claimTimeout = () => act({ action: "CLAIM_TIMEOUT" });

  const onMove = (m: PracticeBoardMove) => move.mutate({ game, uci: m.uci, san: m.san, fen: m.fen });

  return (
    <div className="space-y-3">
      <div
        className={cn(
          "rounded-app border px-3 py-2 text-sm font-semibold",
          !ongoing
            ? "border-primary/40 bg-primary/10 text-primary-ink"
            : game.turn === myColor
              ? "border-success/40 bg-success/10 text-success-ink"
              : "border-app-border bg-app-soft text-app-muted"
        )}
        role="status"
        aria-live="polite"
      >
        {!ongoing
          ? game.status === "FINISHED"
            ? matchResultText(game, myId)
            : "The matches have ended."
          : game.turn === myColor
            ? "Your move"
            : `${opponent.name} is thinking…`}
      </div>

      <div className="mx-auto flex max-w-[min(440px,64dvh)] flex-col items-center gap-2">
        <PlayerRow name={opponent.name} game={game} color={theirColor} onFlag={claimTimeout} />
        <PracticeBoard
          fen={game.fen}
          orientation={myColor}
          playerColor={myColor}
          interactive={ongoing && game.turn === myColor && !move.isPending}
          lastMove={last ? [last.uci.slice(0, 2), last.uci.slice(2, 4)] : null}
          onMove={onMove}
          resetKey={game.ply}
        />
        <PlayerRow name="You" game={game} color={myColor} onFlag={claimTimeout} />
      </div>

      {ongoing && game.drawOfferedBy === theirColor ? (
        <div className="flex flex-wrap items-center gap-2 rounded-app border border-info/40 bg-info/10 p-2 text-sm text-info-ink">
          <Handshake className="size-4" />
          {opponent.name} offers a draw.
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
            {game.drawOfferedBy === myColor ? "Draw offered" : "Offer draw"}
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
        blackStarts={game.startFen.split(" ")[1] === "b"}
        className="max-h-36 rounded-app border border-app-border p-2"
      />
    </div>
  );
}

function Lobby() {
  const { classId, myId, round, incoming } = useMatch();
  const challenge = useChallengeLiveMatch(classId);
  const respond = useRespondLiveMatchChallenge(classId);
  if (!round) return null;

  const active = round.status === "ACTIVE";
  const choosing = active && round.pairingMode === "STUDENT_CHOICE";
  const outgoing = round.challenges.filter((c) => c.from.id === myId);
  const challenged = new Set(outgoing.map((c) => c.to.id));
  const opponents = round.players.filter((p) => p.studentId !== myId && p.inClass);
  const me = round.players.find((p) => p.studentId === myId);
  const busy = respond.isPending || challenge.isPending;

  return (
    <div className="space-y-4">
      {!active ? (
        <p className="rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">The matches have ended.</p>
      ) : !choosing ? (
        <p className="rounded-app border border-app-border bg-app-soft p-3 text-sm text-app-muted">
          {"Your coach is pairing players. You'll be put on a board as soon as you're paired."}
        </p>
      ) : null}

      {incoming.length > 0 ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-app-text">Challenges for you</h3>
          {incoming.map((c) => (
            <div key={c.id} className="flex items-center gap-2 rounded-app border border-info/40 bg-info/10 p-2 text-sm">
              <Swords className="size-4 text-info-ink" />
              <span className="min-w-0 flex-1 truncate font-medium text-info-ink">{c.from.name}</span>
              <Button size="sm" disabled={busy} onClick={() => respond.mutate({ action: "ACCEPT", challengeId: c.id })}>
                Accept
              </Button>
              <Button size="sm" variant="outline" disabled={busy} onClick={() => respond.mutate({ action: "DECLINE", challengeId: c.id })}>
                Decline
              </Button>
            </div>
          ))}
        </section>
      ) : null}

      {choosing ? (
        <section className="space-y-2">
          <h3 className="text-sm font-semibold text-app-text">Choose your opponent</h3>
          {opponents.length === 0 ? (
            <p className="text-sm text-app-muted">No classmates are in the room yet.</p>
          ) : (
            <ul className="max-h-64 space-y-1 overflow-y-auto">
              {opponents.map((p) => {
                const sent = outgoing.find((c) => c.to.id === p.studentId);
                return (
                  <li key={p.studentId} className="flex items-center gap-2 rounded-app border border-app-border px-2 py-1.5">
                    <span className="min-w-0 flex-1 truncate text-sm font-medium text-app-text">{p.name}</span>
                    {p.played > 0 ? <span className="text-xs text-app-muted">{p.points} pts</span> : null}
                    {p.gameId ? (
                      <Badge variant="secondary">Playing</Badge>
                    ) : sent ? (
                      <Button size="sm" variant="ghost" disabled={busy} onClick={() => respond.mutate({ action: "CANCEL", challengeId: sent.id })}>
                        Cancel challenge
                      </Button>
                    ) : (
                      <Button size="sm" variant="outline" disabled={busy || challenged.has(p.studentId)} onClick={() => challenge.mutate(p.studentId)}>
                        <Swords className="mr-1.5 size-4" />
                        Challenge
                      </Button>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
      ) : null}

      {me && me.played > 0 ? (
        <p className="flex items-center gap-2 text-sm text-app-muted">
          <Trophy className="size-4" />
          Your score: <span className="font-semibold text-app-text">{me.points}</span> / {me.played}
        </p>
      ) : null}
    </div>
  );
}

/** The student's match: their board while playing, otherwise the challenge lobby. */
export function MatchStudentView() {
  const { round, myGame, studentOpen, setStudentOpen } = useMatch();
  const [lobby, setLobby] = useState(false);

  useEffect(() => setLobby(false), [myGame?.id]);

  if (!round) return null;
  const ongoing = myGame?.status === "ONGOING";
  const showBoard = !!myGame && (ongoing || !lobby);

  return (
    <Dialog open={studentOpen} onOpenChange={setStudentOpen}>
      {/* No backdrop blur: blurring over live <video> flashes black on mobile GPUs. */}
      <DialogContent className="max-h-[94dvh] max-w-lg overflow-y-auto" overlayClassName="bg-black/60 backdrop-blur-none">
        <DialogHeader>
          <DialogTitle>
            {showBoard && myGame
              ? `${myGame.white.name} vs ${myGame.black.name}`
              : "Student matches"}
          </DialogTitle>
        </DialogHeader>
        {showBoard && myGame ? (
          <>
            <MatchBoard game={myGame} />
            {!ongoing && round.status === "ACTIVE" ? (
              <Button className="mt-3 w-full" variant="outline" onClick={() => setLobby(true)}>
                {round.pairingMode === "STUDENT_CHOICE" ? "Find a new opponent" : "Back to the lobby"}
              </Button>
            ) : null}
          </>
        ) : (
          <Lobby />
        )}
      </DialogContent>
    </Dialog>
  );
}
