"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Save } from "lucide-react";
import { FormPageShell } from "@/components/layout/FormPageShell";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Card } from "@/components/ui/Card";
import { FormField } from "@/components/ui/FormField";
import { Input } from "@/components/ui/Input";
import { Skeleton } from "@/components/ui/Skeleton";
import { Textarea } from "@/components/ui/Textarea";
import { useCourse, useCreateCourse, useUpdateCourse } from "../hooks/useCoursesApi";
import { courseStatusBadgeVariant } from "../lib/courseMeta";
import { ModuleList } from "./ModuleList";

export function CourseCreateClient() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const create = useCreateCourse();

  return (
    <FormPageShell
      actions={
        <Button
          size="sm"
          disabled={!title.trim() || create.isPending}
          onClick={() =>
            create.mutate(
              { title: title.trim(), description: description.trim() || undefined },
              { onSuccess: (res) => router.push(`/admin/courses/${res.course.id}`) }
            )
          }
        >
          Create course
        </Button>
      }
      backHref="/admin/courses"
      backLabel="Back to courses"
      description="Give it a title, then add existing assignments and puzzles as modules."
      eyebrow="Courses"
      title="New course"
    >
      <Card className="mx-auto grid max-w-2xl gap-4 p-4">
        <FormField id="course-title" label="Title">
          <Input
            id="course-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField id="course-desc" label="Description (optional)">
          <Textarea
            id="course-desc"
            value={description}
            rows={3}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
      </Card>
    </FormPageShell>
  );
}

export function CourseEditClient({ id }: { id: string }) {
  const { data, isLoading } = useCourse(id);
  const update = useUpdateCourse();

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");

  useEffect(() => {
    if (data?.course) {
      setTitle(data.course.title);
      setDescription(data.course.description ?? "");
    }
  }, [data?.course]);

  if (isLoading || !data) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-40 w-full" />
      </div>
    );
  }

  const course = data.course;
  const dirty = title.trim() !== course.title || (description.trim() || null) !== course.description;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-app-text">{course.title}</h1>
            <Badge variant={courseStatusBadgeVariant(course.status)}>{course.status}</Badge>
          </div>
          <p className="mt-1 text-sm text-app-muted">{course.moduleCount} module(s)</p>
        </div>
      </div>

      <Card className="grid gap-4 p-4">
        <FormField id="course-title" label="Title">
          <Input
            id="course-title"
            value={title}
            maxLength={200}
            onChange={(e) => setTitle(e.target.value)}
          />
        </FormField>
        <FormField id="course-desc" label="Description (optional)">
          <Textarea
            id="course-desc"
            value={description}
            rows={3}
            maxLength={2000}
            onChange={(e) => setDescription(e.target.value)}
          />
        </FormField>
        <div className="flex justify-end">
          <Button
            variant="outline"
            disabled={!dirty || !title.trim() || update.isPending}
            onClick={() =>
              update.mutate({
                id,
                data: { title: title.trim(), description: description.trim() || null }
              })
            }
          >
            <Save className="mr-2 size-4" strokeWidth={2.5} />
            Save changes
          </Button>
        </div>
      </Card>

      <ModuleList courseId={id} modules={course.modules} />
    </div>
  );
}
