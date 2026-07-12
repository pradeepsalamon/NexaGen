import { Calendar, Clock, MoreVertical, Users } from "lucide-react";
import Link from "next/link";
import { Badge } from "../../../components/ui/Badge";
import { Button } from "../../../components/ui/Button";
import { Card } from "../../../components/ui/Card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger
} from "../../../components/ui/DropdownMenu";
import type { CoachClass } from "@nexa-gen/types";
import { getClassStatusBadgeVariant, getStatusLabel } from "../../../constants/classes";

interface ClassCardProps {
  classItem: CoachClass;
  onEdit?: (classItem: CoachClass) => void;
  onCancel?: (classItem: CoachClass) => void;
}

export function ClassCard({ classItem, onEdit, onCancel }: ClassCardProps) {
  const start = new Date(classItem.startsAt);
  const end = new Date(classItem.endsAt);
  
  const startTime = start.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const endTime = end.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  const dateStr = start.toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });

  const durationMs = end.getTime() - start.getTime();
  const durationMins = Math.round(durationMs / 60000);

  return (
    <Card className="flex flex-col p-4 shadow-card hover:border-primary/30 transition-colors">
      <div className="flex items-start justify-between mb-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <h3 className="font-bold text-app-text line-clamp-1">
              {classItem.title || classItem.topic || "Regular Session"}
            </h3>
            <Badge variant={getClassStatusBadgeVariant(classItem.status)} className="text-[10px] uppercase font-bold tracking-wider">
              {getStatusLabel(classItem.status)}
            </Badge>
          </div>
          <p className="text-sm font-medium text-app-muted line-clamp-1">
            {classItem.batchName}
          </p>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-8 w-8 -mr-2">
              <MoreVertical className="h-4 w-4" />
              <span className="sr-only">Open menu</span>
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem asChild>
              <Link href={`/classes/${classItem.id}`}>View Details</Link>
            </DropdownMenuItem>
            {classItem.status === "SCHEDULED" && onEdit && (
              <DropdownMenuItem onClick={() => onEdit(classItem)}>
                Edit Schedule
              </DropdownMenuItem>
            )}
            {classItem.status === "SCHEDULED" && onCancel && (
              <DropdownMenuItem onClick={() => onCancel(classItem)} className="text-destructive">
                Cancel Class
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      <div className="mt-auto grid grid-cols-2 gap-y-2 gap-x-4 text-xs font-medium text-app-muted">
        <div className="flex items-center gap-1.5">
          <Calendar className="h-3.5 w-3.5" />
          <span>{dateStr}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Clock className="h-3.5 w-3.5" />
          <span>{startTime} - {endTime} ({durationMins}m)</span>
        </div>
        <div className="flex items-center gap-1.5 col-span-2">
          <Users className="h-3.5 w-3.5" />
          <span>{classItem.studentCount} Students</span>
        </div>
      </div>

      <div className="mt-4 pt-4 border-t border-app-border flex gap-2">
        <Button asChild className="flex-1" variant="primary">
          <Link href={`/classes/${classItem.id}`}>
            {classItem.status === "SCHEDULED" ? "Start Class" : "View Details"}
          </Link>
        </Button>
      </div>
    </Card>
  );
}
