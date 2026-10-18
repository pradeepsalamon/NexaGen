import { Fragment, memo, useState } from "react";
import { ChevronDown, ChevronRight, History } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Button } from "@/components/ui/Button";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import type { ClassDetailStudentLog } from "@nexa-chess/types";
import { AttendanceStatusBadge } from "../AttendanceStatusBadge";
import { AttendancePercentBar } from "../AttendancePercentBar";
import { EventTimeline } from "./EventTimeline";
import { formatDuration } from "@/lib/datetime";
import { useTableSort } from "@/hooks/useTableSort";
import { SortButton } from "@/components/ui/DataTableSortButton";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";

interface ClassStudentTableProps {
  students: ClassDetailStudentLog[];
  onViewHistory: (student: { id: string; name: string }) => void;
}

export const ClassStudentTable = memo(function ClassStudentTable({
  students,
  onViewHistory,
}: ClassStudentTableProps) {
  const [expandedStudent, setExpandedStudent] = useState<string | null>(null);
  const { rows: sortedStudents, sortProps } = useTableSort({
    rows: students,
    accessors: {
      attendance: (s) => s.attendancePercent,
      duration: (s) => s.duration,
      name: (s) => s.name,
      reconnects: (s) => s.reconnectCount,
      status: (s) => s.status
    }
  });

  const toggleStudent = (id: string) =>
    setExpandedStudent((current) => (current === id ? null : id));

  return (
    <Card className="border-app-border bg-app-surface shadow-card overflow-hidden">
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
          <Table className="w-full text-sm text-left">
            <TableHeader className="text-xs bg-app-background border-b border-app-border text-app-muted">
              <TableRow>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold" />
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Name" {...sortProps("name")} /></TableHead>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Status" {...sortProps("status")} /></TableHead>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold"><SortButton label="Duration" {...sortProps("duration")} /></TableHead>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold md:w-[160px]">
                  <SortButton label="Attendance %" {...sortProps("attendance")} />
                </TableHead>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold">
                  <SortButton label="Reconnects" {...sortProps("reconnects")} />
                </TableHead>
                <TableHead className="px-3 py-3 md:px-6 md:py-4 font-semibold text-right">
                  History
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody className="divide-y divide-app-border">
              {sortedStudents.map((student) => (
                <Fragment key={student.id}>
                  <TableRow
                    onClick={() => toggleStudent(student.id)}
                    className="hover:bg-app-soft/50 transition-colors cursor-pointer"
                  >
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 w-10">
                      {student.logs.length > 0 && (
                        <button
                          type="button"
                          aria-label={
                            expandedStudent === student.id
                              ? `Collapse event timeline for ${student.name}`
                              : `Expand event timeline for ${student.name}`
                          }
                          aria-expanded={expandedStudent === student.id}
                          className="flex items-center justify-center rounded p-1 text-app-muted hover:text-app-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleStudent(student.id);
                          }}
                        >
                          {expandedStudent === student.id ? (
                            <ChevronDown className="h-4 w-4 text-app-muted" aria-hidden="true" />
                          ) : (
                            <ChevronRight className="h-4 w-4 text-app-muted" aria-hidden="true" />
                          )}
                        </button>
                      )}
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                      <div className="font-medium text-app-text">
                        {student.name}
                      </div>
                      <div className="text-xs text-app-muted mt-0.5">
                        {student.email}
                      </div>
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                      <AttendanceStatusBadge status={student.status} />
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                      {formatDuration(student.duration)}
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4">
                      <AttendancePercentBar percent={student.attendancePercent} />
                    </TableCell>
                    <TableCell className="text-left px-3 py-3 md:px-6 md:py-4 text-app-muted">
                      {student.reconnectCount}
                    </TableCell>
                    <TableCell className="px-3 py-3 md:px-6 md:py-4 text-right">
                      <SimpleTooltip label="Full attendance history">
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
                          <History className="size-4" strokeWidth={2.5} aria-hidden="true" />
                        </Button>
                      </SimpleTooltip>
                    </TableCell>
                  </TableRow>
                  {expandedStudent === student.id && student.logs.length > 0 && (
                    <TableRow>
                      <TableCell
                        colSpan={7}
                        className="text-left px-3 py-3 md:px-6 md:py-4 bg-app-soft/30"
                      >
                        <div className="pl-4">
                          <p className="text-xs font-semibold text-app-muted mb-2">
                            Event Timeline
                          </p>
                          <EventTimeline
                            logs={student.logs}
                            className="space-y-1.5"
                          />
                        </div>
                      </TableCell>
                    </TableRow>
                  )}
                </Fragment>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
});
