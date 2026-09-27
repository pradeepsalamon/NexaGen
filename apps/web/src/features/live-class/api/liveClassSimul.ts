import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AddLiveSimulPlayerRequest,
  type LiveSimulEngineMoveRequest,
  type LiveSimulGameActionRequest,
  type LiveSimulGameResponse,
  type LiveSimulMoveRequest,
  type LiveSimulStateResponse,
  type StartLiveSimulRequest
} from "@nexa-chess/types";

export const getLiveSimul = (classId: string): Promise<LiveSimulStateResponse> =>
  apiFetch<LiveSimulStateResponse>(API_ROUTES.liveClass.simul(classId));

export const startLiveSimul = (
  classId: string,
  body: StartLiveSimulRequest
): Promise<LiveSimulStateResponse> =>
  apiFetch<LiveSimulStateResponse>(API_ROUTES.liveClass.simul(classId), { method: "POST", body });

export const endLiveSimul = (classId: string): Promise<LiveSimulStateResponse> =>
  apiFetch<LiveSimulStateResponse>(API_ROUTES.liveClass.simul(classId), { method: "DELETE" });

export const addLiveSimulPlayer = (
  classId: string,
  body: AddLiveSimulPlayerRequest
): Promise<LiveSimulGameResponse> =>
  apiFetch<LiveSimulGameResponse>(API_ROUTES.liveClass.simulPlayers(classId), {
    method: "POST",
    body
  });

export const playLiveSimulMove = (
  classId: string,
  gameId: string,
  body: LiveSimulMoveRequest
): Promise<LiveSimulGameResponse> =>
  apiFetch<LiveSimulGameResponse>(API_ROUTES.liveClass.simulMove(classId, gameId), {
    method: "POST",
    body
  });

export const playLiveSimulEngineMove = (
  classId: string,
  gameId: string,
  body: LiveSimulEngineMoveRequest
): Promise<LiveSimulGameResponse> =>
  apiFetch<LiveSimulGameResponse>(API_ROUTES.liveClass.simulEngineMove(classId, gameId), {
    method: "POST",
    body
  });

export const liveSimulGameAction = (
  classId: string,
  gameId: string,
  body: LiveSimulGameActionRequest
): Promise<LiveSimulGameResponse> =>
  apiFetch<LiveSimulGameResponse>(API_ROUTES.liveClass.simulGameAction(classId, gameId), {
    method: "POST",
    body
  });
