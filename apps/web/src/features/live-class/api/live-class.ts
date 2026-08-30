import { apiFetch } from "@/lib/api";
import { API_ROUTES, type ClassSummaryResponse } from "@nexa-chess/types";
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

export const getClassSummary = (roomId: string): Promise<ClassSummaryResponse> => {
  return apiFetch<ClassSummaryResponse>(API_ROUTES.attendance.classSummary(roomId));
};

export const getLiveClassParticipants = (roomId: string): Promise<{ participants: ParticipantInfo[] }> => {
  return apiFetch<{ participants: ParticipantInfo[] }>(API_ROUTES.liveClass.participants(roomId));
};

export const getChatHistory = (roomId: string): Promise<any[]> => {
  return apiFetch<any[]>(API_ROUTES.liveClass.chat(roomId));
};

export const saveChatMessage = (
  roomId: string,
  message: string,
  clientMessageId?: string
): Promise<any> => {
  // Pass the plain object — `apiFetch` (axios) serialises it. Passing a
  // pre-stringified body made axios send a raw JSON string (AUDIT M27).
  return apiFetch<any>(API_ROUTES.liveClass.chat(roomId), {
    method: "POST",
    body: { message, ...(clientMessageId ? { clientMessageId } : {}) },
  });
};

export const startRecording = (roomId: string): Promise<{ success: boolean, egressId: string, filepath: string }> => {
  return apiFetch(API_ROUTES.liveClass.startRecording(roomId), { method: "POST" });
};

export const stopRecording = (roomId: string): Promise<{ success: boolean }> => {
  return apiFetch(API_ROUTES.liveClass.stopRecording(roomId), { method: "POST" });
};

export const getRecordingDownloadUrl = (
  roomId: string,
  opts: { download?: boolean } = {}
): Promise<{ url: string }> => {
  const path = API_ROUTES.liveClass.downloadRecording(roomId);
  return apiFetch<{ url: string }>(opts.download ? `${path}?download=1` : path);
};

export const updateRecordingProgress = (roomId: string, watchedSeconds: number): Promise<{ success: boolean }> => {
  return apiFetch<{ success: boolean }>(API_ROUTES.liveClass.recordingProgress(roomId), {
    method: "POST",
    body: { watchedSeconds }
  });
};
