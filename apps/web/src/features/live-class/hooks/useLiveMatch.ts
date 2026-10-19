import { useMutation, useQuery, useQueryClient, type QueryClient } from "@tanstack/react-query";
import type {
  LiveMatchChallengeResponseRequest,
  LiveMatchGame,
  LiveMatchGameActionRequest,
  LiveMatchPairRequest,
  LiveMatchStateResponse,
  MatchPairingMode,
  StartLiveMatchRoundRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import {
  challengeLiveMatch,
  endLiveMatch,
  getLiveMatch,
  liveMatchGameAction,
  pairLiveMatch,
  playLiveMatchMove,
  respondLiveMatchChallenge,
  startLiveMatch,
  updateLiveMatch
} from "../api/liveClassMatch";

/** Server clock minus ours, from the last game copy received — clocks count against it. */
let serverSkewMs = 0;
export const matchNow = () => Date.now() + serverSkewMs;
function noteServerTime(game: LiveMatchGame) {
  serverSkewMs = Date.parse(game.serverTime) - Date.now();
}

export function useLiveMatchState(classId: string) {
  return useQuery({
    queryKey: queryKeys.liveMatch.state(classId),
    queryFn: async () => {
      const data = await getLiveMatch(classId);
      const first = data.round?.games[0];
      if (first) noteServerTime(first);
      return data;
    },
    enabled: !!classId,
    // Packets drive updates; the slow poll only heals a dropped one.
    refetchInterval: 20_000
  });
}

/**
 * Merge one game into the cached round. A copy older than what we hold (lower
 * `ply`, or ongoing after we saw it finish) is ignored, so a late packet never
 * rewinds a move. Returns the game it replaced, or null when nothing changed.
 */
export function mergeMatchGame(
  qc: QueryClient,
  classId: string,
  game: LiveMatchGame,
  // An optimistic copy carries the old serverTime; it must not re-skew the clock.
  { fromServer = true }: { fromServer?: boolean } = {}
): { previous: LiveMatchGame } | null {
  let result: { previous: LiveMatchGame } | null = null;
  qc.setQueryData<LiveMatchStateResponse>(queryKeys.liveMatch.state(classId), (old) => {
    if (!old?.round || old.round.id !== game.roundId) return old;
    const index = old.round.games.findIndex((g) => g.id === game.id);
    if (index === -1) return old;
    const current = old.round.games[index];
    if (current.ply > game.ply || (current.status === "FINISHED" && game.status === "ONGOING")) return old;
    result = { previous: current };
    const games = [...old.round.games];
    games[index] = game;
    return { round: { ...old.round, games } };
  });
  if (result && fromServer) noteServerTime(game);
  return result;
}

function useRoundMutation<TVars>(
  classId: string,
  fn: (vars: TVars) => Promise<LiveMatchStateResponse>,
  errorTitle: string
) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: fn,
    onSuccess: (data) => qc.setQueryData(queryKeys.liveMatch.state(classId), data),
    onError: (error: Error) => {
      toast.error({ title: errorTitle, message: error.message });
      void qc.invalidateQueries({ queryKey: queryKeys.liveMatch.state(classId) });
    }
  });
}

// undo: intentionally excluded — starting a round is a mid-class broadcast every
// participant sees at once, same policy as starting a simul.
export function useStartLiveMatch(classId: string) {
  return useRoundMutation(
    classId,
    (body: StartLiveMatchRoundRequest) => startLiveMatch(classId, body),
    "Couldn't start the matches"
  );
}

// undo: intentionally excluded — same reasoning as useStartLiveMatch.
export function useUpdateLiveMatchMode(classId: string) {
  return useRoundMutation(
    classId,
    (pairingMode: MatchPairingMode) => updateLiveMatch(classId, { pairingMode }),
    "Couldn't change the pairing"
  );
}

// undo: intentionally excluded — same reasoning as useStartLiveMatch.
export function useEndLiveMatch(classId: string) {
  return useRoundMutation(classId, () => endLiveMatch(classId), "Couldn't end the matches");
}

// undo: intentionally excluded — paired students are dropped straight into a game.
export function usePairLiveMatch(classId: string) {
  return useRoundMutation(
    classId,
    (body: LiveMatchPairRequest) => pairLiveMatch(classId, body),
    "Couldn't pair those students"
  );
}

// undo: intentionally excluded — a challenge can be cancelled from the same panel.
export function useChallengeLiveMatch(classId: string) {
  return useRoundMutation(
    classId,
    (opponentId: string) => challengeLiveMatch(classId, { opponentId }),
    "Couldn't send the challenge"
  );
}

// undo: intentionally excluded — accepting starts a game the opponent sees at once.
export function useRespondLiveMatchChallenge(classId: string) {
  return useRoundMutation(
    classId,
    ({ challengeId, action }: { challengeId: string } & LiveMatchChallengeResponseRequest) =>
      respondLiveMatchChallenge(classId, challengeId, { action }),
    "Couldn't answer the challenge"
  );
}

type MoveVars = { game: LiveMatchGame; uci: string; san: string; fen: string };

// undo: intentionally excluded — a chess move is never taken back.
export function useLiveMatchMove(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ game, uci }: MoveVars) => playLiveMatchMove(classId, game.id, { uci, ply: game.ply }),
    onMutate: ({ game, uci, san, fen }) => {
      mergeMatchGame(qc, classId, {
        ...game,
        drawOfferedBy: null,
        fen,
        moves: [...game.moves, { san, uci }],
        ply: game.ply + 1,
        turn: game.turn === "white" ? "black" : "white",
        turnSince: new Date(matchNow()).toISOString()
      }, { fromServer: false });
    },
    onSuccess: (data) => mergeMatchGame(qc, classId, data.game),
    onError: (error: Error) => {
      toast.error({ title: "Move not played", message: error.message });
      void qc.invalidateQueries({ queryKey: queryKeys.liveMatch.state(classId) });
    }
  });
}

// undo: intentionally excluded — resign / draw / adjudication end a game the
// opponent sees immediately.
export function useLiveMatchAction(classId: string) {
  const qc = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ game, body }: { game: LiveMatchGame; body: LiveMatchGameActionRequest }) =>
      liveMatchGameAction(classId, game.id, body),
    onSuccess: (data) => mergeMatchGame(qc, classId, data.game),
    onError: (error: Error, { body }) => {
      // A timeout claim racing the opponent's move is expected; stay quiet.
      if (body.action !== "CLAIM_TIMEOUT") {
        toast.error({ title: "Couldn't update the game", message: error.message });
      }
      void qc.invalidateQueries({ queryKey: queryKeys.liveMatch.state(classId) });
    }
  });
}
