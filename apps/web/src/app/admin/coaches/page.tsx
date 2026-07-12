"use client";

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Check, X, GraduationCap } from "lucide-react";
import { Button } from "@/components/ui/Button";
import { getPendingCoaches, updateCoachStatus } from "@/features/admin/api/adminApi";
import { BackButton } from "@/components/ui/BackButton";
import { useToast } from "@/providers/ToastProvider";
import { getErrorMessage } from "@/lib/errors";

export default function PendingCoachesPage() {
  const queryClient = useQueryClient();
  const toast = useToast();

  const { data, isLoading } = useQuery({
    queryKey: ["admin", "pending-coaches"],
    queryFn: getPendingCoaches
  });

  const updateMutation = useMutation({
    mutationFn: updateCoachStatus,
    onSuccess: (_, variables) => {
      queryClient.invalidateQueries({ queryKey: ["admin", "pending-coaches"] });
      toast.success({
        title: "Success",
        message: `Coach application has been ${variables.status === 'ACTIVE' ? 'approved' : 'rejected'}.`
      });
    },
    onError: (error) => {
      toast.error({
        title: "Action failed",
        message: getErrorMessage(error)
      });
    }
  });

  return (
    <main className="min-h-[calc(100vh-64px)] bg-app-background px-4 py-5 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="mb-8 flex items-center justify-between">
          <div>
            <div className="mb-2 flex items-center gap-2">
              <BackButton />
            </div>
            <h1 className="text-3xl font-extrabold text-app-text">Pending Coach Applications</h1>
            <p className="mt-2 text-app-muted">Review and approve applications for new coaches.</p>
          </div>
        </header>

        {isLoading ? (
          <div className="flex animate-pulse flex-col gap-4">
            <div className="h-24 w-full rounded-panel bg-app-surface border border-app-border" />
            <div className="h-24 w-full rounded-panel bg-app-surface border border-app-border" />
          </div>
        ) : !data?.coaches.length ? (
          <div className="rounded-panel border border-app-border bg-app-surface p-12 text-center shadow-card">
            <GraduationCap className="mx-auto size-12 text-app-muted opacity-50" />
            <h3 className="mt-4 text-lg font-bold text-app-text">No pending applications</h3>
            <p className="mt-2 text-sm text-app-muted">You&apos;re all caught up!</p>
          </div>
        ) : (
          <div className="grid gap-4">
            {data.coaches.map((coach) => (
              <div
                key={coach.id}
                className="flex flex-col gap-4 rounded-panel border border-app-border bg-app-surface p-5 shadow-card sm:flex-row sm:items-center sm:justify-between"
              >
                <div>
                  <h3 className="text-lg font-bold text-app-text">
                    {coach.firstName} {coach.lastName}
                  </h3>
                  <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-app-muted">
                    <span>{coach.email}</span>
                    <span>•</span>
                    <span className="font-semibold text-primary">
                      {coach.coachProfile.title !== "NONE" ? coach.coachProfile.title : "No Title"}
                    </span>
                    {coach.coachProfile.fideRating && (
                      <>
                        <span>•</span>
                        <span>Rating: {coach.coachProfile.fideRating}</span>
                      </>
                    )}
                    {coach.coachProfile.yearsOfExperience && (
                      <>
                        <span>•</span>
                        <span>{coach.coachProfile.yearsOfExperience} years exp.</span>
                      </>
                    )}
                  </div>
                  <div className="mt-2 text-xs text-app-muted opacity-75">
                    Applied on {new Date(coach.createdAt).toLocaleDateString()}
                  </div>
                </div>
                
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    className="border-red-500/30 text-red-500 hover:bg-red-500/10 hover:text-red-600"
                    onClick={() => updateMutation.mutate({ id: coach.id, status: "ARCHIVED" })}
                    disabled={updateMutation.isPending}
                  >
                    <X className="mr-2 size-4" />
                    Decline
                  </Button>
                  <Button
                    onClick={() => updateMutation.mutate({ id: coach.id, status: "ACTIVE" })}
                    disabled={updateMutation.isPending}
                  >
                    <Check className="mr-2 size-4" />
                    Approve
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
