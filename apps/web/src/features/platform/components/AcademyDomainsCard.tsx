"use client";

import { Star, Trash2 } from "lucide-react";
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
  useMakePlatformTenantDomainPrimary,
  useRemovePlatformTenantDomain
} from "../hooks/usePlatformApi";

/** The academy's addresses: its subdomain, plus custom domains (checked and activated in Phase 5). */
export function AcademyDomainsCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const add = useAddPlatformTenantDomain(tenant.id);
  const remove = useRemovePlatformTenantDomain(tenant.id);
  const makePrimary = useMakePlatformTenantDomainPrimary(tenant.id);
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
            <RowActions
              actions={[
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
