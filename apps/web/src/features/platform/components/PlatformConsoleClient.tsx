"use client";

import { useCallback, useState } from "react";
import type { PlatformSupportSessionItem } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Alert } from "@/components/ui/Alert";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAuthStore } from "@/stores/authStore";
import { useEndSupportSession, usePlatformSupportSessions, usePlatformTenants } from "../hooks/usePlatformApi";
import { AcademiesTab } from "./AcademiesTab";
import { AuditList } from "./AuditList";
import { BillingTab } from "./BillingTab";
import { ContentPacksTab } from "./ContentPacksTab";
import { PlansTab } from "./PlansTab";
import { SupportVisitsTable } from "./SupportVisitsTable";

const TABS = ["academies", "plans", "packs", "billing", "support", "audit"] as const;
type Tab = (typeof TABS)[number];

/** The academy name for an id, from the (small) academy list the console already holds. */
export function useAcademyName() {
  const tenants = usePlatformTenants().data?.tenants;
  return useCallback(
    (tenantId: string) => tenants?.find((tenant) => tenant.id === tenantId)?.name ?? tenantId,
    [tenants]
  );
}

function SupportTab() {
  const visits = usePlatformSupportSessions();
  const end = useEndSupportSession();
  const academyName = useAcademyName();
  if (visits.isError) return <WidgetError message="Could not load support visits." onRetry={() => void visits.refetch()} />;
  if (visits.isLoading) return <Skeleton className="h-40 w-full" />;
  return (
    <SupportVisitsTable
      academyName={academyName}
      onEnd={(visit: PlatformSupportSessionItem) => end.mutate(visit.id)}
      visits={visits.data?.sessions ?? []}
    />
  );
}

/** `/admin/platform`: Nexa's console for every academy on the platform (docs/SAAS_MULTI_TENANCY.md §I). */
export function PlatformConsoleClient() {
  const isOperator = useAuthStore((state) => state.user?.isPlatformOperator === true);
  const academyName = useAcademyName();
  const [tab, setTab] = useState<Tab>("academies");

  return (
    <div>
      <PageHeader
        description="Academies, plans, content packs and support visits across the whole platform."
        title="Platform console"
      />
      {!isOperator ? (
        <Alert title="Platform operators only" variant="warning">
          Only NexaChess&apos;s own super admins can use the platform console.
        </Alert>
      ) : (
        <Tabs onValueChange={(value) => setTab(value as Tab)} value={tab}>
          <TabsList className="max-w-full justify-self-start overflow-x-auto">
            <TabsTrigger value="academies">Academies</TabsTrigger>
            <TabsTrigger value="plans">Plans</TabsTrigger>
            <TabsTrigger value="packs">Content packs</TabsTrigger>
            <TabsTrigger value="billing">Billing</TabsTrigger>
            <TabsTrigger value="support">Support visits</TabsTrigger>
            <TabsTrigger value="audit">Audit log</TabsTrigger>
          </TabsList>
          <TabsContent value="academies">
            <AcademiesTab />
          </TabsContent>
          <TabsContent value="plans">
            <PlansTab />
          </TabsContent>
          <TabsContent value="packs">
            <ContentPacksTab />
          </TabsContent>
          <TabsContent value="billing">
            <BillingTab />
          </TabsContent>
          <TabsContent value="support">
            <SupportTab />
          </TabsContent>
          <TabsContent value="audit">
            <AuditList academyName={academyName} />
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
