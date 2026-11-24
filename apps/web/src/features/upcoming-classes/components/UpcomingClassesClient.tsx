"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarDays, Layers3, List, RefreshCw, Video } from "lucide-react";
import { isUpcomingClass, type DemoClass, type ScheduleCalendarClass } from "@nexa-chess/types";
import { PageHeader } from "@/components/layout/PageHeader";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { ClassRow, ClassRowList } from "@/components/ui/ClassRow";
import { EmptyState } from "@/components/ui/EmptyState";
import { KpiCardRow } from "@/components/ui/KpiCardRow";
import { SectionCard } from "@/components/ui/SectionCard";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { StatTile } from "@/components/ui/StatTile";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/Tabs";
import { WidgetError } from "@/components/ui/WidgetError";
import { useDemoClassesInWindowQuery } from "@/features/admin/hooks/useAdminDemoClasses";
import { useScheduleCalendarQuery } from "@/features/batch-schedules/hooks/useBatchScheduleApi";
import { useAllBatchesQuery } from "@/features/batches/hooks/useBatchesApi";
import { usePlanFeature } from "@/features/subscription/hooks/useSubscription";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate, formatRelativeDay, formatTime } from "@/lib/datetime";
import { zonedDayKey } from "@/lib/scheduleCalendar";
import { useAuthStore } from "@/stores/authStore";

type View = "day" | "batch";
type Kind = "all" | "batch" | "demo";

const RANGE_OPTIONS = [
  { label: "Next 7 days", value: "7" },
  { label: "Next 14 days", value: "14" },
  { label: "Next 30 days", value: "30" }
];

/** One row of the agenda: a batch class or (super admins) a demo class. */
type Item =
  | { kind: "batch"; cls: ScheduleCalendarClass }
  | { kind: "demo"; cls: DemoClass };

const DAY_MS = 24 * 60 * 60 * 1000;

function startOfMinute(ms: number) {
  return Math.floor(ms / 60_000) * 60_000;
}

/**
 * Every batch's upcoming classes and the demo classes in one place. The batch
 * side reads the schedule calendar; demo classes are super-admin only, so an
 * admin sees batch classes alone. "Upcoming" is `isUpcomingClass` (live, or
 * scheduled and not over), never re-derived from `status`.
 */
