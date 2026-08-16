import { apiFetch } from "@/lib/api";
import { API_ROUTES } from "@nexa-chess/types";
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

export const getLiveClassToken = (roomId: string, clientId?: string): Promise<LiveKitTokenResponse> => {
  const url = API_ROUTES.liveClass.token(roomId) + (clientId ? `?clientId=${clientId}` : "");
  return apiFetch<LiveKitTokenResponse>(url, { method: "POST" });
};

export const getLiveClassParticipants = (roomId: string): Promise<{ participants: ParticipantInfo[] }> => {
  return apiFetch<{ participants: ParticipantInfo[] }>(API_ROUTES.liveClass.participants(roomId));
};

export const getChatHistory = (roomId: string): Promise<any[]> => {
  return apiFetch<any[]>(API_ROUTES.liveClass.chat(roomId));
};

export const saveChatMessage = (roomId: string, message: string): Promise<any> => {
  return apiFetch<any>(API_ROUTES.liveClass.chat(roomId), {
    method: "POST",
    body: JSON.stringify({ message }),
  });
};

export const startRecording = (roomId: string): Promise<{ success: boolean, egressId: string, filepath: string }> => {
  return apiFetch(API_ROUTES.liveClass.startRecording(roomId), { method: "POST" });
};

export const stopRecording = (roomId: string): Promise<{ success: boolean }> => {
  return apiFetch(API_ROUTES.liveClass.stopRecording(roomId), { method: "POST" });
};
