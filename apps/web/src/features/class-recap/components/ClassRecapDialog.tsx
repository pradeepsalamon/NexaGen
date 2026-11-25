"use client";

import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { WidgetError } from "@/components/ui/WidgetError";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatLongDate } from "@/lib/datetime";
import { useClassRecap } from "../hooks/useClassRecaps";
import { ClassRecapContentView } from "./ClassRecapContentView";
import { ClassRecapReviewPanel } from "./ClassRecapReviewPanel";

/** One class's recap in a dialog: the review panel for staff, the recap for students. */
export function ClassRecapDialog({ classId, onOpenChange }: { classId: string | null; onOpenChange: (open: boolean) => void }) {
  const query = useClassRecap(classId, classId !== null);
  const timeZone = useUserTimeZone();
  const data = query.data;
  const recap = data?.recap ?? null;

  return (
    <Dialog open={classId !== null} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90dvh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{recap ? recap.class.topic : "Class recap"}</DialogTitle>
          <DialogDescription>
            {recap
              ? [recap.class.batchName, recap.class.coachName, formatLongDate(recap.class.startsAt, timeZone)].filter(Boolean).join(" · ")
              : "The AI recap of this class."}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <Skeleton className="h-48 w-full rounded-app" />
        ) : query.isError ? (
          <WidgetError message="This recap couldn't be loaded." onRetry={() => void query.refetch()} />
        ) : !data || !recap ? (
          <p className="text-sm text-app-muted">This class has no recap.</p>
        ) : data.viewer === "STAFF" ? (
          <ClassRecapReviewPanel key={`${data.recap!.id}:${data.recap!.generatedAt ?? ""}:${data.recap!.status}`} recap={data.recap!} />
        ) : (
          <ClassRecapContentView aiLabel={data.recap!.aiLabel} content={data.recap!.content} />
        )}
      </DialogContent>
    </Dialog>
  );
}
