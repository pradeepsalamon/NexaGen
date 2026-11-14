import type { ReactNode } from "react";
import { ClassroomTopBar } from "../meeting/ClassroomTopBar";

/**
 * Chrome for every pre-meeting / non-connected screen (loading, pre-join,
 * waiting room, errors). Keeps the classroom's lighter top bar consistent with
 * the live meeting without pulling in LiveKit hooks (these render outside the
 * room).
 */
export function ClassroomStateShell({
  topic,
  subtitle,
  children,
}: {
  topic?: string | null;
  subtitle?: string | null;
  children: ReactNode;
}) {
  return (
    <div className="flex h-[100dvh] flex-col bg-app-background text-app-text">
      <ClassroomTopBar title={topic || "Live Class"} subtitle={subtitle} />
      <div className="flex flex-1 items-center justify-center overflow-y-auto px-4 pt-16">
        {children}
      </div>
    </div>
  );
}
