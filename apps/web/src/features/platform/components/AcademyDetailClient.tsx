"use client";

import { LifeBuoy, Pause, Play } from "lucide-react";
import { useState } from "react";
import { DEFAULT_TENANT_ID, PLAN_LIMIT_KEYS, PLAN_LIMITS } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useToast } from "@/providers/ToastProvider";
import {
  useEndSupportSession,
  usePlatformSupportSessions,
  usePlatformTenant,
  useReactivatePlatformTenant,
  useStartSupportSession,
  useSuspendPlatformTenant,
  useUpdatePlatformTenant
} from "../hooks/usePlatformApi";
import { AcademyBillingCard } from "./AcademyBillingCard";
import { AcademyDomainsCard } from "./AcademyDomainsCard";
import { AcademySubscriptionCard } from "./AcademySubscriptionCard";
import { AuditList } from "./AuditList";
import { ReasonDialog } from "./ReasonDialog";
import { TenantStatusBadge } from "./statusBadges";
import { SupportVisitsTable } from "./SupportVisitsTable";
import type { PlatformTenantDetail } from "@nexa-chess/types";

function DetailsCard({ tenant }: { tenant: PlatformTenantDetail }) {
  const update = useUpdatePlatformTenant(tenant.id);
  const [name, setName] = useState(tenant.name);
  const [timezone, setTimezone] = useState(tenant.timezone);
  const [country, setCountry] = useState(tenant.country);
  const changed = name.trim() !== tenant.name || timezone.trim() !== tenant.timezone || country.trim().toUpperCase() !== tenant.country;

  return (
    <SectionCard title="Academy">
      <form
        className="grid gap-4"
        onSubmit={(event) => {
          event.preventDefault();
          update.mutate({ country: country.trim().toUpperCase(), name: name.trim(), timezone: timezone.trim() });
        }}
      >
        <FormField id="tenant-name" label="Name" required>
          <Input id="tenant-name" maxLength={120} onChange={(event) => setName(event.target.value)} value={name} />
        </FormField>
        <div className="grid items-start gap-4 sm:grid-cols-2">
          <FormField id="tenant-timezone" label="Time zone" required>
            <Input id="tenant-timezone" onChange={(event) => setTimezone(event.target.value)} value={timezone} />
          </FormField>
          <FormField id="tenant-country" label="Country code" required>
            <Input id="tenant-country" maxLength={2} onChange={(event) => setCountry(event.target.value)} value={country} />
          </FormField>
        </div>
        <dl className="grid gap-1 text-sm sm:grid-cols-2">
          {PLAN_LIMIT_KEYS.map((key) => (
            <div className="flex gap-2" key={key}>
              <dt className="text-app-muted">{PLAN_LIMITS[key].label}:</dt>
              <dd className="tabular-nums text-app-text">
                {tenant.usage[key]} of {tenant.limits[key] ?? "unlimited"}
              </dd>
            </div>
          ))}
        </dl>
        <div>
          <Button disabled={!changed || name.trim().length < 2} isLoading={update.isPending} type="submit" variant="neutral">
            Save
          </Button>
        </div>
      </form>
    </SectionCard>
  );
}

