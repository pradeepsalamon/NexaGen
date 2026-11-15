"use client";

import { Badge } from "@/components/ui/Badge";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { enumLabel } from "@/lib/utils";
import { useTenantDomains } from "../hooks/useBranding";

/** The academy's own addresses, and how to point its own domain here (plan `customDomain`). */
export function AcademyDomainsSection() {
  const domains = useTenantDomains(true);
  return (
    <SectionCard description="Links in emails always use the primary address." title="Addresses">
      {!domains.data ? (
        <Skeleton className="h-24 w-full" />
      ) : (
        <div className="grid gap-4">
          <ul className="divide-y divide-app-border rounded-app border border-app-border">
            {domains.data.domains.map((domain) => (
              <li className="flex flex-wrap items-center gap-2 px-3 py-2" key={domain.hostname}>
                <span className="min-w-0 flex-1 break-all text-sm font-medium text-app-text">{domain.hostname}</span>
                {domain.isPrimary ? <Badge>Primary</Badge> : null}
                <Badge variant={domain.status === "ACTIVE" ? "success" : "warning"}>{enumLabel(domain.status)}</Badge>
              </li>
            ))}
          </ul>
          <div className="rounded-app bg-app-soft p-3 text-sm text-app-text">
            <p className="font-semibold">Use your own domain</p>
            <ol className="mt-1 list-decimal space-y-1 pl-5 text-app-muted">
              <li>
                At your domain provider, add a <span className="font-mono">CNAME</span> record for the address you want
                (e.g. <span className="font-mono">learn.yourschool.com</span>) pointing to{" "}
                <span className="break-all font-mono text-app-text">{domains.data.dnsTarget}</span>.
              </li>
              <li>Send the address to the NexaChess team. It goes live once the check passes.</li>
            </ol>
          </div>
        </div>
      )}
    </SectionCard>
  );
}
