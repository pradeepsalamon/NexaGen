"use client";

import { GraduationCap } from "lucide-react";
import type { PendingCoach, PendingCoachesResponse, UpdateCoachStatusRequest } from "@nexa-chess/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { WidgetError } from "@/components/ui/WidgetError";
import { updateCoachStatus } from "@/features/admin/api/adminApi";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { queryKeys } from "@/lib/queryKeys";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import { ApplicationCard, ApplicationListSkeleton } from "./ApplicationCard";
import { useHiddenIds } from "./useHiddenIds";

type ReviewVars = { coach: PendingCoach; status: UpdateCoachStatusRequest["status"] };

export function PendingCoachesPanel({
  data,
  isError = false,
  isLoading,
  onRetry
}: {
  data?: PendingCoachesResponse;
  isError?: boolean;
  isLoading: boolean;
  onRetry?: () => void;
}) {
  const tz = useUserTimeZone();
  const { hiddenIds, toggle } = useHiddenIds();

  // Deferred, same as students: the approval email can't be unsent.
  const review = useUndoableMutation<ReviewVars, { ok: boolean }>({
    strategy: "defer",
    mutationFn: ({ coach, status }) => updateCoachStatus({ id: coach.id, status }),
    undo: async () => {},
    toast: ({ coach, status }) => ({
      title: status === "ACTIVE" ? "Approving coach" : "Declining coach",
      message: `${coach.firstName} ${coach.lastName ?? ""}`.trim()
    }),
    invalidates: [queryKeys.admin.pendingCoaches],
    onSchedule: ({ coach }) => toggle(coach.id, true),
    onCancel: ({ coach }) => toggle(coach.id, false)
  });

  if (isLoading) return <ApplicationListSkeleton />;
  if (isError && !data) {
    return <WidgetError message="Couldn't load pending coaches." onRetry={onRetry} />;
  }

  const coaches = data?.coaches.filter((coach) => !hiddenIds.has(coach.id)) ?? [];
  if (!coaches.length) {
    return (
      <EmptyState
        description="Coaches who apply through the registration page appear here for review."
        icon={GraduationCap}
        title="No pending coach applications"
      />
    );
  }

  return (
    <div className="grid gap-4">
      {coaches.map((coach) => (
        <ApplicationCard
          details={[
            coach.email,
            <span className="font-semibold text-primary-ink" key="title">
              {coach.coachProfile.title !== "NONE" ? coach.coachProfile.title : "No title"}
            </span>,
            coach.coachProfile.fideRating ? `Rating: ${coach.coachProfile.fideRating}` : null,
            coach.coachProfile.yearsOfExperience ? `${coach.coachProfile.yearsOfExperience} years exp.` : null
          ]}
          footnote={`Applied on ${formatFullDate(coach.createdAt, tz)}`}
          key={coach.id}
          name={`${coach.firstName} ${coach.lastName ?? ""}`.trim()}
          onApprove={() => review.run({ coach, status: "ACTIVE" })}
          onDecline={() => review.run({ coach, status: "ARCHIVED" })}
        />
      ))}
    </div>
  );
}
