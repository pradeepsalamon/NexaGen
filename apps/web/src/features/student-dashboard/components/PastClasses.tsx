"use client";

import { useState } from "react";

import { Download, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { SectionCard } from "@/components/ui/SectionCard";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { RecordingPlayerDialog } from "./RecordingPlayerDialog";

type PastClass = {
  id: string;
  topic: string;
  coachName: string;
  startsAt: string;
  status: string;
  hasRecording: boolean;
};

type PastClassesProps = {
  classes: PastClass[];
};

export function PastClasses({ classes }: PastClassesProps) {
  const timeZone = useUserTimeZone();
  const [recordingPlayerConfig, setRecordingPlayerConfig] = useState<{
    isOpen: boolean;
    classId: string | null;
    topic: string;
  }>({ isOpen: false, classId: null, topic: "" });

  const handleDownload = async (classId: string) => {
    try {
      const data = await getRecordingDownloadUrl(classId, { download: true });
      if (data?.url) {
        window.open(data.url, "_blank");
      }
    } catch (error) {
      console.error("Failed to download recording:", error);
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };

  return (
    <>
      <div data-testid="past-classes">
        <SectionCard description="Rewatch a session any time." title="Past classes">
          <ul className="-my-2 divide-y divide-app-border">
            {classes.map((c) => (
              <li
                className="flex items-center justify-between gap-3 py-3"
                data-testid={`past-class-${c.id}`}
                key={c.id}
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-bold text-app-text">{c.topic}</p>
                  <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-app-muted">
                    <span>
                      {c.coachName} · {formatFullDate(c.startsAt, timeZone)}
                    </span>
                    {c.status === "CANCELLED" ? <Badge variant="secondary">Cancelled</Badge> : null}
                  </p>
                </div>

                <div className="flex shrink-0 items-center gap-2">
                  {c.hasRecording ? (
                    <>
                      <Button
                        onClick={() =>
                          setRecordingPlayerConfig({ isOpen: true, classId: c.id, topic: c.topic })
                        }
                        size="sm"
                        variant="outline"
                      >
                        <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        Watch
                      </Button>
                      <SimpleTooltip label="Download recording">
                        <Button
                          aria-label={`Download recording for ${c.topic}`}
                          className="size-8 rounded-full p-0 text-app-muted hover:text-app-text"
                          onClick={() => handleDownload(c.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                    </>
                  ) : (
                    <span className="text-xs text-app-muted">No recording</span>
                  )}
                </div>
              </li>
            ))}
          </ul>
        </SectionCard>
      </div>

      <RecordingPlayerDialog
        isOpen={recordingPlayerConfig.isOpen}
        classId={recordingPlayerConfig.classId}
        topic={recordingPlayerConfig.topic}
        onClose={() => setRecordingPlayerConfig({ isOpen: false, classId: null, topic: "" })}
      />
    </>
  );
}
