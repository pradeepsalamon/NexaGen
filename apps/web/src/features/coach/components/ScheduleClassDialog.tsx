import { zodResolver } from "@hookform/resolvers/zod";
import { useEffect } from "react";
import { useForm, Controller } from "react-hook-form";
import { ChevronDown, SlidersHorizontal } from "lucide-react";
import {
  DEFAULT_LIVE_CLASS_SETTINGS,
  createClassRequestSchema,
  type CreateClassRequest,
  type CoachClass,
  type CoachBatch,
  type LiveClassSettingsOverride,
} from "@nexa-chess/types";
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
import { cn } from "@/lib/utils";
import { ClassSettingsPanel } from "@/features/live-class/settings/ClassSettingsPanel";
import {
  useBatchLiveClassSettings,
  useClassLiveSettings,
  useLiveClassPresets,
} from "@/features/live-class/settings/hooks";
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
  const [showSettings, setShowSettings] = useState(false);
  const [settingsOverride, setSettingsOverride] = useState<LiveClassSettingsOverride>({});
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

  const selectedBatchId = form.watch("batchId");
  const { data: batchSettings } = useBatchLiveClassSettings(selectedBatchId || undefined, open);
  const { data: presetData } = useLiveClassPresets(open);
  const { data: classSettings } = useClassLiveSettings(
    classToEdit?.id ?? "",
    open && !!classToEdit,
  );

  // Seed the override from the class's saved config once it loads (edit mode).
  useEffect(() => {
    if (classToEdit && open && classSettings) {
      setSettingsOverride(classSettings.classOverride ?? {});
    }
  }, [classToEdit, open, classSettings]);

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
      setSettingsOverride({});
      setShowSettings(false);
    }
  }, [classToEdit, open, form, batches, defaultBatchId]);


  const onSubmit = (data: CreateClassRequest) => {
    const startObj = new Date(data.startsAt);
    const endsAtObj = new Date(startObj.getTime() + parseInt(duration) * 60000);
    
    // Need to ensure the datetime strings sent to backend are full ISO strings UTC
    const submitData = {
      ...data,
      startsAt: startObj.toISOString(),
      endsAt: endsAtObj.toISOString(),
      liveClassSettings:
        Object.keys(settingsOverride).length > 0 ? settingsOverride : undefined
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

          <div className="rounded-app border border-app-border">
            <button
              type="button"
              onClick={() => setShowSettings((v) => !v)}
              className="flex w-full items-center justify-between gap-2 px-3.5 py-3 text-left"
              aria-expanded={showSettings}
            >
              <span className="flex items-center gap-2 text-sm font-semibold text-app-text">
                <SlidersHorizontal className="size-4 text-app-muted" strokeWidth={2.5} />
                Class settings
                {Object.keys(settingsOverride).length > 0 && (
                  <span className="rounded-full bg-app-soft px-2 py-0.5 text-[10px] font-bold text-primary">
                    {Object.keys(settingsOverride).length} customised
                  </span>
                )}
              </span>
              <ChevronDown
                className={cn(
                  "size-4 shrink-0 text-app-muted transition-transform",
                  showSettings && "rotate-180",
                )}
              />
            </button>
            {showSettings && (
              <div className="border-t border-app-border p-3.5">
                {selectedBatchId ? (
                  <ClassSettingsPanel
                    system={batchSettings?.system ?? DEFAULT_LIVE_CLASS_SETTINGS}
                    batchOverride={batchSettings?.batchOverride ?? null}
                    value={settingsOverride}
                    onChange={setSettingsOverride}
                    presets={presetData?.presets ?? []}
                  />
                ) : (
                  <p className="text-sm text-app-muted">Select a batch to configure class settings.</p>
                )}
              </div>
            )}
          </div>

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
