"use client";

import { useState } from "react";
import { Megaphone, Trash2 } from "lucide-react";
import {
  createAnnouncementRequestSchema,
  type AnnouncementAudience,
  type CreateAnnouncementResponse
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useToast } from "@/providers/ToastProvider";
import {
  useAnnouncements,
  useCreateAnnouncement,
  useDeleteAnnouncement
} from "../hooks/useMessagingApi";
import { Switch } from "@/components/ui/Switch";

const AUDIENCE_OPTIONS: { label: string; value: AnnouncementAudience }[] = [
  { label: "Everyone", value: "EVERYONE" },
  { label: "All students", value: "STUDENTS" },
  { label: "All coaches", value: "COACHES" },
  { label: "One batch", value: "BATCH" }
];

function summarise(result: CreateAnnouncementResponse): string {
  const { dispatch } = result;
  if (!dispatch.ruleEnabled) {
    return "Published to the dashboard. The Announcement rule is off, so no messages went out.";
  }
  const parts = [
    `${dispatch.queuedWhatsApp} WhatsApp`,
    `${dispatch.queuedInApp} in-app`
  ];
  if (dispatch.missingPhone > 0) {
    parts.push(`${dispatch.missingPhone} without a phone number`);
  }
  const when = dispatch.scheduledFor
    ? "They go out at the Announcement rule's next send time."
    : "They send within a minute.";
  return `Queued for ${dispatch.recipients} people — ${parts.join(", ")}. ${when}`;
}

function Composer() {
  const create = useCreateAnnouncement();
  const toast = useToast();
  const { data: batchData } = useBatchesQuery();

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [audience, setAudience] = useState<AnnouncementAudience>("EVERYONE");
  const [batchId, setBatchId] = useState("");
  const [sendMessages, setSendMessages] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const publish = () => {
    const parsed = createAnnouncementRequestSchema.safeParse({
      title,
      body,
      audience,
      batchId: audience === "BATCH" ? batchId : undefined,
      sendMessages
    });

    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "Check the form.");
      return;
    }

    setError(null);
    create.mutate(parsed.data, {
      onSuccess: (result) => {
        toast.success({ title: "Announcement published", message: summarise(result) });
        setTitle("");
        setBody("");
      }
    });
  };

  return (
    <Card className="space-y-4 p-5 sm:p-6">
      <div>
        <h2 className="text-lg font-bold text-app-text">New announcement</h2>
        <p className="mt-1 text-sm text-app-muted">
          Publishes to the dashboard feed and, when the Announcement rule is on, sends it
          on that rule&apos;s channels. Messages cannot be recalled once sent.
        </p>
      </div>

      <FormField id="announcement-title" label="Title">
        <Input
          id="announcement-title"
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Holiday break"
          value={title}
        />
      </FormField>

      <FormField id="announcement-body" label="Message">
        <Textarea
          id="announcement-body"
          onChange={(e) => setBody(e.target.value)}
          placeholder="No classes from 20–24 September."
          rows={4}
          value={body}
        />
      </FormField>

      <div className="grid gap-4 sm:grid-cols-2">
        <FormField id="announcement-audience" label="Send to">
          <Select
            id="announcement-audience"
            onChange={(e) => setAudience(e.target.value as AnnouncementAudience)}
            options={AUDIENCE_OPTIONS}
            value={audience}
          />
        </FormField>

        {audience === "BATCH" ? (
          <FormField id="announcement-batch" label="Batch">
            <Select
              id="announcement-batch"
              onChange={(e) => setBatchId(e.target.value)}
              options={(batchData?.batches ?? []).map((batch) => ({
                label: batch.name,
                value: batch.id
              }))}
              placeholder="Choose a batch"
              value={batchId}
            />
          </FormField>
        ) : null}
      </div>

      <Switch
        checked={sendMessages}
        id="announcement-send"
        label="Also send it on the Announcement rule's channels"
        onCheckedChange={(checked) => setSendMessages(checked === true)}
      />

      {error ? <p className="text-sm text-app-danger">{error}</p> : null}

      <div className="flex justify-end">
        <Button disabled={create.isPending} onClick={publish} type="button">
          <Megaphone className="size-4" strokeWidth={2.5} />
          {create.isPending ? "Publishing…" : "Publish"}
        </Button>
      </div>
    </Card>
  );
}

function History() {
  const { data, isLoading } = useAnnouncements();
  const remove = useDeleteAnnouncement();
  const timeZone = useUserTimeZone();

  if (isLoading) return <Skeleton className="h-48 w-full" />;
  if (!data || data.announcements.length === 0) {
    return (
      <EmptyState
        description="Anything you publish shows up here and on every member's dashboard."
        title="No announcements yet"
      />
    );
  }

  return (
    <Card className="overflow-hidden p-0">
      {data.announcements.map((announcement) => (
        <div
          className="flex items-start justify-between gap-4 border-b border-app-border px-4 py-4 last:border-b-0 sm:px-5"
          key={announcement.id}
        >
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="font-semibold text-app-text">{announcement.title}</p>
              <Badge variant="outline">
                {announcement.batchName ?? announcement.audience.toLowerCase()}
              </Badge>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-app-muted">
              {announcement.body}
            </p>
            <p className="mt-1 text-xs text-app-muted">
              {formatDateTime(announcement.createdAt, timeZone)}
              {announcement.createdByName ? ` · ${announcement.createdByName}` : ""}
            </p>
          </div>

          <SimpleTooltip label="Remove from the dashboard feed">
            <Button
              aria-label={`Delete announcement ${announcement.title}`}
              className="size-8 shrink-0 rounded-full border-app-danger p-0 text-app-danger hover:bg-app-danger hover:text-white"
              disabled={remove.isPending}
              onClick={() => remove.mutate(announcement.id)}
              size="icon"
              type="button"
              variant="outline"
            >
              <Trash2 className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      ))}
    </Card>
  );
}

export function AnnouncementsPanel() {
  return (
    <div className="space-y-6">
      <Composer />
      <History />
    </div>
  );
}
