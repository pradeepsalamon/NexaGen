"use client";

import { useEffect, useMemo, useState } from "react";
import { Send } from "lucide-react";
import {
  MESSAGING_EVENT_DEFINITIONS,
  describeSchedule,
  findUnknownTemplateVariables,
  renderMessageTemplate,
  sampleVariablesFor,
  type MessagingAudience,
  type MessagingRuleItem,
  type MessagingScheduleMode
} from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Textarea } from "@/components/ui/Textarea";
import { useTestMessagingRule, useUpdateMessagingRule } from "../hooks/useMessagingApi";
import { TimePicker } from "@/components/ui/TimePicker";
import { Switch } from "@/components/ui/Switch";

const DAY_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" }
];

const MODE_OPTIONS: { label: string; value: MessagingScheduleMode }[] = [
  { label: "Immediately", value: "IMMEDIATE" },
  { label: "Daily, at a set time", value: "DAILY" },
  { label: "Weekly, on a set day", value: "WEEKLY" }
];

/** "09:00" for the time input, from the rule's separate hour/minute. */
function toClockValue(hour: number | null, minute: number | null): string {
  return `${String(hour ?? 9).padStart(2, "0")}:${String(minute ?? 0).padStart(2, "0")}`;
}

const AUDIENCE_LABELS: Record<MessagingAudience, string> = {
  STUDENTS: "Students",
  COACHES: "Coaches",
  STUDENTS_AND_COACHES: "Students and coaches"
};

type Props = {
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rule: MessagingRuleItem;
  whatsappConfigured: boolean;
};