export function UpcomingClassesClient() {
  const timeZone = useUserTimeZone();
  const isSuperAdmin = useAuthStore((state) => state.user?.role === "SUPER_ADMIN");
  const demoFeature = usePlanFeature("demoClasses");
  const showDemo = isSuperAdmin && demoFeature === true;

  const [view, setView] = useState<View>("day");
  const [days, setDays] = useState("7");
  const [batchId, setBatchId] = useState("ALL");
  const [kind, setKind] = useState<Kind>("all");
  // Fixed per visit (and on Refresh) so the query key doesn't change every render.
  const [anchor, setAnchor] = useState(() => startOfMinute(Date.now()));
  const range = useMemo(
    () => ({
      from: new Date(anchor).toISOString(),
      to: new Date(anchor + Number(days) * DAY_MS).toISOString()
    }),
    [anchor, days]
  );

  const batchQuery = useScheduleCalendarQuery({ ...range, keepPrevious: true });
  const demoQuery = useDemoClassesInWindowQuery({ ...range, enabled: showDemo });
  const batchesQuery = useAllBatchesQuery();

  const now = anchor;
  const batchClasses = useMemo(
    () => (batchQuery.data?.classes ?? []).filter((cls) => isUpcomingClass(cls, now)),
    [batchQuery.data, now]
  );
  const demoClasses = useMemo(
    () => (showDemo ? (demoQuery.data ?? []).filter((cls) => isUpcomingClass(cls, now)) : []),
    [demoQuery.data, now, showDemo]
  );

  // Batches still running (or about to start), plus any batch that has a class in the window.
  const batchRows = useMemo(() => {
    const rows = new Map<string, { id: string; name: string; coaches: string; classes: ScheduleCalendarClass[] }>();
    for (const batch of batchesQuery.data?.batches ?? []) {
      if (batch.status !== "ACTIVE" && batch.status !== "UPCOMING") continue;
      rows.set(batch.id, {
        classes: [],
        coaches: batch.coaches.map((coach) => [coach.firstName, coach.lastName].filter(Boolean).join(" ")).join(", "),
        id: batch.id,
        name: batch.name
      });
    }
    for (const cls of batchClasses) {
      const row = rows.get(cls.batchId) ?? { classes: [], coaches: "", id: cls.batchId, name: cls.batchName };
      row.classes.push(cls);
      rows.set(cls.batchId, row);
    }
    // Nothing scheduled first: those are the ones to act on.
    return [...rows.values()].sort(
      (a, b) =>
        Number(a.classes.length > 0) - Number(b.classes.length > 0) ||
        (a.classes[0]?.startsAt ?? "").localeCompare(b.classes[0]?.startsAt ?? "") ||
        a.name.localeCompare(b.name)
    );
  }, [batchClasses, batchesQuery.data]);
  const idleBatches = batchRows.filter((row) => row.classes.length === 0).length;

  const batchOptions = useMemo(
    () => [
      { label: "All batches", value: "ALL" },
      ...[...batchRows].sort((a, b) => a.name.localeCompare(b.name)).map((row) => ({ label: row.name, value: row.id }))
    ],
    [batchRows]
  );

  const agenda = useMemo(() => {
    const items: Item[] = [];
    if (kind !== "demo") {
      for (const cls of batchClasses) {
        if (batchId === "ALL" || cls.batchId === batchId) items.push({ cls, kind: "batch" });
      }
    }
    // A batch filter means that batch's classes only.
    if (kind !== "batch" && batchId === "ALL") {
      for (const cls of demoClasses) items.push({ cls, kind: "demo" });
    }
    items.sort((a, b) => a.cls.startsAt.localeCompare(b.cls.startsAt));
    const byDay = new Map<string, Item[]>();
    for (const item of items) {
      const key = zonedDayKey(item.cls.startsAt, timeZone);
      byDay.set(key, [...(byDay.get(key) ?? []), item]);
    }
    return [...byDay.entries()];
  }, [batchClasses, batchId, demoClasses, kind, timeZone]);

  const loading = batchQuery.isLoading || (showDemo && demoQuery.isLoading);
  const failed = batchQuery.isError || (showDemo && demoQuery.isError);
  const refresh = () => setAnchor(startOfMinute(Date.now()));
  const rangeLabel = RANGE_OPTIONS.find((option) => option.value === days)?.label.toLowerCase() ?? "";

  return (
    <div className="animate-fade-in pb-10">
      <Tabs onValueChange={(next) => setView(next as View)} value={view}>
        <PageHeader
          actions={
            <Button onClick={refresh} variant="outline">
              <RefreshCw aria-hidden="true" className="size-4" strokeWidth={2.5} />
              Refresh
            </Button>
          }
          description={
            showDemo
              ? "Every batch's next classes and the demo classes, in one list."
              : "Every batch's next classes, in one list."
          }
          tabs={
            <TabsList aria-label="Upcoming classes view">
              <TabsTrigger value="day">
                <List aria-hidden="true" className="size-4" strokeWidth={2.25} />
                By day
              </TabsTrigger>
              <TabsTrigger value="batch">
                <Layers3 aria-hidden="true" className="size-4" strokeWidth={2.25} />
                By batch
              </TabsTrigger>
            </TabsList>
          }
          title="Upcoming classes"
        />

        <KpiCardRow className="mb-4" columns={3} label="Upcoming classes summary">
          <StatTile context={rangeLabel} icon={CalendarDays} label="Batch classes" tone="primary" value={loading ? "…" : String(batchClasses.length)} />
          {showDemo ? (
            <StatTile context={rangeLabel} icon={Video} label="Demo classes" tone="accent" value={loading ? "…" : String(demoClasses.length)} />
          ) : null}
          <StatTile
            context={rangeLabel}
            icon={AlertTriangle}
            label="Batches with nothing scheduled"
            tone="warm"
            value={loading || batchesQuery.isLoading ? "…" : String(idleBatches)}
          />
        </KpiCardRow>

        <div className="mb-4 flex flex-wrap gap-2">
          <Select aria-label="Date range" className="w-full sm:w-44" onChange={(event) => setDays(event.target.value)} options={RANGE_OPTIONS} value={days} />
          {view === "day" ? (
            <Select aria-label="Batch" className="w-full sm:w-56" onChange={(event) => setBatchId(event.target.value)} options={batchOptions} value={batchId} />
          ) : null}
          {view === "day" && showDemo ? (
            <Select
              aria-label="Class type"
              className="w-full sm:w-44"
              onChange={(event) => setKind(event.target.value as Kind)}
              options={[
                { label: "All classes", value: "all" },
                { label: "Batch classes", value: "batch" },
                { label: "Demo classes", value: "demo" }
              ]}
              value={kind}
            />
          ) : null}
        </div>

        {failed ? (
          <WidgetError message="Couldn't load the upcoming classes." onRetry={refresh} />
        ) : loading ? (
          <div className="space-y-3">
            <Skeleton className="h-14 rounded-app" />
            <Skeleton className="h-14 rounded-app" />
            <Skeleton className="h-14 rounded-app" />
          </div>
        ) : (
          <>
            <TabsContent value="day">
              {agenda.length === 0 ? (
                <SectionCard title="Upcoming classes">
                  <EmptyState
                    description={`Nothing is scheduled in the ${rangeLabel}. Try a longer range, or schedule classes in the Class scheduler.`}
                    illustration="schedule"
                    title="No upcoming classes"
                    variant="inline"
                  />
                </SectionCard>
              ) : (
                <div className="space-y-4">
                  {agenda.map(([day, items]) => (
                    <SectionCard
                      description={formatLongDate(items[0].cls.startsAt, timeZone)}
                      key={day}
                      title={`${formatRelativeDay(items[0].cls.startsAt, timeZone)} · ${items.length} ${items.length === 1 ? "class" : "classes"}`}
                    >
                      <ClassRowList>
                        {items.map((item) =>
                          item.kind === "batch" ? (
                            <BatchClassRow cls={item.cls} key={item.cls.id} />
                          ) : (
                            <DemoClassRow cls={item.cls} key={item.cls.id} timeZone={timeZone} />
                          )
                        )}
                      </ClassRowList>
                    </SectionCard>
                  ))}
                </div>
              )}
            </TabsContent>

            <TabsContent value="batch">
              <SectionCard
                description={`Each running batch's classes in the ${rangeLabel}. Batches with nothing scheduled come first.`}
                title="By batch"
              >
                {batchRows.length === 0 ? (
                  <EmptyState illustration="schedule" title="No running batches" variant="inline" />
                ) : (
                  <ul className="divide-y divide-app-border">
                    {batchRows.map((row) => (
                      <li className="flex flex-wrap items-start gap-3 py-3 first:pt-0 last:pb-0" key={row.id}>
                        <div className="min-w-0 flex-1 basis-48">
                          <p className="break-words text-sm font-semibold text-app-text">{row.name}</p>
                          {row.coaches ? <p className="text-xs text-app-muted">Coach {row.coaches}</p> : null}
                        </div>
                        <div className="min-w-0 flex-1 basis-56 text-sm">
                          {row.classes.length === 0 ? (
                            <Badge variant="warning">Nothing scheduled</Badge>
                          ) : (
                            <>
                              <p className="text-app-text">
                                Next: {formatRelativeDay(row.classes[0].startsAt, timeZone)}, {formatTime(row.classes[0].startsAt, timeZone)}
                                {row.classes[0].title !== row.name ? ` · ${row.classes[0].title}` : ""}
                              </p>
                              <p className="text-xs text-app-muted">
                                {row.classes.length} {row.classes.length === 1 ? "class" : "classes"} in the {rangeLabel}
                              </p>
                            </>
                          )}
                        </div>
                        <Button
                          onClick={() => {
                            setBatchId(row.id);
                            setKind("batch");
                            setView("day");
                          }}
                          size="sm"
                          variant="outline"
                        >
                          See classes
                        </Button>
                      </li>
                    ))}
                  </ul>
                )}
              </SectionCard>
            </TabsContent>
          </>
        )}
      </Tabs>
    </div>
  );
}

