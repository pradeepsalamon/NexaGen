export type LiveClassStatus = "SCHEDULED" | "WAITING" | "LIVE" | "ENDED" | "CANCELLED";

export interface LiveClass {
  id: string;
  batchId: string;
  coachId: string;
  scheduleId: string;
  roomName: string;
  roomSid: string | null;
  status: LiveClassStatus;
  scheduledAt: string;
  startedAt: string | null;
  endedAt: string | null;
  metadata: any;
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
