// Now a real Prisma enum (schema.prisma) backing LiveSession.status instead of
// an untyped String -- re-exported here so existing call sites importing it
// from this file don't need to change (P0 reliability Phase 1).
export { LiveSessionStatus } from "@prisma/client";

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
