"use client";

import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { apiFetch } from "@/lib/api";
import { API_ROUTES, type CoachTeachingResponse } from "@nexa-chess/types";
import { CoachAttendanceView } from "./CoachAttendanceView";

interface CoachAttendanceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  coachId: string | null;
  coachName?: string;
}

export function CoachAttendanceDialog({
  open,
  onOpenChange,
  coachId,
  coachName,
}: CoachAttendanceDialogProps) {
  const [data, setData] = useState<CoachTeachingResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !coachId) return;

    let cancelled = false;
    setData(null);
    setError(null);
    setIsLoading(true);

    apiFetch<CoachTeachingResponse>(API_ROUTES.attendance.coachById(coachId))
      .then((res) => {
        if (!cancelled) setData(res);
      })
      .catch((err: unknown) => {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : "Failed to load teaching stats");
        }
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [open, coachId]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl lg:max-w-5xl max-h-[85dvh] overflow-hidden flex flex-col p-0">
        <div className="p-6 pb-4 border-b border-app-border">
          <DialogHeader>
            <DialogTitle className="text-xl">
              {coachName ? `${coachName} — Teaching` : "Coach Teaching"}
            </DialogTitle>
            <DialogDescription>
              Teaching hours, completion rate, and recent classes for this coach.
            </DialogDescription>
          </DialogHeader>
        </div>

        <div className="flex-1 overflow-y-auto p-6 pt-4">
          {isLoading ? (
            <div className="space-y-4">
              <Skeleton className="h-28 w-full rounded-control" />
              <Skeleton className="h-64 w-full rounded-control" />
            </div>
          ) : error ? (
            <div className="p-4 rounded-control bg-red-50 text-red-600 border border-red-200">
              {error}
            </div>
          ) : data ? (
            <CoachAttendanceView data={data} hideHeading />
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
