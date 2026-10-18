import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  AttachCourseModuleRequest,
  CourseListQuery,
  CreateCourseRequest,
  ReorderCourseModulesRequest,
  UpdateCourseModuleRequest,
  UpdateCourseRequest
} from "@nexa-chess/types";
import { queryKeys } from "@/lib/queryKeys";
import { useToast } from "@/providers/ToastProvider";
import { restoreTrashItem } from "@/features/trash/api/trashApi";
import { useUndoableMutation } from "@/lib/undo/useUndoableMutation";
import {
  attachCourseModule,
  completeCourseModule,
  createCourse,
  deleteCourse,
  getCourse,
  getCourses,
  getMyCourse,
  getMyCourses,
  removeCourseModule,
  reorderCourseModules,
  setCourseArchived,
  setCoursePublished,
  updateCourse,
  updateCourseModule
} from "../api/courseApi";

// ── Admin ──

export function useCourses(query: CourseListQuery) {
  return useQuery({
    queryKey: queryKeys.courses.list(query),
    queryFn: () => getCourses(query),
    placeholderData: keepPreviousData
  });
}

export function useCourse(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.courses.detail(id),
    queryFn: () => getCourse(id),
    enabled: !!id && enabled
  });
}

export function useCreateCourse() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: CreateCourseRequest) => createCourse(data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.all }),
    onError: (error: Error) =>
      toast.error({ title: "Could not create course", message: error.message })
  });
}

export function useUpdateCourse() {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ id, data }: { id: string; data: UpdateCourseRequest }) => updateCourse(id, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.all }),
    onError: (error: Error) =>
      toast.error({ title: "Could not save course", message: error.message })
  });
}

export function useDeleteCourse() {
  return useUndoableMutation({
    strategy: "immediate",
    mutationFn: (id: string) => deleteCourse(id),
    undo: (id: string) => restoreTrashItem("Course", id),
    toast: () => ({ title: "Course deleted" }),
    invalidates: [queryKeys.courses.all]
  });
}

export function useSetCoursePublished() {
  return useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setCoursePublished(id, { published: next }),
    undo: ({ id, next }) => setCoursePublished(id, { published: !next }),
    toast: ({ next }) => ({ title: next ? "Course published" : "Course unpublished" }),
    invalidates: [queryKeys.courses.all]
  });
}

export function useSetCourseArchived() {
  return useUndoableMutation({
    strategy: "immediate",
    mutationFn: ({ id, next }: { id: string; next: boolean }) =>
      setCourseArchived(id, { archived: next }),
    undo: ({ id, next }) => setCourseArchived(id, { archived: !next }),
    toast: ({ next }) => ({ title: next ? "Course archived" : "Course restored" }),
    invalidates: [queryKeys.courses.all]
  });
}

export function useAttachModule(courseId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: AttachCourseModuleRequest) => attachCourseModule(courseId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) }),
    onError: (error: Error) =>
      toast.error({ title: "Could not attach module", message: error.message })
  });
}

export function useUpdateModule(courseId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: ({ moduleId, data }: { moduleId: string; data: UpdateCourseModuleRequest }) =>
      updateCourseModule(courseId, moduleId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) }),
    onError: (error: Error) =>
      toast.error({ title: "Could not update module", message: error.message })
  });
}

export function useRemoveModule(courseId: string) {
  return useUndoableMutation({
    strategy: "immediate",
    mutationFn: (moduleId: string) => removeCourseModule(courseId, moduleId),
    undo: (moduleId: string) => restoreTrashItem("CourseModule", moduleId),
    toast: () => ({ title: "Module removed" }),
    invalidates: [queryKeys.courses.detail(courseId)]
  });
}

export function useReorderModules(courseId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (data: ReorderCourseModulesRequest) => reorderCourseModules(courseId, data),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: queryKeys.courses.detail(courseId) }),
    onError: (error: Error) =>
      toast.error({ title: "Could not reorder modules", message: error.message })
  });
}

// ── Student ──

export function useMyCourses() {
  return useQuery({ queryKey: queryKeys.courses.mine, queryFn: getMyCourses });
}

export function useMyCourse(id: string, enabled = true) {
  return useQuery({
    queryKey: queryKeys.courses.mineDetail(id),
    queryFn: () => getMyCourse(id),
    enabled: !!id && enabled
  });
}

export function useCompleteModule(courseId: string) {
  const queryClient = useQueryClient();
  const toast = useToast();
  return useMutation({
    mutationFn: (moduleId: string) => completeCourseModule(courseId, moduleId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.mineDetail(courseId) });
      queryClient.invalidateQueries({ queryKey: queryKeys.courses.mine });
    },
    onError: (error: Error) =>
      toast.error({ title: "Could not mark this complete", message: error.message })
  });
}
