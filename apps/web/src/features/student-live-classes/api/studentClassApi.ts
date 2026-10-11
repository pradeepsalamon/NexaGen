import { API_ROUTES, type StudentClassDetailResponse } from "@nexa-chess/types";
import { apiFetch } from "@/lib/api";

export function getStudentClassDetail(id: string): Promise<StudentClassDetailResponse> {
  return apiFetch<StudentClassDetailResponse>(API_ROUTES.student.classDetail(id));
}
