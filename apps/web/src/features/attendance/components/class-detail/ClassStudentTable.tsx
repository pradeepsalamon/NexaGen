import { Fragment, memo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/Tooltip";
import type { ClassDetailStudentLog } from "@nexa-chess/types";
import { AttendanceStatusBadge } from "../AttendanceStatusBadge";
import { AttendancePercentBar } from "../AttendancePercentBar";
import { EventTimeline } from "./EventTimeline";
import { formatDuration } from "@/lib/datetime";

interface ClassStudentTableProps {
  students: ClassDetailStudentLog[];
  onViewHistory: (student: { id: string; name: string }) => void;
}

export const ClassStudentTable = memo(function ClassStudentTable({
  students,
  onViewHistory,
}: ClassStudentTableProps) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);

  const toggleStudent = (id: string) =>
    setExpandedStudent((current) => (current === id ? null : id));

  return (
    <Card className="border-app-border bg-app-surface shadow-sm overflow-hidden">
      <CardHeader className="bg-app-soft/50 border-b border-app-border">
        <CardTitle className="text-lg flex justify-between items-center">
          Student Attendance
          <span className="text-sm font-normal text-app-muted">
            Click a row for event details
          </span>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm text-left">
            <thead className="text-xs uppercase bg-app-background border-b border-app-border text-app-muted">
              <tr>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold" />
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">Name</th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">Status</th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">Duration</th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[160px]">
                  Attendance %
                </th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                  Reconnects
                </th>
                <th className="px-3 py-3 md:px-6 md:py-4 font-semibold text-right">
                  History
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-app-border">
              {students.map((student) => (
                <Fragment key={student.id}>
                  <tr
                    onClick={() => toggleStudent(student.id)}
                    className="hover:bg-app-soft/50 transition-colors cursor-pointer"
                  >
                    <td className="px-3 py-3 md:px-6 md:py-4 w-10">
                      {student.logs.length > 0 &&
                        (expandedStudent === student.id ? (
                          <ChevronDown className="h-4 w-4 text-app-muted" />
                        ) : (
                          <ChevronRight className="h-4 w-4 text-app-muted" />
                        ))}
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4">
                      <div className="font-medium text-app-text">
                        {student.name}
                      </div>
                      <div className="text-xs text-app-muted mt-0.5">
                        {student.email}
                      </div>
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4">
                      <AttendanceStatusBadge status={student.status} />
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                      {formatDuration(student.duration)}
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4">
                      <AttendancePercentBar percent={student.attendancePercent} />
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4 text-app-muted">
                      {student.reconnectCount}
                    </td>
                    <td className="px-3 py-3 md:px-6 md:py-4 text-right">
                      <TooltipProvider>
                        <Tooltip>
                          <TooltipTrigger asChild>
                            <Button
                              aria-label={`View attendance history for ${student.name}`}
                              variant="outline"
                              size="icon"
                              className="size-8 rounded-full border-primary p-0 text-app-text transition-colors hover:bg-primary hover:text-white"
                              onClick={(event) => {
                                event.stopPropagation();
                                onViewHistory({ id: student.id, name: student.name });
                              }}
                            >
                              <History className="size-4" strokeWidth={2.5} />
                            </Button>
                          </TooltipTrigger>
                          <TooltipContent>Full attendance history</TooltipContent>
                        </Tooltip>
                      </TooltipProvider>
                    </td>
                  </tr>
                  {expandedStudent === student.id && student.logs.length > 0 && (
                    <tr>
                      <td
                        colSpan={7}
                        className="px-3 py-3 md:px-6 md:py-4 bg-app-soft/30"
                      >
                        <div className="pl-4">
                          <p className="text-xs font-semibold text-app-muted uppercase mb-2">
                            Event Timeline
                          </p>
                          <EventTimeline
                            logs={student.logs}
                            className="space-y-1.5"
                          />
                        </div>
                      </td>
                    </tr>
                  )}
                </Fragment>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
});