export function MessagingRuleEditor({
  onOpenChange,
  open,
  rule,
  whatsappConfigured
}: Props) {
  const definition = MESSAGING_EVENT_DEFINITIONS[rule.event];
  const update = useUpdateMessagingRule();
  const test = useTestMessagingRule();

  const [draft, setDraft] = useState(rule);
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(rule);
      setTestResult(null);
    }
  }, [open, rule]);

  const preview = useMemo(
    () => renderMessageTemplate(draft.body, sampleVariablesFor(rule.event)),
    [draft.body, rule.event]
  );
  const unknown = useMemo(
    () => findUnknownTemplateVariables(rule.event, `${draft.title} ${draft.body}`),
    [draft.body, draft.title, rule.event]
  );

  const insertVariable = (name: string) => {
    setDraft((current) => ({ ...current, body: `${current.body}{{${name}}}` }));
  };

  const save = () => {
    update.mutate(
      {
        event: rule.event,
        data: {
          enabled: draft.enabled,
          whatsappEnabled: draft.whatsappEnabled,
          inAppEnabled: draft.inAppEnabled,
          audience: draft.audience,
          leadTimeMinutes: draft.leadTimeMinutes,
          scheduleMode: draft.scheduleMode,
          scheduleHour: draft.scheduleHour,
          scheduleMinute: draft.scheduleMinute,
          scheduleDayOfWeek: draft.scheduleDayOfWeek,
          weekdaysOnly: draft.weekdaysOnly,
          title: draft.title,
          body: draft.body,
          whatsappTemplateName: draft.whatsappTemplateName,
          whatsappTemplateLanguage: draft.whatsappTemplateLanguage,
          whatsappTemplateParams: draft.whatsappTemplateParams
        }
      },
      { onSuccess: () => onOpenChange(false) }
    );
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{definition.label}</DialogTitle>
          <DialogDescription>{definition.description}</DialogDescription>
        </DialogHeader>

        <div className="space-y-5">
          <div className="grid gap-3 rounded-app border border-app-border bg-app-background p-4">
            <Switch
              checked={draft.enabled}
              id={`${rule.event}-enabled`}
              label="Send this message"
              onCheckedChange={(checked) =>
                setDraft((current) => ({ ...current, enabled: checked === true }))
              }
            />
            <div className="flex flex-wrap gap-x-6 gap-y-3 pl-6">
              <Switch
                checked={draft.whatsappEnabled}
                disabled={!draft.enabled}
                id={`${rule.event}-whatsapp`}
                label="WhatsApp"
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    whatsappEnabled: checked === true
                  }))
                }
              />
              <Switch
                checked={draft.inAppEnabled}
                disabled={!draft.enabled}
                id={`${rule.event}-inapp`}
                label="In-app notification"
                onCheckedChange={(checked) =>
                  setDraft((current) => ({
                    ...current,
                    inAppEnabled: checked === true
                  }))
                }
              />
            </div>
            {draft.whatsappEnabled && !whatsappConfigured ? (
              <p className="pl-6 text-xs text-app-danger">
                WhatsApp is not configured on this server, so nothing will be sent on that
                channel.
              </p>
            ) : null}
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              id={`${rule.event}-audience`}
              label="Send to"
              hint={
                definition.audiences.length === 1
                  ? "Fixed for this event."
                  : undefined
              }
            >
              <Select
                disabled={definition.audiences.length === 1}
                id={`${rule.event}-audience`}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    audience: e.target.value as MessagingAudience
                  }))
                }
                options={definition.audiences.map((audience) => ({
                  label: AUDIENCE_LABELS[audience],
                  value: audience
                }))}
                value={draft.audience}
              />
            </FormField>

            {definition.supportsLeadTime ? (
              <FormField
                id={`${rule.event}-lead`}
                label="How long before"
                hint="In minutes. Class reminders go out on a 5-minute sweep."
              >
                <Input
                  id={`${rule.event}-lead`}
                  min={1}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      leadTimeMinutes: Number(e.target.value) || null
                    }))
                  }
                  type="number"
                  value={draft.leadTimeMinutes ?? ""}
                />
              </FormField>
            ) : null}
          </div>

          {!definition.supportsLeadTime ? (
            <div className="grid gap-4 rounded-app border border-app-border bg-app-background p-4">
              <FormField id={`${rule.event}-mode`} label="When to send">
                <Select
                  id={`${rule.event}-mode`}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      scheduleMode: e.target.value as MessagingScheduleMode,
                      scheduleHour: current.scheduleHour ?? 9,
                      scheduleMinute: current.scheduleMinute ?? 0,
                      scheduleDayOfWeek: current.scheduleDayOfWeek ?? 1
                    }))
                  }
                  options={MODE_OPTIONS}
                  value={draft.scheduleMode}
                />
              </FormField>

              {draft.scheduleMode !== "IMMEDIATE" ? (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    id={`${rule.event}-time`}
                    label="Time"
                    hint="In each recipient's own timezone."
                  >
                    <TimePicker
                      id={`${rule.event}-time`}
                      onChange={(value) => {
                        const [hour, minute] = value.split(":").map(Number);
                        setDraft((current) => ({
                          ...current,
                          scheduleHour: Number.isFinite(hour) ? hour : 9,
                          scheduleMinute: Number.isFinite(minute) ? minute : 0
                        }));
                      }}
                      
                      value={toClockValue(draft.scheduleHour, draft.scheduleMinute)}
                    />
                  </FormField>

                  {draft.scheduleMode === "WEEKLY" ? (
                    <FormField id={`${rule.event}-day`} label="Day">
                      <Select
                        id={`${rule.event}-day`}
                        onChange={(e) =>
                          setDraft((current) => ({
                            ...current,
                            scheduleDayOfWeek: Number(e.target.value)
                          }))
                        }
                        options={DAY_OPTIONS}
                        value={String(draft.scheduleDayOfWeek ?? 1)}
                      />
                    </FormField>
                  ) : (
                    <div className="flex items-end pb-2">
                      <Switch
                        checked={draft.weekdaysOnly}
                        id={`${rule.event}-weekdays`}
                        label="Weekdays only"
                        onCheckedChange={(checked) =>
                          setDraft((current) => ({
                            ...current,
                            weekdaysOnly: checked === true
                          }))
                        }
                      />
                    </div>
                  )}
                </div>
              ) : null}

              <p className="text-xs text-app-muted">
                {draft.scheduleMode === "IMMEDIATE"
                  ? "Queued the moment it happens and sent within a minute."
                  : `Held until ${describeSchedule(draft).toLowerCase()}, in each person's own timezone.`}
              </p>
            </div>
          ) : null}

          <FormField id={`${rule.event}-title`} label="In-app heading">
            <Input
              id={`${rule.event}-title`}
              onChange={(e) =>
                setDraft((current) => ({ ...current, title: e.target.value }))
              }
              value={draft.title}
            />
          </FormField>

          <FormField id={`${rule.event}-body`} label="Message">
            <Textarea
              id={`${rule.event}-body`}
              onChange={(e) =>
                setDraft((current) => ({ ...current, body: e.target.value }))
              }
              rows={5}
              value={draft.body}
            />
          </FormField>

          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
              Insert a value
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {definition.variables.map((name) => (
                <button
                  className="rounded-full border border-app-border px-2.5 py-1 text-xs text-app-muted transition hover:border-primary hover:text-primary-ink"
                  key={name}
                  onClick={() => insertVariable(name)}
                  type="button"
                >
                  {`{{${name}}}`}
                </button>
              ))}
            </div>
          </div>

          {unknown.length > 0 ? (
            <p className="text-xs text-app-danger">
              {unknown.map((name) => `{{${name}}}`).join(", ")} — this event cannot fill
              that in, so it will send as empty.
            </p>
          ) : null}

          <div className="rounded-app border border-app-border bg-app-background p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-app-muted">
              Preview (sample values)
            </p>
            <p className="mt-2 whitespace-pre-wrap text-sm text-app-text">{preview}</p>
          </div>

          <details className="rounded-app border border-app-border p-4">
            <summary className="cursor-pointer text-sm font-semibold text-app-text">
              Approved WhatsApp template (optional)
            </summary>
            <p className="mt-2 text-xs text-app-muted">
              WhatsApp only delivers free-form text within 24 hours of a member&apos;s last
              message. For anything that may fall outside that window, name a template you
              approved in WhatsApp Manager — its {"{{1}}, {{2}}"} slots are filled from the
              list below, in order.
            </p>
            <div className="mt-3 grid gap-4 sm:grid-cols-2">
              <FormField id={`${rule.event}-tpl`} label="Template name">
                <Input
                  id={`${rule.event}-tpl`}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      whatsappTemplateName: e.target.value || null
                    }))
                  }
                  placeholder="class_reminder"
                  value={draft.whatsappTemplateName ?? ""}
                />
              </FormField>
              <FormField id={`${rule.event}-lang`} label="Language code">
                <Input
                  id={`${rule.event}-lang`}
                  onChange={(e) =>
                    setDraft((current) => ({
                      ...current,
                      whatsappTemplateLanguage: e.target.value || null
                    }))
                  }
                  placeholder="en_US"
                  value={draft.whatsappTemplateLanguage ?? ""}
                />
              </FormField>
            </div>
            <FormField
              id={`${rule.event}-params`}
              label="Template values, one per line"
            >
              <Textarea
                id={`${rule.event}-params`}
                onChange={(e) =>
                  setDraft((current) => ({
                    ...current,
                    whatsappTemplateParams: e.target.value
                      .split("\n")
                      .map((line) => line.trim())
                      .filter(Boolean)
                  }))
                }
                placeholder={"{{recipient.firstName}}\n{{class.time}}"}
                rows={3}
                value={draft.whatsappTemplateParams.join("\n")}
              />
            </FormField>
          </details>

          <div className="rounded-app border border-app-border p-4">
            <p className="text-sm font-semibold text-app-text">Send a test</p>
            <p className="mt-1 text-xs text-app-muted">
              Sends the saved message with sample values. Leave the number blank to use
              your own.
            </p>
            <div className="mt-3 flex flex-wrap items-end gap-2">
              <Input
                aria-label="Test phone number"
                className="max-w-xs"
                onChange={(e) => setTestNumber(e.target.value)}
                placeholder="+91 98765 43210"
                value={testNumber}
              />
              <Button
                disabled={test.isPending}
                onClick={() =>
                  test.mutate(
                    {
                      event: rule.event,
                      data: testNumber.trim() ? { phoneNumber: testNumber.trim() } : {}
                    },
                    {
                      onSuccess: (result) =>
                        setTestResult(
                          result.sent
                            ? `Sent to ${result.to}.`
                            : (result.error ?? "Could not send.")
                        )
                    }
                  )
                }
                type="button"
                variant="outline"
              >
                <Send className="size-4" strokeWidth={2.5} />
                {test.isPending ? "Sending…" : "Send test"}
              </Button>
            </div>
            {testResult ? (
              <p className="mt-2 text-xs text-app-muted">{testResult}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="outline">
            Cancel
          </Button>
          <Button disabled={update.isPending} onClick={save} type="button">
            {update.isPending ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
