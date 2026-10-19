"use client";

import { useState } from "react";
import { RotateCw } from "lucide-react";
import {
  MESSAGING_EVENTS,
  MESSAGING_EVENT_DEFINITIONS,
  type MessageDeliveryStatus,
  type MessagingEvent
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { WidgetError } from "@/components/ui/WidgetError";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import {
  useMessageDeliveries,
  useRetryMessageDelivery
} from "../hooks/useMessagingApi";

const STATUS_VARIANT: Record<
  MessageDeliveryStatus,
  "success" | "destructive" | "secondary" | "outline"
> = {
  PENDING: "outline",
  SENT: "success",
  FAILED: "destructive",
  SKIPPED: "secondary"
};

const STATUS_OPTIONS = [
  { label: "Queued", value: "PENDING" },
  { label: "Sent", value: "SENT" },
  { label: "Failed", value: "FAILED" },
  { label: "Skipped", value: "SKIPPED" }
];

function statusLabel(delivery: {
  status: MessageDeliveryStatus;
  attempts: number;
}): string {
  if (delivery.status === "PENDING") {
    return delivery.attempts > 0 ? `RETRYING (${delivery.attempts})` : "QUEUED";
  }
  return delivery.status;
}

export function DeliveryLogPanel() {
  const timeZone = useUserTimeZone();
  const [event, setEvent] = useState<MessagingEvent | "">("");
  const [status, setStatus] = useState<MessageDeliveryStatus | "">("");

  const retry = useRetryMessageDelivery();
  const { data, isError, isLoading, refetch } = useMessageDeliveries({
    ...(event ? { event } : {}),
    ...(status ? { status } : {}),
    limit: 100
  });

  return (
    <div className="space-y-4">
      <Card className="flex flex-wrap items-end gap-3 p-4">
        <div className="min-w-48 flex-1">
          <Select
            aria-label="Filter by event"
            onChange={(e) => setEvent(e.target.value as MessagingEvent | "")}
            options={MESSAGING_EVENTS.map((value) => ({
              label: MESSAGING_EVENT_DEFINITIONS[value].label,
              value
            }))}
            placeholder="All events"
            value={event}
          />
        </div>
        <div className="min-w-40 flex-1">
          <Select
            aria-label="Filter by status"
            onChange={(e) => setStatus(e.target.value as MessageDeliveryStatus | "")}
            options={STATUS_OPTIONS}
            placeholder="Any status"
            value={status}
          />
        </div>
        {data ? (
          <p className="text-sm text-app-muted">
            {data.counts.pending} queued · {data.counts.sent} sent ·{" "}
            {data.counts.failed} failed · {data.counts.skipped} skipped
          </p>
        ) : null}
      </Card>

      {isLoading ? (
        <Skeleton className="h-64 w-full" />
      ) : isError && !data ? (
        <WidgetError message="Couldn't load the delivery log." onRetry={() => void refetch()} />
      ) : !data || data.deliveries.length === 0 ? (
        event || status ? (
          <EmptyState description="Try another event or status." title="No messages match these filters" />
        ) : (
          <EmptyState
            description="Every message the platform sends is recorded here, including the ones it could not deliver."
            title="Nothing sent yet"
          />
        )
      ) : (
        <Card className="overflow-hidden p-0">
          {data.deliveries.map((delivery) => (
            <div
              className="border-b border-app-border px-4 py-3 last:border-b-0 sm:px-5"
              key={delivery.id}
            >
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant={STATUS_VARIANT[delivery.status]}>
                  {statusLabel(delivery)}
                </Badge>
                <span className="text-sm font-semibold text-app-text">
                  {MESSAGING_EVENT_DEFINITIONS[delivery.event].label}
                </span>
                <Badge variant="outline">
                  {delivery.channel === "WHATSAPP" ? "WhatsApp" : "In-app"}
                </Badge>
                <span className="text-xs text-app-muted">
                  {delivery.recipientName ?? "Unknown"}
                  {delivery.recipientMasked ? ` · ${delivery.recipientMasked}` : ""}
                </span>
                <span className="ml-auto text-xs text-app-muted">
                  {delivery.status === "PENDING"
                    ? `due ${formatDateTime(delivery.scheduledFor, timeZone)}`
                    : formatDateTime(delivery.createdAt, timeZone)}
                </span>
                {delivery.status === "FAILED" ? (
                  <SimpleTooltip label="Queue it for another try">
                    <Button
                      aria-label="Retry this message"
                      className="size-7 rounded-full border-app-border p-0 hover:bg-primary hover:text-white"
                      disabled={retry.isPending}
                      onClick={() => retry.mutate(delivery.id)}
                      size="icon"
                      type="button"
                      variant="outline"
                    >
                      <RotateCw className="size-3.5" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                ) : null}
              </div>
              <p className="mt-1 line-clamp-2 text-sm text-app-muted">{delivery.body}</p>
              {delivery.error ? (
                <p className="mt-1 text-xs text-app-danger">{delivery.error}</p>
              ) : null}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
}
