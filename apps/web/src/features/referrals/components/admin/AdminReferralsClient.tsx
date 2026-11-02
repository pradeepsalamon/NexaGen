"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { LedgerPanel } from "./LedgerPanel";
import { PipelinePanel } from "./PipelinePanel";
import { ReferralSettingsPanel } from "./ReferralSettingsPanel";
import { ReferrersPanel } from "./ReferrersPanel";
import { RewardRulesPanel } from "./RewardRulesPanel";
import { RewardsPanel } from "./RewardsPanel";
import { StagesPanel } from "./StagesPanel";
import { WithdrawalsPanel } from "./WithdrawalsPanel";

const TABS = ["pipeline", "referrers", "rewards", "withdrawals", "ledger", "rules", "stages", "settings"] as const;

/** Admin referral board (docs/REFERRALS.md). `?tab=withdrawals` deep-links a tab. */
export function AdminReferralsClient() {
  const requested = useSearchParams().get("tab");
  const [tab, setTab] = useState<string>(TABS.find((t) => t === requested) ?? "pipeline");
  const [referrer, setReferrer] = useState<{ id: string; name: string } | null>(null);

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-10">
      <PageHeader
        description="Referral links for students, coaches and sales staff: the pipeline, rewards for referrers and new members, wallets and payouts."
        title="Referrals"
      />
      <Tabs onValueChange={setTab} value={tab}>
        <TabsList className="justify-self-end">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="referrers">Referrers</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="ledger">Wallets</TabsTrigger>
          <TabsTrigger value="rules">Reward rules</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
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
        <TabsContent value="withdrawals">
          <WithdrawalsPanel />
        </TabsContent>
        <TabsContent value="ledger">
          <LedgerPanel />
        </TabsContent>
        <TabsContent value="rules">
          <RewardRulesPanel />
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
