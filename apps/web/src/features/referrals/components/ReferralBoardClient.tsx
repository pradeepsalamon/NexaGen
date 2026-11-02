"use client";

import { Eye, Gift, UserCheck, Users, Wallet } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useAuthStore } from "@/stores/authStore";
import { useMyReferralSummary } from "../hooks/useReferrals";
import { money } from "../lib/referralFormat";
import { HowItWorks } from "./HowItWorks";
import { MyReferralsTable } from "./MyReferralsTable";
import { MyRewardsList } from "./MyRewardsList";
import { ReferralFunnel } from "./ReferralFunnel";
import { ReferralShareCard } from "./ReferralShareCard";
import { WalletPanel } from "./WalletPanel";

/**
 * The referrer's board — one screen for students (`/student/referrals`),
 * coaches (`/coach/referrals`) and sales staff (`/sales`).
 */
export function ReferralBoardClient() {
  const role = useAuthStore((state) => state.user?.role);
  const isSales = role === "SALES";
  const { data, error, isLoading, refetch } = useMyReferralSummary();

  const header = (
    <PageHeader
      description={
        isSales
          ? "Track every person you bring to the academy, from first visit to onboarding."
          : "Invite friends to Nexa Chess and earn rewards when they join."
      }
      title={isSales ? "Referral board" : "Refer & earn"}
    />
  );

  if (isLoading) {
    return (
      <div className="space-y-5 pb-10">
        {header}
        <Skeleton className="h-40 rounded-panel" />
        <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
          {[0, 1, 2, 3].map((i) => (
            <Skeleton className="h-28 rounded-app" key={i} />
          ))}
        </div>
        <Skeleton className="h-64 rounded-app" />
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="pb-10">
        {header}
        <WidgetError message="Couldn't load your referrals. Try again." onRetry={() => void refetch()} />
      </div>
    );
  }

  const hasMoney = data.credits.balanceMinor !== 0 || data.credits.earnedMinor > 0;

  if (!data.eligible && !hasMoney) {
    return (
      <div className="pb-10">
        {header}
        <EmptyState
          description="The academy hasn't opened the referral programme to your account yet."
          icon={Gift}
          title="Referrals aren't available yet"
        />
      </div>
    );
  }

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-5 pb-10">
      {header}

      {data.eligible && data.code ? <ReferralShareCard active={data.codeActive} code={data.code} /> : null}

      <div className="grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
        <StatTile context="All time" icon={Eye} label="Link visits" tone="primary" value={String(data.totals.visits)} />
        <StatTile context="Unique people" icon={Users} label="Referred" tone="secondary" value={String(data.totals.referrals)} />
        <StatTile context="Joined the academy" icon={UserCheck} label="Onboarded" tone="accent" value={String(data.totals.converted)} />
        <StatTile
          context={
            data.credits.pendingRewardsMinor > 0
              ? `${money(data.credits.pendingRewardsMinor, data.credits.currency)} pending`
              : "Ready to use"
          }
          icon={Wallet}
          label="Credits"
          tone="reward"
          value={money(data.credits.balanceMinor, data.credits.currency)}
        />
      </div>

      <SectionCard description="How many of your referrals have reached each step." title="Your pipeline">
        <ReferralFunnel
          countLabel="reached"
          stages={data.stages.map((stage) => ({ ...stage, count: stage.reached }))}
        />
      </SectionCard>

      <Tabs defaultValue="referrals">
        <TabsList className="justify-self-end">
          <TabsTrigger value="referrals">Referrals</TabsTrigger>
          <TabsTrigger value="rewards">Rewards</TabsTrigger>
          <TabsTrigger value="wallet">Wallet</TabsTrigger>
          <TabsTrigger value="how">How it works</TabsTrigger>
        </TabsList>
        <TabsContent value="referrals">
          <MyReferralsTable showContact={isSales} stages={data.stages} />
        </TabsContent>
        <TabsContent value="rewards">
          <MyRewardsList />
        </TabsContent>
        <TabsContent value="wallet">
          <WalletPanel summary={data} />
        </TabsContent>
        <TabsContent value="how">
          <HowItWorks summary={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
