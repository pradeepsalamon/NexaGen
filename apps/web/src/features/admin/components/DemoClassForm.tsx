import { useEffect } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { FormSelect } from "@/components/forms/FormSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { Textarea } from "@/components/ui/Textarea";
import { FormField as BaseFormField } from "@/components/ui/FormField";
import { useAssignableUsersQuery } from "@/features/batches/hooks/useBatchesApi";
import { useCreateDemoClassMutation, useUpdateDemoClassMutation } from "../hooks/useAdminDemoClasses";
import type { DemoClass } from "@nexa-chess/types";

const formSchema = z.object({
  coachId: z.string().min(1, "Coach is required"),
  topic: z.string().min(1, "Topic is required").max(120),
  description: z.string().optional(),
  startsAt: z.string().min(1, "Start date is required"),
  endsAt: z.string().min(1, "End date is required"),
});

interface DemoClassFormProps {
  onSuccess?: () => void;
  selectedClass?: DemoClass | null;
}

export function DemoClassForm({ onSuccess, selectedClass }: DemoClassFormProps) {
  const { data: usersData, isLoading: isLoadingUsers } = useAssignableUsersQuery();
  const createMutation = useCreateDemoClassMutation();
  const updateMutation = useUpdateDemoClassMutation(selectedClass?.id || "");

  const form = useForm<z.infer<typeof formSchema>>({
    resolver: zodResolver(formSchema),
    defaultValues: {
      coachId: "",
      topic: "",
      description: "",
      startsAt: "",
      endsAt: "",
    },
  });

  useEffect(() => {
    if (selectedClass) {
      form.reset({
        coachId: usersData?.coaches?.find(c => `${c.firstName} ${c.lastName || ""}`.trim() === selectedClass.coachName)?.id || "",
        topic: selectedClass.topic,
        description: selectedClass.description || "",
        startsAt: selectedClass.startsAt,
        endsAt: selectedClass.endsAt,
      });
    } else {
      form.reset({
        coachId: "",
        topic: "",
        description: "",
        startsAt: "",
        endsAt: "",
      });
    }
  }, [selectedClass, form, usersData]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    const submitData = {
      ...values,
      startsAt: new Date(values.startsAt).toISOString(),
      endsAt: new Date(values.endsAt).toISOString(),
    };
    if (selectedClass) {
      updateMutation.mutate(submitData, {
        onSuccess: () => {
          form.reset();
          onSuccess?.();
        }
      });
    } else {
      createMutation.mutate(submitData, {
        onSuccess: () => {
          form.reset();
          onSuccess?.();
        }
      });
    }
  };

  const isPending = createMutation.isPending || updateMutation.isPending;

  const coachOptions = (usersData?.coaches || []).map(coach => ({
    label: `${coach.firstName} ${coach.lastName || ""}`.trim(),
    value: coach.id,
  }));

  return (
    <Card className="mx-auto max-w-2xl p-6">
      <div className="mb-6">
        <h2 className="text-xl font-bold text-app-text">
          {selectedClass ? "Edit Demo Class" : "Create Demo Class"}
        </h2>
        <p className="mt-1 text-sm text-app-text-muted">
          {selectedClass ? "Update details for this demo class." : "Schedule a new demo class and assign a coach."}
        </p>
      </div>

        <Form form={form} onSubmit={onSubmit} className="space-y-4">
          <FormSelect
            name="coachId"
            id="coachId"
            label="Assign Coach"
            options={coachOptions}
            disabled={isLoadingUsers}
            placeholder="Select a coach..."
          />
          <FormInput
            name="topic"
            label="Topic"
            placeholder="e.g., Introduction to Openings"
          />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <BaseFormField
              id="startsAt"
              label="Start Time"
              error={form.formState.errors.startsAt?.message}
            >
              <DatePicker
                value={form.watch("startsAt") ? new Date(form.watch("startsAt")) : undefined}
                onChange={(date) => form.setValue("startsAt", date ? date.toISOString() : "")}
                withTime
              />
            </BaseFormField>
            <BaseFormField
              id="endsAt"
              label="End Time"
              error={form.formState.errors.endsAt?.message}
            >
              <DatePicker
                value={form.watch("endsAt") ? new Date(form.watch("endsAt")) : undefined}
                onChange={(date) => form.setValue("endsAt", date ? date.toISOString() : "")}
                withTime
              />
            </BaseFormField>
          </div>
          <BaseFormField
            id="description"
            label="Description (Optional)"
            error={form.formState.errors.description?.message}
          >
            <Textarea
              {...form.register("description")}
              placeholder="What will this demo class cover?"
              rows={3}
            />
          </BaseFormField>
          <div className="mt-6 flex justify-end gap-3 pt-4 border-t border-app-border">
            <Button
              type="button"
              variant="outline"
              onClick={() => onSuccess?.()}
              disabled={isPending}
            >
              Cancel
            </Button>
            <Button type="submit" isLoading={isPending} className="gap-2">
              <Save className="size-4" />
              {selectedClass ? "Update Class" : "Create Class"}
            </Button>
          </div>
        </Form>
    </Card>
  );
}
