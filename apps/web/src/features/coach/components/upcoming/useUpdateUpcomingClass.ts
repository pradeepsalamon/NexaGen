import type { CoachClass, UpdateClassRequest } from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { updateClass } from "../../api/coachApi";

type Field = "batchType" | "topic";

type Vars = {
  classItem: CoachClass;
  field: Field;
  onSaved?: () => void;
  payload: UpdateClassRequest;
};

const FIELD_LABEL: Record<Field, string> = {
  batchType: "Class type",
  topic: "Topic"
};

// What the field was before the edit, in the shape the PATCH accepts — so Undo
// can put back "no topic" ("") or "inherit" (null) as well as a real value.
function previousValue(classItem: CoachClass, field: Field): UpdateClassRequest {
  return field === "topic"
    ? { topic: classItem.topic ?? "" }
    : { batchType: classItem.batchTypeOverride };
}

/**
 * One-field saves from a dashboard class card, through the same PATCH the
 * class-notes dialog uses. Only the one class changes — never its batch or
 * sibling classes — and Undo restores the previous value server-side.
 */
export function useUpdateUpcomingClass() {
  return useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (vars: Vars) => {
      const result = await updateClass(vars.classItem.id, vars.payload);
      vars.onSaved?.();
      return result;
    },
    undo: (vars) => updateClass(vars.classItem.id, previousValue(vars.classItem, vars.field)),
    toast: (vars) => ({ title: `${FIELD_LABEL[vars.field]} saved` }),
    invalidates: [
      queryKeys.coach.classes,
      queryKeys.coach.dashboard
    ]
  });
}
