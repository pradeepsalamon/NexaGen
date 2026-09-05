// Now a real Prisma enum (schema.prisma) backing LiveSession.status instead of
// an untyped String -- re-exported here so existing call sites importing it
// from this file don't need to change (P0 reliability Phase 1).
export { LiveSessionStatus } from "@prisma/client";

export interface LiveKitTokenOptions {
  roomName: string;
  participantName: string;
  participantIdentity: string;
  isCoach: boolean;
}
