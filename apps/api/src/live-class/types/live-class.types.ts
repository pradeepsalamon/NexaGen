export enum LiveSessionStatus {
  SCHEDULED = "SCHEDULED",
  WAITING = "WAITING",
  LIVE = "LIVE",
  ENDED = "ENDED",
  CANCELLED = "CANCELLED",
}

export interface LiveKitTokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isCoach: boolean;
}
