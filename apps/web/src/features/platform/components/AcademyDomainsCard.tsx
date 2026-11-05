"use client";

import { RefreshCw, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import type { PlatformTenantDetail } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { SectionCard } from "@/components/ui/SectionCard";
import { enumLabel } from "@/lib/utils";
import {
  useAddPlatformTenantDomain,
  useCheckPlatformTenantDomain,
  useMakePlatformTenantDomainPrimary,
  useRemovePlatformTenantDomain
} from "../hooks/usePlatformApi";

/** The server block the owner adds by hand (§H "Full domains"); certbot fills in the TLS lines. */
const nginxBlock = (host: string) => `server {
    server_name ${host};
    location /api/ { proxy_pass http://127.0.0.1:3001/; include /etc/nginx/nexa-proxy.conf; }
    location /     { proxy_pass http://127.0.0.1:3000;  include /etc/nginx/nexa-proxy.conf; }
}`;

/** The academy's addresses: its subdomain, plus custom domains (checked and activated in Phase 5). */
export function AcademyDomainsCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const add = useAddPlatformTenantDomain(tenant.id);
  const remove = useRemovePlatformTenantDomain(tenant.id);
  const makePrimary = useMakePlatformTenantDomainPrimary(tenant.id);
  const check = useCheckPlatformTenantDomain(tenant.id);
  const pending = tenant.domains.find((domain) => domain.kind === "CUSTOM" && domain.status === "PENDING");
  const [hostname, setHostname] = useState("");

  return (
    <SectionCard
      description="A custom domain stays pending until its DNS check passes."
      title="Addresses"
    >
      <ul className="divide-y divide-app-border rounded-app border border-app-border">
        {tenant.domains.map((domain) => (
          <li className="flex flex-wrap items-center gap-2 px-3 py-2" key={domain.id}>
            <span className="min-w-0 flex-1 break-all text-sm font-medium text-app-text">{domain.hostname}</span>
            {domain.isPrimary ? <Badge variant="default">Primary</Badge> : null}
            <Badge variant={domain.status === "ACTIVE" ? "success" : "warning"}>{enumLabel(domain.status)}</Badge>
            <Badge variant="outline">{enumLabel(domain.kind)}</Badge>
            {domain.lastCheckResult ? (
              <p className="w-full text-xs text-app-muted">{domain.lastCheckResult}</p>
            ) : null}
            <RowActions
              actions={[
                {
                  ariaLabel: `Check ${domain.hostname}`,
                  disabled: domain.kind === "SUBDOMAIN" || check.isPending,
                  icon: RefreshCw,
                  label: "Check",
                  onSelect: () => check.mutate(domain.id)
                },
                {
                  ariaLabel: `Make ${domain.hostname} the primary address`,
                  disabled: domain.isPrimary || domain.status !== "ACTIVE",
                  icon: Star,
                  label: "Make primary",
                  onSelect: () => makePrimary.mutate(domain.id)
                },
                {
                  ariaLabel: `Remove ${domain.hostname}`,
                  disabled: domain.kind === "SUBDOMAIN",
                  icon: Trash2,
                  label: "Remove",
                  onSelect: () => remove.mutate(domain.id),
                  tone: "danger"
                }
              ]}
            />
          </li>
        ))}
      </ul>
      {pending ? (
        <div className="mt-3 rounded-app bg-app-soft p-3 text-xs text-app-text">
          <p className="mb-1 font-semibold">VPS setup for {pending.hostname} (docs/DEPLOYMENT.md, Step 4c)</p>
          <pre className="overflow-x-auto whitespace-pre font-mono text-xs leading-5">{nginxBlock(pending.hostname)}</pre>
          <p className="mt-1 text-app-muted">Then run certbot for the host, reload nginx, and press Check.</p>
        </div>
      ) : null}
      <form
        className="mt-3 flex flex-wrap gap-2"
        onSubmit={(event) => {
          event.preventDefault();
          add.mutateAsync({ hostname: hostname.trim() }).then(() => setHostname(""), () => undefined);
        }}
      >
        <Input
          aria-label="Custom domain"
          className="min-w-0 flex-1"
          onChange={(event) => setHostname(event.target.value)}
          placeholder="learn.example.com"
          value={hostname}
        />
        <Button disabled={hostname.trim().length < 3} isLoading={add.isPending} type="submit" variant="neutral">
          Add domain
        </Button>
      </form>
    </SectionCard>
  );
}
