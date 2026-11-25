"use client";

import {
  CLASS_RECAP_AI_LABEL,
  CLASS_RECAP_EDIT_LIMITS,
  CLASS_RECAP_FAILURE_LABELS,
  findStudentIdentifiers,
  type ClassRecapContent,
  type ClassRecapStaffView
} from "@nexa-chess/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Loader2, RefreshCw, ThumbsDown, ThumbsUp } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { z } from "zod";
import { Alert } from "@/components/ui/Alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle
} from "@/components/ui/AlertDialog";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { onInvalidSubmit } from "@/lib/forms";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { useToast } from "@/providers/ToastProvider";
import {
  discardClassRecap,
  publishClassRecap,
  rateClassRecap,
  regenerateClassRecap,
  restoreClassRecap,
  saveClassRecap,
  unpublishClassRecap
} from "../api/classRecapApi";
import { ClassRecapContentView } from "./ClassRecapContentView";
import { ClassRecapStatusBadge } from "./ClassRecapStatusBadge";

// Lists are edited one item per line.
const toLines = (items: string[]) => items.join("\n");
const fromLines = (text: string) =>
  text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);

const noCodes = (text: string) => findStudentIdentifiers(text).length === 0;
const CODE_MESSAGE = "Remove student codes like S1: students see this, and the codes mean nothing to them.";
const linesField = (label: string) =>
  z
    .string()
    .refine((text) => fromLines(text).length <= CLASS_RECAP_EDIT_LIMITS.items, `At most ${CLASS_RECAP_EDIT_LIMITS.items} ${label}`)
    .refine(
      (text) => fromLines(text).every((line) => line.length <= CLASS_RECAP_EDIT_LIMITS.itemChars),
      `Keep each line under ${CLASS_RECAP_EDIT_LIMITS.itemChars} characters`
    )
    .refine(noCodes, CODE_MESSAGE);

const formSchema = z.object({
  keyPoints: linesField("key ideas"),
  practice: linesField("practice ideas"),
  recap: z
    .string()
    .trim()
    .min(1, "Write a short recap")
    .max(CLASS_RECAP_EDIT_LIMITS.recapChars, `At most ${CLASS_RECAP_EDIT_LIMITS.recapChars} characters`)
    .refine(noCodes, CODE_MESSAGE)
});
type FormValues = z.infer<typeof formSchema>;

const toContent = (values: FormValues): ClassRecapContent => ({
  keyPoints: fromLines(values.keyPoints),
  practice: fromLines(values.practice),
  recap: values.recap.trim()
});

/**
 * The reviewer's view of one class recap (the class's coach and admins):
 * edit and publish a draft, take it back, discard or regenerate it, rate it.
 */
