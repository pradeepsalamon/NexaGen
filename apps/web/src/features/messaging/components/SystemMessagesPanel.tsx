"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
  SYSTEM_MESSAGE_CHANNEL_LABELS,
  SYSTEM_MESSAGE_DEFINITIONS,
  SYSTEM_MESSAGE_GROUP_LABELS,
  markdownToPlainText,
  type SystemMessageGroup,
  type SystemMessageItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useSystemMessages } from "../hooks/useMessagingApi";
import { SystemMessageEditor } from "./SystemMessageEditor";

const GROUPS: SystemMessageGroup[] = ["ACCOUNT", "BILLING", "DEMO", "ADMIN"];

function MessageRow({
  emailConfigured,
  message,
  whatsappConfigured
}: {
  emailConfigured: boolean;
  message: SystemMessageItem;
  whatsappConfigured: boolean;
}) {
  const definition = SYSTEM_MESSAGE_DEFINITIONS[message.key];
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-4 last:border-b-0 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-app-text">{definition.label}</p>
            {message.channels.map((channel) => (
              <Badge key={channel} variant="outline">
                {SYSTEM_MESSAGE_CHANNEL_LABELS[channel]}
              </Badge>
            ))}
            {message.isCustomized ? <Badge variant="info">Edited</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-app-muted">To: {definition.sentTo}</p>
          <p className="mt-1 line-clamp-2 text-sm text-app-muted">{markdownToPlainText(message.body)}</p>
        </div>

        <SimpleTooltip label="Edit message">
          <Button
            aria-label={`Edit ${definition.label}`}
            className="size-8 shrink-0"
            onClick={() => setEditing(true)}
            size="icon"
            type="button"
            variant="neutral"
          >
            <Pencil className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>

      <SystemMessageEditor
        emailConfigured={emailConfigured}
        message={message}
        onOpenChange={setEditing}
        open={editing}
        whatsappConfigured={whatsappConfigured}
      />
    </>
  );
}

export function SystemMessagesPanel() {
  const { data, isError, isLoading, refetch } = useSystemMessages();

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return <WidgetError message="Couldn't load system messages." onRetry={() => refetch()} />;
  }

  return (
    <div className="space-y-6">
      <p className="text-sm text-app-muted">
        Messages the platform always sends. You can change the wording and switch each one&apos;s email,
        WhatsApp and in-app channels on or off, but not when they go out or who receives them.
      </p>

      {!data.emailConfigured ? (
        <Card className="border-warning/40 bg-warning/5 p-4 text-sm text-app-text">
          Email is not configured on this server, so the email channel can&apos;t send until the{" "}
          <code className="text-xs">SMTP_*</code> variables are set.
        </Card>
      ) : null}

      {GROUPS.map((group) => (
        <section className="space-y-2" key={group}>
          <h2 className="text-sm font-semibold text-app-text">{SYSTEM_MESSAGE_GROUP_LABELS[group]}</h2>
          <Card className="overflow-hidden p-0">
            {data.messages
              .filter((message) => SYSTEM_MESSAGE_DEFINITIONS[message.key].group === group)
              .map((message) => (
                <MessageRow
                  emailConfigured={data.emailConfigured}
                  key={message.key}
                  message={message}
                  whatsappConfigured={data.whatsappConfigured}
                />
              ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
