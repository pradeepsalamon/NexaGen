"use client";

import { Crosshair } from "lucide-react";
import Link from "next/link";
import { useQuery } from "@tanstack/react-query";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { Skeleton } from "@/components/ui/Skeleton";
import { getPuzzleTrainingStatus } from "@/features/puzzles/api/puzzleApi";
import { queryKeys } from "@/lib/queryKeys";
import { useMyWeakSpots } from "../hooks/useWeakSpots";

/**
 * The student's own weak spot (docs/WEAK_SPOTS.md): what their play keeps
 * missing, the tip once a coach read it, and Practise → puzzle training on
 * it. Hidden while there is nothing to show.
 */
export function WeakSpotDashboardCard() {
  const query = useMyWeakSpots();
  const hasPractice = (query.data?.weakSpots[0]?.practiceThemes.length ?? 0) > 0;
  // Only asked when there is something to practise (the button needs training on for their batch).
  const training = useQuery({ enabled: hasPractice, queryKey: queryKeys.puzzles.training, queryFn: getPuzzleTrainingStatus });

  if (query.isLoading) return <Skeleton className="h-40 w-full rounded-app" />;
  // A widget that can't load stays out of the way (the rest of the dashboard still works).
  const profile = query.data;
  const spot = profile?.weakSpots[0];
  if (!profile || !spot) return null;
  const also = profile.weakSpots.slice(1).map((s) => s.label);
  const strength = profile.strengths[0];
  const canPractise = hasPractice && training.data?.enabled === true;

  return (
    <SectionCard
      description={`From your games and boards in the last ${profile.windowDays} days, checked by the chess engine.`}
      title="Your weak spot"
    >
      <div className="grid gap-3">
        <div className="flex flex-wrap items-start gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-full bg-warning-soft text-warning-ink">
            <Crosshair className="size-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-base font-semibold text-app-text">{spot.label}</h3>
            <p className="text-xs text-app-muted">
              Missed {spot.missed} of {spot.opportunities} chances
            </p>
          </div>
          {spot.trend === "BETTER" ? <Badge variant="success">Getting better</Badge> : null}
        </div>
        {spot.tip ? <p className="text-sm text-app-text">{spot.tip}</p> : null}
        {also.length || strength ? (
          <p className="text-xs text-app-muted">
            {also.length ? `Also practise: ${also.join(", ")}.` : null}
            {also.length && strength ? " " : null}
            {strength ? `You're good at: ${strength.label}.` : null}
          </p>
        ) : null}
        {canPractise ? (
          <Button asChild className="justify-self-start" size="sm">
            <Link href={`/student/training?weakSpot=${spot.motif}`}>Practise {spot.label.toLowerCase()}</Link>
          </Button>
        ) : null}
      </div>
    </SectionCard>
  );
}
