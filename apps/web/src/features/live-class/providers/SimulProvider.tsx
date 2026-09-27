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
  decodeLiveSimul,
  LIVE_CLASS_SIMUL_TOPIC,
  SIMUL_END_REASON_LABELS,
  type LiveSimul,
  type LiveSimulGame
} from "@nexa-chess/types";
import { useQueryClient } from "@tanstack/react-query";
import { playSound } from "@/features/chessboard/audio/sounds";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import { mergeSimulGame, useLiveSimulState } from "../hooks/useLiveSimul";

type SimulContextValue = {
  classId: string;
  simul: LiveSimul | null;
  /** Coach-owner or admin — plays every board. */
  isManager: boolean;
  /** The student's own game, if they are playing. */
  myGame: LiveSimulGame | null;
  /** Boards waiting on the coach. */
  coachToMove: number;
  coachOpen: boolean;
  setCoachOpen: (open: boolean) => void;
  startOpen: boolean;
  setStartOpen: (open: boolean) => void;
  studentOpen: boolean;
  setStudentOpen: (open: boolean) => void;
  focusedGameId: string | null;
  setFocusedGameId: (id: string | null) => void;
  /** Coach: open the simul view on one board. */
  focusGame: (id: string) => void;
};

const SimulContext = createContext<SimulContextValue | null>(null);

export function useSimul(): SimulContextValue {
  const ctx = useContext(SimulContext);
  if (!ctx) throw new Error("useSimul must be used inside <SimulProvider>.");
  return ctx;
}

export function useOptionalSimul(): SimulContextValue | null {
  return useContext(SimulContext);
}

function resultMessage(game: LiveSimulGame, forCoach: boolean): string {
  const reason = game.endReason ? SIMUL_END_REASON_LABELS[game.endReason] : "";
  if (!game.result) return "The game was not finished.";
  if (game.result === "DRAW") return `Draw — ${reason.toLowerCase()}.`;
  const coachWon = game.result === "COACH_WON";
  if (forCoach) return `${coachWon ? "You beat" : "You lost to"} ${game.studentName} — ${reason.toLowerCase()}.`;
  return `${coachWon ? "Your coach won" : "You won!"} — ${reason.toLowerCase()}.`;
}

/**
 * Simul state for the meeting room. Seeds from `GET /live-class/:id/simul` and
 * applies the API's `live_class_simul` packets on top. Must render inside
 * `<LiveKitRoom>`.
 */
export function SimulProvider({ classId, children }: { classId: string; children: ReactNode }) {
  const qc = useQueryClient();
  const toast = useToast();
  const user = useAuthStore((state) => state.user);
  const isManager = user?.role === "COACH" || isStaffRole(user?.role);

  const state = useLiveSimulState(classId);
  const simul = state.data?.simul ?? null;
  const myGame = useMemo(
    () => (!isManager && simul ? simul.games.find((g) => g.studentId === user?.id) ?? null : null),
    [isManager, simul, user?.id]
  );
  const coachToMove = useMemo(
    () =>
      isManager && simul?.status === "ACTIVE"
        ? simul.games.filter((g) => g.turn === "COACH").length
        : 0,
    [isManager, simul]
  );

  const [coachOpen, setCoachOpen] = useState(false);
  const [startOpen, setStartOpen] = useState(false);
  const [studentOpen, setStudentOpen] = useState(false);
  const [focusedGameId, setFocusedGameId] = useState<string | null>(null);
  const studentOpenRef = useRef(studentOpen);
  studentOpenRef.current = studentOpen;

  const focusGame = useCallback((id: string) => {
    setFocusedGameId(id);
    setCoachOpen(true);
  }, []);

  // Put a student straight onto their board when a simul that includes them starts.
  const seenSimulId = useRef<string | null>(null);
  useEffect(() => {
    if (isManager || !simul || !myGame || seenSimulId.current === simul.id) return;
    seenSimulId.current = simul.id;
    if (simul.status === "ACTIVE" && myGame.status === "ONGOING") setStudentOpen(true);
  }, [isManager, simul, myGame]);

  const openStudentBoard = useCallback(() => setStudentOpen(true), []);

  const onStudentGame = useCallback(
    (game: LiveSimulGame, previous: LiveSimulGame) => {
      const last = game.moves[game.moves.length - 1];
      if (game.ply > previous.ply && last?.by === "COACH") {
        playSound("move");
        if (!studentOpenRef.current && game.turn === "STUDENT") {
          toast.info({
            title: `Your coach played ${last.san}`,
            message: "It's your move.",
            action: { label: "Open board", onClick: openStudentBoard }
          });
        }
      }
      if (game.drawOfferedBy === "COACH" && previous.drawOfferedBy !== "COACH") {
        toast.info({
          title: "Your coach offers a draw",
          action: { label: "Open board", onClick: openStudentBoard }
        });
      }
      if (game.status === "FINISHED" && previous.status === "ONGOING") {
        playSound("gameEnd");
        toast.info({ title: "Game over", message: resultMessage(game, false) });
      }
    },
    [toast, openStudentBoard]
  );

  const onCoachGame = useCallback(
    (game: LiveSimulGame, previous: LiveSimulGame) => {
      if (game.drawOfferedBy === "STUDENT" && previous.drawOfferedBy !== "STUDENT") {
        toast.info({
          title: `${game.studentName} offers a draw`,
          action: { label: "Go to board", onClick: () => focusGame(game.id) }
        });
      }
      const studentEnded =
        game.result === "STUDENT_WON" ||
        (game.endReason === "RESIGNATION" && game.result === "COACH_WON") ||
        (game.endReason === "DRAW_AGREED" && previous.drawOfferedBy === "COACH");
      if (game.status === "FINISHED" && previous.status === "ONGOING" && studentEnded) {
        toast.info({ title: "Board finished", message: resultMessage(game, true) });
      }
    },
    [toast, focusGame]
  );

  const onMessage = useCallback(
    (msg: { payload: Uint8Array }) => {
      const decoded = decodeLiveSimul(msg.payload);
      if (!decoded) return;
      if (decoded.type !== "SIMUL_GAME") {
        void qc.invalidateQueries({ queryKey: queryKeys.liveSimul.state(classId) });
        if (decoded.type === "SIMUL_ENDED" && !isManager && myGame) {
          toast.info({ title: "The simul has ended", message: "Thanks for playing!" });
        }
        return;
      }
      const { game } = decoded;
      if (!isManager && game.studentId !== user?.id) return;
      const merged = mergeSimulGame(qc, classId, game);
      if (!merged) {
        // A board we don't hold yet (added player, missed start) — resync.
        if (isManager) void qc.invalidateQueries({ queryKey: queryKeys.liveSimul.state(classId) });
        return;
      }
      if (isManager) onCoachGame(game, merged.previous);
      else onStudentGame(game, merged.previous);
    },
    [qc, classId, isManager, myGame, user?.id, toast, onCoachGame, onStudentGame]
  );

  useDataChannel(LIVE_CLASS_SIMUL_TOPIC, onMessage);

  const value = useMemo<SimulContextValue>(
    () => ({
      classId,
      coachOpen,
      coachToMove,
      focusGame,
      focusedGameId,
      isManager,
      myGame,
      setCoachOpen,
      setFocusedGameId,
      setStartOpen,
      setStudentOpen,
      simul,
      startOpen,
      studentOpen
    }),
    [classId, coachOpen, coachToMove, focusGame, focusedGameId, isManager, myGame, simul, startOpen, studentOpen]
  );

  return <SimulContext.Provider value={value}>{children}</SimulContext.Provider>;
}
