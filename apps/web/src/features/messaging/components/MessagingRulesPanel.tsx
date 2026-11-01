"use client";

import { useState } from "react";
import { Bell, Mail, MessageCircle, Pencil } from "lucide-react";
import {
  MESSAGING_EVENT_DEFINITIONS,
  describeSchedule,
  markdownToPlainText,
  type MessagingRuleItem
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { useMessagingRules, useUpdateMessagingRule } from "../hooks/useMessagingApi";
import { MessagingRuleEditor } from "./MessagingRuleEditor";

function RuleRow({
  emailConfigured,
  rule,
  whatsappConfigured
}: {
  emailConfigured: boolean;
  rule: MessagingRuleItem;
  whatsappConfigured: boolean;
}) {
  const definition = MESSAGING_EVENT_DEFINITIONS[rule.event];
  const update = useUpdateMessagingRule();
  const [editing, setEditing] = useState(false);
  const timing = describeSchedule(rule);

  return (
    <>
      <div className="flex flex-col gap-3 border-b border-app-border px-4 py-4 last:border-b-0 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <p className="font-semibold text-app-text">{definition.label}</p>
            {rule.enabled ? (
              <Badge variant="success">On</Badge>
            ) : (
              <Badge variant="secondary">Off</Badge>
            )}
            <Badge variant="outline">{timing}</Badge>
          </div>
          <p className="mt-1 line-clamp-2 text-sm text-app-muted">{markdownToPlainText(rule.body)}</p>
        </div>

        <div className="flex shrink-0 items-center gap-2">
          {rule.enabled ? (
            <div className="flex items-center gap-1.5 text-app-muted">
              {rule.whatsappEnabled ? (
                <SimpleTooltip
                  label={
                    whatsappConfigured
                      ? "WhatsApp"
                      : "WhatsApp is on, but not configured on this server"
                  }
                >
                  <MessageCircle
                    aria-label="WhatsApp"
                    className={whatsappConfigured ? "size-4" : "size-4 text-app-danger"}
                    strokeWidth={2.5}
                  />
                </SimpleTooltip>
              ) : null}
              {rule.inAppEnabled ? (
                <SimpleTooltip label="In-app notification">
                  <Bell aria-label="In-app notification" className="size-4" strokeWidth={2.5} />
                </SimpleTooltip>
              ) : null}
              {rule.emailEnabled ? (
                <SimpleTooltip
                  label={emailConfigured ? "Email" : "Email is on, but not configured on this server"}
                >
                  <Mail
                    aria-label="Email"
                    className={emailConfigured ? "size-4" : "size-4 text-app-danger"}
                    strokeWidth={2.5}
                  />
                </SimpleTooltip>
              ) : null}
            </div>
          ) : null}

          <SimpleTooltip label={rule.enabled ? "Turn off" : "Turn on"}>
            <Button
              disabled={update.isPending}
              onClick={() =>
                update.mutate({
                  event: rule.event,
                  data: { enabled: !rule.enabled }
                })
              }
              size="sm"
              type="button"
              variant={rule.enabled ? "outline" : "secondary"}
            >
              {rule.enabled ? "Turn off" : "Turn on"}
            </Button>
          </SimpleTooltip>

          <SimpleTooltip label="Edit message">
            <Button
              aria-label={`Edit ${definition.label}`}
              className="size-8 rounded-full border border-primary bg-primary p-0 text-on-primary shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-on-primary"
              onClick={() => setEditing(true)}
              size="icon"
              type="button"
              variant="ghost"
            >
              <Pencil className="size-4" strokeWidth={2.5} />
            </Button>
          </SimpleTooltip>
        </div>
      </div>

      <MessagingRuleEditor
        emailConfigured={emailConfigured}
        onOpenChange={setEditing}
        open={editing}
        rule={rule}
        whatsappConfigured={whatsappConfigured}
      />
    </>
  );
}

export function MessagingRulesPanel() {
  const { data, isError, isLoading, refetch } = useMessagingRules();

  if (isLoading) return <Skeleton className="h-96 w-full" />;
  if (isError || !data) {
    return (
      <WidgetError message="Couldn't load messaging rules." onRetry={() => refetch()} />
    );
  }

  return (
    <div className="space-y-4">
      {!data.whatsappConfigured ? (
        <Card className="border-app-warning/40 bg-app-warning/5 p-4 text-sm text-app-text">
          WhatsApp is not configured on this server. Rules still control the in-app bell;
          WhatsApp sends are recorded as failed until{" "}
          <code className="text-xs">WHATSAPP_ACCESS_TOKEN</code> and{" "}
          <code className="text-xs">WHATSAPP_PHONE_NUMBER_ID</code> are set.
        </Card>
      ) : null}

      {!data.emailConfigured && data.rules.some((rule) => rule.emailEnabled) ? (
        <Card className="border-app-warning/40 bg-app-warning/5 p-4 text-sm text-app-text">
          Email is not configured on this server, so rule emails are recorded as failed until the{" "}
          <code className="text-xs">SMTP_*</code> variables are set.
        </Card>
      ) : null}

      <Card className="overflow-hidden p-0">
        {data.rules.map((rule) => (
          <RuleRow
            emailConfigured={data.emailConfigured}
            key={rule.event}
            rule={rule}
            whatsappConfigured={data.whatsappConfigured}
          />
        ))}
      </Card>
    </div>
  );
}
