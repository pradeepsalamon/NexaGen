"use client";

import { useState } from "react";
import type { WhatsAppSettingsResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SectionCard } from "@/components/ui/SectionCard";
import { Switch } from "@/components/ui/Switch";
import { useUpdateWhatsAppSettings, useWhatsAppSettings } from "../hooks/useBranding";

function Form({ data }: { data: WhatsAppSettingsResponse }) {
  const save = useUpdateWhatsAppSettings();
  const [phoneNumberId, setPhoneNumberId] = useState(data.phoneNumberId ?? "");
  const [accessToken, setAccessToken] = useState("");
  const [enabled, setEnabled] = useState(data.enabled);
  const idOk = /^\d{5,30}$/.test(phoneNumberId.trim());

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save
          .mutateAsync({ accessToken: accessToken.trim() || undefined, enabled, phoneNumberId: phoneNumberId.trim() })
          .then(() => setAccessToken(""), () => undefined);
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <Badge variant={data.configured ? "success" : "secondary"}>{data.configured ? "Connected" : "Not connected"}</Badge>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-2">
        <FormField hint="Meta Business → WhatsApp → API setup." id="wa-phone-id" label="Phone number ID" required>
          <Input id="wa-phone-id" inputMode="numeric" onChange={(event) => setPhoneNumberId(event.target.value)} value={phoneNumberId} />
        </FormField>
        <FormField
          hint={data.hasAccessToken ? "Saved. Leave blank to keep it." : "A permanent system-user token."}
          id="wa-token"
          label="Access token"
        >
          <PasswordInput autoComplete="off" id="wa-token" onChange={(event) => setAccessToken(event.target.value)} value={accessToken} />
        </FormField>
      </div>
      <Switch checked={enabled} id="wa-enabled" label="Send WhatsApp messages from this number" onCheckedChange={setEnabled} />
      <div>
        <Button disabled={!idOk || (enabled && !data.hasAccessToken && !accessToken.trim())} isLoading={save.isPending} type="submit">
          Save
        </Button>
      </div>
    </form>
  );
}

/** The academy's own WhatsApp Business number (super admins; §F "WhatsApp"). */
export function WhatsAppSettingsSection() {
  const query = useWhatsAppSettings(true);
  if (!query.data || query.data.usesPlatformNumber) return null;
  return (
    <SectionCard
      description="Messages to your students and parents go from your own WhatsApp Business number. Without one, WhatsApp is off and email still works."
      title="WhatsApp"
    >
      <Form data={query.data} key={query.data.updatedAt ?? "new"} />
    </SectionCard>
  );
}
