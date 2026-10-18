import type { DerivedLiveKitGrants, LiveKitTrackSource } from "@nexa-chess/types";

export const SCREEN_SHARE_SOURCES: LiveKitTrackSource[] = ["screen_share", "screen_share_audio"];

/** Matches the coach's participant regardless of the `_<clientId>` tab suffix (AUDIT M23). */
export function isCoachParticipant(identity: string | undefined, coachId: string) {
  return identity === coachId || identity?.split("_")[0] === coachId;
}

/** Widens a set of derived grants to also allow screen share, for one approved student. */
export function withScreenShareSources(grants: DerivedLiveKitGrants): DerivedLiveKitGrants {
  return {
    ...grants,
    canPublish: true,
    canPublishSources: Array.from(
      new Set([...grants.canPublishSources, ...SCREEN_SHARE_SOURCES])
    ),
  };
}
