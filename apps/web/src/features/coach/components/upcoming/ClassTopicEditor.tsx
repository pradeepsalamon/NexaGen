"use client";

import { type FormEvent, useEffect, useId, useRef, useState } from "react";
import { Pencil } from "lucide-react";
import type { CoachClass } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUpdateUpcomingClass } from "./useUpdateUpcomingClass";

const MAX_TOPIC_LENGTH = 120;

/** Inline topic edit for one class; saves through the coach class PATCH. */
export function ClassTopicEditor({ classItem }: { classItem: CoachClass }) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(classItem.topic ?? "");
  const inputRef = useRef<HTMLInputElement>(null);
  const labelId = useId();
  const { run, isPending } = useUpdateUpcomingClass();

  useEffect(() => {
    if (editing) inputRef.current?.focus();
  }, [editing]);

  const startEditing = () => {
    setDraft(classItem.topic ?? "");
    setEditing(true);
  };

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next = draft.trim();
    if (next === (classItem.topic ?? "")) {
      setEditing(false);
      return;
    }
    run({
      classItem,
      field: "topic",
      onSaved: () => setEditing(false),
      payload: { topic: next }
    });
  };

  if (!editing) {
    return (
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-bold text-app-muted" id={labelId}>
            Topic
          </p>
          <p
            aria-labelledby={labelId}
            className={classItem.topic ? "mt-0.5 break-words text-sm font-semibold text-app-text" : "mt-0.5 text-sm text-app-muted"}
          >
            {classItem.topic || "No topic yet"}
          </p>
        </div>
        <SimpleTooltip label={classItem.topic ? "Edit topic" : "Add a topic"}>
          <Button
            aria-label={classItem.topic ? "Edit topic" : "Add a topic"}
            className="size-9 shrink-0"
            onClick={startEditing}
            size="icon"
            variant="ghost"
          >
            <Pencil aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>
    );
  }

  return (
    <form className="space-y-2" onSubmit={onSubmit}>
      <label className="text-xs font-bold text-app-muted" htmlFor={`${labelId}-input`}>
        Topic
      </label>
      <Input
        disabled={isPending}
        id={`${labelId}-input`}
        maxLength={MAX_TOPIC_LENGTH}
        onChange={(event) => setDraft(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            setEditing(false);
          }
        }}
        placeholder="e.g. Lucena position"
        ref={inputRef}
        value={draft}
      />
      <div className="flex justify-end gap-2">
        <Button disabled={isPending} onClick={() => setEditing(false)} size="sm" type="button" variant="outline">
          Cancel
        </Button>
        <Button disabled={isPending} size="sm" type="submit">
          {isPending ? "Saving..." : "Save"}
        </Button>
      </div>
    </form>
  );
}
