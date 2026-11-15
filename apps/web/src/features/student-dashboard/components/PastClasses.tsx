"use client";

import { useState } from "react";
import { Download, History, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { ClassRow, ClassRowList } from "@/components/ui/ClassRow";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { SectionCard } from "@/components/ui/SectionCard";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { openInNewTab } from "@/lib/openInNewTab";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { RecordingPlayerDialog } from "./RecordingPlayerDialog";

type PastClass = {
  id: string;
  topic: string;
  coachName: string;
  startsAt: string;
  endsAt: string;
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
      await openInNewTab(
        async () =>
          (await getRecordingDownloadUrl(classId, { download: true }))?.url
      );
    } catch (error) {
      console.error("Failed to download recording:", error);
      toast.error(
        "Failed to download recording. It may have expired or is unavailable."
      );
    }
  };

  return (
    <>
      <div data-testid="past-classes">
        <SectionCard description="Rewatch a session any time." title="Past classes">
          {classes.length === 0 ? (
            <EmptyState icon={History} title="No past classes yet" variant="inline" />
          ) : (
            <ClassRowList>
              {classes.map((c) => (
                <ClassRow
                  actions={
                    c.hasRecording ? (
                      <>
                        <Button
                          onClick={() =>
                            setRecordingPlayerConfig({
                              isOpen: true,
                              classId: c.id,
                              topic: c.topic
                            })
                          }
                          size="sm"
                          variant="outline"
                        >
                          <PlayCircle
                            aria-hidden="true"
                            className="size-4"
                            strokeWidth={2.5}
                          />
                          Watch
                        </Button>
                        <SimpleTooltip label="Download recording">
                          <Button
                            aria-label={`Download recording for ${c.topic}`}
                            className="size-8 p-0"
                            onClick={() => handleDownload(c.id)}
                            size="icon"
                            variant="neutral"
                          >
                            <Download
                              aria-hidden="true"
                              className="size-4"
                              strokeWidth={2.5}
                            />
                          </Button>
                        </SimpleTooltip>
                      </>
                    ) : (
                      <span className="text-xs text-app-muted">No recording</span>
                    )
                  }
                  cls={{ ...c, title: c.topic, topic: null }}
                  key={c.id}
                  meta={`${c.coachName} · ${formatFullDate(c.startsAt, timeZone)}`}
                  showDate={false}
                  showStatus={c.status !== "COMPLETED"}
                  testId={`past-class-${c.id}`}
                />
              ))}
            </ClassRowList>
          )}
        </SectionCard>
      </div>

      <RecordingPlayerDialog
        isOpen={recordingPlayerConfig.isOpen}
        classId={recordingPlayerConfig.classId}
        topic={recordingPlayerConfig.topic}
        onClose={() =>
          setRecordingPlayerConfig({ isOpen: false, classId: null, topic: "" })
        }
      />
    </>
  );
}