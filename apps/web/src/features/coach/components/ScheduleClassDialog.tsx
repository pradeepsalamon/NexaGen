import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { createClassRequestSchema, type CreateClassRequest, type CoachClass, type CoachBatch } from "@nexa-gen/types";
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
import { FormField as BaseFormField } from "@/components/ui/FormField";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormSelect } from "@/components/forms/FormSelect";
import { useCreateClass, useUpdateClass } from "../hooks/useCoachApi";

interface ScheduleClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classToEdit?: CoachClass | null;
  batches: CoachBatch[];
}

export function ScheduleClassDialog({
  open,
  onOpenChange,
  classToEdit,
  batches
}: ScheduleClassDialogProps) {
  const createClassMutation = useCreateClass();
  const updateClassMutation = useUpdateClass(classToEdit?.id || "");

  const form = useForm<CreateClassRequest>({
    resolver: zodResolver(createClassRequestSchema),
    defaultValues: {
      batchId: "",
      title: "",
      topic: "",
      description: "",
      homework: "",
      startsAt: "",
      endsAt: ""
    }
  });

  useEffect(() => {
    if (classToEdit && open) {
      form.reset({
        batchId: classToEdit.batchId,
        title: classToEdit.title || "",
        topic: classToEdit.topic || "",
        description: classToEdit.description || "",
        homework: classToEdit.homework || "",
        startsAt: classToEdit.startsAt.slice(0, 16), // datetime-local format
        endsAt: classToEdit.endsAt.slice(0, 16)
      });
    } else if (open) {
      // Default to next hour
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const start = new Date(now.getTime() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hr duration

      // Convert to local ISO string format YYYY-MM-DDThh:mm required for datetime-local
      const tzoffset = start.getTimezoneOffset() * 60000;
      const startLocal = new Date(start.getTime() - tzoffset).toISOString().slice(0, 16);
      const endLocal = new Date(end.getTime() - tzoffset).toISOString().slice(0, 16);

      form.reset({
        batchId: batches.length > 0 ? batches[0].id : "",
        title: "",
        topic: "",
        description: "",
        homework: "",
        startsAt: startLocal,
        endsAt: endLocal
      });
    }
  }, [classToEdit, open, form, batches]);

  const onSubmit = (data: CreateClassRequest) => {
    // Need to ensure the datetime strings sent to backend are full ISO strings UTC
    const submitData = {
      ...data,
      startsAt: new Date(data.startsAt).toISOString(),
      endsAt: new Date(data.endsAt).toISOString()
    };

    if (classToEdit) {
      updateClassMutation.mutate(submitData, {
        onSuccess: () => onOpenChange(false)
      });
    } else {
      createClassMutation.mutate(submitData, {
        onSuccess: () => onOpenChange(false)
      });
    }
  };

  const isPending = createClassMutation.isPending || updateClassMutation.isPending;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>{classToEdit ? "Edit Class" : "Schedule Class"}</DialogTitle>
          <DialogDescription>
            {classToEdit
              ? "Update the details for this scheduled class."
              : "Schedule a new class for one of your batches."}
          </DialogDescription>
        </DialogHeader>

        <Form form={form} onSubmit={onSubmit} className="grid gap-4 py-4">
          <FormSelect
            name="batchId"
            label="Batch"
            placeholder="Select a batch"
            options={batches.map(b => ({ label: b.name, value: b.id }))}
          />
          
          <div className="grid grid-cols-2 gap-4">
            <BaseFormField id="startsAt" label="Start Time" error={form.formState.errors.startsAt?.message}>
              <Controller
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <DatePicker
                    withTime
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) => field.onChange(date ? date.toISOString().slice(0, 16) : "")}
                  />
                )}
              />
            </BaseFormField>
            <BaseFormField id="endsAt" label="End Time" error={form.formState.errors.endsAt?.message}>
              <Controller
                control={form.control}
                name="endsAt"
                render={({ field }) => (
                  <DatePicker
                    withTime
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) => field.onChange(date ? date.toISOString().slice(0, 16) : "")}
                  />
                )}
              />
            </BaseFormField>
          </div>

          <FormInput
            name="topic"
            label="Topic"
            placeholder="e.g. Sicilian Defense, Endgame Tactics"
          />

          <FormInput
            name="description"
            label="Description (Optional)"
            placeholder="Brief description of the class plan"
          />

          <FormInput
            name="homework"
            label="Homework (Optional)"
            placeholder="Assignments for the students"
          />

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : classToEdit ? "Update Class" : "Schedule Class"}
            </Button>
          </DialogFooter>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
