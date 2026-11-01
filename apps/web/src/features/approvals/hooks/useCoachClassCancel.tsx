"use client";

import { useState } from "react";
import { resolveCancellationPath, type CoachClass } from "@nexa-chess/types";
import { cancelClass } from "@/features/coach/api/coachApi";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { RequestApprovalDialog } from "../components/RequestApprovalDialog";

/**
 * The coach's "Cancel class" action, routed by the shared 24 h rule (V10,
 * `resolveCancellationPath`): more than 24 h ahead it cancels directly (with
 * undo); closer, or after the start, it opens an admin request instead. The
 * API enforces the same rule, so this only picks the right control.
 */
export function useCoachClassCancel() {
  const [requestFor, setRequestFor] = useState<{ classItem: CoachClass; exceptional: boolean } | null>(null);

  const { run: cancelDirectly } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (classItem: CoachClass) => cancelClass(classItem.id),
    undo: async () => {},
    toast: (classItem) => ({ title: `Cancelling class for ${classItem.batchName}` }),
    invalidates: [
      queryKeys.coach.dashboard,
      queryKeys.coach.classes,
      queryKeys.coach.upcomingClasses,
      queryKeys.coach.classHistory
    ]
  });

  const cancel = (classItem: CoachClass) => {
    const path = resolveCancellationPath(classItem);
    if (path === "DIRECT") cancelDirectly(classItem);
    else if (path === "APPROVAL" || path === "EXCEPTIONAL") {
      setRequestFor({ classItem, exceptional: path === "EXCEPTIONAL" });
    }
  };

  const dialog = (
    <RequestApprovalDialog
      open={requestFor !== null}
      onOpenChange={(open) => !open && setRequestFor(null)}
      actionType={requestFor?.exceptional ? "CLASS_CANCEL_EXCEPTIONAL" : "CLASS_CANCEL"}
      payload={{ classId: requestFor?.classItem.id ?? "" }}
      title={requestFor?.exceptional ? "Ask for an exceptional cancellation" : "Ask to cancel this class"}
      description={
        requestFor?.exceptional
          ? "This class has already started, so only an admin can cancel it. Explain what happened."
          : "This class starts within 24 hours, so an admin has to approve cancelling it. The batch is told only once it's approved."
      }
      submitLabel="Ask an admin"
    />
  );

  return { cancel, dialog };
}
