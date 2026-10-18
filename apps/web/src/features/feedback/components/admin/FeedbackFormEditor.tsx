"use client";

import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { Plus } from "lucide-react";
import {
  FEEDBACK_PLACEMENT_DESCRIPTIONS,
  FEEDBACK_PLACEMENT_LABELS,
  FEEDBACK_TRIGGER_LABELS,
  upsertFeedbackFormRequestSchema,
  type FeedbackFormDto,
  type FeedbackPlacement,
  type FeedbackTrigger,
  type UpsertFeedbackFormRequest
} from "@nexa-chess/types";
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
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useSaveFeedbackFormMutation } from "../../hooks/useFeedbackApi";
import { blankQuestion, defaultFormValues, formToValues } from "../../lib/formDefaults";
import { QuestionEditor } from "./QuestionEditor";
import { Switch } from "@/components/ui/Switch";

const TRIGGER_OPTIONS = (Object.keys(FEEDBACK_TRIGGER_LABELS) as FeedbackTrigger[]).map((value) => ({
  label: FEEDBACK_TRIGGER_LABELS[value],
  value
}));

const PLACEMENTS = Object.keys(FEEDBACK_PLACEMENT_LABELS) as FeedbackPlacement[];

function Section({ children, description, title }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <section className="grid gap-3 border-t border-app-border pt-5 first:border-t-0 first:pt-0">
      <div>
        <h3 className="text-sm font-extrabold text-app-text">{title}</h3>
        {description ? <p className="text-sm text-app-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs font-medium text-app-danger-ink">{message}</p> : null;
}

const toNumber = (value: string) => (value === "" ? 0 : Number(value));

export function FeedbackFormEditor({
  form,
  onOpenChange,
  open
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Null = create a new form. */
  form: FeedbackFormDto | null;
}) {
  const save = useSaveFeedbackFormMutation();
  const { data: batchData } = useBatchesQuery({ pageSize: 100 });
  const batches = useMemo(() => batchData?.batches ?? [], [batchData]);

  const {
    control,
    formState: { errors, isSubmitted },
    handleSubmit,
    register,
    reset,
    setValue,
    watch
  } = useForm<UpsertFeedbackFormRequest>({
    defaultValues: defaultFormValues(),
    resolver: zodResolver(upsertFeedbackFormRequestSchema)
  });

  useEffect(() => {
    if (open) reset(form ? formToValues(form) : defaultFormValues());
  }, [form, open, reset]);

  const questions = watch("questions");
  const trigger = watch("trigger");
  const batchIds = watch("batchIds");

  const setQuestions = (next: UpsertFeedbackFormRequest["questions"]) =>
    setValue("questions", next, { shouldDirty: true, shouldValidate: isSubmitted });

  const onValid = (values: UpsertFeedbackFormRequest) => {
    save.mutate(
      {
        body: {
          ...values,
          description: values.description?.trim() || null,
          intervalDays: values.trigger === "RECURRING" ? values.intervalDays : null
        },
        id: form?.id
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  // Choices are edited as raw lines; drop blank ones before validating.
  const submit = () => {
    setQuestions(
      questions.map((q) =>
        q.type === "SINGLE_CHOICE"
          ? { ...q, options: (q.options ?? []).map((o) => o.trim()).filter(Boolean) }
          : q
      )
    );
    void handleSubmit(onValid)();
  };

  const toggleBatch = (id: string, checked: boolean) =>
    setValue("batchIds", checked ? [...batchIds, id] : batchIds.filter((b) => b !== id), {
      shouldDirty: true
    });

  return (
    <Dialog onOpenChange={onOpenChange} open={open}>
      <DialogContent className="max-h-[92dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{form ? "Edit feedback form" : "New feedback form"}</DialogTitle>
          <DialogDescription>
            Students answer this about their coach. Star-rating answers make up the coach&apos;s rating.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-6">
          <Section title="Form">
            <div className="grid gap-1.5">
              <Label htmlFor="feedback-title">Title</Label>
              <Input hasError={Boolean(errors.title)} id="feedback-title" maxLength={120} {...register("title")} />
              <FieldError message={errors.title?.message} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor="feedback-description">Intro for students (optional)</Label>
              <Textarea
                id="feedback-description"
                maxLength={500}
                rows={2}
                {...register("description")}
                placeholder="e.g. Takes 30 seconds. Your coach sees answers anonymously."
              />
            </div>
          </Section>

          <Section description="Add, reorder or remove the questions students see." title="Questions">
            <div className="grid gap-3">
              {questions.map((question, index) => {
                const qErrors = errors.questions?.[index];
                return (
                  <QuestionEditor
                    error={qErrors?.label?.message ?? qErrors?.options?.message ?? qErrors?.options?.root?.message}
                    index={index}
                    isFirst={index === 0}
                    isLast={index === questions.length - 1}
                    key={question.id}
                    onChange={(next) => setQuestions(questions.map((q, i) => (i === index ? next : q)))}
                    onMove={(direction) => {
                      const next = [...questions];
                      const [moved] = next.splice(index, 1);
                      next.splice(index + direction, 0, moved);
                      setQuestions(next);
                    }}
                    onRemove={() => setQuestions(questions.filter((_, i) => i !== index))}
                    question={question}
                  />
                );
              })}
            </div>
            <FieldError message={errors.questions?.message ?? errors.questions?.root?.message} />
            <Button
              className="w-fit"
              disabled={questions.length >= 20}
              onClick={() => setQuestions([...questions, blankQuestion()])}
              type="button"
              variant="outline"
            >
              <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Add question
            </Button>
          </Section>

          <Section
            description="Decide what makes a student get asked. Only classes that end after the start date (or after the form is created) count."
            title="When to ask"
          >
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label htmlFor="feedback-trigger">Ask</Label>
                <Select id="feedback-trigger" options={TRIGGER_OPTIONS} {...register("trigger")} />
              </div>

              {trigger === "AFTER_CLASS" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="feedback-class-interval">After every … classes with the same coach</Label>
                  <Input
                    id="feedback-class-interval"
                    max={50}
                    min={1}
                    type="number"
                    {...register("classInterval", { setValueAs: toNumber })}
                  />
                  <FieldError message={errors.classInterval?.message} />
                </div>
              ) : trigger === "RECURRING" ? (
                <div className="grid gap-1.5">
                  <Label htmlFor="feedback-interval-days">Every … days (per coach)</Label>
                  <Input
                    id="feedback-interval-days"
                    max={365}
                    min={1}
                    type="number"
                    {...register("intervalDays", { setValueAs: toNumber })}
                  />
                  <FieldError message={errors.intervalDays?.message} />
                </div>
              ) : (
                <p className="self-end text-sm text-app-muted">
                  Each student is asked once about each coach they&apos;ve had a class with.
                </p>
              )}

              <div className="grid gap-1.5">
                <Label htmlFor="feedback-expires">Stays open for (days)</Label>
                <Input
                  id="feedback-expires"
                  max={90}
                  min={1}
                  type="number"
                  {...register("expiresAfterDays", { setValueAs: toNumber })}
                />
                <FieldError message={errors.expiresAfterDays?.message} />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="grid gap-1.5">
                <Label>Start (optional)</Label>
                <Controller
                  control={control}
                  name="startsAt"
                  render={({ field }) => (
                    <DatePicker
                      onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                      placeholder="Starts right away"
                      value={field.value ? new Date(field.value) : undefined}
                      withTime
                    />
                  )}
                />
              </div>
              <div className="grid gap-1.5">
                <Label>End (optional)</Label>
                <Controller
                  control={control}
                  name="endsAt"
                  render={({ field }) => (
                    <DatePicker
                      onChange={(date) => field.onChange(date ? date.toISOString() : null)}
                      placeholder="No end date"
                      value={field.value ? new Date(field.value) : undefined}
                      withTime
                    />
                  )}
                />
                <FieldError message={errors.endsAt?.message} />
              </div>
            </div>
          </Section>

          <Section description="Pick every place a student should see it." title="Where it appears">
            <Controller
              control={control}
              name="placements"
              render={({ field }) => (
                <div className="grid gap-2">
                  {PLACEMENTS.map((placement) => {
                    const checked = field.value.includes(placement);
                    return (
                      <label
                        className="flex cursor-pointer items-start gap-3 rounded-app border border-app-border p-3 transition hover:border-primary"
                        htmlFor={`placement-${placement}`}
                        key={placement}
                      >
                        <Checkbox
                          checked={checked}
                          className="mt-0.5"
                          id={`placement-${placement}`}
                          onCheckedChange={(value) =>
                            field.onChange(
                              value === true
                                ? [...field.value, placement]
                                : field.value.filter((p) => p !== placement)
                            )
                          }
                        />
                        <span className="grid gap-0.5">
                          <span className="text-sm font-semibold text-app-text">
                            {FEEDBACK_PLACEMENT_LABELS[placement]}
                          </span>
                          <span className="text-xs text-app-muted">{FEEDBACK_PLACEMENT_DESCRIPTIONS[placement]}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
              )}
            />
            <FieldError message={errors.placements?.message} />
          </Section>

          <Section description="Leave everything unticked to ask students in every batch." title="Which batches">
            <Checkbox
              checked={batchIds.length === 0}
              id="batches-all"
              label="All batches"
              onCheckedChange={(checked) => {
                if (checked === true) setValue("batchIds", [], { shouldDirty: true });
              }}
            />
            {batches.length > 0 ? (
              <div className="grid grid-cols-1 max-h-48 gap-1 overflow-y-auto rounded-app border border-app-border p-2 sm:grid-cols-2">
                {batches.map((batch) => (
                  <Checkbox
                    checked={batchIds.includes(batch.id)}
                    id={`batch-${batch.id}`}
                    key={batch.id}
                    label={batch.name}
                    onCheckedChange={(checked) => toggleBatch(batch.id, checked === true)}
                  />
                ))}
              </div>
            ) : null}
          </Section>

          <Section title="Options">
            <div className="grid gap-1">
              <Controller
                control={control}
                name="isActive"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    id="feedback-active"
                    label="Active — students are asked while this is on"
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <Controller
                control={control}
                name="allowSkip"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    id="feedback-skip"
                    label="Let students skip it"
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
              <Controller
                control={control}
                name="showToCoach"
                render={({ field }) => (
                  <Switch
                    checked={field.value}
                    id="feedback-coach"
                    label="Show results to the coach (anonymously)"
                    onCheckedChange={(v) => field.onChange(v === true)}
                  />
                )}
              />
            </div>
          </Section>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={save.isPending} onClick={submit} type="button">
            {save.isPending ? "Saving…" : form ? "Save changes" : "Create form"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
