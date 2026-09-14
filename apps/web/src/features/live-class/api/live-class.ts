import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type ClassSummaryResponse,
  type LiveChatMessageResponse,
  type ModerateParticipantRequest,
  type ModerateParticipantResponse,
  type ResolveWaitingRoomRequest,
  type WaitingRoomEntry,
  type WaitingRoomListResponse,
} from "@nexa-chess/types";
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

export const pingHeartbeat = (roomId: string, clientId?: string): Promise<{ ok: boolean }> => {
  return apiFetch<{ ok: boolean }>(API_ROUTES.liveClass.heartbeat(roomId), {
    method: "POST",
    body: clientId ? { clientId } : {},
  });
};

export const getChatHistory = (roomId: string): Promise<LiveChatMessageResponse[]> => {
  return apiFetch<LiveChatMessageResponse[]>(API_ROUTES.liveClass.chat(roomId));
};

export const saveChatMessage = (
  roomId: string,
  message: string,
  clientMessageId?: string,
  /** User id of the single recipient for a private message; omit for the room. */
  recipientId?: string | null
): Promise<LiveChatMessageResponse> => {
  // Pass the plain object — `apiFetch` (axios) serialises it. Passing a
  // pre-stringified body made axios send a raw JSON string (AUDIT M27).
  return apiFetch<LiveChatMessageResponse>(API_ROUTES.liveClass.chat(roomId), {
    method: "POST",
    body: {
      message,
      ...(clientMessageId ? { clientMessageId } : {}),
      ...(recipientId ? { recipientId } : {}),
    },
  });
};

/**
 * Coach-only: switch off one participant's already-published mic, camera or
 * screen share. Mute only — the participant turns it back on themselves.
 */
export const moderateParticipant = (
  roomId: string,
  body: ModerateParticipantRequest
): Promise<ModerateParticipantResponse> => {
  return apiFetch<ModerateParticipantResponse>(API_ROUTES.liveClass.moderate(roomId), {
    method: "POST",
    body,
  });
};

/** Coach-owner/admin: students currently pending admission, oldest first. */
export const getWaitingRoomList = (roomId: string): Promise<WaitingRoomListResponse> => {
  return apiFetch<WaitingRoomListResponse>(API_ROUTES.liveClass.waitingRoom(roomId));
};

/** Coach-owner/admin: admit or deny one pending student. */
export const resolveWaitingRoomEntry = (
  roomId: string,
  body: ResolveWaitingRoomRequest
): Promise<WaitingRoomEntry> => {
  return apiFetch<WaitingRoomEntry>(API_ROUTES.liveClass.resolveWaitingRoom(roomId), {
    method: "POST",
    body,
  });
};

/** Student: (re)request admission, most commonly after a denial. */
export const requestWaitingRoomAdmission = (roomId: string): Promise<WaitingRoomEntry> => {
  return apiFetch<WaitingRoomEntry>(API_ROUTES.liveClass.requestWaitingRoom(roomId), {
    method: "POST",
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
