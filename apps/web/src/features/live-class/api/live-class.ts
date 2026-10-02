import { apiFetch } from "@/lib/api";
import {
  API_ROUTES,
  type ClassSummaryResponse,
  type LiveChatMessageResponse,
  type ModerateAllRequest,
  type ModerateAllResponse,
  type ModerateParticipantRequest,
  type ModerateParticipantResponse,
  type PullRosterResponse,
  type ResolveScreenShareRequest,
  type ResolveWaitingRoomRequest,
  type ScreenShareRequestEntry,
  type ScreenShareRequestListResponse,
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

/** Coach-only: switch mic and/or camera off for every student. Off only. */
export const moderateAll = (
  roomId: string,
  body: ModerateAllRequest
): Promise<ModerateAllResponse> => {
  return apiFetch<ModerateAllResponse>(API_ROUTES.liveClass.moderateAll(roomId), {
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

/** Coach-owner/admin: requests currently pending or approved. */
export const getScreenShareRequestList = (roomId: string): Promise<ScreenShareRequestListResponse> => {
  return apiFetch<ScreenShareRequestListResponse>(API_ROUTES.liveClass.screenShareRequests(roomId));
};

/** Student: ask to share their screen while the class-wide policy is DISABLED. */
export const requestScreenShare = (roomId: string): Promise<ScreenShareRequestEntry> => {
  return apiFetch<ScreenShareRequestEntry>(API_ROUTES.liveClass.requestScreenShare(roomId), {
    method: "POST",
  });
};

/** Coach-owner/admin: approve, deny, or revoke one student's screen-share request. */
export const resolveScreenShareRequest = (
  roomId: string,
  body: ResolveScreenShareRequest
): Promise<ScreenShareRequestEntry> => {
  return apiFetch<ScreenShareRequestEntry>(API_ROUTES.liveClass.resolveScreenShareRequest(roomId), {
    method: "POST",
    body,
  });
};

/** Student: self-report that sharing has stopped. */
export const endScreenShare = (roomId: string): Promise<ScreenShareRequestEntry> => {
  return apiFetch<ScreenShareRequestEntry>(API_ROUTES.liveClass.endScreenShare(roomId), {
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

// Pull a student into class (coach-owner/admin).
export const getPullRoster = (roomId: string) =>
  apiFetch<PullRosterResponse>(API_ROUTES.liveClass.pullRoster(roomId));

export const pullStudent = (roomId: string, studentId: string) =>
  apiFetch<{ status: "PENDING" }>(API_ROUTES.liveClass.pullStudent(roomId), {
    method: "POST",
    body: { studentId }
  });

export const cancelPull = (roomId: string, studentId: string) =>
  apiFetch<{ cancelled: boolean }>(API_ROUTES.liveClass.cancelPull(roomId), {
    method: "POST",
    body: { studentId }
  });
