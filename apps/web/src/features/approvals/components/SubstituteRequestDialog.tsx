"use client";

import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { CoachClass } from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { queryKeys } from "@/lib/queryKeys";
import { listSubstituteOptions } from "../api/approvalsApi";
import { RequestApprovalDialog } from "./RequestApprovalDialog";

/** A coach asks for a colleague to take one upcoming class. */
export function SubstituteRequestDialog({
  classItem,
  onClose
}: {
  classItem: CoachClass | null;
  onClose: () => void;
}) {
  const [substituteCoachId, setSubstituteCoachId] = useState("");

  useEffect(() => {
    setSubstituteCoachId("");
  }, [classItem?.id]);

  const { data, isLoading } = useQuery({
    enabled: !!classItem,
    queryFn: () => listSubstituteOptions(classItem!.id),
    queryKey: queryKeys.approvals.substituteOptions(classItem?.id ?? "")
  });
  const coaches = data?.coaches ?? [];

  return (
    <RequestApprovalDialog
      actionType="CLASS_SUBSTITUTE_COACH"
      canSubmit={!!substituteCoachId}
      description="An admin has to approve this. The other coach takes this class only, and is told once it's approved."
      onOpenChange={(open) => !open && onClose()}
      open={!!classItem}
      payload={{ classId: classItem?.id ?? "", substituteCoachId }}
      submitLabel="Ask an admin"
      title="Ask for a substitute coach"
    >
      <FormField id="substitute-coach" label="Coach">
        <Select
          disabled={isLoading || coaches.length === 0}
          id="substitute-coach"
          onChange={(e) => setSubstituteCoachId(e.target.value)}
          options={coaches.map((coach) => ({
            label: coach.inBatch ? `${coach.name} (coaches this batch)` : coach.name,
            value: coach.id
          }))}
          placeholder={!isLoading && coaches.length === 0 ? "No other active coaches" : "Choose a coach"}
          value={substituteCoachId}
        />
      </FormField>
    </RequestApprovalDialog>
  );
}
