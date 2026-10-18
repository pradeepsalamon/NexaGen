"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode
} from "react";
import { useDataChannel } from "@livekit/components-react";
import {
  decodeLiveMatch,
  LIVE_CLASS_MATCH_TOPIC,
  MATCH_END_REASON_LABELS,
  type LiveMatchChallenge,
  type LiveMatchGame,
  type LiveMatchRound
} from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { playSound } from "@/features/chessboard/audio/sounds";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { mergeMatchGame, useLiveMatchState } from "../hooks/useLiveMatch";

type MatchContextValue = {
  classId: string;
  round: LiveMatchRound | null;
  /** Coach-owner or admin — pairs students and watches every board. */
  isManager: boolean;
  myId: string | null;
  /** The student's current (or most recent) game this round. */
  myGame: LiveMatchGame | null;
  /** Challenges waiting on this student's answer. */
  incoming: LiveMatchChallenge[];
  coachOpen: boolean;
  setCoachOpen: (open: boolean) => void;
  startOpen: boolean;
  setStartOpen: (open: boolean) => void;
  studentOpen: boolean;
  setStudentOpen: (open: boolean) => void;
  focusedGameId: string | null;
  setFocusedGameId: (id: string | null) => void;
};

const MatchContext = createContext<MatchContextValue | null>(null);

export function useMatch(): MatchContextValue {
  const ctx = useContext(MatchContext);
  if (!ctx) throw new Error("useMatch must be used inside <MatchProvider>.");
  return ctx;
}

export function useOptionalMatch(): MatchContextValue | null {
  return useContext(MatchContext);
}

export function matchResultText(game: LiveMatchGame, viewerId?: string | null): string {
  const reason = game.endReason ? MATCH_END_REASON_LABELS[game.endReason] : "";
  if (!game.result) return game.endReason === "ABORTED" ? "Game aborted" : "Not finished";
  if (game.result === "DRAW") return `Draw · ${reason}`;
  const winner = game.result === "WHITE_WON" ? game.white : game.black;
  if (viewerId && (game.white.id === viewerId || game.black.id === viewerId)) {
    return `${winner.id === viewerId ? "You won!" : "You lost"} · ${reason}`;
  }
  return `${winner.name} won · ${reason}`;
}

/**
 * Student-match state for the meeting room. Seeds from
 * `GET /live-class/:id/matches` and applies the API's `live_class_match`
 * packets on top. Must render inside `<LiveKitRoom>`.
 */
