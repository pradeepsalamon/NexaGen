import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { updateClassRequestSchema, type CoachClass, type UpdateClassRequest } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { formatDateTime } from "@/lib/datetime";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { updateClass } from "../api/coachApi";

function toPayload(cls: CoachClass): UpdateClassRequest {
  return {
    title: cls.title ?? "",
    topic: cls.topic || undefined,
    description: cls.description ?? "",
    homework: cls.homework ?? "",
    notes: cls.notes ?? ""
  };
}

interface ClassNotesDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classItem: CoachClass | null;
}

/**
 * Classes are scheduled by the academy (admin or a batch's recurring
 * schedule); a coach only adds the title, topic and notes around one — before
 * it starts or after it ends.
 */
export function ClassNotesDialog({ open, onOpenChange, classItem }: ClassNotesDialogProps) {
  const tz = useUserTimeZone();

  const { run, isPending } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (vars: { id: string; payload: UpdateClassRequest; previous: CoachClass }) => {
      const result = await updateClass(vars.id, vars.payload);
      onOpenChange(false);
      return result;
    },
    undo: (vars) => updateClass(vars.id, toPayload(vars.previous)),
    toast: () => ({ title: "Class notes saved" }),
    invalidates: [
      queryKeys.coach.dashboard,
      queryKeys.coach.classes,
      queryKeys.coach.upcomingClasses,
      queryKeys.coach.classHistory,
      ...(classItem ? [queryKeys.coach.classDetail(classItem.id)] : [])
    ]
  });

  const form = useForm<UpdateClassRequest>({
    resolver: zodResolver(updateClassRequestSchema),
    defaultValues: { title: "", topic: "", description: "", homework: "", notes: "" }
  });

  useEffect(() => {
    if (classItem && open) form.reset(toPayload(classItem));
  }, [classItem, open, form]);

  const onSubmit = (data: UpdateClassRequest) => {
    if (!classItem) return;
    run({ id: classItem.id, payload: { ...data, topic: data.topic || undefined }, previous: classItem });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[600px]">
        <DialogHeader>
          <DialogTitle>Class notes</DialogTitle>
          <DialogDescription>
            {classItem
              ? `${classItem.batchName} · ${formatDateTime(classItem.startsAt, tz)}. The time and batch are set by the academy.`
              : null}
          </DialogDescription>
        </DialogHeader>

        <Form form={form} onSubmit={onSubmit} className="grid gap-4 py-2">
          <FormInput name="title" label="Title (Optional)" placeholder="e.g. Rook endgames" />
          <FormInput name="topic" label="Topic (Optional)" placeholder="e.g. Lucena position" />
          <FormInput name="description" label="Description (Optional)" placeholder="What this class covers" />
          <FormInput name="notes" label="Notes (Optional)" placeholder="Preparation or recap notes" />
          <FormInput name="homework" label="Homework (Optional)" placeholder="Work for the students" />

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : "Save notes"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
