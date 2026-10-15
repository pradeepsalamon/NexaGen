import { useCallback, useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useDataChannel } from "@livekit/components-react";
import {
  decodePuzzleRushMessage,
  LIVE_CLASS_PUZZLE_RUSH_TOPIC,
  rankPuzzleRushStandings,
  type PuzzleRushMode,
  type PuzzleRushStanding,
  type PuzzleRushStateResponse,
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { endPuzzleRush, getPuzzleRush, startPuzzleRush } from "../api/puzzleRush";

type CachedRush = PuzzleRushStateResponse & { skewMs: number };

const withSkew = (res: PuzzleRushStateResponse): CachedRush => ({
  ...res,
  // Server time minus local time, sampled at receipt — every clock counts on it.
  skewMs: Date.parse(res.serverTime) - Date.now(),
});

/** The class's latest Storm / Racer round (shared by the tools and the Interactives provider). */
export function usePuzzleRush(classId: string) {
  const query = useQuery({
    queryKey: queryKeys.puzzleRush.state(classId),
    queryFn: async () => withSkew(await getPuzzleRush(classId)),
    enabled: !!classId,
    // Packets carry the live standings; the poll only heals a dropped one.
    refetchInterval: (q) => {
      const status = q.state.data?.rush?.status;
      return status === "RUNNING" || status === "COUNTDOWN" ? 5_000 : 30_000;
    },
  });
  const rush = query.data?.rush ?? null;
  const skewMs = query.data?.skewMs ?? 0;

  // Refetch the moment a Racer countdown ends (the run is hidden until then)
  // and when the race ends (so the status flips without waiting for the poll).
  const qc = useQueryClient();
  useEffect(() => {
    if (!rush) return;
    const marks = [rush.status === "COUNTDOWN" ? rush.startsAt : null, rush.status !== "ENDED" ? rush.endsAt : null];
    const timers = marks
      .filter((iso): iso is string => !!iso)
      .map((iso) =>
        window.setTimeout(
          () => void qc.invalidateQueries({ queryKey: queryKeys.puzzleRush.state(classId) }),
          Math.max(0, Date.parse(iso) - (Date.now() + skewMs)) + 250,
        ),
      );
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [classId, qc, rush, skewMs]);

  return { ...query, rush, skewMs };
}

/** Merge one player's newer totals into the cached round and re-rank. */
export function mergePuzzleRushStanding(
  data: CachedRush | undefined,
  rushId: string,
  standing: PuzzleRushStanding,
): CachedRush | undefined {
  if (!data?.rush || data.rush.id !== rushId) return data;
  const current = data.rush.standings.find((s) => s.studentId === standing.studentId);
  // A late packet never rewinds anyone.
  if (current && (standing.moves < current.moves || standing.puzzleIndex < current.puzzleIndex)) return data;
  const others = data.rush.standings.filter((s) => s.studentId !== standing.studentId);
  return {
    ...data,
    rush: { ...data.rush, standings: rankPuzzleRushStandings([...others, standing]) },
  };
}

/** Listens to the API's `puzzle_rush` packets. Mount once per room, inside `<LiveKitRoom>`. */
export function usePuzzleRushSync(classId: string) {
  const qc = useQueryClient();
  const onMessage = useCallback(
    (msg: { payload: Uint8Array; from?: unknown }) => {
      // Only the API sends these; a participant-sent packet is ignored.
      if (msg.from) return;
      const decoded = decodePuzzleRushMessage(msg.payload);
      if (!decoded) return;
      const key = queryKeys.puzzleRush.state(classId);
      if (decoded.type === "RUSH_CHANGED") {
        void qc.invalidateQueries({ queryKey: key });
        return;
      }
      qc.setQueryData<CachedRush>(key, (data) => mergePuzzleRushStanding(data, decoded.rushId, decoded.standing));
    },
    [qc, classId],
  );
  useDataChannel(LIVE_CLASS_PUZZLE_RUSH_TOPIC, onMessage);
}

// undo: intentionally excluded — starting or ending a round is a live classroom
// moment broadcast to the room (like sharing a puzzle). Ending early is confirmed.
export function useStartPuzzleRush(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (mode: PuzzleRushMode) => startPuzzleRush(classId, mode),
    onSuccess: (res) => qc.setQueryData(queryKeys.puzzleRush.state(classId), withSkew(res)),
    onError: (error: Error) => toast.error({ title: "Couldn't start", message: error.message }),
  });
}

export function useEndPuzzleRush(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: () => endPuzzleRush(classId),
    onSuccess: (res) => qc.setQueryData(queryKeys.puzzleRush.state(classId), withSkew(res)),
    onError: (error: Error) => toast.error({ title: "Couldn't end the round", message: error.message }),
  });
}

/** Server-corrected "now", re-rendering every `intervalMs` while `active`. */
export function useServerNow(skewMs: number, active: boolean, intervalMs = 200): number {
  const [now, setNow] = useState(() => Date.now() + skewMs);
  useEffect(() => {
    setNow(Date.now() + skewMs);
    if (!active) return;
    const id = window.setInterval(() => setNow(Date.now() + skewMs), intervalMs);
    return () => window.clearInterval(id);
  }, [active, intervalMs, skewMs]);
  return now;
}

/** m:ss from milliseconds (rounded up, so 0:01 shows until the very end). */
export function formatRushClock(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}

/** The viewer's own row in the standings. */
export function useMyStanding(standings: PuzzleRushStanding[] | undefined, userId: string | undefined) {
  return useMemo(
    () => (userId ? (standings ?? []).find((s) => s.studentId === userId) ?? null : null),
    [standings, userId],
  );
}
