"use client";

import { useState } from "react";
import { Download, Play, PlayCircle, Video, MoreVertical } from "lucide-react";
import { toast } from "sonner";
import { ClassStatusBadge } from "@/components/ui/ClassStatusBadge";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { openInNewTab } from "@/lib/openInNewTab";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { useTheme } from "@/providers/ThemeProvider";
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
  const { mode, isHydrated } = useTheme();
  const isDark = isHydrated && mode === "dark";

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
      <div
        data-testid="past-classes"
        className={`rounded-2xl border p-4 sm:p-6 transition-colors duration-200 ${isDark
            ? "bg-[#07142B] border-white/10 text-white shadow-[0_8px_30px_rgba(0,0,0,0.45)]"
            : "bg-white border-[#E8EDF5] text-[#071B41] shadow-[0_4px_20px_rgba(7,27,65,0.04)]"
          }`}
      >
        {/* Header */}
        <div className="flex items-start gap-3 mb-4">
          <span
            className={`flex size-9 sm:size-10 shrink-0 items-center justify-center rounded-xl border mt-0.5 ${isDark
                ? "bg-[#112244] border-[#E2B355]/25 text-[#E2B355]"
                : "bg-[#FDF4E1] border-[#F3DFB6] text-[#C58927]"
              }`}
          >
            <Video aria-hidden="true" className="size-4 sm:size-5" strokeWidth={2} />
          </span>
          <div>
            <h2 className="text-sm sm:text-base font-bold leading-snug">
              Past classes
            </h2>
            <p
              className={`mt-0.5 text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                }`}
            >
              Rewatch a session any time.
            </p>
          </div>
        </div>

        {/* Rows */}
        <ul
          className={`divide-y ${isDark ? "divide-white/8" : "divide-[#EEF2F7]"
            }`}
        >
          {classes.map((c) => (
            <li
              className="flex items-center justify-between gap-3 py-3 first:pt-1 last:pb-0"
              data-testid={`past-class-${c.id}`}
              key={c.id}
            >
              <div className="flex items-center gap-3 min-w-0">
                {/* Circular Play Badge */}
                <span
                  className={`flex size-8 sm:size-9 shrink-0 items-center justify-center rounded-full ${isDark
                      ? "bg-[#11244A] text-[#60A5FA]"
                      : "bg-[#EFF6FF] text-[#1D4ED8]"
                    }`}
                >
                  <Play className="size-3.5 fill-current ml-0.5" />
                </span>

                <div className="min-w-0">
                  <p className="truncate text-xs sm:text-sm font-bold">
                    {c.topic}
                  </p>
                  <p
                    className={`mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] sm:text-xs ${isDark ? "text-[#94A3B8]" : "text-[#64748B]"
                      }`}
                  >
                    <span>
                      {c.coachName} · {formatFullDate(c.startsAt, timeZone)}
                    </span>
                    {c.status !== "COMPLETED" ? (
                      <ClassStatusBadge endsAt={c.endsAt} status={c.status} />
                    ) : null}
                  </p>
                </div>
              </div>

              <div className="flex shrink-0 items-center gap-2">
                {c.hasRecording ? (
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
                        className="size-8 rounded-full p-0 text-app-muted hover:text-app-text"
                        onClick={() => handleDownload(c.id)}
                        size="icon"
                        variant="ghost"
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
                  <div className="flex items-center gap-1.5">
                    <span
                      className={`text-[11px] sm:text-xs ${isDark ? "text-[#64748B]" : "text-[#94A3B8]"
                        }`}
                    >
                      No recording
                    </span>
                    <MoreVertical
                      className={`size-4 ${isDark ? "text-[#64748B]" : "text-[#94A3B8]"
                        }`}
                    />
                  </div>
                )}
              </div>
            </li>
          ))}
        </ul>
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