import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { createClassRequestSchema, type CreateClassRequest, type CoachClass, type CoachBatch } from "@nexa-chess/types";
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
import { Input } from "@/components/ui/Input";
import { FormSelect } from "@/components/forms/FormSelect";
import { useCreateClass, useUpdateClass } from "../hooks/useCoachApi";

import { useState } from "react";

interface ScheduleClassDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  classToEdit?: CoachClass | null;
  batches: CoachBatch[];
  defaultBatchId?: string;
}

export function ScheduleClassDialog({
  open,
  onOpenChange,
  classToEdit,
  batches,
  defaultBatchId
}: ScheduleClassDialogProps) {
  const [duration, setDuration] = useState("60");
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
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
        startsAt: classToEdit.startsAt,
        endsAt: classToEdit.endsAt
      });
      const durMs = new Date(classToEdit.endsAt).getTime() - new Date(classToEdit.startsAt).getTime();
      const durMins = Math.round(durMs / 60000);
      setDuration(durMins.toString());
    } else if (open) {
      // Default to next hour
      const now = new Date();
      now.setMinutes(0, 0, 0);
      const start = new Date(now.getTime() + 60 * 60 * 1000);
      const end = new Date(start.getTime() + 60 * 60 * 1000); // 1 hr duration

      const startLocal = start.toISOString();
      const endLocal = end.toISOString();

      const initialBatch = (defaultBatchId && batches.some(b => b.id === defaultBatchId))
        ? defaultBatchId
        : (batches.length > 0 ? batches[0].id : "");

      form.reset({
        batchId: initialBatch,
        title: "",
        topic: "",
        description: "",
        homework: "",
        startsAt: startLocal,
        endsAt: endLocal
      });
      setDuration("60");
    }
  }, [classToEdit, open, form, batches, defaultBatchId]);


  const onSubmit = (data: CreateClassRequest) => {
    const startObj = new Date(data.startsAt);
    const endsAtObj = new Date(startObj.getTime() + parseInt(duration) * 60000);
    
    // Need to ensure the datetime strings sent to backend are full ISO strings UTC
    const submitData = {
      ...data,
      startsAt: startObj.toISOString(),
      endsAt: endsAtObj.toISOString()
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
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
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
          
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BaseFormField id="startsAt" label="Start Time" error={form.formState.errors.startsAt?.message}>
              <Controller
                control={form.control}
                name="startsAt"
                render={({ field }) => (
                  <DatePicker
                    withTime
                    value={field.value ? new Date(field.value) : undefined}
                    onChange={(date) => field.onChange(date ? date.toISOString() : "")}
                  />
                )}
              />
            </BaseFormField>
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Duration</label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  placeholder="Minutes (e.g. 60)"
                  value={duration}
                  onChange={(e) => setDuration(e.target.value)}
                  onFocus={() => setIsDurationDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDurationDropdownOpen(false), 200)}
                />
                {isDurationDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 rounded-md border border-app-border bg-app-surface shadow-md">
                    <ul className="max-h-60 overflow-auto py-1 text-sm text-app-text">
                      {[
                        { label: "30 minutes", value: "30" },
                        { label: "45 minutes", value: "45" },
                        { label: "60 minutes (1 hour)", value: "60" },
                        { label: "90 minutes (1.5 hours)", value: "90" },
                        { label: "120 minutes (2 hours)", value: "120" }
                      ].map(option => (
                        <li
                          key={option.value}
                          className="px-3 py-2 hover:bg-primary hover:text-white cursor-pointer transition-colors"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            setDuration(option.value);
                            setIsDurationDropdownOpen(false);
                          }}
                        >
                          {option.label}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            </div>
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