function BatchClassRow({ cls }: { cls: ScheduleCalendarClass }) {
  const live = cls.status === "LIVE" || cls.status === "IN_PROGRESS";
  return (
    <ClassRow
      actions={
        <>
          <Button asChild size="sm" variant="ghost">
            <Link href={`/classes/${cls.id}`}>View class</Link>
          </Button>
          {live ? (
            <Button asChild size="sm" variant="outline">
              <Link href={`/admin/live-classes/${cls.id}`}>Monitor</Link>
            </Button>
          ) : null}
        </>
      }
      cls={cls}
      showDate={false}
    />
  );
}

function DemoClassRow({ cls, timeZone }: { cls: DemoClass; timeZone: string }) {
  const meta = [
    `${formatTime(cls.startsAt, timeZone)} – ${formatTime(cls.endsAt, timeZone)}`,
    `Coach ${cls.coachName}`,
    `${cls.registrationCount} registered`
  ].join(" · ");
  return (
    <ClassRow
      actions={
        <Button asChild size="sm" variant="outline">
          <Link href="/admin/demo-classes">Open demo classes</Link>
        </Button>
      }
      badges={<Badge variant="accent">Demo</Badge>}
      cls={{ ...cls, title: cls.topic, topic: null }}
      meta={meta}
      showDate={false}
    />
  );
}
