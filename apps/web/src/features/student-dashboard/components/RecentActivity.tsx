"use client";

import {
  Activity,
  CheckCircle,
  MessageSquare,
  PlayCircle,
  Video,
  type LucideIcon
} from "lucide-react";
import { Panel, PanelBody, PanelEmpty, PanelHeader } from "@/components/ui/Panel";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { TONE, type Tone } from "@/lib/tone";
import { cn } from "@/lib/utils";

interface ActivityItem {
  id: string;
  type: "CLASS_JOINED" | "LESSON_COMPLETED" | "PRACTICE_FINISHED" | "FEEDBACK";
  title: string;
  createdAt: string;
}

interface RecentActivityProps {
  activities?: ActivityItem[];
}

const ACTIVITY_STYLE: Record<string, { icon: LucideIcon; tone: Tone }> = {
  CLASS_JOINED: { icon: Video, tone: "primary" },
  LESSON_COMPLETED: { icon: PlayCircle, tone: "warm" },
  PRACTICE_FINISHED: { icon: CheckCircle, tone: "accent" },
  FEEDBACK: { icon: MessageSquare, tone: "secondary" }
};

export function RecentActivity({ activities = [] }: RecentActivityProps) {
  const timeZone = useUserTimeZone();

  return (
    <Panel className="h-full">
      <PanelHeader icon={Activity} title="Recent Activity" tone="primary" />
      {activities.length === 0 ? (
        <PanelEmpty
          icon={Activity}
          message="Join a class or finish a practice set to start your timeline."
          title="No activity yet"
          tone="primary"
        />
      ) : (
        <PanelBody>
          <ol className="relative space-y-5 border-l border-app-border pl-0">
            {activities.map((activity) => {
              const style = ACTIVITY_STYLE[activity.type] ?? {
                icon: Activity,
                tone: "primary" as Tone
              };
              const Icon = style.icon;

              return (
                <li className="relative pl-8" key={activity.id}>
                  <span
                    aria-hidden="true"
                    className={cn(
                      "absolute -left-[15px] top-0 flex size-[30px] items-center justify-center rounded-full ring-4 ring-app-surface",
                      TONE[style.tone].chip
                    )}
                  >
                    <Icon className="size-3.5" strokeWidth={2.5} />
                  </span>
                  <p className="text-sm font-extrabold text-app-text">{activity.title}</p>
                  <p className="mt-0.5 text-xs text-app-muted">
                    {formatFullDate(activity.createdAt, timeZone)}
                  </p>
                </li>
              );
            })}
          </ol>
        </PanelBody>
      )}
    </Panel>
  );
}
