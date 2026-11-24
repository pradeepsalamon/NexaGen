"use client";

import { useRevealFormErrors } from "@/hooks/useRevealFormErrors";
import { useEffect, useState } from "react";
import type { WhatsAppSettingsResponse } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { Switch } from "@/components/ui/Switch";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { apiUrl } from "@/lib/apiBase";
import { formatDateTime } from "@/lib/datetime";
import { useUpdateWhatsAppSettings, useWhatsAppSettings } from "../hooks/useBranding";

/** The full webhook URL to paste into Meta (an academy host serves the API at /api). */
function useAbsoluteApiUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(path ? new URL(apiUrl(path), window.location.origin).toString() : null);
  }, [path]);
  return url;
}

function SetupValue({ label, value }: { label: string; value: string | null }) {
  if (!value) return null;
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-app-muted">{label}</span>
      <span className="break-all font-mono text-sm text-app-text">{value}</span>
    </div>
  );
}

function Form({ data }: { data: WhatsAppSettingsResponse }) {
  const save = useUpdateWhatsAppSettings();
  const timeZone = useUserTimeZone();
  const webhookUrl = useAbsoluteApiUrl(data.webhookPath);
  const [phoneNumberId, setPhoneNumberId] = useState(data.phoneNumberId ?? "");
  const [wabaId, setWabaId] = useState(data.wabaId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [appSecret, setAppSecret] = useState("");
  const [enabled, setEnabled] = useState(data.enabled);
  const idOk = /^\d{5,30}$/.test(phoneNumberId.trim());
  const wabaOk = /^(\d{5,30})?$/.test(wabaId.trim());
  // Checked when Save is pressed (UI_RULES § "Form errors").
  const [tried, setTried] = useState(false);
  const wabaError = tried && !wabaOk ? "Digits only." : undefined;
  useRevealFormErrors(wabaError);

  return (
    <form noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        setTried(true);
        if (!wabaOk) return;
        save
          .mutateAsync({
            accessToken: accessToken.trim() || undefined,
            appSecret: appSecret.trim() || undefined,
            enabled,
            phoneNumberId: phoneNumberId.trim(),
            wabaId: wabaId.trim()
          })
          .then(
            () => {
              setAccessToken("");
              setAppSecret("");
            },
            () => undefined
          );
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.configured ? "success" : "secondary"}>{data.configured ? "Sending" : "Not sending"}</Badge>
        <Badge variant={data.receiving ? "success" : "secondary"}>{data.receiving ? "Receiving" : "Not receiving"}</Badge>
        {data.lastWebhookAt ? (
          <span className="text-sm text-app-muted">Last message from WhatsApp {formatDateTime(data.lastWebhookAt, timeZone)}</span>
        ) : null}
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField hint="Meta Business → WhatsApp → API setup." id="wa-phone-id" label="Phone number ID" required>
          <Input id="wa-phone-id" inputMode="numeric" onChange={(event) => setPhoneNumberId(event.target.value)} value={phoneNumberId} />
        </FormField>
        <FormField
          error={wabaError}
          hint="Shown next to the phone number ID. Optional for now."
          id="wa-waba-id"
          label="WhatsApp Business Account ID"
        >
          <Input id="wa-waba-id" inputMode="numeric" onChange={(event) => setWabaId(event.target.value)} value={wabaId} />
        </FormField>
        <FormField
          hint={data.hasAccessToken ? "Saved. Leave blank to keep it." : "A permanent system-user token."}
          id="wa-token"
          label="Access token"
        >
          <PasswordInput autoComplete="off" id="wa-token" onChange={(event) => setAccessToken(event.target.value)} value={accessToken} />
        </FormField>
        <FormField
          hint={data.hasAppSecret ? "Saved. Leave blank to keep it." : "Meta app → App settings → Basic. Needed to receive messages."}
          id="wa-app-secret"
          label="App secret"
        >
          <PasswordInput autoComplete="off" id="wa-app-secret" onChange={(event) => setAppSecret(event.target.value)} value={appSecret} />
        </FormField>
      </div>
      {webhookUrl ? (
        <div className="grid gap-2 rounded-panel border border-app-border bg-app-soft p-3">
          <p className="text-sm text-app-text">
            To receive messages, paste these into your Meta app (WhatsApp → Configuration → Webhook) and subscribe to the
            &quot;messages&quot; field:
          </p>
          <SetupValue label="Callback URL" value={webhookUrl} />
          <SetupValue label="Verify token" value={data.verifyToken} />
        </div>
      ) : (
        <p className="text-sm text-app-muted">Save once to get the webhook URL and verify token for receiving messages.</p>
      )}
      <Switch checked={enabled} id="wa-enabled" label="Send and receive WhatsApp messages on this number" onCheckedChange={setEnabled} />
      <div className="flex justify-end">
        <Button disabled={!idOk || (enabled && !data.hasAccessToken && !accessToken.trim())} isLoading={save.isPending} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

/**
 * `/admin/whatsapp`: the academy's own WhatsApp Business number (super admins;
 * §F "WhatsApp"). On every plan, so it is its own page and not part of Branding
 * (which is a plan feature). Nexa's own academy uses the server's number.
 */
export function WhatsAppConnectionClient() {
  const query = useWhatsAppSettings(true);
  const data = query.data;

  return (
    <div className="space-y-6">
      <PageHeader
        description="Messages to your students and parents go from your own WhatsApp Business number, and the WhatsApp support bot answers on it."
        title="WhatsApp connection"
      />
      {query.isError ? (
        <WidgetError message="Couldn't load the WhatsApp connection." onRetry={() => void query.refetch()} />
      ) : !data ? (
        <Skeleton className="h-64 w-full" />
      ) : data.usesPlatformNumber ? (
        <Alert title="Nothing to set here" variant="info">
          This academy sends and receives on the number configured on the server.
        </Alert>
      ) : (
        <SectionCard
          description="Without a connected number, WhatsApp is off and email still works."
          title="Your WhatsApp Business number"
        >
          <Form data={data} key={data.updatedAt ?? "new"} />
        </SectionCard>
      )}
    </div>
  );
}
