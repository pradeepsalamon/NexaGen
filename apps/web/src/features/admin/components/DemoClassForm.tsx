import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { Save } from "lucide-react";
import { demoPasscodeSchema, type DemoClass, type DemoClassAccessMode } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Form } from "@/components/forms/Form";
import { FormInput } from "@/components/forms/FormInput";
import { FormSelect } from "@/components/forms/FormSelect";
import { DatePicker } from "@/components/ui/DatePicker";
import { Input } from "@/components/ui/Input";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { FormField as BaseFormField } from "@/components/ui/FormField";
import { useAssignableUsersQuery } from "@/features/batches/hooks/useBatchesApi";
import { useCreateDemoClassMutation, useUpdateDemoClassMutation } from "../hooks/useAdminDemoClasses";
import { DemoAccessFields } from "./demo-classes/DemoAccessFields";
import {
  DemoInviteePicker,
  EMPTY_PENDING_INVITEES,
  pendingInviteeCount,
  type PendingInvitees
} from "./demo-classes/DemoInviteePicker";

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
  const [duration, setDuration] = useState("60");
  const [isDurationDropdownOpen, setIsDurationDropdownOpen] = useState(false);
  const [accessMode, setAccessMode] = useState<DemoClassAccessMode>(selectedClass?.accessMode ?? "PUBLIC");
  const [passcode, setPasscode] = useState(selectedClass?.passcode ?? "");
  const [passcodeError, setPasscodeError] = useState<string | undefined>();
  const [durationError, setDurationError] = useState<string | undefined>();
  const [invitees, setInvitees] = useState<PendingInvitees>(EMPTY_PENDING_INVITEES);
  const [notifyInvitees, setNotifyInvitees] = useState(true);
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
        coachId: selectedClass.coachId,
        topic: selectedClass.topic,
        description: selectedClass.description || "",
        startsAt: selectedClass.startsAt,
        endsAt: selectedClass.endsAt,
      });
      const durMs = new Date(selectedClass.endsAt).getTime() - new Date(selectedClass.startsAt).getTime();
      const durMins = Math.round(durMs / 60000);
      setDuration(durMins.toString());
    } else {
      form.reset({
        coachId: "",
        topic: "",
        description: "",
        startsAt: "",
        endsAt: new Date().toISOString(),
      });
      setDuration("60");
    }
  }, [selectedClass, form]);

  const onSubmit = (values: z.infer<typeof formSchema>) => {
    if (accessMode === "PASSCODE") {
      const parsed = demoPasscodeSchema.safeParse(passcode);
      if (!parsed.success) {
        setPasscodeError(parsed.error.issues[0]?.message);
        return;
      }
    }
    setPasscodeError(undefined);

    const minutes = Number(duration);
    if (!Number.isInteger(minutes) || minutes <= 0 || minutes > 1440) {
      setDurationError("Enter the duration as a whole number of minutes (1 to 1440).");
      return;
    }

    const startObj = new Date(values.startsAt);
    const endsAtObj = new Date(startObj.getTime() + minutes * 60000);
    if (Number.isNaN(endsAtObj.getTime())) {
      setDurationError("Please enter a valid start time and duration.");
      return;
    }
    setDurationError(undefined);

    const submitData = {
      ...values,
      startsAt: startObj.toISOString(),
      endsAt: endsAtObj.toISOString(),
      accessMode,
      ...(accessMode === "PASSCODE" ? { passcode } : {}),
    };
    if (selectedClass) {
      updateMutation.mutate(submitData, {
        onSuccess: () => {
          form.reset();
          onSuccess?.();
        }
      });
    } else {
      createMutation.mutate(
        {
          ...submitData,
          leadIds: invitees.leads.map((l) => l.id),
          invitees: invitees.invitees,
          notifyInvitees,
        },
        {
          onSuccess: () => {
            form.reset();
            setInvitees(EMPTY_PENDING_INVITEES);
            onSuccess?.();
          }
        }
      );
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
        <p className="mt-1 text-sm text-app-muted">
          {selectedClass
            ? "Update details for this demo class. Manage its guests from the class details."
            : "Schedule a one-off demo class. For a recurring slot with a permanent link, use Schedules."}
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
            <div className="space-y-2">
              <label className="text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">Duration</label>
              <div className="relative">
                <Input
                  type="number"
                  min={1}
                  placeholder="Minutes (e.g. 60)"
                  aria-describedby={durationError ? "demo-duration-error" : undefined}
                  aria-invalid={!!durationError}
                  hasError={!!durationError}
                  value={duration}
                  onChange={(e) => {
                    setDuration(e.target.value);
                    setDurationError(undefined);
                  }}
                  onFocus={() => setIsDurationDropdownOpen(true)}
                  onBlur={() => setTimeout(() => setIsDurationDropdownOpen(false), 200)}
                />
                {isDurationDropdownOpen && (
                  <div className="absolute z-50 w-full mt-1 rounded-control border border-app-border bg-app-surface shadow-card">
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
                          className="px-3 py-2 hover:bg-primary hover:text-on-primary cursor-pointer transition-colors"
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
              {durationError ? (
                <p className="m-0 text-xs leading-5 text-app-danger-ink" id="demo-duration-error" role="alert">
                  {durationError}
                </p>
              ) : null}
            </div>
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

          <div className="border-t border-app-border pt-4">
            <DemoAccessFields
              accessMode={accessMode}
              passcode={passcode}
              onAccessModeChange={setAccessMode}
              onPasscodeChange={(value) => {
                setPasscode(value);
                setPasscodeError(undefined);
              }}
              passcodeError={passcodeError}
              disabled={isPending}
            />
          </div>

          {!selectedClass && (
            <div className="grid gap-3 border-t border-app-border pt-4">
              <div>
                <p className="text-sm font-medium text-app-text">Invite guests (optional)</p>
                <p className="text-xs text-app-muted">You can also add guests later from the class details.</p>
              </div>
              <DemoInviteePicker value={invitees} onChange={setInvitees} disabled={isPending} />
              {pendingInviteeCount(invitees) > 0 && (
                <Switch
                  checked={notifyInvitees}
                  onCheckedChange={setNotifyInvitees}
                  label="Send each guest their personal link (email / WhatsApp)"
                />
              )}
            </div>
          )}

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
