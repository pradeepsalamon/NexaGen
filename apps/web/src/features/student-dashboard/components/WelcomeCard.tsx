import { ArrowRight, BookOpen, CalendarDays, Play, Users } from "lucide-react";
import Link from "next/link";
import { Button } from "@/components/ui/Button";

interface WelcomeCardProps {
  studentName: string;
  batchName?: string;
  courseName?: string;
  memberSince?: string;
  liveClassId?: string; // If there's an active live class
}

export function WelcomeCard({
  studentName,
  batchName = "Unassigned Batch",
  courseName = "No active course",
  memberSince = "Recently",
  liveClassId
}: WelcomeCardProps) {
  return (
    <section className="relative h-full overflow-hidden rounded-panel border border-app-border bg-app-surface p-6 shadow-card sm:p-8">
      <span
        aria-hidden="true"
        className="pointer-events-none absolute -bottom-10 -right-10 size-64 rounded-full bg-primary/5 blur-3xl"
      />

      <div className="relative flex h-full flex-col justify-between gap-6">
        <div>
          <span className="inline-flex items-center rounded-full border border-secondary/40 bg-secondary/25 px-2.5 py-0.5 text-xs font-extrabold text-secondary-ink">
            {batchName}
          </span>
          <h1 className="mt-2 flex items-center gap-3 text-2xl font-extrabold tracking-tight text-app-text sm:text-3xl">
            <span>Welcome back, {studentName}!</span>
            <span aria-hidden="true" className="inline-block motion-safe:animate-bounce">
              👋
            </span>
          </h1>
          <p className="mt-1 max-w-xl text-sm text-app-muted">
            Track your progress, join interactive batches, analyze tactic puzzles, and
            continue mastering your chess openings.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3 pt-2">
          {/* Informational, not links — /student/courses and /student/batches
              are in studentNavItems but have no page yet. */}
          <span className="inline-flex items-center gap-2 rounded-control border border-app-border bg-app-soft px-3.5 py-2 text-xs font-bold text-app-text">
            <BookOpen aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            {courseName}
          </span>
          <span className="inline-flex items-center gap-2 rounded-control border border-app-border bg-app-soft px-3.5 py-2 text-xs font-bold text-app-text">
            <Users aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Your Batch
          </span>
          <span className="inline-flex items-center gap-1.5 rounded-control border border-app-border bg-app-surface px-3.5 py-2 text-xs font-medium text-app-muted">
            <CalendarDays aria-hidden="true" className="size-3.5" strokeWidth={2.5} />
            Member since
            <span className="font-bold text-app-text">{memberSince}</span>
          </span>

          {liveClassId ? (
            <Button asChild className="ml-auto" variant="destructive">
              <Link href={`/live-class/${liveClassId}`}>
                <span className="relative flex size-2">
                  <span className="absolute inline-flex size-full animate-ping rounded-full bg-white opacity-75 motion-reduce:animate-none" />
                  <span className="relative inline-flex size-2 rounded-full bg-white" />
                </span>
                Join Live Class
                <Play aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          ) : (
            <Button asChild className="ml-auto" variant="primary">
              <Link href="/student/schedule">
                View Full Schedule
                <ArrowRight aria-hidden="true" className="size-4" strokeWidth={2.5} />
              </Link>
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}
