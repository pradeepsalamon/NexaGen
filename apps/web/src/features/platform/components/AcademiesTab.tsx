"use client";

import { Building2, ExternalLink, Plus, Settings2 } from "lucide-react";
import { useMemo, useState } from "react";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { RowActions } from "@/components/ui/RowActions";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { usePlatformTenants } from "../hooks/usePlatformApi";
import { CreateAcademyDialog } from "./CreateAcademyDialog";
import { SubscriptionStatusBadge, TenantStatusBadge } from "./statusBadges";

export function AcademiesTab() {
  const timeZone = useUserTimeZone();
  const tenants = usePlatformTenants();
  const [creating, setCreating] = useState(false);
  const [search, setSearch] = useState("");

  const rows = useMemo(() => {
    const query = search.trim().toLowerCase();
    const list = tenants.data?.tenants ?? [];
    return query
      ? list.filter((tenant) =>
          [tenant.name, tenant.slug, tenant.primaryHost ?? ""].some((value) => value.toLowerCase().includes(query))
        )
      : list;
  }, [search, tenants.data]);

  if (tenants.isError) return <WidgetError message="Could not load academies." onRetry={() => void tenants.refetch()} />;

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          aria-label="Search academies"
          className="max-w-xs"
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search name or address"
          value={search}
        />
        <Button className="ml-auto" onClick={() => setCreating(true)} type="button">
          <Plus aria-hidden="true" className="size-4" strokeWidth={2.5} />
          New academy
        </Button>
      </div>

      {tenants.isLoading ? (
        <Skeleton className="h-48 w-full" />
      ) : rows.length === 0 ? (
        <EmptyState
          description={search ? "No academy matches that search." : "Create the first academy to get started."}
          icon={Building2}
          title="No academies"
        />
      ) : (
        <div className="overflow-x-auto rounded-panel border border-app-border bg-app-surface shadow-card">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Academy</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Subscription</TableHead>
                <TableHead className="text-right">Students</TableHead>
                <TableHead className="text-right">Coaches</TableHead>
                <TableHead>Created</TableHead>
                <TableHead className="text-right">
                  <span className="sr-only">Actions</span>
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tenant) => (
                <TableRow key={tenant.id}>
                  <TableCell>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-app-text">{tenant.name}</span>
                      {tenant.status !== "ACTIVE" ? <TenantStatusBadge status={tenant.status} /> : null}
                    </div>
                    <p className="text-xs text-app-muted">{tenant.primaryHost ?? tenant.slug}</p>
                  </TableCell>
                  <TableCell>{tenant.plan?.name ?? "—"}</TableCell>
                  <TableCell>
                    <SubscriptionStatusBadge accessMode={tenant.accessMode} status={tenant.subscriptionStatus} />
                  </TableCell>
                  <TableCell className="text-right tabular-nums">{tenant.usage.maxStudents}</TableCell>
                  <TableCell className="text-right tabular-nums">{tenant.usage.maxCoaches}</TableCell>
                  <TableCell className="whitespace-nowrap">{formatFullDate(tenant.createdAt, timeZone)}</TableCell>
                  <TableCell>
                    <RowActions
                      actions={[
                        {
                          ariaLabel: `Manage ${tenant.name}`,
                          href: `/admin/platform/academies/${tenant.id}`,
                          icon: Settings2,
                          label: "Manage"
                        },
                        ...(tenant.primaryHost
                          ? [
                              {
                                ariaLabel: `Open ${tenant.primaryHost}`,
                                icon: ExternalLink,
                                label: "Open site",
                                onSelect: () => window.open(`https://${tenant.primaryHost}`, "_blank", "noopener")
                              }
                            ]
                          : [])
                      ]}
                    />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {creating ? (
        <CreateAcademyDialog onClose={() => setCreating(false)} rootDomain={tenants.data?.rootDomain ?? "nexachess.in"} />
      ) : null}
    </div>
  );
}
