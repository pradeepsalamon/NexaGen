"use client";

import { useEffect, useMemo, useState } from "react";
import { Mail, Send } from "lucide-react";
import {
  MESSAGING_EVENT_DEFINITIONS,
  describeSchedule,
  findUnknownTemplateVariables,
  messagingSendDays,
  normalizeMessagingSendDays,
  parseWhatsAppTemplateParams,
  renderFormattedTemplate,
  sampleVariablesFor,
  whatsappTemplateIssues,
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
import { FormattedText } from "@/components/ui/FormattedText";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { TextEditor } from "@/components/ui/TextEditor";
import { useTestMessagingRule, useUpdateMessagingRule } from "../hooks/useMessagingApi";
import { PlaceholderPicker, useTemplateInsert } from "./PlaceholderPicker";
import {
  WhatsAppTemplateFields,
  templateDraftFrom,
  templateFieldsFrom,
  type WhatsAppTemplateDraft
} from "./WhatsAppTemplateFields";
import { TimePicker } from "@/components/ui/TimePicker";
import { Switch } from "@/components/ui/Switch";
import { cn } from "@/lib/utils";

const DAY_OPTIONS = [
  { label: "Sunday", value: "0" },
  { label: "Monday", value: "1" },
  { label: "Tuesday", value: "2" },
  { label: "Wednesday", value: "3" },
  { label: "Thursday", value: "4" },
  { label: "Friday", value: "5" },
  { label: "Saturday", value: "6" }
];

const DAY_CHIPS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

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
  STUDENTS_AND_COACHES: "Students and coaches",
  ADMINS: "Admins"
};

type Props = {
  emailConfigured: boolean;
  onOpenChange: (open: boolean) => void;
  open: boolean;
  rule: MessagingRuleItem;
  whatsappConfigured: boolean;
};

