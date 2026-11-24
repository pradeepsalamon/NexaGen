"use client";

import { useState } from "react";
import { BarChart3 } from "lucide-react";
import { formatMoney, LEAD_FUNNEL_MAX_DAYS, type LeadFunnelRow } from "@nexa-chess/types";
import { Alert } from "@/components/ui/Alert";
import { Card } from "@/components/ui/Card";
import { DateStringPicker } from "@/components/ui/DatePicker";
import { EmptyState } from "@/components/ui/EmptyState";
import { FormField } from "@/components/ui/FormField";
import { Table, TableBody, TableCell, TableFooter, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { TableSkeletonRows } from "@/components/ui/TableSkeletonRows";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useLeadFunnelQuery } from "../hooks/useAdminLeads";
import { dayInZone, daysBefore, percentOf } from "../lib/funnelDates";

const NOT_GIVEN = "—";

/**
 * Admin Leads → Funnel (docs/AD_MEASUREMENT.md "Funnel report"): leads made between two days, by
 * source and campaign, and how many booked a demo, attended and enrolled. With Meta ad spend
 * configured, spend and cost per lead / enrolment where the ads match.
 */
export function LeadFunnelPanel() {
  const timeZone = useUserTimeZone();
  const [to, setTo] = useState(() => dayInZone(timeZone));
  const [from, setFrom] = useState(() => daysBefore(dayInZone(timeZone), 29));
  const tooLong = from && to ? daysBefore(to, LEAD_FUNNEL_MAX_DAYS - 1) > from : false;
  const backwards = Boolean(from && to && from > to);
  const { data, isError, isLoading } = useLeadFunnelQuery(tooLong ? "" : from, to);

  const withSpend = Boolean(data?.spend && !data.spend.error);
  const money = (minor: number | null) => (minor === null || !data?.spend ? NOT_GIVEN : formatMoney(minor, data.spend.currency));
  const per = (minor: number | null, count: number) => (minor === null || count === 0 || !data?.spend ? NOT_GIVEN : formatMoney(Math.round(minor / count), data.spend.currency));
  const columns = withSpend ? 11 : 8;

  const numbers = (row: Omit<LeadFunnelRow, "campaign" | "source">) => (
    <>
      <TableCell className="text-right tabular-nums">{row.leads}</TableCell>
      <TableCell className="text-right tabular-nums">{row.demoBooked}</TableCell>
      <TableCell className="text-right tabular-nums">{row.demoAttended}</TableCell>
      <TableCell className="text-right tabular-nums">{row.enrolled}</TableCell>
      <TableCell className="text-right tabular-nums text-app-muted">{percentOf(row.demoBooked, row.leads)}</TableCell>
      <TableCell className="text-right tabular-nums text-app-muted">{percentOf(row.enrolled, row.leads)}</TableCell>
      {withSpend ? (
        <>
          <TableCell className="text-right tabular-nums">{money(row.spendMinor)}</TableCell>
          <TableCell className="text-right tabular-nums">{per(row.spendMinor, row.leads)}</TableCell>
          <TableCell className="text-right tabular-nums">{per(row.spendMinor, row.enrolled)}</TableCell>
        </>
      ) : null}
    </>
  );

  return (
    <div className="grid grid-cols-[minmax(0,1fr)] gap-4">
      <div className="grid grid-cols-2 gap-3 sm:flex sm:justify-end">
        {/* A filter with no Submit: its problem stays on screen (UI_RULES § "Form errors"). */}
        <FormField
          error={backwards ? "Starts after the end" : tooLong ? `At most ${LEAD_FUNNEL_MAX_DAYS} days` : undefined}
          errorVisible
          id="funnel-from"
          label="From"
        >
          <DateStringPicker className="w-full sm:w-56" id="funnel-from" onChange={setFrom} value={from} />
        </FormField>
        <FormField id="funnel-to" label="To">
          <DateStringPicker className="w-full sm:w-56" id="funnel-to" onChange={setTo} value={to} />
        </FormField>
      </div>

      {data?.spend?.error ? (
        <Alert title="Ad spend isn't available right now" variant="warning">
          Meta didn&apos;t answer the spend request ({data.spend.error}). The funnel below is complete.
        </Alert>
      ) : null}

      {isError ? (
        <Alert title="Couldn't load the funnel" variant="error">
          Try again in a moment.
        </Alert>
      ) : !isLoading && data && data.rows.length === 0 ? (
        <EmptyState description="No leads were made in these days. Pick a longer range." icon={BarChart3} title="No leads in this range" />
      ) : (
        <Card className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Source</TableHead>
                <TableHead>Campaign</TableHead>
                <TableHead className="text-right">Leads</TableHead>
                <TableHead className="text-right">Demo booked</TableHead>
                <TableHead className="text-right">Attended</TableHead>
                <TableHead className="text-right">Enrolled</TableHead>
                <TableHead className="text-right">Booked %</TableHead>
                <TableHead className="text-right">Enrolled %</TableHead>
                {withSpend ? (
                  <>
                    <TableHead className="text-right">Ad spend</TableHead>
                    <TableHead className="text-right">Per lead</TableHead>
                    <TableHead className="text-right">Per enrolment</TableHead>
                  </>
                ) : null}
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading || !data ? (
                <TableSkeletonRows columns={columns} />
              ) : (
                data.rows.map((row) => (
                  <TableRow key={`${row.source}|${row.campaign ?? ""}`}>
                    <TableCell className="font-medium">{row.source}</TableCell>
                    <TableCell className="max-w-64 truncate text-app-muted">{row.campaign ?? NOT_GIVEN}</TableCell>
                    {numbers(row)}
                  </TableRow>
                ))
              )}
            </TableBody>
            {data && data.rows.length > 0 ? (
              <TableFooter>
                <TableRow>
                  <TableCell className="font-semibold" colSpan={2}>
                    All sources
                  </TableCell>
                  {numbers(data.totals)}
                </TableRow>
              </TableFooter>
            ) : null}
          </Table>
        </Card>
      )}

      {data ? (
        <p className="text-xs text-app-muted">
          Leads made from {data.from} to {data.to} ({data.timeZone}). A lead counts at every step it reached, even if it was later
          lost. {withSpend ? "Spend is matched to WhatsApp ad leads by ad, and to website leads by campaign name (rows sharing a campaign split it by leads); the total is all ads in these days." : null}
        </p>
      ) : null}
    </div>
  );
}
