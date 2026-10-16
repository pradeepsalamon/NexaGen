"use client";

import { TrendingUp } from "lucide-react";
import { StudentProgressWorkspace } from "./StudentProgressWorkspace";

export function StudentProgressClient() {
  return (
    <div className="space-y-6 animate-fade-in">
      <div>
        <h1 className="text-2xl font-extrabold leading-tight tracking-tight flex items-center gap-2 text-app-text">
          <TrendingUp className="size-6 text-primary-ink" strokeWidth={2.5} />
          My Progress
        </h1>
        <p className="mt-1 text-app-muted">
          Solve puzzles and finish assignments every day to grow your rating and your streak.
        </p>
      </div>
      <StudentProgressWorkspace studentId={null} />
    </div>
  );
}
