"use client";

import { useState } from "react";
import { Clock, MessagesSquare, UserPlus, Users } from "lucide-react";
import { SUPPORT_ANALYTICS_DAYS, type KpiValue, type SupportAnalyticsDays, type SupportAnalyticsResponse } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { PageLoading } from "@/components/layout/PageLoading";
import { KpiCard } from "@/components/ui/KpiCard";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDayMonth } from "@/lib/datetime";
import { useSupportAnalyticsQuery } from "../hooks/useSupportAdmin";
import { SUPPORT_CATEGORY_LABELS } from "../lib/supportLabels";

const RANGE_OPTIONS = SUPPORT_ANALYTICS_DAYS.map((value) => ({ label: `Last ${value} days`, value }));

function kpi(value: number | null): KpiValue {
  return { deltaPct: null, insufficientHistory: true, previous: null, value };
}

/** "45 min", "3 h 10 min". */
function minutesLabel(minutes: number | null): string {
  if (minutes === null) return "—";
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return rest ? `${hours} h ${rest} min` : `${hours} h`;
}

function DailyBars({ data, timeZone }: { data: SupportAnalyticsResponse["daily"]; timeZone: string }) {
  const max = Math.max(1, ...data.map((day) => day.conversations));
  return (
    <div>
      <div aria-label="Conversations per day" className="flex h-32 items-end gap-px sm:gap-0.5" role="img">
        {data.map((day) => (
          <div className="flex h-full min-w-0 flex-1 flex-col justify-end" key={day.date} title={`${formatDayMonth(`${day.date}T12:00:00.000Z`, "UTC")}: ${day.conversations} conversations, ${day.handoffs} to staff`}>
            <div className="w-full rounded-t-sm bg-primary-soft" style={{ height: `${(day.conversations / max) * 100}%` }}>
              <div className="w-full rounded-t-sm bg-primary" style={{ height: `${day.conversations ? (day.handoffs / day.conversations) * 100 : 0}%` }} />
            </div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-between text-xs text-app-muted">
        <span>{data[0] ? formatDayMonth(`${data[0].date}T12:00:00.000Z`, "UTC") : ""}</span>
        <span className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-primary-soft" /> Conversations
          </span>
          <span className="flex items-center gap-1">
            <span aria-hidden="true" className="inline-block size-2.5 rounded-sm bg-primary" /> Handed to staff
          </span>
        </span>
        <span>{data.at(-1) ? formatDayMonth(`${data.at(-1)!.date}T12:00:00.000Z`, "UTC") : ""}</span>
      </div>
      <p className="sr-only">Days are in {timeZone}.</p>
    </div>
  );
}

/** `/admin/support/insights`: how the WhatsApp assistant is doing (docs/WHATSAPP_SUPPORT.md §0 "Analytics"). */
export function SupportInsightsClient() {
  const timeZone = useUserTimeZone();
  const [days, setDays] = useState<SupportAnalyticsDays>("30");
  const query = useSupportAnalyticsQuery(days, timeZone);
  const data = query.data;

  return (
    <div className="animate-fade-in space-y-4 pb-10">
      <PageHeader
        actions={
          <Select
            aria-label="Period"
            className="w-auto"
            onChange={(event) => setDays(event.target.value as SupportAnalyticsDays)}
            options={RANGE_OPTIONS}
            value={days}
          />
        }
        breadcrumbs={[{ href: "/admin/support", label: "WhatsApp support" }, { label: "Insights" }]}
        description="How many people write in, how many the bot hands to your team, and how quickly the team answers."
        title="WhatsApp support insights"
      />

      {query.isError ? (
        <WidgetError message={(query.error as Error).message} onRetry={() => void query.refetch()} />
      ) : !data ? (
        <PageLoading />
      ) : (
        <>
          <KpiCardRow>
            <KpiCard icon={MessagesSquare} kpi={kpi(data.conversations)} label="Conversations" tooltip="WhatsApp conversations that started in this period." />
            <KpiCard
              icon={Users}
              kpi={kpi(data.handoffRate === null ? null : Math.round(data.handoffRate * 100))}
              label="Handed to staff"
              tooltip={`${data.handedToStaff} conversations the bot passed to your team (a finished form, "agent", or replies it couldn't read).`}
              unit="percent"
            />
            <KpiCard
              icon={Clock}
              kpi={kpi(data.firstReply.medianMinutes)}
              label="First reply (median, min)"
              tooltip={`From the hand-off to the team's first message. ${data.firstReply.answered} answered${data.firstReply.waiting ? `, ${data.firstReply.waiting} still waiting` : ""}. 9 in 10 were answered within ${minutesLabel(data.firstReply.p90Minutes)}.`}
            />
            <KpiCard icon={UserPlus} kpi={kpi(data.newLeads)} label="New leads" tooltip="Demo bookings that made a new lead." />
          </KpiCardRow>

          <SectionCard description="Each bar is one day; the darker part reached your team." title="Per day">
            <DailyBars data={data.daily} timeZone={timeZone} />
          </SectionCard>

          <SectionCard description={`${data.tickets.opened} opened, ${data.tickets.resolved} resolved in this period.`} title="Requests by topic">
            {data.tickets.byCategory.length === 0 ? (
              <p className="text-sm text-app-muted">No requests in this period.</p>
            ) : (
              <ul className="space-y-2">
                {data.tickets.byCategory.map((row) => (
                  <li className="flex items-center gap-3 text-sm" key={row.category}>
                    <span className="w-28 shrink-0 text-app-text">{SUPPORT_CATEGORY_LABELS[row.category]}</span>
                    <span className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-app-soft">
                      <span className="block h-full rounded-full bg-primary" style={{ width: `${(row.count / data.tickets.opened) * 100}%` }} />
                    </span>
                    <span className="w-8 shrink-0 text-right tabular-nums text-app-muted">{row.count}</span>
                  </li>
                ))}
              </ul>
            )}
          </SectionCard>
          <p className="text-xs text-app-muted">Hand-offs and reply times are counted from 14 Nov 2026, when this history started.</p>
        </>
      )}
    </div>
  );
}
