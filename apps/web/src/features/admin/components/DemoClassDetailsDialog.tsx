import { format } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/Dialog";
import { useDemoClassDetailsQuery } from "../hooks/useAdminDemoClasses";
import { Badge } from "@/components/ui/Badge";
import { Clock, Users, User, Calendar, Mail, Phone } from "lucide-react";
import { Skeleton } from "@/components/ui/Skeleton";

interface DemoClassDetailsDialogProps {
  classId: string | null;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

export function DemoClassDetailsDialog({
  classId,
  isOpen,
  onOpenChange,
}: DemoClassDetailsDialogProps) {
  const { data, isLoading, isError } = useDemoClassDetailsQuery(
    classId as string,
    !!classId && isOpen
  );

  const demoClass = data?.class;

  const formatDate = (dateString?: string | null) => {
    if (!dateString) return "N/A";
    return format(new Date(dateString), "MMM d, yyyy h:mm a");
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle>Demo Class Details</DialogTitle>
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

          {demoClass && (
            <>
              <div>
                <h3 className="text-lg font-semibold">{demoClass.topic}</h3>
                <p className="text-sm text-app-muted mt-1">
                  Coach: {demoClass.coachName}
                </p>
                {demoClass.description && (
                  <p className="text-sm mt-3">{demoClass.description}</p>
                )}
              </div>

              <div className="space-y-3 rounded-control border p-4 bg-app-soft/20">
                <div className="flex items-center gap-2 text-sm">
                  <Calendar className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Scheduled:</span>
                  <span>
                    {formatDate(demoClass.startsAt)} - {format(new Date(demoClass.endsAt), "h:mm a")}
                  </span>
                </div>
                
                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Actual Start:</span>
                  <span>{formatDate(demoClass.actualStartsAt)}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="size-4 text-app-muted" />
                  <span className="font-medium min-w-[110px]">Actual End:</span>
                  <span>{formatDate(demoClass.actualEndsAt)}</span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-semibold flex items-center gap-2">
                    <Users className="size-4" /> Registrations
                  </h4>
                  <Badge variant="secondary">
                    {demoClass.registrations.length} registered
                  </Badge>
                </div>

                {demoClass.registrations.length > 0 ? (
                  <ul className="space-y-2 border rounded-control p-3 bg-card max-h-[220px] overflow-y-auto">
                    {demoClass.registrations.map((r, i) => (
                      <li key={i} className="flex items-center justify-between gap-2 text-sm">
                        <span className="flex min-w-0 items-center gap-2">
                          <User className="size-3 shrink-0 text-app-muted" />
                          <span className="flex min-w-0 flex-col">
                            <span className="truncate font-medium">{r.name}</span>
                            <span className="flex items-center gap-1 truncate text-xs text-app-muted">
                              {r.contactMethod === "EMAIL" ? (
                                <Mail className="size-3 shrink-0" />
                              ) : (
                                <Phone className="size-3 shrink-0" />
                              )}
                              {r.contact}
                            </span>
                          </span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-1">
                          <Badge variant={r.joined ? "success" : "secondary"} className="text-[10px]">
                            {r.joined ? "Joined" : "Registered"}
                          </Badge>
                          <span className="text-[10px] text-app-muted">
                            {format(new Date(r.registeredAt), "MMM d, h:mm a")}
                          </span>
                        </span>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div className="text-sm text-app-muted border rounded-control p-4 text-center bg-app-soft/10">
                    No one has registered for this class yet.
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
