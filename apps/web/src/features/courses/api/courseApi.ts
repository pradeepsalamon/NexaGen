import { API_ROUTES } from "@nexa-chess/types";
import type {
  AttachCourseModuleRequest,
  CompleteCourseModuleResponse,
  CourseListQuery,
  CourseListResponse,
  CourseModuleResponse,
  CourseResponse,
  CreateCourseRequest,
  ReorderCourseModulesRequest,
  SetCourseArchivedRequest,
  SetCoursePublishedRequest,
  StudentCourseDetailResponse,
  StudentCourseListResponse,
  UpdateCourseModuleRequest,
  UpdateCourseRequest
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

function qs(params: Record<string, string | number | undefined>): string {
  const sp = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== "" && value !== null) sp.set(key, String(value));
  }
  const s = sp.toString();
  return s ? `?${s}` : "";
}

// ── Admin ──

export function getCourses(query: CourseListQuery): Promise<CourseListResponse> {
  return apiFetch(
    API_ROUTES.courses.list +
      qs({ page: query.page, pageSize: query.pageSize, search: query.search, status: query.status })
  );
}

export function getCourse(id: string): Promise<CourseResponse> {
  return apiFetch(API_ROUTES.courses.get(id));
}

export function createCourse(data: CreateCourseRequest): Promise<CourseResponse> {
  return apiFetch(API_ROUTES.courses.create, { method: "POST", body: data });
}

export function updateCourse(id: string, data: UpdateCourseRequest): Promise<CourseResponse> {
  return apiFetch(API_ROUTES.courses.update(id), { method: "PATCH", body: data });
}

export function deleteCourse(id: string): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.courses.delete(id), { method: "DELETE" });
}

export function setCoursePublished(
  id: string,
  data: SetCoursePublishedRequest
): Promise<CourseResponse> {
  return apiFetch(API_ROUTES.courses.publish(id), { method: "POST", body: data });
}

export function setCourseArchived(
  id: string,
  data: SetCourseArchivedRequest
): Promise<CourseResponse> {
  return apiFetch(API_ROUTES.courses.archive(id), { method: "POST", body: data });
}

export function attachCourseModule(
  courseId: string,
  data: AttachCourseModuleRequest
): Promise<CourseModuleResponse> {
  return apiFetch(API_ROUTES.courses.modules(courseId), { method: "POST", body: data });
}

export function updateCourseModule(
  courseId: string,
  moduleId: string,
  data: UpdateCourseModuleRequest
): Promise<CourseModuleResponse> {
  return apiFetch(API_ROUTES.courses.module(courseId, moduleId), { method: "PATCH", body: data });
}

export function removeCourseModule(
  courseId: string,
  moduleId: string
): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.courses.module(courseId, moduleId), { method: "DELETE" });
}

export function reorderCourseModules(
  courseId: string,
  data: ReorderCourseModulesRequest
): Promise<{ success: true }> {
  return apiFetch(API_ROUTES.courses.reorderModules(courseId), { method: "PATCH", body: data });
}

// ── Student ──

export function getMyCourses(): Promise<StudentCourseListResponse> {
  return apiFetch(API_ROUTES.courses.mine);
}

export function getMyCourse(id: string): Promise<StudentCourseDetailResponse> {
  return apiFetch(API_ROUTES.courses.mineGet(id));
}

export function completeCourseModule(
  courseId: string,
  moduleId: string
): Promise<CompleteCourseModuleResponse> {
  return apiFetch(API_ROUTES.courses.completeModule(courseId, moduleId), { method: "POST" });
}
