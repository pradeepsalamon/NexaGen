"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import Link from "next/link";
import { Controller, useForm } from "react-hook-form";
import { z } from "zod";
import {
  SUPPORT_SETTINGS_LIMITS,
  updateSupportSettingsRequestSchema,
  type SupportSettingsResponse,
  type UpdateSupportSettingsRequest
} from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/layout/PageLoading";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Switch } from "@/components/ui/Switch";
import { Textarea } from "@/components/ui/Textarea";
import { WidgetError } from "@/components/ui/WidgetError";
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

/** Numbers stay text in the form (one per line for the test list) and become the API body on save. */
const formSchema = z.object({
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

function toForm(data: SupportSettingsResponse): FormValues {
  return {
    agentReplyTemplate: data.agentReplyTemplate ?? "",
    agentReplyTemplateLanguage: data.agentReplyTemplateLanguage,
    botEnabled: data.botEnabled,
    leadNudgeHours: String(data.leadNudgeHours),
    staffReminderMinutes: String(data.staffReminderMinutes),
    testNumbers: data.testNumbers.map((number) => `+${number}`).join("\n")
  };
}

function toRequest(values: FormValues): UpdateSupportSettingsRequest {
  return {
    agentReplyTemplate: values.agentReplyTemplate,
    agentReplyTemplateLanguage: values.agentReplyTemplateLanguage,
    botEnabled: values.botEnabled,
    leadNudgeHours: Number(values.leadNudgeHours),
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
          : "Messages reach the bot through your own WhatsApp Business number, connected under Branding → WhatsApp."
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
            <Link href="/admin/branding">WhatsApp connection</Link>
          </Button>
        ) : null}
      </div>
      {!connection.receiving && !connection.usesPlatformNumber ? (
        <p className="mt-3 text-sm text-app-muted">
          {isSuperAdmin
            ? "Save the access token and app secret under Branding → WhatsApp, switch it on, then paste the webhook URL and verify token shown there into your Meta app."
            : "A super admin connects the number under Branding → WhatsApp."}
        </p>
      ) : null}
    </SectionCard>
  );
}

function SettingsForm({ data }: { data: SupportSettingsResponse }) {
  const save = useUpdateSupportSettings();
  const {
    control,
    formState: { errors, isDirty },
    handleSubmit,
    register,
    reset
  } = useForm<FormValues>({ defaultValues: toForm(data), resolver: zodResolver(formSchema) });

  return (
    <form
      className="grid gap-6"
      onSubmit={handleSubmit((values) => {
        save.mutateAsync(toRequest(values)).then((saved) => reset(toForm(saved)), () => undefined);
      })}
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
      </SectionCard>

      <div className="flex justify-end gap-2">
        <Button disabled={!isDirty || save.isPending} onClick={() => reset(toForm(data))} type="button" variant="neutral">
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
