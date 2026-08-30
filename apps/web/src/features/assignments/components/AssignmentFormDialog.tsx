"use client";

import { useEffect, useRef, useState } from "react";
import { Controller, useForm } from "react-hook-form";
import type { AssignmentLibraryItem, CoachBatch } from "@nexa-chess/types";
import { Upload } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { DatePicker } from "@/components/ui/DatePicker";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useCreateAssignment, useUpdateAssignment } from "../hooks/useAssignmentsApi";

type FormValues = {
  title: string;
  description: string;
  difficulty: "BEGINNER" | "INTERMEDIATE" | "ADVANCED";
  timeLimitMinutes: string;
  pgn: string;
  batchIds: string[];
  dueDate: string;
};

const DIFFICULTY_OPTIONS = [
  { label: "Beginner", value: "BEGINNER" },
  { label: "Intermediate", value: "INTERMEDIATE" },
  { label: "Advanced", value: "ADVANCED" }
];

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  mode: "create" | "edit";
  assignment?: AssignmentLibraryItem | null;
  /** Coach batches — when provided, a coach can assign on create in one step. */
  coachBatches?: CoachBatch[];
}

export function AssignmentFormDialog({ open, onOpenChange, mode, assignment, coachBatches }: Props) {
  const createMutation = useCreateAssignment();
  const updateMutation = useUpdateAssignment(assignment?.id ?? "");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [assignNow, setAssignNow] = useState(false);

  const form = useForm<FormValues>({
    defaultValues: {
      title: "",
      description: "",
      difficulty: "BEGINNER",
      timeLimitMinutes: "",
      pgn: "",
      batchIds: [],
      dueDate: ""
    }
  });

  useEffect(() => {
    if (!open) return;
    setAssignNow(false);
    if (mode === "edit" && assignment) {
      form.reset({
        title: assignment.title,
        description: assignment.description ?? "",
        difficulty: assignment.difficulty,
        timeLimitMinutes: assignment.timeLimitMinutes ? assignment.timeLimitMinutes.toString() : "",
        pgn: assignment.pgn,
        batchIds: [],
        dueDate: ""
      });
    } else {
      form.reset({
        title: "",
        description: "",
        difficulty: "BEGINNER",
        timeLimitMinutes: "",
        pgn: "",
        batchIds: [],
        dueDate: ""
      });
    }
  }, [open, mode, assignment, form]);

  const errors = form.formState.errors;
  const isPending = createMutation.isPending || updateMutation.isPending;
  const canAssignOnCreate = mode === "create" && !!coachBatches && coachBatches.length > 0;

  const handleFile = async (file: File) => {
    const text = await file.text();
    form.setValue("pgn", text, { shouldValidate: true });
  };

  const onSubmit = form.handleSubmit((values) => {
    form.clearErrors();
    if (!values.title.trim()) {
      form.setError("title", { message: "Title is required." });
      return;
    }
    if (!values.pgn.trim()) {
      form.setError("pgn", { message: "PGN is required." });
      return;
    }

    if (mode === "edit" && assignment) {
      updateMutation.mutate(
        {
          title: values.title.trim(),
          description: values.description.trim() || null,
          difficulty: values.difficulty,
          timeLimitMinutes: values.timeLimitMinutes ? parseInt(values.timeLimitMinutes, 10) : undefined,
          pgn: values.pgn
        },
        { onSuccess: () => onOpenChange(false) }
      );
      return;
    }

    const deploying = canAssignOnCreate && assignNow && values.batchIds.length > 0;
    if (canAssignOnCreate && assignNow) {
      if (values.batchIds.length === 0) {
        form.setError("batchIds", { message: "Select at least one batch." });
        return;
      }
      if (!values.dueDate) {
        form.setError("dueDate", { message: "A due date is required." });
        return;
      }
    }
    createMutation.mutate(
      {
        title: values.title.trim(),
        description: values.description.trim() || undefined,
        difficulty: values.difficulty,
        timeLimitMinutes: values.timeLimitMinutes ? parseInt(values.timeLimitMinutes, 10) : undefined,
        pgn: values.pgn,
        batchIds: deploying ? values.batchIds : undefined,
        dueDate: deploying ? values.dueDate : undefined
      },
      { onSuccess: () => onOpenChange(false) }
    );
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[620px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{mode === "edit" ? "Edit assignment" : "New assignment"}</DialogTitle>
          <DialogDescription>
            {mode === "edit"
              ? "Update this assignment. Changes apply everywhere it is used."
              : "Add a chess game or line as a reusable assignment."}
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={onSubmit} className="grid gap-4 py-2">
          <FormField id="title" label="Title" error={errors.title?.message as string | undefined}>
            <Input id="title" hasError={!!errors.title} {...form.register("title")} placeholder="e.g. Ruy Lopez — main line" />
          </FormField>

          <FormField id="difficulty" label="Difficulty">
            <Controller
              control={form.control}
              name="difficulty"
              render={({ field }) => (
                <Select
                  id="difficulty"
                  options={DIFFICULTY_OPTIONS}
                  value={field.value}
                  onChange={(e) => field.onChange(e.target.value)}
                />
              )}
            />
          </FormField>

          <FormField
            id="timeLimitMinutes"
            label="Time limit (minutes, optional)"
            error={errors.timeLimitMinutes?.message as string | undefined}
          >
            <Input
              id="timeLimitMinutes"
              type="number"
              min="1"
              max="180"
              hasError={!!errors.timeLimitMinutes}
              {...form.register("timeLimitMinutes")}
              placeholder="e.g. 30"
            />
          </FormField>

          <FormField
            id="description"
            label="Instructions (optional)"
            error={errors.description?.message as string | undefined}
          >
            <Textarea
              id="description"
              rows={2}
              hasError={!!errors.description}
              {...form.register("description")}
              placeholder="What should the student focus on?"
            />
          </FormField>

          <FormField id="pgn" label="PGN" error={errors.pgn?.message as string | undefined}>
            <Textarea
              id="pgn"
              rows={6}
              className="font-mono text-xs"
              hasError={!!errors.pgn}
              {...form.register("pgn")}
              placeholder="1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 ..."
            />
            <div className="mt-2">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pgn"
                className="hidden"
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  if (file) void handleFile(file);
                  e.target.value = "";
                }}
              />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
              >
                <Upload className="mr-2 size-4" strokeWidth={2.5} />
                Upload .pgn file
              </Button>
            </div>
          </FormField>

          {canAssignOnCreate && (
            <div className="rounded-app border border-app-border bg-app-background/50 p-3">
              <Checkbox
                id="assignNow"
                label="Assign to my batches now"
                checked={assignNow}
                onCheckedChange={(v) => setAssignNow(v === true)}
              />

              {assignNow && (
                <div className="mt-3 grid gap-3">
                  <div className="grid gap-2">
                    <p className="text-sm font-medium text-app-text">Batches</p>
                    <Controller
                      control={form.control}
                      name="batchIds"
                      render={({ field }) => (
                        <div className="grid gap-1.5">
                          {coachBatches!.map((batch) => {
                            const checked = field.value.includes(batch.id);
                            return (
                              <Checkbox
                                key={batch.id}
                                id={`batch-${batch.id}`}
                                label={batch.name}
                                checked={checked}
                                onCheckedChange={(v) =>
                                  field.onChange(
                                    v === true
                                      ? [...field.value, batch.id]
                                      : field.value.filter((id) => id !== batch.id)
                                  )
                                }
                              />
                            );
                          })}
                        </div>
                      )}
                    />
                  </div>

                  <FormField
                    id="dueDate"
                    label="Due date"
                    error={errors.dueDate?.message as string | undefined}
                  >
                    <Controller
                      control={form.control}
                      name="dueDate"
                      render={({ field }) => (
                        <DatePicker
                          withTime
                          value={field.value ? new Date(field.value) : undefined}
                          onChange={(date) => field.onChange(date ? date.toISOString() : "")}
                        />
                      )}
                    />
                  </FormField>
                </div>
              )}
            </div>
          )}

          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={isPending}>
              Cancel
            </Button>
            <Button type="submit" disabled={isPending}>
              {isPending ? "Saving..." : mode === "edit" ? "Save changes" : "Create assignment"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
