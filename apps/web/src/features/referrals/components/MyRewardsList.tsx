"use client";

import { Gift } from "lucide-react";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { useMyReferralRewards } from "../hooks/useReferrals";
import { money, REWARD_STATUS_LABEL, REWARD_STATUS_VARIANT } from "../lib/referralFormat";

export function MyRewardsList() {
  const timeZone = useUserTimeZone();
  const { data, isLoading } = useMyReferralRewards();

  if (isLoading) return <Skeleton className="h-48 rounded-app" />;
  if (!data?.length) {
    return (
      <EmptyState
        description="Rewards appear here when your referrals reach a stage the academy rewards."
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
                <p className="font-bold text-app-text">{reward.ruleName}</p>
                <p className="text-xs text-app-muted">{reward.prospectName ?? reward.description}</p>
              </TableCell>
              <TableCell>
                <Badge variant={REWARD_STATUS_VARIANT[reward.status]}>{REWARD_STATUS_LABEL[reward.status]}</Badge>
              </TableCell>
              <TableCell>{formatFullDate(reward.createdAt, timeZone)}</TableCell>
              <TableCell className="text-right font-bold tabular-nums">{money(reward.amountMinor, reward.currency)}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </Card>
  );
}
