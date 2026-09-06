import { ParticipantKind, type Participant } from "livekit-client";

/**
 * Which LiveKit participants represent an actual person in the room.
 *
 * Two kinds of participant join a class without being a human attendee:
 *
 * - the coach's pop-out board window (`<identity>_board`), a second connection
 *   from a coach who is already in the room, and
 * - the recording bot — egress' headless Chrome loading the recorder template
 *   (`apps/web/src/app/recorder/[classId]`). It subscribes only, publishes
 *   nothing, and exists purely to compose the recording.
 *
 * Neither belongs in the people list, the participant count, or the video grid.
 */

/** Identity suffix of a coach's pop-out board window. */
const BOARD_WINDOW_SUFFIX = "_board";

/** Identity prefix LiveKit gives an egress participant. */
const EGRESS_IDENTITY_PREFIX = "EG_";

export function isBoardWindowParticipant(participant: Participant): boolean {
  return participant.identity.endsWith(BOARD_WINDOW_SUFFIX);
}

/**
 * The recording bot. `kind` is the authoritative signal — the identity prefix
 * is a fallback for a server that does not populate it.
 */
export function isRecorderParticipant(participant: Participant): boolean {
  return (
    participant.kind === ParticipantKind.EGRESS ||
    participant.identity.startsWith(EGRESS_IDENTITY_PREFIX)
  );
}

/** True for participants a human should see listed and tiled. */
export function isHumanParticipant(participant: Participant): boolean {
  return !isBoardWindowParticipant(participant) && !isRecorderParticipant(participant);
}
