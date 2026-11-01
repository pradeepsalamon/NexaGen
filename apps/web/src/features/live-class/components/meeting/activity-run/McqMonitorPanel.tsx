"use client";

import { Check, X } from "lucide-react";
import type { McqMonitorResponse } from "@nexa-chess/types";
import { Badge } from "@/components/ui/Badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/Table";
import { useUserTimeZone } from "@/hooks/useUserTimeZone";
import { formatDateTime } from "@/lib/datetime";
import { cn } from "@/lib/utils";
import { ActivityContent } from "./ActivityContent";

const LETTERS = ["A", "B", "C", "D", "E", "F"];

/** Live MCQ results. The right option is only marked once it has been revealed, so a shared screen can't give it away. */
export function McqMonitorPanel({ monitor }: { monitor: McqMonitorResponse }) {
  const timeZone = useUserTimeZone();
  const { totals } = monitor;
  const letterOf = (id: string) => LETTERS[monitor.options.findIndex((o) => o.id === id)] ?? "?";
  const widest = Math.max(1, ...monitor.options.map((o) => o.count));

  return (
    <div className="space-y-4">
      <ActivityContent content={monitor.question} imageAlt="The question" textClassName="font-semibold text-app-text" boardClassName="max-w-[240px]" />

      <dl className="grid grid-cols-3 gap-2 sm:grid-cols-6">
        {[
          ["Students", totals.students],
          ["Answered", totals.answered],
          ["Waiting", totals.pending],
          ["Correct", totals.correct],
          ["Incorrect", totals.incorrect],
          ["Accuracy", totals.accuracyPercent === null ? "—" : `${totals.accuracyPercent}%`]
        ].map(([label, value]) => (
          <div key={label} className="rounded-control border border-app-border bg-app-surface p-2">
            <dt className="text-xs text-app-muted">{label}</dt>
            <dd className="text-lg font-extrabold tabular-nums text-app-text">{value}</dd>
          </div>
        ))}
      </dl>

      <ul className="space-y-1.5" aria-label="Answers chosen">
        {monitor.options.map((option, index) => (
          <li
            key={option.id}
            className={cn(
              "flex items-center gap-2 rounded-control border p-2 text-sm",
              option.isCorrect ? "border-success bg-success/10" : "border-app-border bg-app-surface"
            )}
          >
            <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-app-soft text-xs font-bold text-app-text">
              {option.isCorrect ? <Check className="size-3.5 text-success-ink" strokeWidth={3} aria-label="Correct answer" /> : LETTERS[index]}
            </span>
            <div className="min-w-0 flex-1">
              <ActivityContent content={option} imageAlt={`Answer ${LETTERS[index]}`} boardClassName="max-w-[120px]" textClassName="text-app-text" />
              <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-app-soft" aria-hidden="true">
                <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${(option.count / widest) * 100}%` }} />
              </div>
            </div>
            <span className="w-8 shrink-0 text-right font-bold tabular-nums text-app-text">{option.count}</span>
          </li>
        ))}
      </ul>

      <div className="overflow-hidden rounded-app border border-app-border">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Student</TableHead>
              <TableHead>Answer</TableHead>
              <TableHead>Result</TableHead>
              <TableHead className="text-right">Score</TableHead>
              <TableHead className="text-right">Submitted</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {monitor.students.map((student) => (
              <TableRow key={student.studentId}>
                <TableCell className="font-medium">{student.studentName}</TableCell>
                <TableCell>{student.selectedOptionIds.map(letterOf).sort().join(", ") || "—"}</TableCell>
                <TableCell>
                  {student.status === "PENDING" ? (
                    <Badge variant="outline">Waiting</Badge>
                  ) : student.correct ? (
                    <Badge variant="success">Correct</Badge>
                  ) : (
                    <Badge variant="destructive">
                      <X className="mr-0.5 size-3" strokeWidth={3} aria-hidden="true" /> Incorrect
                    </Badge>
                  )}
                  {student.attempts > 1 ? <span className="ml-1.5 text-xs text-app-muted">{student.attempts} tries</span> : null}
                </TableCell>
                <TableCell className="text-right tabular-nums">{student.score === null ? "—" : `${student.score} / ${monitor.marks}`}</TableCell>
                <TableCell className="text-right text-xs text-app-muted">
                  {student.submittedAt ? formatDateTime(student.submittedAt, timeZone) : "—"}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
