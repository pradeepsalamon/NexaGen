"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";
import { DiscountsPanel } from "./DiscountsPanel";
import { GatewayKeysPanel } from "./GatewayKeysPanel";
import { ManualPaymentsPanel } from "./ManualPaymentsPanel";
import { PaymentsOverviewPanel } from "./PaymentsOverviewPanel";
import { PaymentsTablePanel } from "./PaymentsTablePanel";
import { PlansPanel } from "./PlansPanel";
import { ProviderHealthPanel } from "./ProviderHealthPanel";
import { RefundsPanel } from "./RefundsPanel";
import { RoutingPanel } from "./RoutingPanel";
import { SubscriptionsPanel } from "./SubscriptionsPanel";

/** The admin payment dashboard (§16) and its configuration surfaces. */
const FEE_TABS = ["overview", "transactions", "manual", "plans"];
/** Only with online payments (`studentPayments`); fee tracking alone records offline payments. */
const ONLINE_TABS = ["refunds", "subscriptions", "discounts", "gateways"];

export function PaymentsAdminClient() {
  // `?tab=manual` is the admin request inbox's link to the offline-payment queue.
  const requested = useSearchParams().get("tab");
  const online = usePlanFeature("studentPayments") === true;
  const tabs = online ? [...FEE_TABS, ...ONLINE_TABS] : FEE_TABS;
  const initialTab = requested && tabs.includes(requested) ? requested : "overview";
  return (
    <div className="space-y-6">
      <Tabs defaultValue={initialTab}>
        <PageHeader
          description={
            online
              ? "Revenue, transactions, refunds, subscriptions and gateway configuration."
              : "Fees received, payments recorded in cash, UPI or bank transfer, and fee plans."
          }
          tabs={
            <TabsList>
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="transactions">Transactions</TabsTrigger>
              <TabsTrigger value="manual">Manual payments</TabsTrigger>
              {online ? <TabsTrigger value="refunds">Refunds</TabsTrigger> : null}
              {online ? <TabsTrigger value="subscriptions">Subscriptions</TabsTrigger> : null}
              <TabsTrigger value="plans">Plans</TabsTrigger>
              {online ? <TabsTrigger value="discounts">Discounts</TabsTrigger> : null}
              {online ? <TabsTrigger value="gateways">Gateways</TabsTrigger> : null}
            </TabsList>
          }
          title="Payments"
        />

        <TabsContent value="overview">
          <PaymentsOverviewPanel />
        </TabsContent>
        <TabsContent value="transactions">
          <PaymentsTablePanel />
        </TabsContent>
        <TabsContent value="manual">
          <ManualPaymentsPanel />
        </TabsContent>
        {online ? (
          <TabsContent value="refunds">
            <RefundsPanel />
          </TabsContent>
        ) : null}
        {online ? (
          <TabsContent value="subscriptions">
            <SubscriptionsPanel />
          </TabsContent>
        ) : null}
        <TabsContent value="plans">
          <PlansPanel />
        </TabsContent>
        {online ? (
          <TabsContent value="discounts">
            <DiscountsPanel />
          </TabsContent>
        ) : null}
        {online ? (
          <TabsContent value="gateways">
            <div className="space-y-6">
              <GatewayKeysPanel />
              <ProviderHealthPanel />
              <RoutingPanel />
            </div>
          </TabsContent>
        ) : null}
      </Tabs>
    </div>
  );
}
