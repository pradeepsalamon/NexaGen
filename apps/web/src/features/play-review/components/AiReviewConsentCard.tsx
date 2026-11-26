"use client";

import type { AiReviewConsentState } from "@nexa-chess/types";
import { Sparkles } from "lucide-react";
import { useState } from "react";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useAiReviewConsent, useSetAiReviewConsent } from "../hooks/usePlayReviewApi";

/** Why comments aren't being written although the switch is on. */
function idleReason(state: AiReviewConsentState): string | null {
  if (!state.allowed || state.active) return null;
  if (!state.planIncludes) return "Your academy's plan doesn't include AI play review, so no comments are written.";
  if (!state.academyEnabled) return "Your academy hasn't turned outside-AI comments on yet. Nothing is sent until it does.";
  if (!state.providerConfigured) return "No outside AI service is set up yet. Nothing is sent until one is.";
  return null;
}

/**
 * The outside-AI switch (docs/AI_PLAY_REVIEW.md §3.1). `studentId` null = the
 * signed-in student's own (Profile); otherwise their coach or an admin sees
 * it on the student's page and may change it after a parent agreed.
 */
export function AiReviewConsentCard({ studentId, compact = false }: { studentId: string | null; compact?: boolean }) {
  const toast = useToast();
  const tz = useUserTimeZone();
  const consent = useAiReviewConsent(studentId);
  const change = useSetAiReviewConsent(studentId);
  const [asking, setAsking] = useState(false);
  const [guardian, setGuardian] = useState(false);
  const self = studentId === null;
  const state = consent.data;
  const provider = state?.providerName ?? "an outside AI service";

  const turnOff = () =>
    change.mutate(
      { allowed: false },
      {
        onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't switch it off" }),
        onSuccess: () => toast.success({ title: "Outside-AI comments switched off", message: "Its earlier comments were deleted." })
      }
    );

  const turnOn = () =>
    change.mutate(
      { allowed: true, guardianConfirmed: true },
      {
        onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't switch it on" }),
        onSuccess: () => {
          setAsking(false);
          setGuardian(false);
          toast.success({ title: "Outside-AI comments switched on" });
        }
      }
    );

  return (
    <section
      aria-labelledby="ai-review-consent-heading"
      className={
        compact
          ? "rounded-app border border-app-border bg-app-surface p-4 shadow-card"
          : "mx-auto mt-5 max-w-4xl rounded-panel border border-app-border bg-app-surface p-5 shadow-card"
      }
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1 basis-64">
          <h2 className="flex items-center gap-2 text-lg font-bold text-app-text" id="ai-review-consent-heading">
            <Sparkles aria-hidden className="size-4 text-accent-ink" strokeWidth={2.5} />
            {self ? "AI comments on my play" : "Outside-AI comments"}
          </h2>
          <p className="mt-1 text-sm text-app-muted">
            {self ? "Every move you play" : "Every move this student plays"} on a board here is recorded and checked by our own chess
            engine, on our own server, so {self ? "you and your coach" : "the student and their coach"} can see what to work on.
            This switch is only about {provider} writing short coach-style comments too. It gets the positions and moves, never a
            name, and only while the switch is on. Switching it off deletes its comments.
          </p>
        </div>
        {consent.isLoading ? (
          <Skeleton className="h-6 w-10 rounded-full" />
        ) : state ? (
          <Switch
            aria-label={self ? "AI comments on my play" : "Outside-AI comments for this student"}
            checked={state.allowed}
            className="ml-auto mt-1"
            disabled={change.isPending}
            onCheckedChange={(next) => (next ? setAsking(true) : turnOff())}
          />
        ) : null}
      </div>

      {consent.isError ? (
        <WidgetError className="mt-3" message={consent.error?.message} onRetry={() => void consent.refetch()} />
      ) : state ? (
        <div className="mt-3 space-y-2">
          {state.changedAt ? (
            <p className="text-xs text-app-muted">
              {state.allowed ? "Switched on" : "Switched off"} {formatDateTime(state.changedAt, tz)}
              {state.changedBy && state.changedBy !== "STUDENT" ? ` by ${state.changedBy === "COACH" ? "a coach" : "an admin"}` : ""}.
            </p>
          ) : null}
          {state.needsReconsent ? (
            <Alert variant="warning">The wording or the AI service changed since this was switched on. Switch it on again to keep the comments coming.</Alert>
          ) : null}
          {idleReason(state) ? <Alert variant="info">{idleReason(state)}</Alert> : null}
        </div>
      ) : null}

      <Dialog onOpenChange={(open) => (open ? setAsking(true) : (setAsking(false), setGuardian(false)))} open={asking}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Switch on outside-AI comments?</DialogTitle>
            <DialogDescription>
              {provider} will get {self ? "your" : "this student's"} board positions and moves, plus what our engine found. Never a
              name, email, class or academy. It may keep what it is sent under its own terms. Past play is included. Switch it off
              any time and its comments are deleted.
            </DialogDescription>
          </DialogHeader>
          <Checkbox
            checked={guardian}
            id="ai-review-guardian"
            label={self ? "My parent or guardian agrees." : "A parent or guardian of this student agreed."}
            onCheckedChange={(v) => setGuardian(v === true)}
          />
          <DialogFooter>
            <Button onClick={() => setAsking(false)} variant="ghost">
              Cancel
            </Button>
            <Button disabled={!guardian || change.isPending} onClick={turnOn}>
              {change.isPending ? "Switching on…" : "Switch on"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
