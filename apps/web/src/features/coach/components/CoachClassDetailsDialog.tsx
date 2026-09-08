import { format } from "date-fns";
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
import { toast } from "sonner";

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

  const handleDownload = async () => {
    if (!classId) return;
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

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
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
            <div className="text-sm text-destructive">
              Failed to load class details.
            </div>
          )}

          {coachClass && (
            <>
              <div>
                <h3 className="text-lg font-semibold">{coachClass.topic || coachClass.title || "Untitled Class"}</h3>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <GraduationCap className="size-4" /> {coachClass.batchName}
                </p>
                {coachClass.description && (
                  <p className="text-sm mt-2">{coachClass.description}</p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Scheduled:</span>
                  <span>
                    {formatDate(coachClass.startsAt)} - {format(new Date(coachClass.endsAt), "h:mm a")}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Actual Start:</span>
                  <span>{formatDate(coachClass.actualStartsAt)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Actual End:</span>
                  <span>{formatDate(coachClass.actualEndsAt)}</span>
                </div>
              </div>

              {coachClass.hasRecording && (
                <div className="flex items-center justify-between p-3 rounded-lg border border-border/60 bg-muted/10">
                  <div className="flex items-center gap-2 text-sm">
                    <Video className="size-4 text-primary" />
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
                  <ul className="space-y-2 border rounded-md p-3 bg-card max-h-[150px] overflow-y-auto">
                    {coachClass.participants.map((p, i) => (
                      <li key={i} className="flex justify-between items-center text-sm">
                        <span className="flex items-center gap-2">
                          <User className="size-3 text-muted-foreground" /> {p.name}
                        </span>
                        <span className="text-muted-foreground text-xs">
                          {p.joinedAt ? format(new Date(p.joinedAt), "h:mm a") : "—"}
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-muted-foreground border rounded-md p-4 text-center bg-muted/10">
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
