"use client";

import { useId } from "react";
import {
  BATCH_TYPE_LABELS,
  BATCH_TYPE_OPTIONS,
  batchTypeSchema,
  type CoachClass
} from "@nexa-chess/types";
import { Select } from "@/components/ui/Select";
import { useUpdateUpcomingClass } from "./useUpdateUpcomingClass";

const INHERIT = "";

/**
 * Group / Individual / Buddy for this one class. "Batch default" clears the
 * override; the batch's own default is admin-owned (Batches → edit).
 */
export function ClassBatchTypeSelect({ classItem }: { classItem: CoachClass }) {
  const id = useId();
  const { run, isPending } = useUpdateUpcomingClass();

  const options = [
    { label: `Batch default (${BATCH_TYPE_LABELS[classItem.batchTypeInherited]})`, value: INHERIT },
    ...BATCH_TYPE_OPTIONS
  ];

  return (
    <div className="space-y-1.5">
      <label className="text-xs font-bold uppercase tracking-wide text-app-muted" htmlFor={id}>
        Class type
      </label>
      <Select
        aria-describedby={`${id}-hint`}
        className="min-h-10"
        disabled={isPending}
        id={id}
        onChange={(event) => {
          const parsed = batchTypeSchema.safeParse(event.target.value);
          const next = parsed.success ? parsed.data : null;
          if (next === classItem.batchTypeOverride) return;
          run({ classItem, field: "batchType", payload: { batchType: next } });
        }}
        options={options}
        value={classItem.batchTypeOverride ?? INHERIT}
      />
      <p className="text-xs text-app-muted" id={`${id}-hint`}>
        Applies to this class only.
      </p>
    </div>
  );
}
