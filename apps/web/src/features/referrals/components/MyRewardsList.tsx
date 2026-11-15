"use client";

import { Gift } from "lucide-react";
import { formatReferralReward } from "@nexa-chess/types";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useMyReferralRewards } from "../hooks/useReferrals";
import { REWARD_STATUS_LABEL, REWARD_STATUS_VARIANT } from "../lib/referralFormat";

export function MyRewardsList() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useMyReferralRewards();

  if (isLoading) return <Skeleton className="h-48 rounded-app" />;
  if (!data?.length) {
    return (
      <EmptyState
        description="Rewards appear here when your referrals reach a stage the academy rewards — and welcome points if you joined through someone's link."
        icon={Gift}
        title="No rewards yet"
      />
    );
  }

  return (
    <Card className="p-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Reward</TableHead>
            <TableHead>Status</TableHead>
            <TableHead>Date</TableHead>
            <TableHead className="text-right">Amount</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((reward) => (
            <TableRow key={reward.id}>
              <TableCell>
                <p className="flex flex-wrap items-center gap-2 font-bold text-app-text">
                  {reward.sourceName}
                  {reward.beneficiary === "REFERRED" ? <Badge variant="accent">Welcome points</Badge> : null}
                </p>
                <p className="text-xs text-app-muted">
                  {reward.beneficiary === "REFERRED" ? reward.description : (reward.prospectName ?? reward.description)}
                </p>
              </TableCell>
              <TableCell>
                <Badge variant={REWARD_STATUS_VARIANT[reward.status]}>{REWARD_STATUS_LABEL[reward.status]}</Badge>
              </TableCell>
              <TableCell>{formatFullDate(reward.createdAt, timeZone)}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">
                {formatReferralReward(reward.amountMinor, reward.unit, reward.currency)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
