import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useAdminBatchClassDetailsQuery } from "../hooks/useAdminBatchClasses";
import { Badge } from "@/components/ui/Badge";
import { Clock, Users, User, Calendar, GraduationCap } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface BatchClassDetailsDialogProps {
  classId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function BatchClassDetailsDialog({
  classId,
  isOpen,
  onOpenChange,
}: BatchClassDetailsDialogProps) {
  const { data, isLoading, isError } = useAdminBatchClassDetailsQuery(
    classId as string,
    !!classId && isOpen
  );

  const batchClass = data?.class;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Batch Class Details</DialogTitle>
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

          {batchClass && (
            <>
              <div>
                <h3 className="text-lg font-semibold">{batchClass.title || "Untitled Class"}</h3>
                <p className="text-sm text-muted-foreground mt-1 flex items-center gap-2">
                  <GraduationCap className="size-4" /> {batchClass.coachName} • {batchClass.batchName}
                </p>
                {batchClass.topic && (
                  <p className="text-sm font-medium mt-2">Topic: {batchClass.topic}</p>
                )}
                {batchClass.description && (
                  <p className="text-sm mt-2">{batchClass.description}</p>
                )}
              </div>

              <div className="space-y-3 rounded-lg border p-4 bg-muted/20">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Scheduled:</span>
                  <span>
                    {formatDate(batchClass.startsAt)} - {format(new Date(batchClass.endsAt), "h:mm a")}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Actual Start:</span>
                  <span>{formatDate(batchClass.actualStartsAt)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-muted-foreground" />
                  <span className="font-medium min-w-[110px]">Actual End:</span>
                  <span>{formatDate(batchClass.actualEndsAt)}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="size-4" /> Enrolled Students Who Joined
                  </h4>
                  <Badge variant="secondary">
                    {batchClass.participants.length} / {batchClass.studentCount} joined
                  </Badge>
                </div>

                {batchClass.participants.length > 0 ? (
                  <ul className="space-y-2 border rounded-md p-3 bg-card max-h-[150px] overflow-y-auto">
                    {batchClass.participants.map((p, i) => (
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
