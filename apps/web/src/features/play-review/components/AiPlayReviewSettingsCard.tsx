"use client";

import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useAiPlayReviewSettings, useUpdateAiPlayReviewSettings } from "../hooks/usePlayReviewApi";

/** The academy's AI play review switches (docs/AI_PLAY_REVIEW.md). Admins. */
export function AiPlayReviewSettingsCard() {
  const toast = useToast();
  const settings = useAiPlayReviewSettings();
  const update = useUpdateAiPlayReviewSettings();
  const s = settings.data;

  const save = (body: { engineReviewEnabled?: boolean; outsideAiEnabled?: boolean }) =>
    update.mutate(body, {
      onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save" }),
      onSuccess: () => toast.success({ title: "Saved" })
    });

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-bold text-app-text">AI play review</h2>
        <p className="text-sm text-app-muted">
          Every move students play on a board here is recorded. Each night our chess engine reviews new play on this server, and
          students, their coaches and admins see the results on the student&apos;s Board play tab.
        </p>
      </div>
      {settings.isLoading ? (
        <Skeleton className="h-24 w-full rounded-app" />
      ) : settings.isError || !s ? (
        <WidgetError message={settings.error?.message} onRetry={() => void settings.refetch()} />
      ) : (
        <>
          {!s.planIncludes ? (
            <Alert variant="info">Your plan doesn&apos;t include AI play review, so these switches have no effect.</Alert>
          ) : null}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-app-text">Nightly engine review</p>
              <p className="text-sm text-app-muted">Mistakes, better moves and missed tactics for every student, by our own engine.</p>
            </div>
            <Switch
              aria-label="Nightly engine review"
              checked={s.engineReviewEnabled}
              disabled={update.isPending || !s.planIncludes}
              onCheckedChange={(engineReviewEnabled) => save({ engineReviewEnabled })}
            />
          </div>
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-app-text">Outside-AI comments</p>
              <p className="text-sm text-app-muted">
                Short coach-style comments written by {s.providerName ?? "an outside AI service"}, only for students whose switch
                is on (with a parent&apos;s agreement). It gets positions and moves, never names. {s.consentedStudents}{" "}
                {s.consentedStudents === 1 ? "student has" : "students have"} switched it on.
              </p>
            </div>
            <Switch
              aria-label="Outside-AI comments"
              checked={s.outsideAiEnabled}
              disabled={update.isPending || !s.planIncludes}
              onCheckedChange={(outsideAiEnabled) => save({ outsideAiEnabled })}
            />
          </div>
          {s.outsideAiEnabled && !s.providerConfigured ? (
            <Alert variant="warning">No outside AI service is set up on this server yet, so nothing is sent.</Alert>
          ) : null}
        </>
      )}
    </Card>
  );
}
