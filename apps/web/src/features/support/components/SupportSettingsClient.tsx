"use client";

import { onInvalidSubmit } from "@/lib/forms";
import { zodResolver } from "@hookform/resolvers/zod";
import { FieldError } from "@/components/ui/FieldError";
import Link from "next/link";
import { useMemo } from "react";
import { Controller, useFieldArray, useForm, useWatch } from "react-hook-form";
import { ArrowDown, ArrowUp } from "lucide-react";
import { z } from "zod";
import {
  DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE,
  SUPPORT_CATEGORY_LABELS,
  SUPPORT_MENU_DESCRIPTION_MAX,
  SUPPORT_MENU_TITLE_MAX,
  SUPPORT_OUT_OF_HOURS_MAX,
  SUPPORT_SETTINGS_LIMITS,
  SUPPORT_WEEKDAY_LABELS,
  supportMenuSchema,
  updateSupportSettingsRequestSchema,
  type SupportSettingsResponse,
  type UpdateSupportSettingsRequest
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/layout/PageLoading";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Combobox, ComboboxContent, ComboboxEmpty, ComboboxInput, ComboboxItem, ComboboxList } from "@/components/ui/Combobox";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { TimePicker } from "@/components/ui/TimePicker";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { WidgetError } from "@/components/ui/WidgetError";
import { getTimezoneOptions } from "@/features/auth/components/profile-form/profileForm.utils";
import { WhatsAppTemplateStatus } from "@/features/messaging/components/WhatsAppTemplateStatus";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { useAuthStore } from "@/stores/authStore";
import { useSupportSettingsQuery, useUpdateSupportSettings } from "../hooks/useSupportAdmin";

const wholeNumber = (max: number, unit: string) =>
  z
    .string()
    .trim()
    .regex(/^\d{1,4}$/, `A whole number of ${unit}, 0 to ${max}`)
    .refine((value) => Number(value) <= max, `At most ${max} ${unit}`);

const dayRowSchema = z.object({ close: z.string(), enabled: z.boolean(), open: z.string() });

/** Numbers stay text in the form (one per line for the test list) and become the API body on save. */
const formSchema = z.object({
  accountAnswers: z.boolean(),
  captureLeads: z.boolean(),
  days: z
    .array(dayRowSchema)
    .length(7)
    .superRefine((days, ctx) => {
      days.forEach((day, index) => {
        if (day.enabled && day.open >= day.close) {
          ctx.addIssue({ code: "custom", message: "Closes after it opens", path: [index, "close"] });
        }
      });
    }),
  hoursEnabled: z.boolean(),
  menu: supportMenuSchema,
  outOfHoursMessage: z.string().trim().max(SUPPORT_OUT_OF_HOURS_MAX, `At most ${SUPPORT_OUT_OF_HOURS_MAX} characters`),
  timezone: z.string().trim().min(1, "Pick a time zone"),
  agentReplyTemplate: updateSupportSettingsRequestSchema.shape.agentReplyTemplate,
  agentReplyTemplateLanguage: updateSupportSettingsRequestSchema.shape.agentReplyTemplateLanguage,
  botEnabled: z.boolean(),
  leadNudgeHours: wholeNumber(SUPPORT_SETTINGS_LIMITS.leadNudgeHoursMax, "hours"),
  staffReminderMinutes: wholeNumber(SUPPORT_SETTINGS_LIMITS.staffReminderMinutesMax, "minutes"),
  testNumbers: z
    .string()
    .max(1000)
    .refine(
      (value) => splitNumbers(value).length <= SUPPORT_SETTINGS_LIMITS.testNumbersMax,
      `At most ${SUPPORT_SETTINGS_LIMITS.testNumbersMax} numbers`
    )
});
type FormValues = z.infer<typeof formSchema>;

function splitNumbers(text: string): string[] {
  return text
    .split(/[\n,]/)
    .map((value) => value.trim())
    .filter(Boolean);
}

/** Mon–Sat 9 to 6 until the academy sets its own. */
const DEFAULT_DAY = (day: number) => ({ close: "18:00", enabled: day !== 0, open: "09:00" });

function toForm(data: SupportSettingsResponse, fallbackZone: string): FormValues {
  return {
    accountAnswers: data.accountAnswers,
    captureLeads: data.captureLeads,
    agentReplyTemplate: data.agentReplyTemplate ?? "",
    agentReplyTemplateLanguage: data.agentReplyTemplateLanguage,
    botEnabled: data.botEnabled,
    days: SUPPORT_WEEKDAY_LABELS.map((_, day) => {
      if (!data.hours) return DEFAULT_DAY(day);
      const saved = data.hours.days.find((row) => row.day === day);
      return saved ? { close: saved.close, enabled: true, open: saved.open } : { close: "18:00", enabled: false, open: "09:00" };
    }),
    hoursEnabled: data.hours !== null,
    menu: data.menu,
    outOfHoursMessage: data.outOfHoursMessage ?? "",
    timezone: data.hours?.timezone ?? fallbackZone,
    leadNudgeHours: String(data.leadNudgeHours),
    staffReminderMinutes: String(data.staffReminderMinutes),
    testNumbers: data.testNumbers.map((number) => `+${number}`).join("\n")
  };
}

function toRequest(values: FormValues, usesPlatformNumber: boolean): UpdateSupportSettingsRequest {
  return {
    accountAnswers: values.accountAnswers,
    // Lead capture is Nexa's academy only; another academy never sends the field.
    ...(usesPlatformNumber ? { captureLeads: values.captureLeads } : {}),
    agentReplyTemplate: values.agentReplyTemplate,
    agentReplyTemplateLanguage: values.agentReplyTemplateLanguage,
    botEnabled: values.botEnabled,
    hours: values.hoursEnabled
      ? {
          days: values.days.flatMap((day, index) => (day.enabled ? [{ close: day.close, day: index, open: day.open }] : [])),
          timezone: values.timezone
        }
      : null,
    leadNudgeHours: Number(values.leadNudgeHours),
    menu: values.menu,
    outOfHoursMessage: values.outOfHoursMessage,
    staffReminderMinutes: Number(values.staffReminderMinutes),
    testNumbers: splitNumbers(values.testNumbers)
  };
}

function ConnectionCard({ data }: { data: SupportSettingsResponse }) {
  const timeZone = useUserTimeZone();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  const { connection } = data;
  return (
    <SectionCard
      description={
        connection.usesPlatformNumber
          ? "This academy uses the WhatsApp number set up on the server."
          : "Messages reach the bot through your own WhatsApp Business number, connected under Settings → WhatsApp connection."
      }
      title="Connection"
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={connection.receiving ? "success" : "secondary"}>
          {connection.receiving ? "Ready to receive messages" : "Not receiving messages"}
        </Badge>
        {connection.lastWebhookAt ? (
          <span className="text-sm text-app-muted">Last message from WhatsApp {formatDateTime(connection.lastWebhookAt, timeZone)}</span>
        ) : null}
        {!connection.usesPlatformNumber && isSuperAdmin ? (
          <Button asChild className="ml-auto" variant="outline">
            <Link href="/admin/whatsapp">WhatsApp connection</Link>
          </Button>
        ) : null}
      </div>
      {!connection.receiving && !connection.usesPlatformNumber ? (
        <p className="mt-3 text-sm text-app-muted">
          {isSuperAdmin
            ? "Save the access token and app secret under Settings → WhatsApp connection, switch it on, then paste the webhook URL and verify token shown there into your Meta app."
            : "A super admin connects the number under Settings → WhatsApp connection."}
        </p>
      ) : null}
    </SectionCard>
  );
}

function SettingsForm({ data }: { data: SupportSettingsResponse }) {
  const save = useUpdateSupportSettings();
  const userZone = useUserTimeZone();
  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset
  } = useForm<FormValues>({ mode: "onSubmit", defaultValues: toForm(data, userZone), resolver: zodResolver(formSchema) });
  const hoursEnabled = useWatch({ control, name: "hoursEnabled" });
  const days = useWatch({ control, name: "days" });
  const timezone = useWatch({ control, name: "timezone" });
  const zoneOptions = useMemo(() => getTimezoneOptions(timezone), [timezone]);
  const templateName = useWatch({ control, name: "agentReplyTemplate" });
  const templateLanguage = useWatch({ control, name: "agentReplyTemplateLanguage" });
  const menu = useFieldArray({ control, keyName: "key", name: "menu" });
  const menuValues = useWatch({ control, name: "menu" });
  const menuError = errors.menu?.root?.message ?? errors.menu?.message;

  return (
    <form
      className="grid gap-6"
      noValidate
      onSubmit={handleSubmit((values) => {
        save.mutateAsync(toRequest(values, data.connection.usesPlatformNumber)).then((saved) => reset(toForm(saved, userZone)), () => undefined);
      }, onInvalidSubmit)}
    >
      {data.source === "SERVER" ? (
        <Alert title="Using the server's settings" variant="info">
          These values come from the server until you save this page. After that, this page decides.
        </Alert>
      ) : null}

      <SectionCard description="What the bot does when someone messages your WhatsApp number." title="Bot">
        <div className="grid gap-4">
          <Controller
            control={control}
            name="botEnabled"
            render={({ field }) => (
              <Switch checked={field.value} id="support-bot-enabled" label="Answer WhatsApp messages automatically" onCheckedChange={field.onChange} />
            )}
          />
          <FormField
            error={errors.testNumbers?.message}
            hint="While this list has numbers, the bot answers only them, so staff can try it first. Leave it empty to answer everyone. One number per line, with country code."
            id="support-test-numbers"
            label="Test numbers"
          >
            <Textarea id="support-test-numbers" placeholder="+91 90000 00000" rows={3} {...register("testNumbers")} />
          </FormField>
          <div className="grid gap-1">
            <Controller
              control={control}
              name="accountAnswers"
              render={({ field }) => (
                <Switch checked={field.value} id="support-account-answers" label="Answer linked families" onCheckedChange={field.onChange} />
              )}
            />
            <p className="text-xs text-app-muted">
              A family whose number you linked to a student (Admin → Users → the student → WhatsApp link code) can send NEXT CLASS and
              get that student&apos;s next class time. Nothing else about the account is ever sent, and other numbers get nothing.
            </p>
          </div>
          {data.connection.usesPlatformNumber ? (
            <div className="grid gap-1">
              <Controller
                control={control}
                name="captureLeads"
                render={({ field }) => (
                  <Switch checked={field.value} id="support-capture-leads" label="Make every new chat a lead" onCheckedChange={field.onChange} />
                )}
              />
              <p className="text-xs text-app-muted">
                When someone who isn&apos;t a student, parent or open lead writes to this number, they appear under Leads (from a WhatsApp ad, or
                WhatsApp), and are copied to Frappe CRM. Works with the bot on or off, and never sends them anything.
              </p>
            </div>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard
        description="The options in the bot's first message, in this order. Customers can also reply with an option's number. Talk to our team always stays: it's the way to a person."
        title="Main menu"
      >
        <ol className="grid gap-3">
          {menu.fields.map((item, index) => {
            const enabled = menuValues?.[index]?.enabled ?? item.enabled;
            const shown = (menuValues ?? []).slice(0, index + 1).filter((row) => row.enabled || row.category === "OTHER").length;
            return (
              <li className="grid gap-3 rounded-control border border-app-border p-3 sm:grid-cols-[auto_minmax(0,1fr)_minmax(0,1.4fr)_auto] sm:items-start" key={item.key}>
                <div className="flex items-center gap-2 sm:pt-7">
                  <span className="w-5 text-right text-sm tabular-nums text-app-muted">{enabled || item.category === "OTHER" ? shown : "–"}</span>
                  <Controller
                    control={control}
                    name={`menu.${index}.enabled`}
                    render={({ field }) => (
                      <Switch
                        aria-label={`Show ${SUPPORT_CATEGORY_LABELS[item.category]}`}
                        checked={item.category === "OTHER" ? true : field.value}
                        disabled={item.category === "OTHER"}
                        id={`support-menu-${item.category}-enabled`}
                        onCheckedChange={field.onChange}
                      />
                    )}
                  />
                </div>
                <FormField
                  error={errors.menu?.[index]?.title?.message}
                  hint={SUPPORT_CATEGORY_LABELS[item.category]}
                  id={`support-menu-${item.category}-title`}
                  label="Title"
                  required
                >
                  <Input id={`support-menu-${item.category}-title`} maxLength={SUPPORT_MENU_TITLE_MAX} {...register(`menu.${index}.title`)} />
                </FormField>
                <FormField error={errors.menu?.[index]?.description?.message} id={`support-menu-${item.category}-description`} label="Description">
                  <Input id={`support-menu-${item.category}-description`} maxLength={SUPPORT_MENU_DESCRIPTION_MAX} {...register(`menu.${index}.description`)} />
                </FormField>
                <div className="flex gap-1 sm:pt-6">
                  <SimpleTooltip label="Move up">
                    <Button aria-label={`Move ${SUPPORT_CATEGORY_LABELS[item.category]} up`} disabled={index === 0} onClick={() => menu.move(index, index - 1)} size="icon" type="button" variant="neutral">
                      <ArrowUp className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                  <SimpleTooltip label="Move down">
                    <Button
                      aria-label={`Move ${SUPPORT_CATEGORY_LABELS[item.category]} down`}
                      disabled={index === menu.fields.length - 1}
                      onClick={() => menu.move(index, index + 1)}
                      size="icon"
                      type="button"
                      variant="neutral"
                    >
                      <ArrowDown className="size-4" strokeWidth={2.5} />
                    </Button>
                  </SimpleTooltip>
                </div>
              </li>
            );
          })}
        </ol>
        {menuError ? <p className="mt-2 text-sm text-danger-ink">{menuError}</p> : null}
      </SectionCard>

      <SectionCard
        description="Outside these hours the bot still answers. Someone who asks for a person gets your out-of-hours message, and staff reminders wait until you open."
        title="Team hours"
      >
        <div className="grid gap-4">
          <Controller
            control={control}
            name="hoursEnabled"
            render={({ field }) => (
              <Switch checked={field.value} id="support-hours-enabled" label="My team answers only at set hours" onCheckedChange={field.onChange} />
            )}
          />
          {hoursEnabled ? (
            <>
              <FormField error={errors.timezone?.message} id="support-hours-zone" label="Time zone" required>
                <Controller
                  control={control}
                  name="timezone"
                  render={({ field }) => (
                    <Combobox id="support-hours-zone" items={zoneOptions} onValueChange={field.onChange} value={field.value}>
                      <ComboboxInput placeholder="Select time zone" />
                      <ComboboxContent>
                        <ComboboxEmpty>No time zone found.</ComboboxEmpty>
                        <ComboboxList>
                          {(zone) => (
                            <ComboboxItem key={zone} value={zone}>
                              {zone}
                            </ComboboxItem>
                          )}
                        </ComboboxList>
                      </ComboboxContent>
                    </Combobox>
                  )}
                />
              </FormField>
              <div className="grid gap-2">
                {SUPPORT_WEEKDAY_LABELS.map((label, index) => (
                  <div className="grid grid-cols-[minmax(0,1fr)] items-center gap-2 sm:grid-cols-[9rem_auto_auto_auto]" key={label}>
                    <Controller
                      control={control}
                      name={`days.${index}.enabled`}
                      render={({ field }) => (
                        <Checkbox
                          checked={field.value}
                          id={`support-day-${index}`}
                          label={label}
                          onCheckedChange={(checked) => field.onChange(checked === true)}
                        />
                      )}
                    />
                    {days[index]?.enabled ? (
                      <>
                        <Controller
                          control={control}
                          name={`days.${index}.open`}
                          render={({ field }) => (
                            <TimePicker aria-label={`${label} opens`} id={`support-day-${index}-open`} onChange={field.onChange} value={field.value} />
                          )}
                        />
                        <span className="text-sm text-app-muted">to</span>
                        <Controller
                          control={control}
                          name={`days.${index}.close`}
                          render={({ field }) => (
                            <TimePicker aria-label={`${label} closes`} id={`support-day-${index}-close`} onChange={field.onChange} value={field.value} />
                          )}
                        />
                        <FieldError className="sm:col-start-2 sm:col-end-5" id={`support-day-${index}-close`} message={errors.days?.[index]?.close?.message} standalone />
                      </>
                    ) : (
                      <span className="text-sm text-app-muted sm:col-span-3">Closed</span>
                    )}
                  </div>
                ))}
              </div>
              <FormField
                error={errors.outOfHoursMessage?.message}
                hint="Sent after the hand-off message outside these hours. Leave it empty to send the text shown in the box."
                id="support-out-of-hours"
                label="Out-of-hours message"
              >
                <Textarea id="support-out-of-hours" placeholder={DEFAULT_SUPPORT_OUT_OF_HOURS_MESSAGE} rows={2} {...register("outOfHoursMessage")} />
              </FormField>
            </>
          ) : null}
        </div>
      </SectionCard>

      <SectionCard description="Quick follow-ups on requests and enquiries." title="Follow-ups">
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            error={errors.staffReminderMinutes?.message}
            hint="Admins are reminded about a request nobody has answered after this many minutes, and again shortly before WhatsApp's 24-hour reply window closes. 0 = off."
            id="support-reminder-minutes"
            label="Remind staff after (minutes)"
          >
            <Input id="support-reminder-minutes" inputMode="numeric" {...register("staffReminderMinutes")} />
          </FormField>
          <FormField
            error={errors.leadNudgeHours?.message}
            hint="A parent who asked about classes and went quiet gets one reminder after this many hours, inside the free reply window. 0 = off."
            id="support-nudge-hours"
            label="Nudge parents after (hours)"
          >
            <Input id="support-nudge-hours" inputMode="numeric" {...register("leadNudgeHours")} />
          </FormField>
        </div>
      </SectionCard>

      <SectionCard
        description="WhatsApp only lets you reply freely within 24 hours of the customer's last message. After that, staff replies go as this approved template: {{1}} is the request reference, {{2}} the reply."
        title="Replies after 24 hours"
      >
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField
            error={errors.agentReplyTemplate?.message}
            hint="As in WhatsApp Manager. Empty = staff can't reply after 24 hours."
            id="support-template"
            label="Template name"
          >
            <Input autoComplete="off" id="support-template" placeholder="support_reply" {...register("agentReplyTemplate")} />
          </FormField>
          <FormField error={errors.agentReplyTemplateLanguage?.message} id="support-template-language" label="Template language" required>
            <Input autoComplete="off" id="support-template-language" placeholder="en" {...register("agentReplyTemplateLanguage")} />
          </FormField>
        </div>
        <div className="mt-2">
          <WhatsAppTemplateStatus language={templateLanguage} name={templateName} />
        </div>
      </SectionCard>

      <div className="flex justify-end gap-2">
        <Button disabled={!isDirty || save.isPending} onClick={() => reset(toForm(data, userZone))} type="button" variant="neutral">
          Reset
        </Button>
        <Button disabled={!isDirty && data.source === "ACADEMY"} isLoading={save.isPending} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

/** The academy's WhatsApp bot settings (docs/WHATSAPP_SUPPORT_MODES_PLAN.md Phase B). Admins. */
export function SupportSettingsClient() {
  const query = useSupportSettingsQuery();
  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-6">
      <PageHeader
        breadcrumbs={[{ href: "/admin/support", label: "WhatsApp support" }, { label: "Settings" }]}
        description="Switch the bot on, try it with staff numbers first, and set how quickly people are followed up."
        title="WhatsApp bot settings"
      />
      {query.isPending ? (
        <PageLoading />
      ) : query.isError ? (
        <WidgetError message="The settings couldn't be loaded." onRetry={() => void query.refetch()} />
      ) : (
        <>
          <ConnectionCard data={query.data} />
          <SettingsForm data={query.data} key={query.data.updatedAt ?? "server"} />
        </>
      )}
    </div>
  );
}
