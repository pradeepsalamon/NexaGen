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
}

export interface LiveKitTokenResponse {
  token: string;
  roomName: string;
  topic?: string;
}

export interface ParticipantInfo {
  sid: string;
  identity: string;
  state: string;
  name: string;
  isPublisher: boolean;
}
