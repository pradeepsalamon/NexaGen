import { API_ROUTES } from "@nexa-chess/types";
import type {
  StudentActivityHistoryQuery,
  StudentActivityHistoryResponse,
  StudentActivityScope,
  StudentActivitySummaryResponse,
  StudentProgressResponse
} from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getMyProgress() {
  return apiFetch<StudentProgressResponse>(API_ROUTES.progress.mine);
}

export function getStudentProgress(studentId: string) {
  return apiFetch<StudentProgressResponse>(API_ROUTES.progress.student(studentId));
}

/** `undefined` values are dropped, so an unset filter never reaches the API. */
function withQuery(path: string, query: Record<string, string | number | undefined>) {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value !== undefined && value !== "") params.set(key, String(value));
  }
  const qs = params.toString();
  return qs ? `${path}?${qs}` : path;
}

/** `studentId` null = the signed-in student's own history. */
export function getActivityHistory(studentId: string | null, query: StudentActivityHistoryQuery) {
  const path = studentId ? API_ROUTES.progress.history(studentId) : API_ROUTES.progress.historyMine;
  return apiFetch<StudentActivityHistoryResponse>(withQuery(path, query));
}

export function getActivitySummary(studentId: string | null, scope: StudentActivityScope) {
  const path = studentId ? API_ROUTES.progress.summary(studentId) : API_ROUTES.progress.summaryMine;
  return apiFetch<StudentActivitySummaryResponse>(withQuery(path, scope));
}
