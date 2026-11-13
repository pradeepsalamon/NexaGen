"use client";

import { lazy, Suspense, type ReactNode } from "react";
import { Spinner } from "@/components/ui/Spinner";
import { lazyOnOpen } from "@/lib/lazyOnOpen";

/**
 * Parts of the room that most people in a class never open, split out of the
 * room's first download (a student's phone is the budget): the coach's
 * dialogs and boards, and the post-class summary. Each loads on first use.
 */

/** Coach: share a library puzzle. Pulls in the catalogue browser, the assignment form and its date picker. */
export const PuzzleAssignModal = lazyOnOpen(() => import("./PuzzleAssignModal"), "PuzzleAssignModal");

/** Coach: share the current position as a puzzle. */
export const SharePositionDialog = lazyOnOpen(() => import("./SharePositionDialog"), "SharePositionDialog");

/** Coach: every board of a running student match. */
export const MatchCoachView = lazy(() =>
  import("./match/MatchCoachView").then((m) => ({ default: m.MatchCoachView })),
);

/** Coach: every board of a running simul. */
export const SimulCoachView = lazy(() =>
  import("./simul/SimulCoachView").then((m) => ({ default: m.SimulCoachView })),
);

/** Coach: the class's activity queue tab. */
export const ActivityQueueRoomPanel = lazy(() =>
  import("../activity-queue/ActivityQueueRoomPanel").then((m) => ({ default: m.ActivityQueueRoomPanel })),
);

/** Shown once the class has ended: attendance tables, feedback, transcript. */
export const ClassSummary = lazy(() =>
  import("../summary/ClassSummary").then((m) => ({ default: m.ClassSummary })),
);

/** Centred spinner while one of the views above downloads. */
export function LazyViewFallback() {
  return (
    <div className="flex min-h-24 w-full flex-1 items-center justify-center" role="status" aria-label="Loading">
      <Spinner className="size-6 text-primary-ink" />
    </div>
  );
}

export function LazyView({ children }: { children: ReactNode }) {
  return <Suspense fallback={<LazyViewFallback />}>{children}</Suspense>;
}
