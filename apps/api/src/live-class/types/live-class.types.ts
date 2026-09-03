export enum LiveSessionStatus {
  SCHEDULED = "SCHEDULED",
  WAITING = "WAITING",
  LIVE = "LIVE",
  ENDED = "ENDED",
  CANCELLED = "CANCELLED",
}

import type { DerivedLiveKitGrants } from "@nexa-chess/types";

export interface LiveKitTokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isCoach: boolean;
  /**
   * Pre-class-settings-derived publish grants. When present they replace the
   * default coach/student grant logic (used once a class has an
   * `effectiveSettings` snapshot).
   */
  grants?: DerivedLiveKitGrants;
}
