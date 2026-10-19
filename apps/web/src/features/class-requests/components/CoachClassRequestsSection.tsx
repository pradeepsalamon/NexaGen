"use client";

import { useState } from "react";
import { CLASS_REQUEST_TYPE_LABELS, type ClassChangeRequestDto } from "@nexa-chess/types";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Skeleton } from "@/components/ui/Skeleton";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { withdrawClassRequest } from "../api/classRequestsApi";
import { CLASS_REQUEST_INVALIDATES, useClassRequests } from "../hooks/useClassRequests";
import { ClassRequestStatusBadge } from "./ClassRequestStatusBadge";
import { ClassRequestWhen } from "./ClassRequestWhen";

/** The coach's own extra-class / reschedule requests and where each one stands. */
export function CoachClassRequestsSection() {
  const { data, isLoading } = useClassRequests();
  // Requests whose withdrawal is waiting out the undo window: no second click.
  const [queued, setQueued] = useState<ReadonlySet<string>>(new Set());
  const mark = (id: string, on: boolean) =>
    setQueued((ids) => {
      const next = new Set(ids);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });

  const { run: withdraw } = useUndoableMutation({
    strategy: "defer",
    mutationFn: (request: ClassChangeRequestDto) => withdrawClassRequest(request.id),
    undo: async () => {},
    toast: () => ({ title: "Withdrawing request" }),
    invalidates: CLASS_REQUEST_INVALIDATES,
    onSchedule: (request) => mark(request.id, true),
    onCancel: (request) => mark(request.id, false)
  });

  const requests = data?.requests ?? [];
  if (!isLoading && requests.length === 0) return null;

  return (
    <div className="space-y-3">
      <h2 className="text-xl font-bold text-app-text">My requests</h2>
      {isLoading ? (
        <Skeleton className="h-20 w-full rounded-app" />
      ) : (
        <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
          {requests.slice(0, 20).map((r) => (
            <Card key={r.id} className="flex flex-col gap-2 p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold text-app-text">
                    {CLASS_REQUEST_TYPE_LABELS[r.type]} · {r.batchName}
                  </p>
                  <ClassRequestWhen request={r} />
                </div>
                <ClassRequestStatusBadge status={r.status} />
              </div>
              {r.reason ? <p className="text-sm text-app-muted">{r.reason}</p> : null}
              {r.reviewNote ? (
                <p className="rounded-control bg-app-soft px-3 py-2 text-sm text-app-text">
                  <span className="font-semibold">{r.reviewedByName ?? "Admin"}:</span> {r.reviewNote}
                </p>
              ) : null}
              {r.status === "PENDING" ? (
                <div>
                  <Button
                    disabled={queued.has(r.id)}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => withdraw(r)}
                  >
                    Withdraw
                  </Button>
                </div>
              ) : null}
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
