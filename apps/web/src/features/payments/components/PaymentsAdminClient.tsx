"use client";

import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { DiscountsPanel } from "./DiscountsPanel";
import { ManualPaymentsPanel } from "./ManualPaymentsPanel";
import { PaymentsOverviewPanel } from "./PaymentsOverviewPanel";
import { PaymentsTablePanel } from "./PaymentsTablePanel";
import { PlansPanel } from "./PlansPanel";
import { ProviderHealthPanel } from "./ProviderHealthPanel";
import { RefundsPanel } from "./RefundsPanel";
import { RoutingPanel } from "./RoutingPanel";
import { SubscriptionsPanel } from "./SubscriptionsPanel";

/** The admin payment dashboard (§16) and its configuration surfaces. */
export function PaymentsAdminClient() {
  return (
    <div className="space-y-6">
      <PageHeader
        description="Revenue, transactions, refunds, subscriptions and gateway configuration."
        title="Payments"
      />

      <Tabs defaultValue="overview">
        <TabsList>
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="transactions">Transactions</TabsTrigger>
          <TabsTrigger value="manual">Manual payments</TabsTrigger>
          <TabsTrigger value="refunds">Refunds</TabsTrigger>
          <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger>
          <TabsTrigger value="plans">Plans</TabsTrigger>
          <TabsTrigger value="discounts">Discounts</TabsTrigger>
          <TabsTrigger value="gateways">Gateways</TabsTrigger>
        </TabsList>

        <TabsContent value="overview">
          <PaymentsOverviewPanel />
        </TabsContent>
        <TabsContent value="transactions">
          <PaymentsTablePanel />
        </TabsContent>
        <TabsContent value="manual">
          <ManualPaymentsPanel />
        </TabsContent>
        <TabsContent value="refunds">
          <RefundsPanel />
        </TabsContent>
        <TabsContent value="subscriptions">
          <SubscriptionsPanel />
        </TabsContent>
        <TabsContent value="plans">
          <PlansPanel />
        </TabsContent>
        <TabsContent value="discounts">
          <DiscountsPanel />
        </TabsContent>
        <TabsContent value="gateways">
          <div className="space-y-6">
            <ProviderHealthPanel />
            <RoutingPanel />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
