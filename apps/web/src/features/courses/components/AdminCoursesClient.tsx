"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import type { CourseListQuery, CourseStatus, CourseSummary } from "@nexa-chess/types";
import { Archive, ArchiveRestore, Pencil, Plus, Send, Trash2, Undo2 } from "lucide-react";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { EmptyState } from "@/components/ui/EmptyState";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { Skeleton } from "@/components/ui/Skeleton";
import { SimpleTooltip } from "@/components/ui/Tooltip";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from "@/components/ui/Table";
import { useDebouncedValue } from "@/hooks/useDebouncedValue";
import { useCourses, useDeleteCourse, useSetCourseArchived, useSetCoursePublished } from "../hooks/useCoursesApi";
import { COURSE_STATUS_OPTIONS, courseStatusBadgeVariant } from "../lib/courseMeta";

const iconBtn =
  "size-8 rounded-full border-app-border p-0 text-app-text transition-colors hover:bg-primary hover:text-white";

export function AdminCoursesClient() {
  const [searchInput, setSearchInput] = useState("");
  const search = useDebouncedValue(searchInput, 350);
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);

  const query: CourseListQuery = useMemo(
    () => ({
      page,
      pageSize: 20,
      search: search || undefined,
      status: (status || undefined) as CourseStatus | undefined
    }),
    [page, search, status]
  );

  const { data, isLoading, isPlaceholderData } = useCourses(query);
  const { run: runPublish } = useSetCoursePublished();
  const { run: runArchive } = useSetCourseArchived();
  const { run: runDelete } = useDeleteCourse();

  const courses = data?.courses ?? [];
  const pagination = data?.pagination;
  const hasFilters = Boolean(searchInput || status);

  const clearFilters = () => {
    setSearchInput("");
    setStatus("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-app-text">Courses</h1>
          <p className="mt-1 text-sm text-app-muted">
            Curate ordered playlists of existing assignments and puzzles for students.
          </p>
        </div>
        <Button asChild>
          <Link href="/admin/courses/new">
            <Plus className="mr-2 size-4" />
            New course
          </Link>
        </Button>
      </div>

      <Card className="grid gap-4 p-4">
        <div className="flex flex-wrap gap-2">
          <Input
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value);
              setPage(1);
            }}
            placeholder="Search courses…"
            className="w-full sm:w-56"
          />
          <Select
            aria-label="Filter by status"
            value={status}
            placeholder="All statuses"
            options={COURSE_STATUS_OPTIONS}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            className="w-auto"
          />
          {hasFilters && (
            <Button variant="ghost" size="sm" onClick={clearFilters}>
              Clear
            </Button>
          )}
        </div>

        {isLoading ? (
          <div className="space-y-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-12 w-full" />
            ))}
          </div>
        ) : courses.length === 0 ? (
          <EmptyState
            icon={Plus}
            title={hasFilters ? "No courses match your filters" : "No courses yet"}
            description={
              hasFilters
                ? "Try a different search or clear the filters."
                : "Create your first course and start curating modules."
            }
            action={hasFilters ? { label: "Clear filters", onClick: clearFilters } : undefined}
          />
        ) : (
          <div className="overflow-x-auto">
            <Table className={isPlaceholderData ? "opacity-60" : undefined}>
              <TableHeader>
                <TableRow>
                  <TableHead>Course</TableHead>
                  <TableHead>Modules</TableHead>
                  <TableHead>Created by</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {courses.map((c: CourseSummary) => (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium text-app-text">
                      <Link href={`/admin/courses/${c.id}`} className="hover:text-primary">
                        {c.title}
                      </Link>
                    </TableCell>
                    <TableCell>{c.moduleCount}</TableCell>
                    <TableCell>{c.createdByName ?? "—"}</TableCell>
                    <TableCell>
                      <Badge variant={courseStatusBadgeVariant(c.status)}>{c.status}</Badge>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1.5">
                        <SimpleTooltip label="Edit">
                          <Button
                            asChild
                            aria-label="Edit course"
                            variant="outline"
                            size="icon"
                            className={iconBtn}
                          >
                            <Link href={`/admin/courses/${c.id}`}>
                              <Pencil className="size-4" strokeWidth={2.5} />
                            </Link>
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip label={c.status === "PUBLISHED" ? "Unpublish" : "Publish"}>
                          <Button
                            aria-label={c.status === "PUBLISHED" ? "Unpublish course" : "Publish course"}
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:bg-secondary hover:text-black"
                            onClick={() => runPublish({ id: c.id, next: c.status !== "PUBLISHED" })}
                          >
                            {c.status === "PUBLISHED" ? (
                              <Undo2 className="size-4" strokeWidth={2.5} />
                            ) : (
                              <Send className="size-4" strokeWidth={2.5} />
                            )}
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip label={c.status === "ARCHIVED" ? "Restore" : "Archive"}>
                          <Button
                            aria-label={c.status === "ARCHIVED" ? "Restore course" : "Archive course"}
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full border-secondary p-0 text-app-text transition-colors hover:bg-secondary hover:text-black"
                            onClick={() => runArchive({ id: c.id, next: c.status !== "ARCHIVED" })}
                          >
                            {c.status === "ARCHIVED" ? (
                              <ArchiveRestore className="size-4" strokeWidth={2.5} />
                            ) : (
                              <Archive className="size-4" strokeWidth={2.5} />
                            )}
                          </Button>
                        </SimpleTooltip>
                        <SimpleTooltip label="Delete">
                          <Button
                            aria-label="Delete course"
                            variant="outline"
                            size="icon"
                            className="size-8 rounded-full border-app-danger p-0 text-app-text transition-colors hover:bg-app-danger hover:text-white"
                            onClick={() => runDelete(c.id)}
                          >
                            <Trash2 className="size-4" strokeWidth={2.5} />
                          </Button>
                        </SimpleTooltip>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}

        {pagination && pagination.totalPages > 1 && (
          <div className="flex items-center justify-between text-sm text-app-muted">
            <span>
              Page {pagination.page} of {pagination.totalPages} · {pagination.total} courses
            </span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page <= 1}
                onClick={() => setPage((p) => Math.max(1, p - 1))}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={pagination.page >= pagination.totalPages}
                onClick={() => setPage((p) => p + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        )}
      </Card>
    </div>
  );
}
