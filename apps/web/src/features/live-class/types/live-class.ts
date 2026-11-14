export type ClassStatus = "SCHEDULED" | "LIVE" | "COMPLETED" | "CANCELLED";
export type LiveSessionStatus = "SCHEDULED" | "WAITING" | "LIVE" | "ENDED" | "CANCELLED";

export interface LiveSession {
  id: string;
  classId: string;
  roomName: string;
  livekitRoomName: string | null;
  status: LiveSessionStatus;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  recordingUrl: string | null;
}

export interface CoachClass {
  id: string;
  batchId: string;
  coachId: string;
  title: string | null;
  topic: string | null;
  status: ClassStatus;
  startsAt: string;
  endsAt: string;
  liveSession?: LiveSession;
  /** Resolved pre-class settings, so the pre-join screen can preview the policy. */
  preClassSettings?: import("@nexa-chess/types").LiveClassSettings | null;
}

export interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  topic?: string;
  /** Resolved pre-class settings for this participant; null for legacy classes. */
  settings?: import("@nexa-chess/types").LiveClassSettings | null;
}

export interface ParticipantInfo {
  sid: string;
  identity: string;
  state: string;
  name: string;
  isPublisher: boolean;
}
