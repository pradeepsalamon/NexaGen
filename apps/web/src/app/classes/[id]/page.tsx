"use client";

import { useEffect } from "react";
import { Calendar, Clock, Video, Loader2 } from "lucide-react";
import { useParams, useRouter } from "next/navigation";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Skeleton } from "@/components/ui/Skeleton";
import { AppShell } from "@/components/layout/AppShell";
import { useClassDetail } from "../../../features/coach/hooks/useCoachApi";
import { BackButton } from "@/components/ui/BackButton";
import { getClassStatusBadgeVariant } from "../../../constants/classes";
import { useAuthStore } from "@/stores/authStore";
import { useStartLiveClass } from "../../../features/live-class/hooks/useLiveClassApi";

export default function ClassDetailsPage() {
  const { id } = useParams() as { id: string };
  const router = useRouter();
  const user = useAuthStore((state) => state.user);
  const isCoach = user?.role === "COACH";
  const startLiveClassMutation = useStartLiveClass(id);
  const { data, isLoading } = useClassDetail(id, { refetchInterval: 20000 });
  const cls = data?.class;

  useEffect(() => {
    if (cls) {
      document.title = `${cls.title || cls.topic || 'Class Details'} - Nexa Chess`;
    }
  }, [cls]);

  if (isLoading) {
    return (
      <AppShell>
        <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-6">
          <Skeleton className="h-8 w-32" />
          <Skeleton className="h-48 w-full" />
        </div>
      </AppShell>
    );
  }

  if (!cls) return null;

  const start = new Date(cls.startsAt);
  const end = new Date(cls.endsAt);
  const durationMs = end.getTime() - start.getTime();
  const durationMins = Math.round(durationMs / 60000);

  return (
    <AppShell>
      <div className="p-6 md:p-8 max-w-4xl mx-auto space-y-8 animate-fade-in">
        <BackButton />

        <div className="flex flex-col gap-6 md:flex-row md:items-start md:justify-between">
          <div>
            <div className="flex items-center gap-3 mb-2">
              <h1 className="text-3xl font-extrabold text-app-text">
                {cls.title || cls.topic || "Regular Session"}
              </h1>
              <div className="flex items-center gap-2">
                <Badge variant={getClassStatusBadgeVariant(cls.status)} className="text-xs uppercase font-bold tracking-wider">
                  {cls.status}
                </Badge>
                {(cls.status === "IN_PROGRESS" || cls.status === "LIVE") && (
                  <span className="flex h-3 w-3 relative ml-1" title="Live Now">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-green-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-3 w-3 bg-green-500"></span>
                  </span>
                )}
              </div>
            </div>
            <p className="text-xl text-app-muted font-medium">
              {cls.batchName}
            </p>
          </div>
          
          <div className="flex flex-col gap-3 p-4 bg-app-surface border border-app-border rounded-app shadow-soft md:min-w-[200px]">
            <div className="flex items-center gap-2 text-app-text">
              <Calendar className="h-4 w-4 text-primary" />
              <span className="font-semibold">{start.toLocaleDateString()}</span>
            </div>
            <div className="flex items-center gap-2 text-app-text">
              <Clock className="h-4 w-4 text-primary" />
              <span className="font-semibold">
                {start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })} ({durationMins}m)
              </span>
            </div>
          </div>
        </div>

        <Card className="p-8 border-primary/20 bg-[linear-gradient(145deg,color-mix(in_srgb,var(--color-primary)_5%,var(--color-surface)),color-mix(in_srgb,var(--color-accent)_5%,var(--color-surface)))]">
          <div className="flex flex-col items-center text-center max-w-md mx-auto space-y-4">
            <div className="p-4 rounded-full bg-primary/10 text-primary mb-2">
              <Video className="h-8 w-8" />
            </div>
            {isCoach ? (
              <>
                {cls.status === "SCHEDULED" ? (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Ready to Teach?</h2>
                    <p className="text-app-muted">Start the live video class and students will be able to join.</p>
                    <Button 
                      className="mt-4 w-full sm:w-auto" 
                      size="lg"
                      disabled={startLiveClassMutation.isPending}
                      onClick={() => {
                        startLiveClassMutation.mutate(undefined, {
                          onSuccess: () => router.push(`/live-class/${id}`)
                        });
                      }}
                    >
                      {startLiveClassMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                      {startLiveClassMutation.isPending ? "Starting Live Class..." : "Start Live Class"}
                    </Button>
                  </>
                ) : (cls.status === "IN_PROGRESS" || cls.status === "LIVE") ? (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Class is Live!</h2>
                    <p className="text-app-muted">The live session is currently active.</p>
                    <Button 
                      className="mt-4 w-full sm:w-auto" 
                      size="lg"
                      onClick={() => router.push(`/live-class/${id}`)}
                    >
                      Return to Live Class
                    </Button>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Class Ended</h2>
                    <p className="text-app-muted">This live session has already concluded.</p>
                    <Button disabled className="mt-4 w-full sm:w-auto" size="lg">
                      Session Ended
                    </Button>
                  </>
                )}
              </>
            ) : (
              <>
                {(cls.status === "IN_PROGRESS" || cls.status === "LIVE") ? (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Class is Live!</h2>
                    <p className="text-app-muted">The coach has started the live session. Join now!</p>
                    <Button 
                      className="mt-4 w-full sm:w-auto" 
                      size="lg"
                      onClick={() => router.push(`/live-class/${id}`)}
                    >
                      Join Live Class
                    </Button>
                  </>
                ) : cls.status === "SCHEDULED" ? (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Waiting for Coach</h2>
                    <p className="text-app-muted">The live class hasn&apos;t started yet.</p>
                    <Button disabled className="mt-4 w-full sm:w-auto" size="lg">
                      Waiting for Coach
                    </Button>
                  </>
                ) : (
                  <>
                    <h2 className="text-2xl font-bold text-app-text">Class Ended</h2>
                    <p className="text-app-muted">This live class has ended.</p>
                    <Button disabled className="mt-4 w-full sm:w-auto" size="lg">
                      Session Ended
                    </Button>
                  </>
                )}
              </>
            )}
          </div>
        </Card>

        <div className="grid gap-6 md:grid-cols-2">
          <Card className="p-6">
            <h3 className="text-lg font-bold text-app-text mb-4">Class Details</h3>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-bold text-app-muted">Description</span>
                <p className="mt-1 text-app-text">{cls.description || "No description provided."}</p>
              </div>
              {cls.objectives && (
                <div>
                  <span className="text-sm font-bold text-app-muted">Objectives</span>
                  <p className="mt-1 text-app-text">{cls.objectives}</p>
                </div>
              )}
            </div>
          </Card>

          <Card className="p-6">
            <h3 className="text-lg font-bold text-app-text mb-4">Post-Class</h3>
            <div className="space-y-4">
              <div>
                <span className="text-sm font-bold text-app-muted">Homework</span>
                <p className="mt-1 text-app-text">{cls.homework || "No homework assigned."}</p>
              </div>
              {cls.notes && (
                <div>
                  <span className="text-sm font-bold text-app-muted">Private Notes</span>
                  <p className="mt-1 text-app-text">{cls.notes}</p>
                </div>
              )}
            </div>
          </Card>
        </div>
      </div>
    </AppShell>
  );
}