export function MessagingRuleEditor({
  emailConfigured,
  onOpenChange,
  open,
  rule,
  whatsappConfigured
}: Props) {
  const definition = MESSAGING_EVENT_DEFINITIONS[rule.event];
  const supportsEmail = definition.supportsEmail !== false;
  const whatsappOnly = definition.whatsappOnly === true;
  const zoneHint = definition.academyTimeZone ? "In the academy's time zone." : "In each recipient's own timezone.";
  const update = useUpdateMessagingRule();
  const test = useTestMessagingRule();

  const [draft, setDraft] = useState(rule);
  // Shared with system messages (WhatsAppTemplateFields); values parsed only on save.
  const [template, setTemplate] = useState<WhatsAppTemplateDraft>(() => templateDraftFrom(savedTemplate(rule)));
  const [testNumber, setTestNumber] = useState("");
  const [testResult, setTestResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setDraft(rule);
      setTemplate(templateDraftFrom(savedTemplate(rule)));
      setTestResult(null);
    }
  }, [open, rule]);

  const templateIssues = useMemo(
    () =>
      whatsappTemplateIssues(
        { language: template.language, name: template.name, params: parseWhatsAppTemplateParams(template.paramsText) },
        definition.variables
      ),
    [definition.variables, template]
  );

  const preview = useMemo(
    () => renderFormattedTemplate(draft.body, sampleVariablesFor(rule.event)),
    [draft.body, rule.event]
  );
  const unknown = useMemo(
    () => findUnknownTemplateVariables(rule.event, `${draft.title} ${draft.body}`),
    [draft.body, draft.title, rule.event]
  );

  const { bodyProps, headingProps, insert } = useTemplateInsert({
    body: {
      onChange: (body) => setDraft((current) => ({ ...current, body })),
      value: draft.body
    },
    heading: {
      onChange: (title) => setDraft((current) => ({ ...current, title })),
      value: draft.title
    }
  });

  const sendTest = (channel: "EMAIL" | "WHATSAPP") => {
    test.mutate(
      {
        event: rule.event,
        data:
          channel === "EMAIL"
            ? { channel }
            : testNumber.trim()
              ? { phoneNumber: testNumber.trim() }
              : {}
      },
      {
        onSuccess: (result) =>
          setTestResult(
            result.sent ? `Sent to ${result.to}.` : (result.error ?? "Could not send.")
          )
      }
    );
  };

  const save = () => {
    update.mutate(
      {
        event: rule.event,
        data: {
          enabled: draft.enabled,
          whatsappEnabled: draft.whatsappEnabled,
          inAppEnabled: draft.inAppEnabled,
          emailEnabled: draft.emailEnabled,
          audience: draft.audience,
          leadTimeMinutes: draft.leadTimeMinutes,
          scheduleMode: draft.scheduleMode,
          scheduleHour: draft.scheduleHour,
          scheduleMinute: draft.scheduleMinute,
          scheduleDayOfWeek: draft.scheduleDayOfWeek,
          // The days as shown (an older weekdays-only rule shows Mon–Fri), so saving never changes them unasked.
          scheduleDays: normalizeMessagingSendDays(messagingSendDays(draft)),
          title: draft.title,
          body: draft.body,
          ...templateFieldsFrom(template)
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
              {whatsappOnly ? null : (
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
              )}
              {supportsEmail ? (
                <Switch
                  checked={draft.emailEnabled}
                  disabled={!draft.enabled}
                  id={`${rule.event}-email`}
                  label="Email"
                  onCheckedChange={(checked) =>
                    setDraft((current) => ({
                      ...current,
                      emailEnabled: checked === true
                    }))
                  }
                />
              ) : null}
            </div>
            {whatsappOnly ? (
              <p className="pl-6 text-xs text-app-muted">
                WhatsApp only: it goes to the numbers that asked for it, and some have no account. Pick an approved
                template below, because these messages go out without the person writing first.
              </p>
            ) : supportsEmail ? null : (
              <p className="pl-6 text-xs text-app-muted">
                The invoice email has its own wording under System messages, so it isn&apos;t a channel here.
              </p>
            )}
            {draft.emailEnabled && !emailConfigured ? (
              <p className="pl-6 text-xs text-app-danger">
                Email is not configured on this server, so nothing will be sent on that channel.
              </p>
            ) : null}
            {draft.whatsappEnabled && !whatsappConfigured ? (
              <p className="pl-6 text-xs text-app-danger">
                WhatsApp is not configured on this server, so nothing will be sent on that
                channel.
              </p>
            ) : null}
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
                    setDraft((current) => {
                      // Whole minutes, at least 1; anything else saves as "not set".
                      const minutes = Number(e.target.value);
                      return {
                        ...current,
                        leadTimeMinutes: Number.isInteger(minutes) && minutes >= 1 ? minutes : null
                      };
                    })
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
                  options={
                    definition.scheduledOnly ? MODE_OPTIONS.filter((option) => option.value !== "IMMEDIATE") : MODE_OPTIONS
                  }
                  value={draft.scheduleMode}
                />
              </FormField>

              {draft.scheduleMode !== "IMMEDIATE" ? (
                <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                  <FormField
                    id={`${rule.event}-time`}
                    label="Time"
                    hint={zoneHint}
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
                    <SendDaysPicker
                      days={messagingSendDays(draft)}
                      id={`${rule.event}-days`}
                      onChange={(days) =>
                        setDraft((current) => ({ ...current, scheduleDays: days, weekdaysOnly: false }))
                      }
                    />
                  )}
                </div>
              ) : null}

              <p className="text-xs text-app-muted">
                {draft.scheduleMode === "IMMEDIATE"
                  ? "Queued the moment it happens and sent within a minute."
                  : `Held until ${describeSchedule(draft).toLowerCase()}, ${
                      definition.academyTimeZone ? "in the academy's time zone" : "in each person's own timezone"
                    }.`}
              </p>
            </div>
          ) : null}

          <FormField
            id={`${rule.event}-title`}
            label={supportsEmail ? "In-app heading and email subject" : "In-app heading"}
          >
            <Input
              {...headingProps}
              id={`${rule.event}-title`}
              onChange={(e) =>
                setDraft((current) => ({ ...current, title: e.target.value }))
              }
              value={draft.title}
            />
          </FormField>

          <FormField
            hint="Formatting shows in email and in-app. WhatsApp shows bold and italic, and writes a link out as its address."
            id={`${rule.event}-body`}
            label="Message"
          >
            <TextEditor
              {...bodyProps}
              id={`${rule.event}-body`}
              linkTargets="template"
              onChange={(body) => setDraft((current) => ({ ...current, body }))}
              rows={5}
              value={draft.body}
            />
          </FormField>

          <PlaceholderPicker onInsert={insert} variables={definition.variables} />

          {unknown.length > 0 ? (
            <p className="text-xs text-app-danger">
              {unknown.map((name) => `{{${name}}}`).join(", ")} — this event cannot fill
              that in, so it will send as empty.
            </p>
          ) : null}

          <div className="rounded-app border border-app-border bg-app-background p-4">
            <p className="text-xs font-semibold text-app-muted">
              Preview (sample values)
            </p>
            <FormattedText className="mt-2 text-sm text-app-text" source={preview} />
          </div>

          <WhatsAppTemplateFields
            draft={template}
            idPrefix={rule.event}
            issues={templateIssues}
            onChange={setTemplate}
            samples={sampleVariablesFor(rule.event)}
          />

          <div className="rounded-app border border-app-border p-4">
            <p className="text-sm font-semibold text-app-text">Send a test</p>
            <p className="mt-1 text-xs text-app-muted">
              Sends the saved message with sample values. For WhatsApp, leave the number
              blank to use your own. An email test goes to your own email address.
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
                onClick={() => sendTest("WHATSAPP")}
                type="button"
                variant="outline"
              >
                <Send className="size-4" strokeWidth={2.5} />
                {test.isPending ? "Sending…" : "Test WhatsApp"}
              </Button>
              {supportsEmail ? (
                <Button
                  disabled={test.isPending}
                  onClick={() => sendTest("EMAIL")}
                  type="button"
                  variant="outline"
                >
                  <Mail className="size-4" strokeWidth={2.5} />
                  {test.isPending ? "Sending…" : "Email me a test"}
                </Button>
              ) : null}
            </div>
            {testResult ? (
              <p className="mt-2 text-xs text-app-muted">{testResult}</p>
            ) : null}
          </div>
        </div>

        <DialogFooter>
          <Button onClick={() => onOpenChange(false)} type="button" variant="neutral">
            Cancel
          </Button>
          <Button disabled={update.isPending || templateIssues.length > 0} onClick={save} type="button">
            {update.isPending ? "Saving…" : "Save rule"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function savedTemplate(rule: MessagingRuleItem) {
  return { language: rule.whatsappTemplateLanguage, name: rule.whatsappTemplateName, params: rule.whatsappTemplateParams };
}

/** The days a daily rule sends on. At least one stays chosen. */
function SendDaysPicker({ days, id, onChange }: { days: number[]; id: string; onChange: (days: number[]) => void }) {
  return (
    <div className="grid gap-1 sm:col-span-2">
      <span className="text-xs font-medium text-app-muted" id={`${id}-label`}>
        Days
      </span>
      <div aria-describedby={`${id}-hint`} aria-labelledby={`${id}-label`} className="flex flex-wrap gap-2" role="group">
        {DAY_CHIPS.map((label, day) => {
          const on = days.includes(day);
          return (
            <button
              aria-pressed={on}
              className={cn(
                "min-h-[var(--control-h)] min-w-12 rounded-control border px-3 text-sm font-bold disabled:cursor-not-allowed",
                on ? "border-primary bg-primary text-on-primary" : "border-app-border bg-app-surface text-app-text hover:bg-app-soft"
              )}
              // The last chosen day stays: a daily rule with no days would never send.
              disabled={on && days.length === 1}
              key={day}
              onClick={() => onChange(on ? days.filter((d) => d !== day) : [...days, day].sort((a, b) => a - b))}
              type="button"
            >
              {label}
            </button>
          );
        })}
      </div>
      <p className="m-0 text-xs leading-5 text-app-muted" id={`${id}-hint`}>
        Messages go out only on the days picked here.
      </p>
    </div>
  );
}
