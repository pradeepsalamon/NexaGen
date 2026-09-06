"use client";

import { Megaphone } from "lucide-react";
import type { VariantProps } from "class-variance-authority";
import { Badge, type badgeVariants } from "@/components/ui/Badge";
import { Panel, PanelEmpty, PanelHeader, PanelList, PanelRow } from "@/components/ui/Panel";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";

interface Announcement {
  id: string;
  title: string;
  createdAt: string;
  description: string;
  type: "BATCH" | "COURSE" | "PLATFORM";
}

interface AnnouncementsProps {
  announcements?: Announcement[];
}

type BadgeVariant = VariantProps<typeof badgeVariants>["variant"];

const TYPE_VARIANT: Record<Announcement["type"], BadgeVariant> = {
  BATCH: "success",
  COURSE: "info",
  PLATFORM: "default"
};

export function Announcements({ announcements = [] }: AnnouncementsProps) {
  const timeZone = useUserTimeZone();

  return (
    <Panel className="h-full">
      <PanelHeader icon={Megaphone} title="Announcements" tone="accent" />
      {announcements.length === 0 ? (
        <PanelEmpty
          icon={Megaphone}
          message="We'll post here when there's news for your batch or course."
          title="Nothing new"
          tone="accent"
        />
      ) : (
        <PanelList>
          {announcements.map((announcement) => (
            <PanelRow key={announcement.id} tone="accent">
              <div>
                <div className="mb-2 flex items-start justify-between gap-4">
                  <h3 className="font-extrabold leading-tight tracking-tight text-app-text">
                    {announcement.title}
                  </h3>
                  <Badge
                    className="shrink-0 text-[10px]"
                    variant={TYPE_VARIANT[announcement.type] ?? "secondary"}
                  >
                    {announcement.type}
                  </Badge>
                </div>
                <p className="line-clamp-2 text-sm leading-6 text-app-muted">
                  {announcement.description}
                </p>
                <p className="mt-3 text-xs font-bold text-app-muted">
                  {formatFullDate(announcement.createdAt, timeZone)}
                </p>
              </div>
            </PanelRow>
          ))}
        </PanelList>
      )}
    </Panel>
  );
}
