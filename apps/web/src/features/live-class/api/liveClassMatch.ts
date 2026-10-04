import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type LiveMatchChallengeRequest,
  type LiveMatchChallengeResponseRequest,
  type LiveMatchGameActionRequest,
  type LiveMatchGameResponse,
  type LiveMatchMoveRequest,
  type LiveMatchPairRequest,
  type LiveMatchStateResponse,
  type StartLiveMatchRoundRequest,
  type UpdateLiveMatchRoundRequest
} from "@nexa-chess/types";

export const getLiveMatch = (classId: string): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchRound(classId));

export const startLiveMatch = (
  classId: string,
  body: StartLiveMatchRoundRequest
): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchRound(classId), { method: "POST", body });

export const updateLiveMatch = (
  classId: string,
  body: UpdateLiveMatchRoundRequest
): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchRound(classId), { method: "PATCH", body });

export const endLiveMatch = (classId: string): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchRound(classId), { method: "DELETE" });

export const pairLiveMatch = (classId: string, body: LiveMatchPairRequest): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchPairs(classId), { method: "POST", body });

export const challengeLiveMatch = (
  classId: string,
  body: LiveMatchChallengeRequest
): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchChallenges(classId), { method: "POST", body });

export const respondLiveMatchChallenge = (
  classId: string,
  challengeId: string,
  body: LiveMatchChallengeResponseRequest
): Promise<LiveMatchStateResponse> =>
  apiFetch<LiveMatchStateResponse>(API_ROUTES.liveClass.matchChallenge(classId, challengeId), {
    method: "PATCH",
    body
  });

export const playLiveMatchMove = (
  classId: string,
  gameId: string,
  body: LiveMatchMoveRequest
): Promise<LiveMatchGameResponse> =>
  apiFetch<LiveMatchGameResponse>(API_ROUTES.liveClass.matchMove(classId, gameId), { method: "POST", body });

export const liveMatchGameAction = (
  classId: string,
  gameId: string,
  body: LiveMatchGameActionRequest
): Promise<LiveMatchGameResponse> =>
  apiFetch<LiveMatchGameResponse>(API_ROUTES.liveClass.matchGameAction(classId, gameId), {
    method: "POST",
    body
  });
