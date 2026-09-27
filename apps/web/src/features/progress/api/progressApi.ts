import { API_ROUTES } from "@nexa-chess/types";
import type { StudentProgressResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getMyProgress() {
  return apiFetch<StudentProgressResponse>(API_ROUTES.progress.mine);
}

export function getStudentProgress(studentId: string) {
  return apiFetch<StudentProgressResponse>(API_ROUTES.progress.student(studentId));
}
