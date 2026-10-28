import { useEffect, useRef } from "react";
import { useConnectionState, useLocalParticipant } from "@livekit/components-react";
import { ConnectionState } from "livekit-client";
import { isStaffRole, useAuthStore } from "@/stores/authStore";
import {
  CLASSROOM_PRESENTATION_ATTRIBUTE,
  encodeClassroomPresentation,
  loadClassroomPresentation,
  parseClassroomPresentation,
  saveClassroomPresentation,
  type PresentationState
} from "../lib/classroomPresentation";
import { useLiveClassState } from "../providers/LiveClassProvider";
import { useRoomClassId } from "../providers/LiveRoomContext";
import { useRoster } from "./useRoster";

/**
 * Carries the coach's `classroomPresentation` to everyone, like
 * `useCoachBoardOpen` does for the shared board: the coach publishes it as a
 * participant attribute (restored per tab, so a reload keeps presenting the
 * same thing — a new class starts on the gallery); everyone else takes it
 * from a participant whose signed metadata role is coach or staff.
 */
export function useClassroomPresentation() {
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH" || isStaffRole(user?.role);
  const classId = useRoomClassId();
  const { classroomPresentation, presentationSeq, applyClassroomPresentation } = useLiveClassState(
    "classroomPresentation",
    "presentationSeq",
    "applyClassroomPresentation"
  );
  const { localParticipant } = useLocalParticipant();
  const connected = useConnectionState() === ConnectionState.Connected;
  const participants = useRoster();

  // undefined = not read yet; null = nothing saved (or taken); a value = waiting for the store to take it.
  const restoring = useRef<PresentationState | null | undefined>(undefined);
  useEffect(() => {
    if (!isCoach || !classId || restoring.current !== undefined) return;
    restoring.current = loadClassroomPresentation(classId);
    if (restoring.current) applyClassroomPresentation(restoring.current);
  }, [isCoach, classId, applyClassroomPresentation]);

  useEffect(() => {
    if (!isCoach || !classId || restoring.current === undefined) return;
    const state = { presentation: classroomPresentation, seq: presentationSeq };
    // Don't publish the store's default over the value being restored.
    if (restoring.current && encodeClassroomPresentation(restoring.current) !== encodeClassroomPresentation(state)) return;
    restoring.current = null;
    saveClassroomPresentation(classId, state);
    if (!connected || !localParticipant) return;
    const value = encodeClassroomPresentation(state);
    if (localParticipant.attributes?.[CLASSROOM_PRESENTATION_ATTRIBUTE] === value) return;
    localParticipant.setAttributes({ [CLASSROOM_PRESENTATION_ATTRIBUTE]: value }).catch(console.warn);
  }, [isCoach, classId, classroomPresentation, presentationSeq, connected, localParticipant]);

  useEffect(() => {
    if (isCoach) return;
    for (const p of participants) {
      let coachRole = false;
      try {
        const meta = p.metadata ? JSON.parse(p.metadata) : null;
        coachRole = meta?.role === "COACH" || isStaffRole(meta?.role);
      } catch {
        // ignore malformed metadata
      }
      const presented = coachRole ? parseClassroomPresentation(p.attributes?.[CLASSROOM_PRESENTATION_ATTRIBUTE]) : null;
      if (presented) {
        applyClassroomPresentation(presented);
        return;
      }
    }
    // No coach in the room: keep the last one (the store starts on the gallery),
    // so a coach's reconnect doesn't bounce everyone's stage.
  }, [participants, isCoach, applyClassroomPresentation]);
}
