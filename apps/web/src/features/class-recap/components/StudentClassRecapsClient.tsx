"use client";

import { Sparkles } from "lucide-react";
import { PageHeader } from "@/components/layout/PageHeader";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { InfiniteScrollTrigger } from "@/components/ui/InfiniteScrollTrigger";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate } from "@/lib/datetime";
import { useMyClassRecaps } from "../hooks/useClassRecaps";
import { ClassRecapContentView } from "./ClassRecapContentView";

/** A student's published class recaps, newest first. */
export function StudentClassRecapsClient() {
  const query = useMyClassRecaps();
  const timeZone = useUserTimeZone();
  const items = query.data?.pages.flatMap((page) => page.items) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader description="What your classes covered, the key ideas and what to practise." title="Class recaps" />
      {query.isLoading ? (
        <div className="space-y-4">
          <Skeleton className="h-40 w-full rounded-panel" />
          <Skeleton className="h-40 w-full rounded-panel" />
        </div>
      ) : query.isError ? (
        <WidgetError message="Your class recaps couldn't be loaded." onRetry={() => void query.refetch()} />
      ) : items.length === 0 ? (
        <EmptyState
          description="After a class, your coach may share a short recap here."
          icon={Sparkles}
          title="No class recaps yet"
        />
      ) : (
        <div className="space-y-4">
          {items.map((recap) => (
            <Card className="space-y-3 p-4 sm:p-5" key={recap.id}>
              <div>
                <h2 className="text-lg font-bold text-app-text">{recap.class.topic}</h2>
                <p className="text-sm text-app-muted">
                  {[recap.class.batchName, recap.class.coachName, formatLongDate(recap.class.startsAt, timeZone)]
                    .filter(Boolean)
                    .join(" · ")}
                </p>
              </div>
              <ClassRecapContentView aiLabel={recap.aiLabel} content={recap.content} />
            </Card>
          ))}
          <InfiniteScrollTrigger endLabel="That's every recap." query={query} />
        </div>
      )}
    </div>
  );
}
