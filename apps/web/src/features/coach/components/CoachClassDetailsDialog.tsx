import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useCoachClassDetailsQuery } from "../hooks/useCoachApi";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Clock, Users, User, Calendar, GraduationCap, Download, Video } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";
import { getRecordingDownloadUrl } from "@/features/live-class/api/live-class";
import { openInNewTab } from "@/lib/openInNewTab";
import { toast } from "sonner";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime, formatTime } from "@/lib/datetime";

interface CoachClassDetailsDialogProps {
  classId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function CoachClassDetailsDialog({
  classId,
  isOpen,
  onOpenChange,
}: CoachClassDetailsDialogProps) {
  const { data, isLoading, isError } = useCoachClassDetailsQuery(
    classId as string,
    !!classId && isOpen
  );

  const coachClass = data?.class;
  const timeZone = useUserTimeZone();

  const handleDownload = async () => {
    if (!classId) return;
    try {
      await openInNewTab(async () => (await getRecordingDownloadUrl(classId, { download: true }))?.url);
    } catch (error) {
      console.error("Failed to download recording:", error);
      toast.error("Failed to download recording. It may have expired or is unavailable.");
    }
  };

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return formatDateTime(dateString, timeZone);
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Class Details</DialogTitle>
        </DialogHeader>

        <div className="space-y-6">
          {isLoading && (
            <div className="space-y-4">
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-4 w-full" />
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-24 w-full" />
            </div>
          )}

          {isError && (
            <div className="text-sm text-app-danger-ink">
              Failed to load class details.
            </div>
          )}

          {coachClass && (
            <>
              <div>
                <h3 className="text-lg font-semibold">{coachClass.topic || coachClass.title || "Untitled Class"}</h3>
                <p className="text-sm text-app-muted mt-1 flex items-center gap-2">
                  <GraduationCap className="size-4" /> {coachClass.batchName}
                </p>
                {coachClass.description && (
                  <p className="text-sm mt-2">{coachClass.description}</p>
                )}
              </div>

              <div className="space-y-3 rounded-control border p-4 bg-app-soft/20">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Scheduled:</span>
                  <span>
                    {formatDate(coachClass.startsAt)} - {formatTime(coachClass.endsAt, timeZone)}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Actual Start:</span>
                  <span>{formatDate(coachClass.actualStartsAt)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Actual End:</span>
                  <span>{formatDate(coachClass.actualEndsAt)}</span>
                </div>
              </div>

              {coachClass.hasRecording && (
                <div className="flex items-center justify-between p-3 rounded-control border border-app-border/60 bg-app-soft/10">
                  <div className="flex items-center gap-2 text-sm">
                    <Video className="size-4 text-primary-ink" />
                    <span className="font-medium">Class Recording</span>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    className="gap-1.5"
                    onClick={handleDownload}
                  >
                    <Download className="size-3.5" />
                    Download
                  </Button>
                </div>
              )}

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="size-4" /> Enrolled Students Who Joined
                  </h4>
                  <Badge variant="secondary">
                    {coachClass.participants.length} / {coachClass.studentCount} joined
                  </Badge>
                </div>

                {coachClass.participants.length > 0 ? (
                  <ul className="space-y-2 rounded-control border border-app-border bg-app-surface p-3 max-h-[150px] overflow-y-auto">
                    {coachClass.participants.map((p, i) => (
                      <li key={i} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2">
                          <User className="size-3 text-app-muted" /> {p.name}
                        </span>
                        <span className="text-app-muted text-xs">
                          {p.joinedAt ? formatTime(p.joinedAt, timeZone) : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-app-muted border rounded-control p-4 text-center bg-app-soft/10">
                    No students joined this class.
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