/** `/admin/platform/academies/[tenantId]`: one academy, as the platform console manages it. */
export function AcademyDetailClient({ tenantId }: { tenantId: string }) {
  const toast = useToast();
  const query = usePlatformTenant(tenantId);
  const visits = usePlatformSupportSessions(tenantId);
  const suspend = useSuspendPlatformTenant(tenantId);
  const reactivate = useReactivatePlatformTenant(tenantId);
  const startSupport = useStartSupportSession(tenantId);
  const endSupport = useEndSupportSession();
  const [dialog, setDialog] = useState<"reactivate" | "support" | "suspend" | null>(null);
  const tenant = query.data?.tenant;
  const isNexa = tenantId === DEFAULT_TENANT_ID;

  const breadcrumbs = [
    { href: "/admin/platform", label: "Platform console" },
    { label: tenant?.name ?? "Academy" }
  ];

  if (query.isError) {
    return (
      <div>
        <PageHeader breadcrumbs={breadcrumbs} title="Academy" />
        <WidgetError message="Could not load this academy." onRetry={() => void query.refetch()} />
      </div>
    );
  }
  if (!tenant) {
    return (
      <div>
        <PageHeader breadcrumbs={breadcrumbs} title="Academy" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  return (
    <div>
      <PageHeader
        actions={
          <>
            <Button
              disabled={isNexa || tenant.status !== "ACTIVE" || !tenant.primaryHost}
              onClick={() => setDialog("support")}
              type="button"
              variant="neutral"
            >
              <LifeBuoy aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Open as support
            </Button>
            {tenant.status === "ACTIVE" ? (
              <Button disabled={isNexa} onClick={() => setDialog("suspend")} type="button" variant="destructive">
                <Pause aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Suspend
              </Button>
            ) : (
              <Button onClick={() => setDialog("reactivate")} type="button">
                <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
                Reactivate
              </Button>
            )}
          </>
        }
        breadcrumbs={breadcrumbs}
        description={tenant.primaryHost ?? tenant.slug}
        title={
          <span className="inline-flex flex-wrap items-center gap-2">
            {tenant.name}
            {tenant.status !== "ACTIVE" ? <TenantStatusBadge status={tenant.status} /> : null}
          </span>
        }
      />

      {isNexa ? (
        <div className="mb-4">
          <Alert title="This is NexaChess's own academy" variant="info">
            It can&apos;t be suspended or opened as support, and its plan is managed like any other.
          </Alert>
        </div>
      ) : null}

      <div className="grid gap-6 xl:grid-cols-2">
        <div className="grid content-start gap-6">
          <AcademySubscriptionCard tenantId={tenantId} />
          <SectionCard title="Support visits">
            <SupportVisitsTable onEnd={(visit) => endSupport.mutate(visit.id)} visits={visits.data?.sessions ?? []} />
          </SectionCard>
        </div>
        <div className="grid content-start gap-6">
          <DetailsCard key={`${tenant.name}|${tenant.timezone}|${tenant.country}`} tenant={tenant} />
          <AcademyDomainsCard tenant={tenant} />
          {isNexa ? null : <AcademyBillingCard primaryHost={tenant.primaryHost} tenantId={tenantId} />}
        </div>
      </div>
      <section className="mt-6 grid gap-3">
        <h2 className="text-lg font-bold text-app-text">Audit log</h2>
        <AuditList tenantId={tenantId} />
      </section>

      {dialog === "suspend" ? (
        <ReasonDialog
          confirmLabel="Suspend academy"
          description="Everyone in the academy is signed out and can't sign in until it is reactivated. Nothing is deleted."
          isPending={suspend.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => suspend.mutateAsync({ reason })}
          title={`Suspend ${tenant.name}?`}
          variant="destructive"
        />
      ) : null}
      {dialog === "reactivate" ? (
        <ReasonDialog
          confirmLabel="Reactivate"
          description="The academy's users can sign in again."
          isPending={reactivate.isPending}
          onClose={() => setDialog(null)}
          onConfirm={(reason) => reactivate.mutateAsync({ reason })}
          title={`Reactivate ${tenant.name}?`}
        />
      ) : null}
      {dialog === "support" ? (
        <ReasonDialog
          confirmLabel="Start and open"
          description={`Opens ${tenant.primaryHost} signed in as the academy's support account for one hour. The academy's super admins can see this visit and its reason.`}
          isPending={startSupport.isPending}
          label="Reason (e.g. the ticket)"
          minLength={5}
          onClose={() => setDialog(null)}
          onConfirm={async (reason) => {
            const started = await startSupport.mutateAsync({ reason });
            const opened = window.open(started.enterUrl, "_blank");
            if (opened) {
              opened.opener = null;
            } else {
              toast.info({ message: started.enterUrl, title: "Pop-up blocked: open this one-time link within 5 minutes" });
            }
          }}
          title={`Open ${tenant.name} as support`}
        />
      ) : null}
    </div>
  );
}
