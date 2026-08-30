"use client";

import { useState } from "react";

import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/Card";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Download, PlayCircle, Clock } from "lucide-react";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatFullDate } from "@/lib/datetime";
import { toast } from "sonner";
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

  if (!classes?.length) {
    return (
      <Card className="border-border/40 shadow-sm">
        <CardHeader>
          <CardTitle className="text-xl">Past Classes</CardTitle>
          <CardDescription>Your recent class history</CardDescription>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-sm">No past classes found.</p>
        </CardContent>
      </Card>
    );
  }

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
      <Card className="border-border/40 shadow-sm relative overflow-hidden">
        {/* Decorative gradient blob */}
        <div className="absolute top-0 right-0 w-64 h-64 bg-app-accent/5 rounded-full blur-3xl -z-10 translate-x-1/3 -translate-y-1/3 pointer-events-none" />
        
        <CardHeader>
          <CardTitle className="text-xl font-bold">Past Classes & Recordings</CardTitle>
          <CardDescription>Review your past sessions and watch class recordings.</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4">
            {classes.map((c) => (
              <div
                key={c.id}
                className="flex flex-col sm:flex-row sm:items-center justify-between p-4 rounded-xl border border-border/40 bg-card/50 hover:bg-card/80 transition-colors gap-4"
              >
                <div className="flex items-start gap-4">
                  <div className="size-12 rounded-full bg-app-accent/10 flex items-center justify-center shrink-0">
                    <PlayCircle className="size-6 text-app-accent" />
                  </div>
                  <div>
                    <h4 className="font-semibold text-app-text">{c.topic}</h4>
                    <p className="text-sm text-muted-foreground mt-1">
                      Coach: {c.coachName}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <Badge variant="outline" className="text-xs font-normal">
                        <Clock className="mr-1 size-3" />
                        {formatFullDate(c.startsAt, timeZone)}
                      </Badge>
                      <Badge variant={c.status === "COMPLETED" ? "default" : "secondary"} className="text-xs">
                        {c.status.charAt(0) + c.status.slice(1).toLowerCase()}
                      </Badge>
                    </div>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2 sm:justify-end">
                  {c.hasRecording ? (
                    <>
                      <Button
                        variant="primary"
                        className="gap-2 w-full sm:w-auto"
                        onClick={() => handleWatch(c.id, c.topic)}
                      >
                        <PlayCircle className="size-4" />
                        Watch
                      </Button>
                      <Button
                        variant="outline"
                        size="icon"
                        title="Download Recording"
                        onClick={() => handleDownload(c.id)}
                      >
                        <Download className="size-4" />
                      </Button>
                    </>
                  ) : (
                    <span className="text-xs text-muted-foreground italic mr-2">No recording</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <RecordingPlayerDialog
        isOpen={recordingPlayerConfig.isOpen}
        classId={recordingPlayerConfig.classId}
        topic={recordingPlayerConfig.topic}
        onClose={() => setRecordingPlayerConfig({ isOpen: false, classId: null, topic: "" })}
      />
    </>
  );
}
