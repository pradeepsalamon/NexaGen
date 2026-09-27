"use client";

import { useState } from "react";

import { Clock, Download, History, PlayCircle } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Panel, PanelEmpty, PanelHeader, PanelList, PanelRow } from "@/components/ui/Panel";
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

  const handleWatch = (classId: string, topic: string) => {
    setRecordingPlayerConfig({ isOpen: true, classId, topic });
  };

  return (
    <>
      <Panel testId="past-classes">
        <PanelHeader
          description="Rewatch a session or download its recording."
          icon={History}
          title="Past Classes & Recordings"
          tone="warm"
        />
        {!classes?.length ? (
          <PanelEmpty
            icon={History}
            message="Completed classes and their recordings will appear here."
            title="No past classes"
            tone="warm"
          />
        ) : (
          <PanelList>
            {classes.map((c) => (
              <PanelRow
                className="sm:flex-row sm:items-center"
                key={c.id}
                testId={`past-class-${c.id}`}
                tone="warm"
              >
                <div className="flex items-start gap-4">
                  <span
                    aria-hidden="true"
                    className="flex size-11 shrink-0 items-center justify-center rounded-full bg-warm/30 text-warm-ink"
                  >
                    <PlayCircle className="size-5" strokeWidth={2.5} />
                  </span>
                  <div className="min-w-0">
                    <h3 className="font-extrabold tracking-tight text-app-text">
                      {c.topic}
                    </h3>
                    <p className="mt-0.5 text-sm text-app-muted">Coach {c.coachName}</p>
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <Badge variant="outline">
                        <Clock aria-hidden="true" className="size-3" strokeWidth={2.5} />
                        {formatFullDate(c.startsAt, timeZone)}
                      </Badge>
                      <Badge variant={c.status === "COMPLETED" ? "success" : "secondary"}>
                        {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {c.hasRecording ? (
                    <>
                      <Button
                        className="w-full sm:w-auto"
                        onClick={() => handleWatch(c.id, c.topic)}
                        size="sm"
                      >
                        <PlayCircle aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        Watch
                      </Button>
                      <SimpleTooltip label="Download recording">
                        <Button
                          aria-label={`Download recording for ${c.topic}`}
                          className="size-8 rounded-full border border-primary bg-primary p-0 text-white shadow-none transition-colors hover:border-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:bg-[color-mix(in_srgb,var(--color-primary)_75%,white)] hover:text-white"
                          onClick={() => handleDownload(c.id)}
                          size="icon"
                          variant="ghost"
                        >
                          <Download aria-hidden="true" className="size-4" strokeWidth={2.5} />
                        </Button>
                      </SimpleTooltip>
                    </>
                  ) : (
                    <span className="text-xs font-bold text-app-muted">No recording</span>
                  )}
                </div>
              </PanelRow>
            ))}
          </PanelList>
        )}
      </Panel>

      <RecordingPlayerDialog
        isOpen={recordingPlayerConfig.isOpen}
        classId={recordingPlayerConfig.classId}
        topic={recordingPlayerConfig.topic}
        onClose={() => setRecordingPlayerConfig({ isOpen: false, classId: null, topic: "" })}
      />
    </>
  );
}
