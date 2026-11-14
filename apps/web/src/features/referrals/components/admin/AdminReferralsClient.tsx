"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { BonusRulesPanel } from "./BonusRulesPanel";
import { LedgerPanel } from "./LedgerPanel";
import { PipelinePanel } from "./PipelinePanel";
import { RedemptionsPanel } from "./RedemptionsPanel";
import { ReferralSettingsPanel } from "./ReferralSettingsPanel";
import { ReferrersPanel } from "./ReferrersPanel";
import { RewardsPanel } from "./RewardsPanel";
import { StagesPanel } from "./StagesPanel";
import { VouchersPanel } from "./VouchersPanel";
import { WithdrawalsPanel } from "./WithdrawalsPanel";

const TABS = [
  "pipeline",
  "referrers",
  "rewards",
  "redemptions",
  "withdrawals",
  "ledger",
  "vouchers",
  "bonuses",
  "stages",
  "settings"
] as const;

/** Admin referral board (docs/REFERRALS.md). `?tab=withdrawals` deep-links a tab. */
export function AdminReferralsClient() {
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<string>(TABS.find((t) => t === requested) ?? "pipeline");
  const [referrer, setReferrer] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-10">
      <Tabs onValueChange={setTab} value={tab}>
        <PageHeader
          description="Referral links for students, coaches and sales staff: the pipeline, what each stage pays (points for students, money for staff), the rewards store, and payouts."
          tabs={
            <TabsList>
              <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
              <TabsTrigger value="referrers">Referrers</TabsTrigger>
              <TabsTrigger value="rewards">Rewards</TabsTrigger>
              <TabsTrigger value="redemptions">Redemptions</TabsTrigger>
              <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
              <TabsTrigger value="ledger">History</TabsTrigger>
              <TabsTrigger value="vouchers">Vouchers</TabsTrigger>
              <TabsTrigger value="bonuses">Bonuses</TabsTrigger>
              <TabsTrigger value="stages">Stages</TabsTrigger>
              <TabsTrigger value="settings">Settings</TabsTrigger>
            </TabsList>
          }
          title="Referrals"
        />
        <TabsContent value="pipeline">
          <PipelinePanel onClearReferrer={() => setReferrer(null)} referrer={referrer} />
        </TabsContent>
        <TabsContent value="referrers">
          <ReferrersPanel
            onViewReferrals={(row) => {
              setReferrer({ id: row.userId, name: row.name });
              setTab("pipeline");
            }}
          />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsPanel />
        </TabsContent>
        <TabsContent value="redemptions">
          <RedemptionsPanel />
        </TabsContent>
        <TabsContent value="withdrawals">
          <WithdrawalsPanel />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerPanel />
        </TabsContent>
        <TabsContent value="vouchers">
          <VouchersPanel />
        </TabsContent>
        <TabsContent value="bonuses">
          <BonusRulesPanel />
        </TabsContent>
        <TabsContent value="stages">
          <StagesPanel />
        </TabsContent>
        <TabsContent value="settings">
          <ReferralSettingsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
