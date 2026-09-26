"use client";

import { useState } from "react";
import { ClipboardList, Pencil, Plus, Power, PowerOff, Trash2 } from "lucide-react";
import {
  FEEDBACK_PLACEMENT_LABELS,
  type FeedbackFormDto
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { deleteFeedbackForm } from "../../api/feedbackApi";
import { useFeedbackFormsQuery, useToggleFeedbackFormMutation } from "../../hooks/useFeedbackApi";
import { describeSchedule } from "../../lib/formDefaults";
import { FeedbackFormEditor } from "./FeedbackFormEditor";
import { RowAction } from "./RowAction";

export function FeedbackFormsPanel() {
  const tz = useUserTimeZone();
  const { data, error, isLoading, refetch } = useFeedbackFormsQuery();
  const toggle = useToggleFeedbackFormMutation();
  const [editing, setEditing] = useState<FeedbackFormDto | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [hidden, setHidden] = useState<string[]>([]);

  const remove = useUndoableMutation<FeedbackFormDto, { success: true }>({
    invalidates: [queryKeys.feedback.forms],
    mutationFn: (form) => deleteFeedbackForm(form.id),
    onCancel: (form) => setHidden((ids) => ids.filter((id) => id !== form.id)),
    onSchedule: (form) => setHidden((ids) => [...ids, form.id]),
    strategy: "defer",
    toast: (form) => ({ title: `Deleting "${form.title}"` }),
    undo: async () => undefined
  });

  const openEditor = (form: FeedbackFormDto | null) => {
    setEditing(form);
    setEditorOpen(true);
  };

  const forms = (data?.forms ?? []).filter((form) => !hidden.includes(form.id));

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-app-muted">
          Build the questions, then choose when and where students are asked.
        </p>
        <Button onClick={() => openEditor(null)} type="button">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New form
        </Button>
      </div>

      {isLoading ? (
        <div className="grid gap-3">
          {[0, 1].map((i) => (
            <Skeleton className="h-28 rounded-app" key={i} />
          ))}
        </div>
      ) : error ? (
        <WidgetError onRetry={() => refetch()} />
      ) : forms.length === 0 ? (
        <Card className="p-6">
          <EmptyState
            action={{ label: "Create a feedback form", onClick: () => openEditor(null) }}
            description="Students won't be asked for feedback until you create and activate a form."
            icon={ClipboardList}
            title="No feedback forms yet"
          />
        </Card>
      ) : (
        <div className="grid gap-3">
          {forms.map((form) => (
            <Card className="grid gap-3 p-4 sm:p-5" key={form.id}>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="text-base font-extrabold text-app-text">{form.title}</h3>
                    <Badge variant={form.isActive ? "success" : "secondary"}>
                      {form.isActive ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <p className="mt-1 text-sm text-app-muted">
                    {form.questions.length} question{form.questions.length === 1 ? "" : "s"} &middot;{" "}
                    {describeSchedule(form)} &middot; open {form.expiresAfterDays} day
                    {form.expiresAfterDays === 1 ? "" : "s"} &middot;{" "}
                    {form.batchIds.length === 0
                      ? "All batches"
                      : `${form.batchIds.length} batch${form.batchIds.length === 1 ? "" : "es"}`}
                  </p>
                  {form.startsAt || form.endsAt ? (
                    <p className="text-xs text-app-muted">
                      {form.startsAt ? `From ${formatFullDate(form.startsAt, tz)}` : "From now"}
                      {form.endsAt ? ` until ${formatFullDate(form.endsAt, tz)}` : ""}
                    </p>
                  ) : null}
                </div>
                <div className="flex items-center gap-1.5">
                  <RowAction icon={Pencil} label="Edit form" onClick={() => openEditor(form)} />
                  <RowAction
                    disabled={toggle.isPending}
                    icon={form.isActive ? PowerOff : Power}
                    label={form.isActive ? "Deactivate form" : "Activate form"}
                    onClick={() => toggle.mutate(form)}
                    tone={form.isActive ? "warning" : "success"}
                  />
                  <RowAction
                    disabled={form.responseCount > 0}
                    icon={Trash2}
                    label={form.responseCount > 0 ? "Has responses — deactivate instead" : "Delete form"}
                    onClick={() => remove.run(form)}
                    tone="danger"
                  />
                </div>
              </div>
              <div className="flex flex-wrap items-center gap-1.5">
                {form.placements.map((placement) => (
                  <Badge key={placement} variant="info">
                    {FEEDBACK_PLACEMENT_LABELS[placement]}
                  </Badge>
                ))}
                {form.showToCoach ? <Badge variant="outline">Coach sees results</Badge> : null}
                {!form.allowSkip ? <Badge variant="outline">Can&apos;t skip</Badge> : null}
                <span className="ml-auto text-xs font-semibold text-app-muted">
                  {form.responseCount} response{form.responseCount === 1 ? "" : "s"}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <FeedbackFormEditor form={editing} onOpenChange={setEditorOpen} open={editorOpen} />
    </div>
  );
}
