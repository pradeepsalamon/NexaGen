import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save, UserMinus } from "lucide-react";
import type { Batch, CreateBatchRequest, UpdateBatchRequest } from "@nexa-chess/types";

import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { DatePicker } from "@/components/ui/DatePicker";
import { FormField as BaseFormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { FormSelect } from "@/components/forms/FormSelect";
import { AddMemberDialog } from "./AddMemberDialog";
import { BatchLiveClassSettingsTab } from "@/features/live-class/settings/BatchLiveClassSettingsTab";
import { useToast } from "@/providers/ToastProvider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/Tooltip";
import { useAssignableUsersQuery } from "../hooks/useBatchesApi";
import { createBatch, updateBatch, deleteBatch } from "../api/batchApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { queryKeys } from "@/lib/queryKeys";

const batchFormSchema = z.object({
  name: z.string().min(1, "Name is required"),
  description: z.string().optional(),
  startsAt: z.string().min(1, "Start date is required"),
  endsAt: z.string().optional(),
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

type BatchFormProps = {
  onSuccess?: () => void;
  selectedBatch?: Batch | null;
};

function toUpdatePayload(batch: Batch): UpdateBatchRequest {
  return {
    name: batch.name,
    description: batch.description || undefined,
    startsAt: batch.startsAt || "",
    endsAt: batch.endsAt || undefined,
    scheduleNotes: batch.scheduleNotes || undefined,
    status: batch.status,
    coachIds: batch.coaches.map(c => c.id),
    studentIds: batch.students.map(s => s.id),
  };
}

export function BatchForm({ selectedBatch, onSuccess }: BatchFormProps) {
  const { success, info } = useToast();
  const { run: runCreate, isPending: isCreating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (payload: CreateBatchRequest) => {
      const result = await createBatch(payload);
      form.reset();
      onSuccess?.();
      return result;
    },
    undo: (_vars, result) => deleteBatch(result.batch.id),
    toast: (vars) => ({ title: `"${vars.name}" created` }),
    invalidates: [queryKeys.batches.all]
  });

  const { run: runUpdate, isPending: isUpdating } = useUndoableMutation({
    strategy: "immediate",
    mutationFn: async (vars: { id: string; payload: UpdateBatchRequest; previous: Batch }) => {
      const result = await updateBatch(vars.id, vars.payload);
      form.reset();
      onSuccess?.();
      return result;
    },
    undo: (vars) => updateBatch(vars.id, toUpdatePayload(vars.previous)),
    toast: () => ({ title: "Batch updated successfully" }),
    invalidates: [queryKeys.batches.all]
  });
  const assignableUsersQuery = useAssignableUsersQuery();
  
  const coaches = assignableUsersQuery.data?.coaches ?? [];
  const students = assignableUsersQuery.data?.students ?? [];

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: {
      name: selectedBatch?.name || "",
      description: selectedBatch?.description || "",
      startsAt: selectedBatch?.startsAt || "",
      endsAt: selectedBatch?.endsAt || "",
      scheduleNotes: selectedBatch?.scheduleNotes || "",
      status: selectedBatch?.status || "ACTIVE",
      coachIds: selectedBatch?.coaches.map(c => c.id) || [],
      studentIds: selectedBatch?.students.map(s => s.id) || [],
    },
  });

  const isSaving = isCreating || isUpdating;

  function onSubmit(values: BatchFormValues) {
    const payload: Partial<CreateBatchRequest | UpdateBatchRequest> = {
      name: values.name,
      description: values.description || undefined,
      startsAt: values.startsAt || "",
      endsAt: values.endsAt || undefined,
      scheduleNotes: values.scheduleNotes || undefined,
      status: values.status,
      coachIds: values.coachIds,
      studentIds: values.studentIds,
    };

    if (selectedBatch) {
      runUpdate({ id: selectedBatch.id, payload: payload as UpdateBatchRequest, previous: selectedBatch });
    } else {
      runCreate(payload as CreateBatchRequest);
    }
  }

  return (
    <Card className="p-5">
      <Form form={form} onSubmit={onSubmit} className="grid gap-5">
        <Tabs defaultValue="details" className="w-full">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-app-border pb-4 mb-4">
            <div>
              <p className="text-xs font-extrabold uppercase text-primary">
                {selectedBatch ? "Edit batch" : "Create batch"}
              </p>
              <h2 className="mt-2 text-xl font-extrabold text-app-text">
                {selectedBatch ? selectedBatch.name : "Batch details"}
              </h2>
            </div>
            <div className="flex gap-4 items-center">
              {selectedBatch && (
                <TabsList>
                  <TabsTrigger value="details">Details</TabsTrigger>
                  <TabsTrigger value="members">Manage Members</TabsTrigger>
                  <TabsTrigger value="liveClass">Class Settings</TabsTrigger>
                </TabsList>
              )}
              <Button disabled={isSaving} isLoading={isSaving} type="submit">
                <Save aria-hidden="true" className="size-4" strokeWidth={2.5} />
                {selectedBatch ? "Save Batch" : "Create Batch"}
              </Button>
            </div>
          </div>

          <TabsContent value="details" className="grid gap-4 lg:grid-cols-2">
          <FormInput name="name" label="Batch Name" required />
          <FormSelect name="status" label="Status" options={statusOptions} />

          <BaseFormField id="startsAt" label="Start Date" error={form.formState.errors.startsAt?.message}>
            <Controller
              control={form.control}
              name="startsAt"
              render={({ field }) => (
                <DatePicker
                  value={field.value ? new Date(field.value) : undefined}
                  onChange={(date) => field.onChange(date ? date.toISOString() : "")}
                />
              )}
            />
          </BaseFormField>

          <BaseFormField id="endsAt" label="End Date" error={form.formState.errors.endsAt?.message}>
            <Controller
              control={form.control}
              name="endsAt"
              render={({ field }) => (
                <DatePicker
                  value={field.value ? new Date(field.value) : undefined}
                  onChange={(date) => field.onChange(date ? date.toISOString() : "")}
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
          </TabsContent>

          {selectedBatch && (
            <TabsContent value="members">
              <div className="grid gap-6 md:grid-cols-2">
              <Controller
                control={form.control}
                name="coachIds"
                render={({ field }) => {
                  const assignedCoaches = coaches.filter(c => field.value?.includes(c.id));
                  const unassignedCoaches = coaches.filter(c => !field.value?.includes(c.id));

                  return (
                    <Card className="flex flex-col border border-app-border bg-app-surface/50 shadow-none h-full">
                      <div className="flex items-center justify-between border-b border-app-border bg-app-soft/30 px-4 py-3">
                        <h3 className="text-sm font-semibold text-app-text">
                          Assign Coaches
                        </h3>
                        <AddMemberDialog members={unassignedCoaches} onAdd={(id) => {
                          field.onChange([...(field.value || []), id]);
                          const c = unassignedCoaches.find(x => x.id === id);
                          if (c) {
                            success({
                              title: "Coach added",
                              message: `${c.firstName} ${c.lastName || ""} was added to this batch.`,
                              action: {
                                label: "Undo",
                                onClick: () => {
                                  const current = form.getValues("coachIds") || [];
                                  form.setValue("coachIds", current.filter(x => x !== id), { shouldDirty: true });
                                  info({ title: "Action undone", message: "Coach addition was undone." });
                                }
                              }
                            });
                          }
                        }} type="Coach" />
                      </div>
                      <div className="flex-1 p-4">
                        <div className="flex flex-col gap-4">
                          {assignedCoaches.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {assignedCoaches.map(c => (
                                <div key={c.id} className="flex items-center justify-between p-3 border border-app-border rounded-lg bg-app-surface shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                                      {c.firstName.charAt(0)}{c.lastName ? c.lastName.charAt(0) : ""}
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-app-text">{c.firstName} {c.lastName || ""}</p>
                                      <p className="text-xs text-app-muted">{c.email}</p>
                                    </div>
                                  </div>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            field.onChange((field.value || []).filter(id => id !== c.id));
                                            success({
                                              title: "Coach removed",
                                              message: `${c.firstName} ${c.lastName || ""} was removed from this batch.`,
                                              action: {
                                                label: "Undo",
                                                onClick: () => {
                                                  const current = form.getValues("coachIds") || [];
                                                  if (!current.includes(c.id)) {
                                                    form.setValue("coachIds", [...current, c.id], { shouldDirty: true });
                                                    info({ title: "Action undone", message: "Coach removal was undone." });
                                                  }
                                                }
                                              }
                                            });
                                          }}
                                          className="flex size-8 items-center justify-center rounded-full border border-app-danger text-app-text transition-colors hover:bg-app-danger hover:text-white"
                                        >
                                          <UserMinus className="size-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remove coach</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-app-muted">No coaches assigned yet.</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                }}
              />

              <Controller
                control={form.control}
                name="studentIds"
                render={({ field }) => {
                  const assignedStudents = students.filter(s => field.value?.includes(s.id));
                  const unassignedStudents = students.filter(s => !field.value?.includes(s.id));

                  return (
                    <Card className="flex flex-col border border-app-border bg-app-surface/50 shadow-none h-full">
                      <div className="flex items-center justify-between border-b border-app-border bg-app-soft/30 px-4 py-3">
                        <h3 className="text-sm font-semibold text-app-text">
                          Assign Students
                        </h3>
                        <AddMemberDialog members={unassignedStudents} onAdd={(id) => {
                          field.onChange([...(field.value || []), id]);
                          const s = unassignedStudents.find(x => x.id === id);
                          if (s) {
                            success({
                              title: "Student added",
                              message: `${s.firstName} ${s.lastName || ""} was added to this batch.`,
                              action: {
                                label: "Undo",
                                onClick: () => {
                                  const current = form.getValues("studentIds") || [];
                                  form.setValue("studentIds", current.filter(x => x !== id), { shouldDirty: true });
                                  info({ title: "Action undone", message: "Student addition was undone." });
                                }
                              }
                            });
                          }
                        }} type="Student" />
                      </div>
                      <div className="flex-1 p-4">
                        <div className="flex flex-col gap-4">
                          {assignedStudents.length > 0 ? (
                            <div className="flex flex-col gap-2">
                              {assignedStudents.map(s => (
                                <div key={s.id} className="flex items-center justify-between p-3 border border-app-border rounded-lg bg-app-surface shadow-sm">
                                  <div className="flex items-center gap-3">
                                    <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary font-bold">
                                      {s.firstName.charAt(0)}{s.lastName ? s.lastName.charAt(0) : ""}
                                    </div>
                                    <div>
                                      <p className="text-sm font-semibold text-app-text">{s.firstName} {s.lastName || ""}</p>
                                      <p className="text-xs text-app-muted">{s.email}</p>
                                    </div>
                                  </div>
                                  <TooltipProvider>
                                    <Tooltip>
                                      <TooltipTrigger asChild>
                                        <button
                                          type="button"
                                          onClick={() => {
                                            field.onChange((field.value || []).filter(id => id !== s.id));
                                            success({
                                              title: "Student removed",
                                              message: `${s.firstName} ${s.lastName || ""} was removed from this batch.`,
                                              action: {
                                                label: "Undo",
                                                onClick: () => {
                                                  const current = form.getValues("studentIds") || [];
                                                  if (!current.includes(s.id)) {
                                                    form.setValue("studentIds", [...current, s.id], { shouldDirty: true });
                                                    info({ title: "Action undone", message: "Student removal was undone." });
                                                  }
                                                }
                                              }
                                            });
                                          }}
                                          className="flex size-8 items-center justify-center rounded-full border border-app-danger text-app-text transition-colors hover:bg-app-danger hover:text-white"
                                        >
                                          <UserMinus className="size-4" />
                                        </button>
                                      </TooltipTrigger>
                                      <TooltipContent>Remove student</TooltipContent>
                                    </Tooltip>
                                  </TooltipProvider>
                                </div>
                              ))}
                            </div>
                          ) : (
                            <p className="text-sm text-app-muted">No students assigned yet.</p>
                          )}
                        </div>
                      </div>
                    </Card>
                  );
                }}
              />
            </div>
          </TabsContent>
          )}

          {selectedBatch && (
            <TabsContent value="liveClass">
              <BatchLiveClassSettingsTab batchId={selectedBatch.id} />
            </TabsContent>
          )}
        </Tabs>
      </Form>
    </Card>
  );
}
