import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save } from "lucide-react";
import type { Batch, BatchStatus, CreateBatchRequest, UpdateBatchRequest } from "@nexa-gen/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DateTimePicker } from "@/components/ui/DateTimePicker";
import { FormField as BaseFormField } from "@/components/ui/FormField";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { FormSelect } from "@/components/forms/FormSelect";
import { useAssignableUsersQuery, useCreateBatchMutation, useUpdateBatchMutation } from "../hooks/useBatchesApi";

const batchFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startsAt: z.string().min(1, "Start date is required"),
  endsAt: z.string().min(1, "End date is required"),
  scheduleNotes: z.string().optional(),
  status: z.enum(["UPCOMING", "ACTIVE", "COMPLETED", "ARCHIVED"]),
  coachIds: z.array(z.string()).optional(),
  studentIds: z.array(z.string()).optional(),
});

type BatchFormValues = z.infer<typeof batchFormSchema>;

const statusOptions = [
  { label: "Upcoming", value: "UPCOMING" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" }
];

interface BatchFormProps {
  selectedBatch: Batch | null;
  onSuccess: () => void;
}

export function BatchForm({ selectedBatch, onSuccess }: BatchFormProps) {
  const createMutation = useCreateBatchMutation();
  const updateMutation = useUpdateBatchMutation();
  const assignableUsersQuery = useAssignableUsersQuery();
  
  const coaches = assignableUsersQuery.data?.coaches ?? [];
  const students = assignableUsersQuery.data?.students ?? [];

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      name: selectedBatch?.name || "",
      description: selectedBatch?.description || "",
      startsAt: selectedBatch?.startsAt ? new Date(selectedBatch.startsAt).toISOString().slice(0, 16) : "",
      endsAt: selectedBatch?.endsAt ? new Date(selectedBatch.endsAt).toISOString().slice(0, 16) : "",
      scheduleNotes: selectedBatch?.scheduleNotes || "",
      status: selectedBatch?.status || "ACTIVE",
      coachIds: selectedBatch?.coaches.map(c => c.id) || [],
      studentIds: selectedBatch?.students.map(s => s.id) || [],
    },
  });

  const isSaving = createMutation.isPending || updateMutation.isPending;

  function onSubmit(values: BatchFormValues) {
    if (selectedBatch) {
      updateMutation.mutate({ id: selectedBatch.id, payload: values as UpdateBatchRequest }, {
        onSuccess: () => {
          form.reset();
          onSuccess();
        }
      });
    } else {
      createMutation.mutate(values as CreateBatchRequest, {
        onSuccess: () => {
          form.reset();
          onSuccess();
        }
      });
    }
  }

  return (
    <Card className="p-5">
      <Form form={form} onSubmit={onSubmit} className="grid gap-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-xs font-extrabold uppercase text-primary">
              {selectedBatch ? "Edit batch" : "Create batch"}
            </p>
            <h2 className="mt-2 text-xl font-extrabold text-app-text">
              {selectedBatch ? selectedBatch.name : "Batch details"}
            </h2>
          </div>
          <div>
            <Button disabled={isSaving} isLoading={isSaving} type="submit">
              <Save aria-hidden="true" className="size-4" strokeWidth={2.5} />
              {selectedBatch ? "Save Batch" : "Create Batch"}
            </Button>
          </div>
        </div>

        <div className="grid gap-4 lg:grid-cols-2">
          <FormInput name="name" label="Batch Name" required />
          <FormSelect name="status" label="Status" options={statusOptions} />

          <BaseFormField id="startsAt" label="Start Date/Time" error={form.formState.errors.startsAt?.message}>
            <Controller
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <DateTimePicker
                  value={field.value ? new Date(field.value) : undefined}
                  onChange={(date) => field.onChange(date ? date.toISOString().slice(0, 16) : "")}
                />
              )}
            />
          </BaseFormField>

          <BaseFormField id="endsAt" label="End Date/Time" error={form.formState.errors.endsAt?.message}>
            <Controller
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <DateTimePicker
                  value={field.value ? new Date(field.value) : undefined}
                  onChange={(date) => field.onChange(date ? date.toISOString().slice(0, 16) : "")}
                />
              )}
            />
          </BaseFormField>

          <div className="grid gap-2 lg:col-span-2">
            <BaseFormField id="description" label="Description" error={form.formState.errors.description?.message}>
              <Controller
                control={form.control}
                name="description"
                render={({ field }) => (
                  <Textarea
                    id="description"
                    placeholder="Batch description"
                    {...field}
                  />
                )}
              />
            </BaseFormField>
          </div>

          <div className="grid gap-2 lg:col-span-2">
            <BaseFormField id="scheduleNotes" label="Schedule Notes" error={form.formState.errors.scheduleNotes?.message}>
              <Controller
                control={form.control}
                name="scheduleNotes"
                render={({ field }) => (
                  <Textarea
                    id="scheduleNotes"
                    placeholder="e.g. Every Monday and Wednesday at 6 PM"
                    {...field}
                  />
                )}
              />
            </BaseFormField>
          </div>
        </div>

        <div className="mt-2 grid gap-6 md:grid-cols-2">
          <Card className="flex flex-col border border-app-border bg-app-surface/50 shadow-none">
            <div className="border-b border-app-border bg-app-soft/30 px-4 py-3">
              <h3 className="text-sm font-semibold text-app-text">
                Assign Coaches
              </h3>
            </div>
            <div className="flex-1 p-4">
              <div className="grid gap-2">
                <Controller
                  control={form.control}
                  name="coachIds"
                  render={({ field }) => (
                    <Select
                      multiple
                      className="min-h-[160px] bg-app-surface"
                      value={field.value}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions, option => option.value);
                        field.onChange(values);
                      }}
                      options={coaches.map((c) => ({
                        label: `${c.firstName} ${c.lastName || ""}`,
                        value: c.id
                      }))}
                    />
                  )}
                />
              </div>
            </div>
          </Card>

          <Card className="flex flex-col border border-app-border bg-app-surface/50 shadow-none">
            <div className="border-b border-app-border bg-app-soft/30 px-4 py-3">
              <h3 className="text-sm font-semibold text-app-text">
                Assign Students
              </h3>
            </div>
            <div className="flex-1 p-4">
              <div className="grid gap-2">
                <Controller
                  control={form.control}
                  name="studentIds"
                  render={({ field }) => (
                    <Select
                      multiple
                      className="min-h-[160px] bg-app-surface"
                      value={field.value}
                      onChange={(e) => {
                        const values = Array.from(e.target.selectedOptions, option => option.value);
                        field.onChange(values);
                      }}
                      options={students.map((s) => ({
                        label: `${s.firstName} ${s.lastName || ""}`,
                        value: s.id
                      }))}
                    />
                  )}
                />
              </div>
            </div>
          </Card>
        </div>
      </Form>
    </Card>
  );
}
