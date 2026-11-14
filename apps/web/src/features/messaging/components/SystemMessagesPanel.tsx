"use client";

import { useState } from "react";
import { Pencil } from "lucide-react";
import {
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

function MessageRow({ message }: { message: SystemMessageItem }) {
  const definition = SYSTEM_MESSAGE_DEFINITIONS[message.key];
  const [editing, setEditing] = useState(false);

  return (
    <>
      <div className="flex items-center justify-between gap-3 border-b border-app-border px-4 py-4 last:border-b-0 sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-app-text">{definition.label}</p>
            <Badge variant="outline">{definition.channel === "EMAIL" ? "Email" : "WhatsApp"}</Badge>
            {message.isCustomized ? <Badge variant="info">Edited</Badge> : null}
          </div>
          <p className="mt-1 text-xs text-app-muted">To: {definition.sentTo}</p>
          <p className="mt-1 line-clamp-2 text-sm text-app-muted">{markdownToPlainText(message.body)}</p>
        </div>

        <SimpleTooltip label="Edit message">
          <Button
            aria-label={`Edit ${definition.label}`}
            className="size-8 shrink-0 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
            onClick={() => setEditing(true)}
            size="icon"
            type="button"
            variant="ghost"
          >
            <Pencil className="size-4" strokeWidth={2.5} />
          </Button>
        </SimpleTooltip>
      </div>

      <SystemMessageEditor message={message} onOpenChange={setEditing} open={editing} />
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
        Messages the platform always sends. You can change the wording here, but not when they go out or
        who receives them.
      </p>

      {!data.emailConfigured ? (
        <Card className="border-app-warning/40 bg-app-warning/5 p-4 text-sm text-app-text">
          Email is not configured on this server, so these emails can&apos;t be sent until the{" "}
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
                <MessageRow key={message.key} message={message} />
              ))}
          </Card>
        </section>
      ))}
    </div>
  );
}
