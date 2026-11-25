"use client";

import type { ClassRecapProvider, UpdateClassRecapSettingsRequest } from "@nexa-chess/types";
import Link from "next/link";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { ChoiceTile } from "@/components/ui/ChoiceTile";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { getErrorMessage } from "@/lib/errors";
import { useToast } from "@/providers/ToastProvider";
import { useClassRecapSettings, useUpdateClassRecapSettings } from "../hooks/useClassRecaps";

/** The academy's class recap switches (docs/CLASS_RECAPS.md). Admins. */
export function ClassRecapSettingsCard() {
  const toast = useToast();
  const settings = useClassRecapSettings();
  // undo: intentionally excluded — a settings switch; switching it back is the correction.
  const update = useUpdateClassRecapSettings();
  const s = settings.data;

  const save = (body: UpdateClassRecapSettingsRequest) =>
    update.mutate(body, {
      onError: (error) => toast.error({ message: getErrorMessage(error), title: "Couldn't save" }),
      onSuccess: () => toast.success({ title: "Saved" })
    });

  const choose = (provider: ClassRecapProvider) => {
    if (s && s.provider !== provider) save({ provider });
  };

  return (
    <Card className="space-y-4 p-4">
      <div>
        <h2 className="text-lg font-bold text-app-text">Settings</h2>
        <p className="text-sm text-app-muted">
          After a class with a transcript, an AI drafts a short recap from what the coach said. The coach or an admin reviews it;
          students see it only once it is published. Transcripts are kept only for classes with &ldquo;Class transcript&rdquo; on in{" "}
          <Link className="font-semibold text-primary-ink underline-offset-2 hover:underline" href="/admin/live-class">
            Live class settings
          </Link>
          , and only for coaches who agreed.
        </p>
      </div>
      {settings.isLoading ? (
        <Skeleton className="h-32 w-full rounded-app" />
      ) : settings.isError || !s ? (
        <WidgetError message={settings.error?.message} onRetry={() => void settings.refetch()} />
      ) : (
        <>
          {!s.planIncludes ? (
            <Alert variant="info">Your plan doesn&apos;t include AI class recaps, so no new recaps are made.</Alert>
          ) : null}
          {s.planIncludes && !s.serverEnabled ? (
            <Alert variant="warning">AI class recaps aren&apos;t switched on for this server yet, so no new recaps are made.</Alert>
          ) : null}
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-sm font-semibold text-app-text">Make AI class recaps</p>
              <p className="text-sm text-app-muted">Off stops new drafts. Recaps already published stay.</p>
            </div>
            <Switch
              aria-label="Make AI class recaps"
              checked={s.enabled}
              disabled={update.isPending || !s.planIncludes}
              onCheckedChange={(enabled) => save({ enabled })}
            />
          </div>
          <fieldset className="space-y-2">
            <legend className="text-sm font-semibold text-app-text">Where the AI runs</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              <ChoiceTile
                disabled={update.isPending || !s.planIncludes}
                selected={s.provider === "LOCAL"}
                onClick={() => choose("LOCAL")}
              >
                <span className="block text-sm font-semibold text-app-text">Our own server</span>
                <span className="block text-xs text-app-muted">
                  Nothing leaves the server. Slower: drafts are written between classes.
                  {s.local.configured ? ` Model: ${s.local.model}.` : " Not set up on this server yet."}
                </span>
              </ChoiceTile>
              <ChoiceTile
                disabled={update.isPending || !s.planIncludes}
                selected={s.provider === "OUTSIDE"}
                onClick={() => choose("OUTSIDE")}
              >
                <span className="block text-sm font-semibold text-app-text">
                  {s.outside.name ? `Outside AI: ${s.outside.name}` : "Outside AI service"}
                </span>
                <span className="block text-xs text-app-muted">
                  Faster and may read Tamil better. The transcript is sent with every name replaced by a code.
                  {s.outside.configured ? ` Model: ${s.outside.model}.` : " Not set up on this server yet."}
                </span>
              </ChoiceTile>
            </div>
          </fieldset>
          {s.provider === "LOCAL" && !s.local.configured ? (
            <Alert variant="warning">Our own server&apos;s AI isn&apos;t set up yet, so no drafts are written.</Alert>
          ) : null}
          {s.provider === "OUTSIDE" && !s.outside.configured ? (
            <Alert variant="warning">No outside AI service is set up on this server yet, so no drafts are written.</Alert>
          ) : null}
        </>
      )}
    </Card>
  );
}
