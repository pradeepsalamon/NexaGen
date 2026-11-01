"use client";

import { useEffect, useState } from "react";
import { LOCKABLE_LIVE_SETTING_LABELS, type LiveSettingExceptionField } from "@nexa-chess/types";
import { FormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { RequestApprovalDialog } from "./RequestApprovalDialog";

/** A coach asks for a different value on a locked setting, for this class only, before it starts. */
export function LiveSettingExceptionDialog({
  classId,
  field,
  currentValue,
  options,
  onClose
}: {
  classId: string;
  field: LiveSettingExceptionField | null;
  currentValue: string | undefined;
  options: { label: string; value: string }[];
  onClose: () => void;
}) {
  const [value, setValue] = useState("");

  useEffect(() => {
    setValue("");
  }, [field]);

  const label = field ? LOCKABLE_LIVE_SETTING_LABELS[field] : "";

  return (
    <RequestApprovalDialog
      actionType="LIVE_SETTING_EXCEPTION"
      canSubmit={!!value}
      description="This setting is locked. An admin can allow a different value for this class only, up until it starts."
      onOpenChange={(open) => !open && onClose()}
      open={!!field}
      payload={{ classId, field: field ?? "", value }}
      submitLabel="Ask an admin"
      title={`Ask to change: ${label}`}
    >
      <FormField id="exception-value" label="Value for this class">
        <Select
          id="exception-value"
          onChange={(e) => setValue(e.target.value)}
          options={options.filter((option) => option.value !== currentValue)}
          placeholder="Choose a value"
          value={value}
        />
      </FormField>
    </RequestApprovalDialog>
  );
}
