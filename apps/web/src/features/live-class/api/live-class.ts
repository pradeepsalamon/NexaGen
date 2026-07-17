import { apiFetch } from "@/lib/api";
import { API_ROUTES } from "@nexa-gen/types";
import { CoachClass, LiveSession, LiveKitTokenResponse, ParticipantInfo } from "../types/live-class";

export const getLiveClass = (roomId: string): Promise<CoachClass> => {
  return apiFetch<CoachClass>(API_ROUTES.liveClass.get(roomId));
};

export const startLiveClass = (roomId: string): Promise<{ liveSession: LiveSession }> => {
  return apiFetch<{ liveSession: LiveSession }>(API_ROUTES.liveClass.start(roomId), { method: "POST" });
};

export const endLiveClass = (roomId: string): Promise<void> => {
  return apiFetch<void>(API_ROUTES.liveClass.end(roomId), { method: "POST" });
};

export const getLiveClassToken = (roomId: string): Promise<LiveKitTokenResponse> => {
  return apiFetch<LiveKitTokenResponse>(API_ROUTES.liveClass.token(roomId), { method: "POST" });
};

export const getLiveClassParticipants = (roomId: string): Promise<{ participants: ParticipantInfo[] }> => {
  return apiFetch<{ participants: ParticipantInfo[] }>(API_ROUTES.liveClass.participants(roomId));
};
