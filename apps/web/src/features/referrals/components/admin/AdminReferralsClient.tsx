"use client";

import { useSearchParams } from "next/navigation";
import { PageHeader } from "@/components/layout/PageHeader";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { PipelinePanel } from "./PipelinePanel";
import { ReferralSettingsPanel } from "./ReferralSettingsPanel";
import { ReferrersPanel } from "./ReferrersPanel";
import { RewardRulesPanel } from "./RewardRulesPanel";
import { RewardsPanel } from "./RewardsPanel";
import { StagesPanel } from "./StagesPanel";
import { WithdrawalsPanel } from "./WithdrawalsPanel";

const TABS = ["pipeline", "referrers", "rewards", "withdrawals", "rules", "stages", "settings"] as const;

/** Admin referral board (docs/REFERRALS.md). `?tab=withdrawals` deep-links a tab. */
export function AdminReferralsClient() {
  const requested = useSearchParams().get("tab");
  const initialTab = TABS.find((tab) => tab === requested) ?? "pipeline";

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-10">
      <PageHeader
        description="Referral links for students, coaches and sales staff: the pipeline, reward rules and payouts."
        title="Referrals"
      />
      <Tabs defaultValue={initialTab}>
        <TabsList className="justify-self-end">
          <TabsTrigger value="pipeline">Pipeline</TabsTrigger>
          <TabsTrigger value="referrers">Referrers</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="withdrawals">Withdrawals</TabsTrigger>
          <TabsTrigger value="rules">Reward rules</TabsTrigger>
          <TabsTrigger value="stages">Stages</TabsTrigger>
          <TabsTrigger value="settings">Settings</TabsTrigger>
        </TabsList>
        <TabsContent value="pipeline">
          <PipelinePanel />
        </TabsContent>
        <TabsContent value="referrers">
          <ReferrersPanel />
        </TabsContent>
        <TabsContent value="rewards">
          <RewardsPanel />
        </TabsContent>
        <TabsContent value="withdrawals">
          <WithdrawalsPanel />
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
