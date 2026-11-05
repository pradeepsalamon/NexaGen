"use client";

import { useEffect, useState } from "react";
import {
  TENANT_GATEWAY_FIELD_LABELS,
  type TenantGatewayView,
} from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { PasswordInput } from "@/components/ui/PasswordInput";
import { SectionCard } from "@/components/ui/SectionCard";
import { Switch } from "@/components/ui/Switch";
import { apiUrl } from "@/lib/apiBase";
import { enumLabel } from "@/lib/utils";
import { useAuthStore } from "@/stores/authStore";
import { useGatewayKeys, useUpdateGatewayKeys } from "../hooks/useGatewayKeys";

/** The full webhook URL to paste into the gateway's dashboard (an academy host serves the API at /api). */
function useAbsoluteApiUrl(path: string | null) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    setUrl(path ? new URL(apiUrl(path), window.location.origin).toString() : null);
  }, [path]);
  return url;
}

function GatewayForm({ gateway }: { gateway: TenantGatewayView }) {
  const webhookUrl = useAbsoluteApiUrl(gateway.webhookPath);
  const save = useUpdateGatewayKeys();
  const labels = TENANT_GATEWAY_FIELD_LABELS[gateway.provider];
  const id = gateway.provider.toLowerCase();
  const [publicKey, setPublicKey] = useState(gateway.publicKey ?? "");
  const [keySecret, setKeySecret] = useState("");
  const [webhookSecret, setWebhookSecret] = useState("");
  const [enabled, setEnabled] = useState(gateway.enabled);
  const needsWebhookSecret = gateway.provider !== "CASHFREE";
  const canSave =
    publicKey.trim().length >= 4 &&
    (gateway.hasKeySecret || keySecret.trim().length >= 8) &&
    (!enabled || !needsWebhookSecret || gateway.hasWebhookSecret || webhookSecret.trim().length >= 8);

  return (
    <form
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        save
          .mutateAsync({
            body: {
              enabled,
              keySecret: keySecret.trim() || undefined,
              publicKey: publicKey.trim(),
              webhookSecret: webhookSecret.trim() || undefined,
            },
            provider: gateway.provider,
          })
          .then(
            () => {
              setKeySecret("");
              setWebhookSecret("");
            },
            () => undefined
          );
      }}
    >
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-app-text">{enumLabel(gateway.provider)}</h3>
        <Badge variant={gateway.configured ? "success" : "secondary"}>{gateway.configured ? "Connected" : "Not connected"}</Badge>
      </div>
      <div className="grid items-start gap-4 sm:grid-cols-3">
        <FormField id={`${id}-public`} label={labels.publicKey} required>
          <Input autoComplete="off" id={`${id}-public`} onChange={(event) => setPublicKey(event.target.value)} value={publicKey} />
        </FormField>
        <FormField hint={gateway.hasKeySecret ? "Saved. Leave blank to keep it." : undefined} id={`${id}-secret`} label={labels.keySecret}>
          <PasswordInput autoComplete="off" id={`${id}-secret`} onChange={(event) => setKeySecret(event.target.value)} value={keySecret} />
        </FormField>
        <FormField
          hint={gateway.hasWebhookSecret ? "Saved. Leave blank to keep it." : undefined}
          id={`${id}-webhook`}
          label={labels.webhookSecret}
        >
          <PasswordInput autoComplete="off" id={`${id}-webhook`} onChange={(event) => setWebhookSecret(event.target.value)} value={webhookSecret} />
        </FormField>
      </div>
      {webhookUrl ? (
        <p className="break-all text-xs text-app-muted">
          Webhook URL for the {enumLabel(gateway.provider)} dashboard:{" "}
          <span className="font-mono text-app-text">{webhookUrl}</span>
        </p>
      ) : null}
      <Switch checked={enabled} id={`${id}-enabled`} label="Take student payments through this account" onCheckedChange={setEnabled} />
      <div>
        <Button disabled={!canSave} isLoading={save.isPending} type="submit" variant="outline">
          Save {enumLabel(gateway.provider)}
        </Button>
      </div>
    </form>
  );
}

/**
 * The academy's own gateway accounts (docs/SAAS_MULTI_TENANCY.md §G "Two
 * money flows" 2): student fees land in the academy's account, never
 * NexaChess's. Super admins only; hidden on NexaChess's own academy, which
 * uses the server's keys.
 */
export function GatewayKeysPanel() {
  const isSuperAdmin = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  const query = useGatewayKeys(isSuperAdmin);
  if (!isSuperAdmin || !query.data || query.data.usesPlatformAccount) return null;
  return (
    <SectionCard
      description="Students pay into your own gateway account. Without a connected gateway, online payments are off; manual payments still work."
      title="Your gateway accounts"
    >
      {!query.data.canStore ? (
        <p className="text-sm text-app-muted">Saving gateway keys isn&apos;t set up on this server yet. Contact the NexaChess team.</p>
      ) : (
        <div className="grid gap-6 divide-y divide-app-border [&>*:not(:first-child)]:pt-6">
          {query.data.gateways.map((gateway) => (
            <GatewayForm gateway={gateway} key={gateway.provider} />
          ))}
        </div>
      )}
    </SectionCard>
  );
}