export function MatchProvider({ classId, children }: { classId: string; children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);
  const myId = user?.id ?? null;
  const isManager = user?.role === "COACH" || isStaffRole(user?.role);

  const state = useLiveMatchState(classId);
  const round = state.data?.round ?? null;

  const myGame = useMemo(() => {
    if (isManager || !round || !myId) return null;
    const mine = round.games.filter((g) => g.white.id === myId || g.black.id === myId);
    return mine.find((g) => g.status === "ONGOING") ?? mine[mine.length - 1] ?? null;
  }, [isManager, round, myId]);

  const incoming = useMemo(
    () => (round?.status === "ACTIVE" && myId ? round.challenges.filter((c) => c.to.id === myId) : []),
    [round, myId]
  );

  const [coachOpen, setCoachOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [focusedGameId, setFocusedGameId] = useState<string | null>(null);
  const studentOpenRef = useRef(studentOpen);
  studentOpenRef.current = studentOpen;
  const openStudent = useCallback(() => setStudentOpen(true), []);

  // A new round, or a new game for this student: put them on the board.
  const seenRoundId = useRef<string | null>(null);
  const seenGameId = useRef<string | null>(null);
  useEffect(() => {
    if (isManager || !round || round.status !== "ACTIVE") return;
    if (seenRoundId.current !== round.id) {
      seenRoundId.current = round.id;
      if (!myGame) {
        toast.info({
          title: "Student matches started",
          message: round.pairingMode === "STUDENT_CHOICE" ? "Pick a classmate to play." : "Waiting to be paired.",
          action: { label: "Open", onClick: openStudent }
        });
        if (round.pairingMode === "STUDENT_CHOICE") setStudentOpen(true);
      }
    }
    if (myGame && myGame.status === "ONGOING" && seenGameId.current !== myGame.id) {
      seenGameId.current = myGame.id;
      const opponent = myGame.white.id === myId ? myGame.black : myGame.white;
      const color = myGame.white.id === myId ? "White" : "Black";
      toast.info({ title: `You're playing ${opponent.name}`, message: `You have ${color}.` });
      setStudentOpen(true);
    }
  }, [isManager, round, myGame, myId, toast, openStudent]);

  // A new incoming challenge.
  const seenChallenges = useRef<Set<string>>(new Set());
  useEffect(() => {
    for (const c of incoming) {
      if (seenChallenges.current.has(c.id)) continue;
      seenChallenges.current.add(c.id);
      if (!studentOpenRef.current) {
        toast.info({
          title: `${c.from.name} challenges you`,
          action: { label: "Answer", onClick: openStudent }
        });
      }
    }
  }, [incoming, toast, openStudent]);

  const onMyGame = useCallback(
    (game: LiveMatchGame, previous: LiveMatchGame) => {
      const myColor = game.white.id === myId ? "white" : "black";
      if (game.ply > previous.ply && game.turn === myColor) {
        playSound("move");
        if (!studentOpenRef.current) {
          toast.info({
            title: `Your opponent played ${game.moves[game.moves.length - 1]?.san ?? "a move"}`,
            message: "It's your move.",
            action: { label: "Open board", onClick: openStudent }
          });
        }
      }
      if (game.drawOfferedBy && game.drawOfferedBy !== myColor && previous.drawOfferedBy !== game.drawOfferedBy) {
        toast.info({ title: "Your opponent offers a draw", action: { label: "Open board", onClick: openStudent } });
      }
      if (game.status === "FINISHED" && previous.status === "ONGOING") {
        playSound("gameEnd");
        toast.info({ title: "Game over", message: matchResultText(game, myId) });
      }
    },
    [myId, toast, openStudent]
  );

  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Only the API sends these; a participant-sent packet is ignored.
      if (msg.from) return;
      const decoded = decodeLiveMatch(msg.payload);
      if (!decoded) return;
      if (decoded.type !== "MATCH_GAME") {
        void qc.invalidateQueries({ queryKey: queryKeys.liveMatch.state(classId) });
        if (decoded.type === "ROUND_ENDED" && !isManager && myGame) {
          toast.info({ title: "Student matches have ended", message: "Thanks for playing!" });
        }
        return;
      }
      const { game } = decoded;
      const isMine = game.white.id === myId || game.black.id === myId;
      if (!isManager && !isMine) return;
      const merged = mergeMatchGame(qc, classId, game);
      if (!merged) {
        // A board we don't hold yet — resync.
        void qc.invalidateQueries({ queryKey: queryKeys.liveMatch.state(classId) });
        return;
      }
      if (isMine) onMyGame(game, merged.previous);
    },
    [qc, classId, isManager, myGame, myId, toast, onMyGame]
  );

  useDataChannel(LIVE_CLASS_MATCH_TOPIC, onMessage);

  const value = useMemo<MatchContextValue>(
    () => ({
      classId,
      coachOpen,
      focusedGameId,
      incoming,
      isManager,
      myGame,
      myId,
      round,
      setCoachOpen,
      setFocusedGameId,
      setStartOpen,
      setStudentOpen,
      startOpen,
      studentOpen
    }),
    [classId, coachOpen, focusedGameId, incoming, isManager, myGame, myId, round, startOpen, studentOpen]
  );

  return <MatchContext.Provider value={value}>{children}</MatchContext.Provider>;
}
