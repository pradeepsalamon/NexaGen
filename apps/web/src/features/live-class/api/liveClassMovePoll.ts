import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type AnswerLiveMovePollRequest,
  type LiveMovePollStateResponse,
  type StartLiveMovePollRequest,
  type UpdateLiveMovePollRequest
} from "@nexa-chess/types";

export const getLiveMovePoll = (classId: string): Promise<LiveMovePollStateResponse> =>
  apiFetch<LiveMovePollStateResponse>(API_ROUTES.liveClass.movePoll(classId));

export const startLiveMovePoll = (
  classId: string,
  body: StartLiveMovePollRequest
): Promise<LiveMovePollStateResponse> =>
  apiFetch<LiveMovePollStateResponse>(API_ROUTES.liveClass.movePoll(classId), { method: "POST", body });

export const updateLiveMovePoll = (
  classId: string,
  body: UpdateLiveMovePollRequest
): Promise<LiveMovePollStateResponse> =>
  apiFetch<LiveMovePollStateResponse>(API_ROUTES.liveClass.movePoll(classId), { method: "PATCH", body });

export const endLiveMovePoll = (classId: string): Promise<LiveMovePollStateResponse> =>
  apiFetch<LiveMovePollStateResponse>(API_ROUTES.liveClass.movePoll(classId), { method: "DELETE" });

export const answerLiveMovePoll = (
  classId: string,
  body: AnswerLiveMovePollRequest
): Promise<LiveMovePollStateResponse> =>
  apiFetch<LiveMovePollStateResponse>(API_ROUTES.liveClass.movePollAnswer(classId), {
    method: "POST",
    body
  });
