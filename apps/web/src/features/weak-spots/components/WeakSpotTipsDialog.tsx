"use client";

import { WEAK_SPOT_TIP_LIMITS, type WeakSpotTipItem, type WeakSpotTipStatus } from "@nexa-chess/types";
import { useState } from "react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { FieldError, fieldErrorId } from "@/components/ui/FieldError";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useWeakSpotTipMutations, useWeakSpotTips } from "../hooks/useWeakSpots";

const STATUS: Record<WeakSpotTipStatus, { label: string; variant: "success" | "warning" | "secondary" }> = {
  CHANGED: { label: "Changed since read", variant: "warning" },
  NOT_READ: { label: "Not read yet", variant: "secondary" },
  READ: { label: "Students see it", variant: "success" }
};

function TipRow({ tip }: { tip: WeakSpotTipItem }) {
  const tz = useUserTimeZone();
  const toast = useToast();
  const { read, unread } = useWeakSpotTipMutations();
  const [text, setText] = useState(tip.text);
  const [error, setError] = useState<string | null>(null);
  const id = `weak-spot-tip-${tip.motif}`;
  const edited = text.trim() !== tip.text;

  const save = () => {
    const trimmed = text.trim();
    const problem =
      trimmed.length < WEAK_SPOT_TIP_LIMITS.min
        ? `Write at least ${WEAK_SPOT_TIP_LIMITS.min} characters.`
        : trimmed.length > WEAK_SPOT_TIP_LIMITS.max
          ? `Keep it under ${WEAK_SPOT_TIP_LIMITS.max} characters.`
          : null;
    setError(problem);
    if (problem) {
      document.getElementById(id)?.focus();
      toast.error({ message: problem, title: `Check the ${tip.label.toLowerCase()} tip` });
      return;
    }
    read.mutate(
      { body: { text: trimmed }, motif: tip.motif },
      {
        onError: (e) => toast.error({ message: getErrorMessage(e), title: "Couldn't save the tip" }),
        onSuccess: () => toast.success({ title: `${tip.label}: students see this tip now` })
      }
    );
  };

  return (
    <li className="grid gap-2 py-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <label className="text-sm font-semibold text-app-text" htmlFor={id}>
          {tip.label}
        </label>
        <Badge variant={STATUS[tip.status].variant}>{STATUS[tip.status].label}</Badge>
      </div>
      <div className="relative">
        <Textarea
          aria-describedby={error ? fieldErrorId(id) : undefined}
          hasError={!!error}
          id={id}
          maxLength={WEAK_SPOT_TIP_LIMITS.max + 50}
          onChange={(e) => setText(e.target.value)}
          rows={3}
          value={text}
        />
        <FieldError id={id} message={error} />
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-xs text-app-muted">
          {tip.status === "READ" && tip.reviewedAt
            ? `Read by ${tip.reviewedByName ?? "a coach"} · ${formatFullDate(tip.reviewedAt, tz)}`
            : tip.status === "CHANGED"
              ? "Our wording changed since it was read; students don't see it until someone reads it again."
              : "Students don't see this tip yet."}
          {text.trim() !== tip.builtInText ? (
            <>
              {" "}
              <button className="font-semibold text-primary-ink underline-offset-2 hover:underline" onClick={() => setText(tip.builtInText)} type="button">
                Use our wording
              </button>
            </>
          ) : null}
        </p>
        <div className="flex flex-wrap gap-2">
          {tip.status === "READ" ? (
            <Button
              isLoading={unread.isPending}
              onClick={() =>
                unread.mutate(tip.motif, {
                  onError: (e) => toast.error({ message: getErrorMessage(e), title: "Couldn't hide the tip" })
                })
              }
              size="sm"
              type="button"
              variant="ghost"
            >
              Hide from students
            </Button>
          ) : null}
          {tip.status !== "READ" || edited ? (
            <Button isLoading={read.isPending} onClick={save} size="sm" type="button" variant="primary">
              {tip.status === "READ" ? "Save wording" : "I've read it — show students"}
            </Button>
          ) : null}
        </div>
      </div>
    </li>
  );
}

/**
 * The academy's weak-spot tips (docs/WEAK_SPOTS.md § "Tips"): a student sees
 * a tip only after a coach or admin read it here, in our words or their own.
 */
export function WeakSpotTipsDialog({ onClose }: { onClose: () => void }) {
  const query = useWeakSpotTips();
  const tips = query.data?.tips ?? [];
  const readCount = tips.filter((t) => t.status === "READ").length;

  return (
    <Dialog onOpenChange={(open) => !open && onClose()} open>
      <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tips students see</DialogTitle>
          <DialogDescription>
            Each weak spot has a short tip. Students see a tip only after a coach or admin of the academy reads it here; you can
            change the wording first. {tips.length ? `${readCount} of ${tips.length} read.` : null}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-64 w-full rounded-app" />
        ) : query.isError ? (
          <WidgetError message={query.error?.message} onRetry={() => void query.refetch()} />
        ) : (
          <ul className="divide-y divide-app-border">
            {tips.map((tip) => (
              <TipRow key={`${tip.motif}:${tip.status}:${tip.text}`} tip={tip} />
            ))}
          </ul>
        )}
      </DialogContent>
    </Dialog>
  );
}