export function ClassRecapReviewPanel({ recap }: { recap: ClassRecapStaffView }) {
  const classId = recap.class.classId;
  const toast = useToast();
  const queryClient = useQueryClient();
  const timeZone = useUserTimeZone();
  const [confirmRegenerate, setConfirmRegenerate] = useState(false);
  const invalidates = [queryKeys.classRecaps.all];
  const refresh = () => void queryClient.invalidateQueries({ queryKey: queryKeys.classRecaps.all });

  const content = recap.content ?? recap.draft;
  const form = useForm<FormValues>({
    defaultValues: {
      keyPoints: toLines(content?.keyPoints ?? []),
      practice: toLines(content?.practice ?? []),
      recap: content?.recap ?? ""
    },
    mode: "onSubmit",
    resolver: zodResolver(formSchema)
  });
  const { errors, isSubmitted } = form.formState;

  const publish = useUndoableMutation({
    invalidates,
    mutationFn: (vars: { content: ClassRecapContent }) => publishClassRecap(classId, vars.content),
    strategy: "immediate",
    toast: () => ({ message: "Students of this class can read it now.", title: "Recap published" }),
    undo: () => unpublishClassRecap(classId)
  });
  const unpublish = useUndoableMutation({
    invalidates,
    mutationFn: () => unpublishClassRecap(classId),
    strategy: "immediate",
    toast: () => ({ message: "Students no longer see it. It is back to review.", title: "Recap taken back" }),
    undo: () => publishClassRecap(classId)
  });
  const discard = useUndoableMutation({
    invalidates,
    mutationFn: () => discardClassRecap(classId),
    strategy: "immediate",
    toast: () => ({ title: "Recap discarded" }),
    undo: () => restoreClassRecap(classId)
  });
  const restore = useUndoableMutation({
    invalidates,
    mutationFn: () => restoreClassRecap(classId),
    strategy: "immediate",
    toast: () => ({ title: "Recap back in review" }),
    undo: () => discardClassRecap(classId)
  });
  // undo: intentionally excluded — saving a draft is a Save; editing again is the correction.
  const save = useMutation({
    mutationFn: (vars: { content: ClassRecapContent }) => saveClassRecap(classId, vars.content),
    onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save the recap" }),
    onSuccess: () => {
      toast.success({ title: "Draft saved" });
      refresh();
    }
  });
  // undo: intentionally excluded — a new draft costs a model run and is confirmed up front.
  const regenerate = useMutation({
    mutationFn: () => regenerateClassRecap(classId),
    onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't make a new draft" }),
    onSuccess: () => {
      toast.success({ message: "The AI writes it between classes; this can take a while.", title: "New draft requested" });
      refresh();
    }
  });
  // undo: intentionally excluded — a rating is the opposite button.
  const rate = useMutation({
    mutationFn: (rating: 1 | -1) => rateClassRecap(classId, rating),
    onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save your rating" }),
    onSuccess: refresh
  });

  const busy = publish.isPending || unpublish.isPending || discard.isPending || restore.isPending || save.isPending || regenerate.isPending;
  const canRegenerate = recap.regenerationsLeft > 0 && ["READY", "DISCARDED", "FAILED", "SKIPPED"].includes(recap.status);

  const regenerateButton = canRegenerate ? (
    <Button disabled={busy} type="button" variant="ghost" onClick={() => setConfirmRegenerate(true)}>
      <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
      New draft
    </Button>
  ) : null;

  const rating =
    recap.draft && recap.status !== "QUEUED" && recap.status !== "RUNNING" ? (
      <div className="flex items-center gap-1">
        <span className="mr-1 text-xs text-app-muted">Was the AI draft useful?</span>
        <SimpleTooltip label="Useful">
          <Button
            aria-label="The AI draft was useful"
            aria-pressed={recap.rating === 1}
            className={recap.rating === 1 ? "text-success-ink" : undefined}
            disabled={rate.isPending}
            size="icon"
            type="button"
            variant="neutral"
            onClick={() => rate.mutate(1)}
          >
            <ThumbsUp aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
        <SimpleTooltip label="Not useful">
          <Button
            aria-label="The AI draft was not useful"
            aria-pressed={recap.rating === -1}
            className={recap.rating === -1 ? "text-app-danger-ink" : undefined}
            disabled={rate.isPending}
            size="icon"
            type="button"
            variant="neutral"
            onClick={() => rate.mutate(-1)}
          >
            <ThumbsDown aria-hidden="true" className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>
    ) : null;

  const originalDraft =
    recap.draft && recap.edited ? (
      <details className="rounded-app border border-app-border p-3">
        <summary className="cursor-pointer text-sm font-semibold text-app-text">The AI&apos;s original draft</summary>
        <div className="mt-3">
          <ClassRecapContentView content={recap.draft} />
        </div>
      </details>
    ) : null;

  const generatedBy =
    recap.generatedAt && recap.model ? (
      <p className="text-xs text-app-muted">
        Drafted {formatDateTime(recap.generatedAt, timeZone)} by {recap.model} ({recap.provider === "OUTSIDE" ? recap.providerName : "our server"}).
      </p>
    ) : null;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <ClassRecapStatusBadge status={recap.status} />
        {recap.edited ? <span className="text-xs font-semibold text-app-muted">Edited</span> : null}
      </div>

      {recap.status === "QUEUED" || recap.status === "RUNNING" ? (
        <p className="flex items-center gap-2 text-sm text-app-muted">
          <Loader2 aria-hidden="true" className="size-4 motion-safe:animate-spin" strokeWidth={2.5} />
          The AI is writing a draft from the class transcript. It runs between classes, so this can take a while.
        </p>
      ) : null}

      {recap.status === "FAILED" || recap.status === "SKIPPED" ? (
        <Alert variant={recap.status === "FAILED" ? "warning" : "info"}>
          {recap.failure ? CLASS_RECAP_FAILURE_LABELS[recap.failure] : "No recap was made."}{" "}
          {recap.status === "FAILED" ? "You can ask for a new draft." : null}
        </Alert>
      ) : null}

      {recap.status === "READY" ? (
        <form
          className="space-y-4"
          noValidate
          onSubmit={form.handleSubmit((values) => void publish.run({ content: toContent(values) }), onInvalidSubmit)}
        >
          <p className="text-sm text-app-muted">
            Students see nothing until you publish. Check it is true to the class, then edit anything you like. Students will
            see &ldquo;{CLASS_RECAP_AI_LABEL}&rdquo; above it.
          </p>
          <FormField error={errors.recap?.message} errorVisible={isSubmitted} id="recap-text" label="Recap" required>
            <Textarea id="recap-text" rows={5} {...form.register("recap")} />
          </FormField>
          <FormField
            error={errors.keyPoints?.message}
            errorVisible={isSubmitted}
            hint="One idea per line."
            id="recap-key-points"
            label="Key ideas"
          >
            <Textarea id="recap-key-points" rows={5} {...form.register("keyPoints")} />
          </FormField>
          <FormField
            error={errors.practice?.message}
            errorVisible={isSubmitted}
            hint="One per line. Leave empty for none."
            id="recap-practice"
            label="Practise at home"
          >
            <Textarea id="recap-practice" rows={3} {...form.register("practice")} />
          </FormField>
          {originalDraft}
          {generatedBy}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {rating}
            <div className="flex flex-wrap items-center gap-2 sm:ml-auto">
              {regenerateButton}
              <Button disabled={busy} type="button" variant="danger-outline" onClick={() => void discard.run(undefined)}>
                Discard
              </Button>
              <Button
                disabled={busy}
                isLoading={save.isPending}
                type="button"
                variant="outline"
                onClick={form.handleSubmit((values) => save.mutate({ content: toContent(values) }), onInvalidSubmit)}
              >
                Save draft
              </Button>
              <Button disabled={busy} isLoading={publish.isPending} type="submit">
                Publish to students
              </Button>
            </div>
          </div>
        </form>
      ) : null}

      {recap.status === "PUBLISHED" && recap.content ? (
        <>
          <ClassRecapContentView aiLabel={CLASS_RECAP_AI_LABEL} content={recap.content} />
          {recap.publishedAt ? (
            <p className="text-xs text-app-muted">
              Published {formatDateTime(recap.publishedAt, timeZone)}
              {recap.publishedByName ? ` by ${recap.publishedByName}` : ""}.
            </p>
          ) : null}
          {originalDraft}
          {generatedBy}
          <div className="flex flex-wrap items-center justify-between gap-3">
            {rating}
            <Button disabled={busy} isLoading={unpublish.isPending} type="button" variant="outline" onClick={() => void unpublish.run(undefined)}>
              Take back from students
            </Button>
          </div>
        </>
      ) : null}

      {recap.status === "DISCARDED" ? (
        <>
          <p className="text-sm text-app-muted">This recap was discarded. Students don&apos;t see it.</p>
          <div className="flex flex-wrap items-center justify-between gap-3">
            {rating}
            <div className="flex flex-wrap gap-2 sm:ml-auto">
              {regenerateButton}
              {recap.content ? (
                <Button disabled={busy} isLoading={restore.isPending} type="button" variant="outline" onClick={() => void restore.run(undefined)}>
                  Back to review
                </Button>
              ) : null}
            </div>
          </div>
        </>
      ) : null}

      {(recap.status === "FAILED" || recap.status === "SKIPPED") && regenerateButton ? (
        <div className="flex justify-end">{regenerateButton}</div>
      ) : null}

      <AlertDialog open={confirmRegenerate} onOpenChange={setConfirmRegenerate}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Make a new draft?</AlertDialogTitle>
            <AlertDialogDescription>
              The AI writes a new recap from the transcript. The current draft and any edits are replaced.{" "}
              {recap.regenerationsLeft === 1 ? "This is the last new draft for this class." : `${recap.regenerationsLeft} new drafts left for this class.`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Keep this one</AlertDialogCancel>
            <AlertDialogAction onClick={() => regenerate.mutate()}>Make a new draft</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
